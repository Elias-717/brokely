import type { EntityData, EntityName } from "@brokely/contracts";
import {
  checkCanApprove,
  checkCanCreateDraft,
  checkCanDeleteCategory,
  checkDebtMovement,
  checkLinesSum,
  checkRefund,
  checkWithinOutstanding,
  fail,
  OK,
  sen,
  summarizeDebt,
  type LocalDate,
  type RuleResult,
  type Transaction as DomainTransaction,
} from "@brokely/domain";
import { and, asc, count, eq, inArray, isNull, ne } from "drizzle-orm";
import type { Db } from "../db/client";
import {
  allocations,
  bills,
  categories,
  dayCheckIns,
  debtAdjustments,
  debts,
  planningCycles,
  planRevisions,
  scheduledItems,
  transactionEdits,
  transactionLines,
  transactions,
  userSettings,
  walletChecks,
} from "../db/schema";

/**
 * How each synced entity is stored, read back and checked on the server (sync-api §3, §4, §6).
 * The push pipeline (push.ts) and pull (pull.ts) are the same for every entity; what differs
 * lives here.
 */

/** Parsed `data` of an upsert for one entity (the contracts have no transforms, so in = out). */
export type Data<E extends EntityName> = EntityData<E>;

/**
 * Every synced table has these columns. Drizzle can't type "any table with these columns", so
 * the shared code treats each table as this one; the columns it touches exist on all of them.
 */
export type SyncedTable = typeof walletChecks;
export type SyncedRow = SyncedTable["$inferSelect"] & Record<string, unknown>;

/** A row another record points to, checked before writing (step 5, REFERENCE_MISSING). */
export interface Reference {
  readonly table: SyncedTable;
  readonly id: string;
  readonly what: string;
}

export interface WriteContext<E extends EntityName> {
  readonly tx: Db;
  readonly userId: string;
  readonly entityId: string;
  readonly data: Data<E>;
  /** The stored row before this change, if any (may be a delete marker). */
  readonly existing: SyncedRow | undefined;
}

export interface EntityHandler<E extends EntityName> {
  readonly table: SyncedTable;
  /** Columns to store for `data` (the shared sync columns are added by push.ts). */
  columns(data: Data<E>): Record<string, unknown>;
  /** Rebuilds `data` for pull and conflicts; batched so parts load in one query. */
  toData(tx: Db, rows: readonly SyncedRow[]): Promise<Map<string, Data<E>>>;
  references?(data: Data<E>): Reference[];
  /** Business rules for an upsert (sync-api §6). */
  check?(ctx: WriteContext<E>): Promise<RuleResult>;
  /** Business rules for a delete. */
  checkDelete?(tx: Db, userId: string, row: SyncedRow): Promise<RuleResult>;
  /**
   * Replaces the aggregate's parts (S-01), after the parent row is written. `fresh`: the row
   * was just created, so it has no old parts to remove (one round trip fewer).
   */
  writeParts?(
    tx: Db,
    userId: string,
    entityId: string,
    data: Data<E>,
    fresh: boolean,
  ): Promise<void>;
  /**
   * Natural-key merge (S-05, S-06): a create that matches a row the student already has,
   * created elsewhere, becomes a `duplicate` of that row instead of a second copy.
   */
  mergeTarget?(
    tx: Db,
    userId: string,
    entityId: string,
    data: Data<E>,
  ): Promise<SyncedRow | undefined>;
}

const t = (table: unknown) => table as SyncedTable;
const iso = (value: Date | null): string | null => (value ? value.toISOString() : null);
const at = (value: string | null): Date | null => (value ? new Date(value) : null);

/** Builds `toData` for entities whose data is just their own columns. */
function plain<D>(map: (row: SyncedRow) => D) {
  return async (_tx: Db, rows: readonly SyncedRow[]) =>
    new Map(rows.map((row) => [row.id, map(row)]));
}

// ── Shared lookups ──────────────────────────────────────────────────────────

async function liveRow(tx: Db, table: SyncedTable, userId: string, id: string) {
  const [row] = await tx
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, id), eq(table.userId, userId), isNull(table.deletedAt)));
  return row;
}

/** Step 5: every referenced row exists for this student and is not deleted. */
export async function checkReferences(
  tx: Db,
  userId: string,
  references: readonly Reference[],
): Promise<string | undefined> {
  for (const ref of references) {
    if (!(await liveRow(tx, ref.table, userId, ref.id)))
      return `The ${ref.what} is not on the server`;
  }
  return undefined;
}

/** Live transactions touching a debt, as the domain sees them (only that debt's lines). */
async function debtMovements(tx: Db, userId: string, debtId: string, exceptId: string) {
  const rows = await tx
    .select({
      id: transactions.id,
      type: transactions.type,
      amountSen: transactions.amountSen,
      localDate: transactions.localDate,
      lineSen: transactionLines.amountSen,
    })
    .from(transactionLines)
    .innerJoin(transactions, eq(transactions.id, transactionLines.transactionId))
    .where(
      and(
        eq(transactionLines.debtId, debtId),
        eq(transactions.userId, userId),
        isNull(transactions.deletedAt),
        ne(transactions.id, exceptId),
      ),
    );
  return rows.map((r): DomainTransaction => ({
    id: r.id,
    type: r.type,
    amountSen: sen(r.amountSen),
    localDate: r.localDate as LocalDate,
    lines: [{ kind: "debt", debtId, amountSen: sen(r.lineSen) }],
  }));
}

function asDomain(id: string, data: Data<"transaction">): DomainTransaction {
  return {
    id,
    type: data.type,
    amountSen: sen(data.amountSen),
    localDate: data.localDate as LocalDate,
    refundsTransactionId: data.refundsTransactionId,
    writeOffCategoryId: data.writeOffCategoryId,
    isEstimate: data.isEstimate,
    lines: data.lines.map((l) =>
      l.kind === "spending"
        ? { kind: "spending", categoryId: l.categoryId, amountSen: sen(l.amountSen) }
        : { kind: "debt", debtId: l.debtId, amountSen: sen(l.amountSen) },
    ),
  };
}

// ── Handlers ────────────────────────────────────────────────────────────────

const category: EntityHandler<"category"> = {
  table: t(categories),
  columns: (d) => ({ ...d, archivedAt: at(d.archivedAt) }),
  toData: plain((r) => ({
    name: r.name as string,
    kind: r.kind as Data<"category">["kind"],
    sortOrder: r.sortOrder as number,
    archivedAt: iso(r.archivedAt as Date | null),
  })),
  // A category with history can only be archived (FR-CAT-08, BR-28, D-21).
  async checkDelete(tx, userId, row) {
    const [allocated] = await tx
      .select({ n: count() })
      .from(allocations)
      .innerJoin(planRevisions, eq(planRevisions.id, allocations.revisionId))
      .where(
        and(
          eq(allocations.categoryId, row.id),
          eq(allocations.userId, userId),
          isNull(planRevisions.deletedAt),
        ),
      );
    const [spent] = await tx
      .select({ n: count() })
      .from(transactionLines)
      .innerJoin(transactions, eq(transactions.id, transactionLines.transactionId))
      .where(
        and(
          eq(transactionLines.categoryId, row.id),
          eq(transactionLines.userId, userId),
          isNull(transactions.deletedAt),
        ),
      );
    return checkCanDeleteCategory({
      allocations: allocated?.n ?? 0,
      transactionLines: spent?.n ?? 0,
    });
  },
};

const planningCycle: EntityHandler<"planning_cycle"> = {
  table: t(planningCycles),
  columns: (d) => d,
  // Overlap of active/completed cycles (BR-05) is the EXCLUDE constraint → CYCLE_OVERLAP.
  toData: plain((r) => ({
    startDate: r.startDate as string,
    endDateExclusive: r.endDateExclusive as string,
    trackingStartDate: r.trackingStartDate as string,
    status: r.status as Data<"planning_cycle">["status"],
  })),
  // Only drafts can be deleted (ERD cycle lifecycle, BR-27).
  async checkDelete(_tx, _userId, row) {
    return row.status === "draft"
      ? OK
      : fail("VALIDATION_FAILED", "Only a draft plan can be deleted; archive it instead");
  },
};

const planRevision: EntityHandler<"plan_revision"> = {
  table: t(planRevisions),
  columns: (d) => ({
    cycleId: d.cycleId,
    revisionNo: d.revisionNo,
    budgetSen: d.budgetSen,
    approvedAt: at(d.approvedAt),
    shortfallAcknowledged: d.shortfallAcknowledged,
  }), // allocations are parts (writeParts)
  async toData(tx, rows) {
    const ids = rows.map((r) => r.id);
    const parts =
      ids.length === 0
        ? []
        : await tx
            .select()
            .from(allocations)
            .where(inArray(allocations.revisionId, ids))
            .orderBy(asc(allocations.id));
    return new Map(
      rows.map((r) => [
        r.id,
        {
          cycleId: r.cycleId as string,
          revisionNo: r.revisionNo as number,
          budgetSen: r.budgetSen as number,
          approvedAt: iso(r.approvedAt as Date | null),
          shortfallAcknowledged: r.shortfallAcknowledged as boolean,
          allocations: parts
            .filter((a) => a.revisionId === r.id)
            .map((a) => ({ id: a.id, categoryId: a.categoryId, amountSen: a.amountSen })),
        },
      ]),
    );
  },
  references: (d) => [
    { table: t(planningCycles), id: d.cycleId, what: "plan" },
    ...d.allocations.map((a) => ({ table: t(categories), id: a.categoryId, what: "category" })),
  ],
  async check({ tx, userId, entityId, data, existing }) {
    // Approved revisions are never edited (FR-PLN-11, BR-08, D-03).
    if (existing && !existing.deletedAt && existing.approvedAt) {
      return fail("REVISION_IMMUTABLE", "An approved plan can't be changed; save a new revision");
    }
    if (data.approvedAt === null) {
      const others = await tx
        .select({
          id: planRevisions.id,
          revisionNo: planRevisions.revisionNo,
          approvedAt: planRevisions.approvedAt,
        })
        .from(planRevisions)
        .where(
          and(
            eq(planRevisions.cycleId, data.cycleId),
            eq(planRevisions.userId, userId),
            isNull(planRevisions.deletedAt),
            ne(planRevisions.id, entityId),
          ),
        );
      const draft = checkCanCreateDraft(
        others.map((o) => ({
          id: o.id,
          revisionNo: o.revisionNo,
          approved: o.approvedAt !== null,
        })),
      ); // D-20, FR-PLN-16
      if (!draft.ok) return draft;
      return OK;
    }
    const ids = data.allocations.map((a) => a.categoryId);
    const kinds = new Map(
      ids.length === 0
        ? []
        : (
            await tx
              .select({ id: categories.id, kind: categories.kind })
              .from(categories)
              .where(inArray(categories.id, ids))
          ).map((c) => [c.id, c.kind]),
    );
    return checkCanApprove(
      sen(data.budgetSen),
      data.allocations.map((a) => ({
        categoryId: a.categoryId,
        kind: kinds.get(a.categoryId)!,
        amountSen: sen(a.amountSen),
      })),
      data.shortfallAcknowledged,
    ); // FR-PLN-09/10
  },
  async checkDelete(_tx, _userId, row) {
    return row.approvedAt ? fail("REVISION_IMMUTABLE", "An approved plan can't be deleted") : OK;
  },
  async writeParts(tx, userId, entityId, data, fresh) {
    if (!fresh) await tx.delete(allocations).where(eq(allocations.revisionId, entityId));
    if (data.allocations.length === 0) return;
    await tx
      .insert(allocations)
      .values(data.allocations.map((a) => ({ ...a, userId, revisionId: entityId })));
  },
};

const bill: EntityHandler<"bill"> = {
  table: t(bills),
  columns: ({ repeat: { kind, ...params }, ...d }) => ({
    ...d,
    repeatKind: kind,
    repeatParams: params,
    archivedAt: at(d.archivedAt),
  }),
  toData: plain((r) => ({
    categoryId: r.categoryId as string,
    name: r.name as string,
    amountSen: r.amountSen as number,
    repeat: { kind: r.repeatKind, ...(r.repeatParams as object) } as Data<"bill">["repeat"],
    anchorDate: r.anchorDate as string,
    archivedAt: iso(r.archivedAt as Date | null),
  })),
  references: (d) => [{ table: t(categories), id: d.categoryId, what: "category" }],
};

const scheduledItem: EntityHandler<"scheduled_item"> = {
  table: t(scheduledItems),
  columns: (d) => d,
  toData: plain((r) => ({
    billId: r.billId as string,
    dueDate: r.dueDate as string,
    amountSen: r.amountSen as number,
    status: r.status as Data<"scheduled_item">["status"],
    transactionId: r.transactionId as string | null,
  })),
  references: (d) => [
    { table: t(bills), id: d.billId, what: "bill" },
    ...(d.transactionId ? [{ table: t(transactions), id: d.transactionId, what: "payment" }] : []),
  ],
};

const transaction: EntityHandler<"transaction"> = {
  table: t(transactions),
  columns: (d) => ({
    type: d.type,
    amountSen: d.amountSen,
    occurredAt: new Date(d.occurredAt),
    localDate: d.localDate,
    source: d.source,
    note: d.note,
    refundsTransactionId: d.refundsTransactionId,
    writeOffCategoryId: d.writeOffCategoryId,
    isEstimate: d.isEstimate,
  }), // lines are parts (writeParts)
  async toData(tx, rows) {
    const ids = rows.map((r) => r.id);
    const lines =
      ids.length === 0
        ? []
        : await tx
            .select()
            .from(transactionLines)
            .where(inArray(transactionLines.transactionId, ids))
            .orderBy(asc(transactionLines.id));
    return new Map(
      rows.map((r) => [
        r.id,
        {
          type: r.type as Data<"transaction">["type"],
          amountSen: r.amountSen as number,
          occurredAt: (r.occurredAt as Date).toISOString(),
          localDate: r.localDate as string,
          source: r.source as "manual" | "import",
          note: r.note as string,
          refundsTransactionId: r.refundsTransactionId as string | null,
          writeOffCategoryId: r.writeOffCategoryId as string | null,
          isEstimate: r.isEstimate as boolean,
          lines: lines
            .filter((l) => l.transactionId === r.id)
            .map((l) =>
              l.kind === "spending"
                ? {
                    id: l.id,
                    kind: "spending" as const,
                    categoryId: l.categoryId!,
                    amountSen: l.amountSen,
                  }
                : { id: l.id, kind: "debt" as const, debtId: l.debtId!, amountSen: l.amountSen },
            ),
        },
      ]),
    );
  },
  references: (d) => [
    ...d.lines.map((l) =>
      l.kind === "spending"
        ? { table: t(categories), id: l.categoryId, what: "category" }
        : { table: t(debts), id: l.debtId, what: "debt" },
    ),
    ...(d.refundsTransactionId
      ? [{ table: t(transactions), id: d.refundsTransactionId, what: "refunded purchase" }]
      : []),
    ...(d.writeOffCategoryId
      ? [{ table: t(categories), id: d.writeOffCategoryId, what: "category" }]
      : []),
  ],
  async check({ tx, userId, entityId, data }) {
    const self = asDomain(entityId, data);
    const sum = checkLinesSum(self); // FR-TXN-04
    if (!sum.ok) return sum;

    if (data.refundsTransactionId) {
      // FR-TXN-06: refunds never exceed what is left of the purchase.
      const [purchase] = await tx
        .select()
        .from(transactions)
        .where(eq(transactions.id, data.refundsTransactionId));
      const refunds = await tx
        .select({ id: transactions.id, amountSen: transactions.amountSen })
        .from(transactions)
        .where(
          and(
            eq(transactions.refundsTransactionId, data.refundsTransactionId),
            eq(transactions.userId, userId),
            isNull(transactions.deletedAt),
          ),
        );
      const result = checkRefund(
        self,
        {
          id: purchase!.id,
          type: purchase!.type,
          amountSen: sen(purchase!.amountSen),
          localDate: purchase!.localDate as LocalDate,
          lines: [],
        },
        refunds.map((r) => ({
          id: r.id,
          type: "refund" as const,
          amountSen: sen(r.amountSen),
          localDate: data.localDate as LocalDate,
          refundsTransactionId: data.refundsTransactionId,
          lines: [],
        })),
      );
      if (!result.ok) return result;
    }

    for (const line of data.lines) {
      if (line.kind !== "debt") continue;
      const [debt] = await tx
        .select({ direction: debts.direction })
        .from(debts)
        .where(eq(debts.id, line.debtId));
      const movement = checkDebtMovement(debt!.direction, data.type); // FR-DEBT-01, D-01
      if (!movement.ok) return movement;
      if (
        data.type === "write_off" &&
        debt!.direction === "owed_to_me" &&
        !data.writeOffCategoryId
      ) {
        return fail("VALIDATION_FAILED", "Writing off money owed to you needs a category (R-07)");
      }
      if (
        data.type === "repayment_received" ||
        data.type === "repayment_made" ||
        data.type === "write_off"
      ) {
        const adjustments = await tx
          .select({ deltaSen: debtAdjustments.deltaSen })
          .from(debtAdjustments)
          .where(and(eq(debtAdjustments.debtId, line.debtId), isNull(debtAdjustments.deletedAt)));
        const summary = summarizeDebt(
          line.debtId,
          await debtMovements(tx, userId, line.debtId, entityId),
          adjustments.map((a) => sen(a.deltaSen)),
        );
        const within = checkWithinOutstanding(summary, sen(line.amountSen)); // BR-22
        if (!within.ok) return within;
      }
    }
    return OK;
  },
  async writeParts(tx, userId, entityId, data, fresh) {
    if (!fresh) {
      await tx.delete(transactionLines).where(eq(transactionLines.transactionId, entityId));
    }
    if (data.lines.length === 0) return;
    await tx.insert(transactionLines).values(
      data.lines.map((l) => ({
        id: l.id,
        userId,
        transactionId: entityId,
        kind: l.kind,
        categoryId: l.kind === "spending" ? l.categoryId : null,
        debtId: l.kind === "debt" ? l.debtId : null,
        amountSen: l.amountSen,
      })),
    );
  },
};

const transactionEdit: EntityHandler<"transaction_edit"> = {
  table: t(transactionEdits),
  columns: (d) => ({ ...d, changedAt: new Date(d.changedAt) }),
  toData: plain((r) => ({
    transactionId: r.transactionId as string,
    changedAt: (r.changedAt as Date).toISOString(),
    before: r.before as Record<string, unknown>,
    after: r.after as Record<string, unknown>,
  })),
  references: (d) => [{ table: t(transactions), id: d.transactionId, what: "record" }],
};

const debt: EntityHandler<"debt"> = {
  table: t(debts),
  columns: (d) => d,
  toData: plain((r) => ({
    direction: r.direction as Data<"debt">["direction"],
    counterparty: r.counterparty as string,
    dueDate: r.dueDate as string | null,
    notes: r.notes as string,
  })),
};

const debtAdjustment: EntityHandler<"debt_adjustment"> = {
  table: t(debtAdjustments),
  columns: (d) => d,
  toData: plain((r) => ({
    debtId: r.debtId as string,
    deltaSen: r.deltaSen as number,
    reason: r.reason as string,
  })),
  references: (d) => [{ table: t(debts), id: d.debtId, what: "debt" }],
};

const dayCheckIn: EntityHandler<"day_check_in"> = {
  table: t(dayCheckIns),
  columns: (d) => d,
  toData: plain((r) => ({ localDate: r.localDate as string })),
  // Two phones tapping "No spending today" for the same day: keep the first (S-06).
  async mergeTarget(tx, userId, entityId, data) {
    const [row] = await tx
      .select()
      .from(dayCheckIns)
      .where(
        and(
          eq(dayCheckIns.userId, userId),
          eq(dayCheckIns.localDate, data.localDate),
          isNull(dayCheckIns.deletedAt),
          ne(dayCheckIns.id, entityId),
        ),
      );
    return row as SyncedRow | undefined;
  },
};

const walletCheck: EntityHandler<"wallet_check"> = {
  table: t(walletChecks),
  columns: (d) => ({ ...d, checkedAt: new Date(d.checkedAt) }),
  toData: plain((r) => ({
    checkedAt: (r.checkedAt as Date).toISOString(),
    localDate: r.localDate as string,
    amountSen: r.amountSen as number,
    note: r.note as string,
  })),
};

const settings: EntityHandler<"user_settings"> = {
  table: t(userSettings),
  columns: (d) => d,
  toData: plain((r) => ({
    timeZone: r.timeZone as string,
    weekStart: r.weekStart as number,
    mascotVisible: r.mascotVisible as boolean,
  })),
  // One settings row per student (S-06).
  async mergeTarget(tx, userId, entityId) {
    const [row] = await tx
      .select()
      .from(userSettings)
      .where(
        and(
          eq(userSettings.userId, userId),
          isNull(userSettings.deletedAt),
          ne(userSettings.id, entityId),
        ),
      );
    return row as SyncedRow | undefined;
  },
};

export const handlers: { [E in EntityName]: EntityHandler<E> } = {
  category,
  planning_cycle: planningCycle,
  plan_revision: planRevision,
  bill,
  scheduled_item: scheduledItem,
  transaction,
  transaction_edit: transactionEdit,
  debt,
  debt_adjustment: debtAdjustment,
  day_check_in: dayCheckIn,
  wallet_check: walletCheck,
  user_settings: settings,
};
