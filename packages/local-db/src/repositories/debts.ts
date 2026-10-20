import {
  sen,
  sumSen,
  summarizeDebt,
  type DebtDirection,
  type DebtSummary,
  type Sen,
} from "@brokely/domain";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { debtAdjustments, debts } from "../schema";
import { RepoError, write, type Db, type RepoContext, type WriteScope } from "./context";
import { cancelPendingDelete, enqueueDelete, enqueueUpsert, freshRow, touched } from "./outbox";
import {
  debtAdjustmentsOf,
  recordTransactionIn,
  transactionsForDebts,
  type LineInput,
} from "./transactions";

/**
 * Debts: FR-DEBT-01…06, BR-22, BR-23, R-07, D-01. Principal, outstanding and status are
 * derived from the transactions on the debt, never stored (ERD v0.2).
 */

type DebtRow = typeof debts.$inferSelect;

export type DebtView = DebtRow & { readonly summary: DebtSummary };

interface When {
  readonly occurredAt: string;
  readonly localDate: string;
}

function view(db: Db, row: DebtRow): DebtView {
  return {
    ...row,
    summary: summarizeDebt(
      row.id,
      transactionsForDebts(db, [row.id]),
      debtAdjustmentsOf(db, row.id),
    ),
  };
}

export function getDebt(db: Db, id: string): DebtView | undefined {
  const row = db
    .select()
    .from(debts)
    .where(and(eq(debts.id, id), isNull(debts.deletedAt)))
    .get();
  return row ? view(db, row) : undefined;
}

/** Every debt with its outstanding amount and status (FR-DEBT-03), newest first. */
export function listDebts(db: Db): DebtView[] {
  return db
    .select()
    .from(debts)
    .where(isNull(debts.deletedAt))
    .orderBy(desc(debts.createdAt))
    .all()
    .map((row) => view(db, row));
}

function liveDebt(tx: Db, id: string): DebtView {
  const debt = getDebt(tx, id);
  if (!debt) throw new RepoError("NOT_FOUND", "That debt doesn't exist");
  return debt;
}

interface NewDebt {
  readonly direction: DebtDirection;
  readonly counterparty: string;
  readonly dueDate?: string | null;
  readonly notes?: string;
}

function insertDebt(scope: WriteScope, input: NewDebt): string {
  const row: DebtRow = {
    ...freshRow(scope),
    direction: input.direction,
    counterparty: input.counterparty.trim(),
    dueDate: input.dueDate ?? null,
    notes: input.notes ?? "",
  };
  enqueueUpsert(scope, "debt", row.id, null, {
    direction: row.direction,
    counterparty: row.counterparty,
    dueDate: row.dueDate,
    notes: row.notes,
  });
  scope.tx.insert(debts).values(row).run();
  return row.id;
}

/**
 * "I borrowed" or "I lent": the debt and its opening transaction (FR-DEBT-01).
 * Borrowing and lending are never spending (FR-DEBT-06).
 */
export function createDebtIn(scope: WriteScope, input: NewDebt & When & { amountSen: Sen }) {
  const debtId = insertDebt(scope, input);
  const { id: transactionId } = recordTransactionIn(scope, {
    type: input.direction === "owed_by_me" ? "borrow" : "lend",
    amountSen: input.amountSen,
    occurredAt: input.occurredAt,
    localDate: input.localDate,
    note: input.notes,
    lines: [{ kind: "debt", debtId, amountSen: input.amountSen }],
  });
  return { debtId, transactionId };
}

export function createDebt(ctx: RepoContext, input: NewDebt & When & { amountSen: Sen }) {
  return write(ctx, (scope) => createDebtIn(scope, input));
}

export interface SplitPurchaseInput extends When {
  readonly amountSen: Sen;
  /** The category for the student's own share. */
  readonly categoryId: string;
  /** Each friend's share becomes money owed to the student (D-01). */
  readonly friends: readonly { counterparty: string; amountSen: Sen; dueDate?: string | null }[];
  readonly note?: string;
}

/**
 * One purchase split into the student's spending and what friends owe (FR-TXN-03, D-01, AC-10).
 * Each friend's debt is linked to the purchase through its line (FR-DEBT-05).
 */
export function recordSplitPurchase(ctx: RepoContext, input: SplitPurchaseInput) {
  return write(ctx, (scope) => {
    const owedSen = sumSen(input.friends.map((f) => f.amountSen));
    const mineSen = sen(input.amountSen - owedSen);
    if (mineSen <= 0) {
      throw new RepoError(
        "VALIDATION_FAILED",
        "Friends can't owe the whole amount; record it as money you lent instead",
      );
    }
    const debtIds = input.friends.map((f) =>
      insertDebt(scope, {
        direction: "owed_to_me",
        counterparty: f.counterparty,
        dueDate: f.dueDate,
      }),
    );
    const lines: LineInput[] = [
      { kind: "spending", categoryId: input.categoryId, amountSen: mineSen },
      ...input.friends.map((f, i) => ({
        kind: "debt" as const,
        debtId: debtIds[i]!,
        amountSen: f.amountSen,
      })),
    ];
    const { id: transactionId } = recordTransactionIn(scope, {
      type: "purchase",
      amountSen: input.amountSen,
      occurredAt: input.occurredAt,
      localDate: input.localDate,
      note: input.note,
      lines,
    });
    return { transactionId, debtIds };
  });
}

/** A partial or full repayment; its type follows the debt's direction (FR-DEBT-02, AC-08). */
export function recordRepayment(
  ctx: RepoContext,
  input: When & { debtId: string; amountSen: Sen; note?: string },
) {
  return write(ctx, (scope) => {
    const debt = liveDebt(scope.tx, input.debtId);
    return recordTransactionIn(scope, {
      type: debt.direction === "owed_to_me" ? "repayment_received" : "repayment_made",
      amountSen: input.amountSen,
      occurredAt: input.occurredAt,
      localDate: input.localDate,
      note: input.note,
      lines: [{ kind: "debt", debtId: debt.id, amountSen: input.amountSen }],
    });
  });
}

/**
 * Writes off what is still outstanding (FR-DEBT-04). Money a friend owed the student is gone,
 * so it becomes spending in the category they choose (R-07, BR-23, AC-11).
 */
export function writeOffDebt(
  ctx: RepoContext,
  input: When & { debtId: string; categoryId?: string },
) {
  return write(ctx, (scope) => {
    const debt = liveDebt(scope.tx, input.debtId);
    const outstanding = debt.summary.outstandingSen;
    if (outstanding <= 0) {
      throw new RepoError("DEBT_EXCEEDS_OUTSTANDING", "Nothing is outstanding on this debt");
    }
    if (debt.direction === "owed_to_me" && !input.categoryId) {
      throw new RepoError("VALIDATION_FAILED", "Choose the category this write-off counts in");
    }
    return recordTransactionIn(scope, {
      type: "write_off",
      amountSen: outstanding,
      occurredAt: input.occurredAt,
      localDate: input.localDate,
      writeOffCategoryId: debt.direction === "owed_to_me" ? input.categoryId : null,
      lines: [{ kind: "debt", debtId: debt.id, amountSen: outstanding }],
    });
  });
}

/** An audited change to what is owed, with a reason (BR-22). */
export function adjustDebt(
  ctx: RepoContext,
  input: { debtId: string; deltaSen: Sen; reason: string },
) {
  return write(ctx, (scope) => {
    const debt = liveDebt(scope.tx, input.debtId);
    if (debt.summary.outstandingSen + input.deltaSen < 0) {
      throw new RepoError("DEBT_EXCEEDS_OUTSTANDING", "That would make the debt less than zero");
    }
    const row = {
      ...freshRow(scope),
      debtId: debt.id,
      deltaSen: input.deltaSen,
      reason: input.reason.trim(),
    };
    enqueueUpsert(scope, "debt_adjustment", row.id, null, {
      debtId: row.debtId,
      deltaSen: row.deltaSen,
      reason: row.reason,
    });
    scope.tx.insert(debtAdjustments).values(row).run();
    return { id: row.id };
  });
}

/**
 * Removes a debt that has no transactions left, e.g. after Undo of the lend, borrow or split
 * that created it (D-38). A debt with history is never deleted; it settles or is written off.
 */
export function deleteDebt(ctx: RepoContext, id: string) {
  return write(ctx, (scope) => {
    const debt = liveDebt(scope.tx, id);
    if (transactionsForDebts(scope.tx, [id]).length > 0) {
      throw new RepoError(
        "VALIDATION_FAILED",
        "This debt has payments on it, so it can't be removed",
      );
    }
    enqueueDelete(scope, "debt", id, debt.version);
    scope.tx
      .update(debts)
      .set({ deletedAt: scope.at, ...touched(scope.at) })
      .where(eq(debts.id, id))
      .run();
  });
}

/** Undo of deleteDebt: the same debt comes back (restore it before its transactions). */
export function restoreDebt(ctx: RepoContext, id: string) {
  return write(ctx, (scope) => {
    const row = scope.tx
      .select()
      .from(debts)
      .where(and(eq(debts.id, id), isNotNull(debts.deletedAt)))
      .get();
    if (!row) throw new RepoError("NOT_FOUND", "There is nothing to bring back");
    if (!cancelPendingDelete(scope, "debt", id)) {
      enqueueUpsert(scope, "debt", id, row.version, {
        direction: row.direction,
        counterparty: row.counterparty,
        dueDate: row.dueDate,
        notes: row.notes,
      });
    }
    scope.tx
      .update(debts)
      .set({ deletedAt: null, ...touched(scope.at) })
      .where(eq(debts.id, id))
      .run();
  });
}
