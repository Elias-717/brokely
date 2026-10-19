import type { EntityData } from "@brokely/contracts";
import {
  checkDebtMovement,
  checkLinesSum,
  checkRefund,
  localDate,
  refundableSen,
  sen,
  summarizeDebt,
  type Line,
  type Sen,
  type Transaction,
  type TransactionType,
} from "@brokely/domain";
import { and, desc, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import {
  debtAdjustments,
  debts,
  transactionEdits,
  transactionLines,
  transactions,
} from "../schema";
import { liveCategory } from "./categories";
import {
  asLocalDate,
  ensure,
  RepoError,
  write,
  type Db,
  type RepoContext,
  type WriteScope,
} from "./context";
import { enqueueDelete, enqueueUpsert, touched } from "./outbox";
import { releaseScheduledItem } from "./scheduled-items";

/**
 * Transactions: FR-TXN-01…08, FR-TXN-10/11, FR-DEBT-06, BR-22, D-01, D-26.
 * A transaction and its lines are one aggregate with one outbox operation per change (S-01).
 */

type TransactionRow = typeof transactions.$inferSelect;
type LineRow = typeof transactionLines.$inferSelect;

/** A saved line keeps its ID so an edit can update it in place. */
export type SavedLine = Line & { readonly id: string };

/** A saved transaction as the screens and the domain see it. */
export type TransactionView = Omit<Transaction, "lines"> & {
  readonly occurredAt: string;
  readonly note: string;
  readonly source: "manual" | "import";
  readonly version: number;
  readonly lines: readonly SavedLine[];
};

/** A line as the caller gives it. Pass the `id` of an existing line to keep it on edit. */
export type LineInput =
  | {
      readonly id?: string;
      readonly kind: "spending";
      readonly categoryId: string;
      readonly amountSen: Sen;
    }
  | {
      readonly id?: string;
      readonly kind: "debt";
      readonly debtId: string;
      readonly amountSen: Sen;
    };

export interface TransactionInput {
  readonly type: TransactionType;
  readonly amountSen: Sen;
  /** When it happened (ISO instant) and the student's local date for it (BR-03, BR-04). */
  readonly occurredAt: string;
  readonly localDate: string;
  readonly note?: string;
  readonly source?: "manual" | "import";
  readonly refundsTransactionId?: string | null;
  readonly writeOffCategoryId?: string | null;
  readonly isEstimate?: boolean;
  readonly lines: readonly LineInput[];
}

const liveTxn = isNull(transactions.deletedAt);
const liveLine = isNull(transactionLines.deletedAt);

function toLine(row: LineRow): SavedLine {
  return row.kind === "spending"
    ? { id: row.id, kind: "spending", categoryId: row.categoryId!, amountSen: sen(row.amountSen) }
    : { id: row.id, kind: "debt", debtId: row.debtId!, amountSen: sen(row.amountSen) };
}

function toView(row: TransactionRow, lines: readonly LineRow[]): TransactionView {
  return {
    id: row.id,
    type: row.type,
    amountSen: sen(row.amountSen),
    occurredAt: row.occurredAt,
    localDate: localDate(row.localDate),
    note: row.note,
    source: row.source,
    version: row.version,
    refundsTransactionId: row.refundsTransactionId,
    writeOffCategoryId: row.writeOffCategoryId,
    isEstimate: row.isEstimate,
    lines: lines.map(toLine),
  };
}

function withLines(db: Db, rows: readonly TransactionRow[]): TransactionView[] {
  if (rows.length === 0) return [];
  const lines = db
    .select()
    .from(transactionLines)
    .where(
      and(
        inArray(
          transactionLines.transactionId,
          rows.map((r) => r.id),
        ),
        liveLine,
      ),
    )
    .all();
  return rows.map((r) =>
    toView(
      r,
      lines.filter((l) => l.transactionId === r.id),
    ),
  );
}

export function getTransaction(db: Db, id: string): TransactionView | undefined {
  const row = db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), liveTxn))
    .get();
  return row ? withLines(db, [row])[0] : undefined;
}

/** Live transactions, newest day first; optionally only those inside a date range (BR-04). */
export function listTransactions(
  db: Db,
  range?: { readonly start: string; readonly endExclusive: string },
): TransactionView[] {
  const rows = db
    .select()
    .from(transactions)
    .where(
      range
        ? and(
            liveTxn,
            gte(transactions.localDate, range.start),
            lt(transactions.localDate, range.endExclusive),
          )
        : liveTxn,
    )
    .orderBy(desc(transactions.localDate), desc(transactions.occurredAt))
    .all();
  return withLines(db, rows);
}

/** Every live transaction with a line on one of these debts. */
export function transactionsForDebts(db: Db, debtIds: readonly string[]): TransactionView[] {
  if (debtIds.length === 0) return [];
  const ids = db
    .selectDistinct({ id: transactionLines.transactionId })
    .from(transactionLines)
    .where(and(inArray(transactionLines.debtId, [...debtIds]), liveLine))
    .all()
    .map((r) => r.id);
  if (ids.length === 0) return [];
  const rows = db
    .select()
    .from(transactions)
    .where(and(inArray(transactions.id, ids), liveTxn))
    .all();
  return withLines(db, rows);
}

function payload(t: TransactionView): EntityData<"transaction"> {
  return {
    type: t.type,
    amountSen: t.amountSen,
    occurredAt: t.occurredAt,
    localDate: t.localDate,
    source: t.source,
    note: t.note,
    refundsTransactionId: t.refundsTransactionId ?? null,
    writeOffCategoryId: t.writeOffCategoryId ?? null,
    isEstimate: t.isEstimate ?? false,
    lines: t.lines.map((l) =>
      l.kind === "spending"
        ? { id: l.id, kind: l.kind, categoryId: l.categoryId, amountSen: l.amountSen }
        : { id: l.id, kind: l.kind, debtId: l.debtId, amountSen: l.amountSen },
    ),
  };
}

/** Builds the new state of a transaction from the input, giving new lines their IDs. */
function build(
  scope: WriteScope,
  id: string,
  input: TransactionInput,
  before: TransactionView | undefined,
): TransactionView {
  const keep = new Set(before?.lines.map((l) => l.id));
  return {
    id,
    type: input.type,
    amountSen: input.amountSen,
    occurredAt: input.occurredAt,
    localDate: asLocalDate(input.localDate),
    note: input.note ?? "",
    source: input.source ?? before?.source ?? "manual",
    version: before?.version ?? 1,
    refundsTransactionId: input.refundsTransactionId ?? null,
    writeOffCategoryId: input.writeOffCategoryId ?? null,
    isEstimate: input.isEstimate ?? false,
    lines: input.lines.map((l) => ({ ...l, id: l.id && keep.has(l.id) ? l.id : scope.newId() })),
  };
}

/**
 * The rules a transaction must pass before it is saved. `after` is null for a delete.
 * Contracts check the shape (which lines each type has); this checks what needs other records.
 */
function checkRules(
  scope: WriteScope,
  before: TransactionView | undefined,
  after: TransactionView | null,
) {
  const { tx } = scope;
  if (after) {
    ensure(checkLinesSum(after)); // FR-TXN-04
    for (const line of after.lines) {
      if (line.kind === "spending") liveCategory(tx, line.categoryId, "REFERENCE_MISSING");
    }
    if (after.writeOffCategoryId) liveCategory(tx, after.writeOffCategoryId, "REFERENCE_MISSING");

    if (after.type === "refund" && after.refundsTransactionId) {
      const purchase = getTransaction(tx, after.refundsTransactionId);
      if (!purchase)
        throw new RepoError("REFERENCE_MISSING", "The purchase being refunded is gone");
      ensure(checkRefund(after, purchase, refundsOf(tx, purchase.id))); // FR-TXN-06
    }
  }

  // A purchase can't shrink below its refunds, and can't be deleted while it has any (FR-TXN-06).
  if (before?.type === "purchase") {
    const refunds = refundsOf(tx, before.id);
    if (!after && refunds.length > 0) {
      throw new RepoError("VALIDATION_FAILED", "This purchase has refunds. Delete them first.");
    }
    if (after && refundableSen(after, refunds) < 0) {
      throw new RepoError("REFUND_EXCEEDS_PURCHASE", "This purchase was already refunded for more");
    }
  }

  checkDebts(scope, before, after);
}

function refundsOf(tx: Db, purchaseId: string): TransactionView[] {
  const rows = tx
    .select()
    .from(transactions)
    .where(and(eq(transactions.refundsTransactionId, purchaseId), liveTxn))
    .all();
  return withLines(tx, rows);
}

/**
 * Debt lines must point to a live debt in a direction that allows this type, and no debt may
 * end up below zero outstanding without an adjustment (BR-22, FR-DEBT-01…04). Checking the
 * result after the change covers repayments, write-offs, edits and deletes with one rule.
 */
function checkDebts(
  scope: WriteScope,
  before: TransactionView | undefined,
  after: TransactionView | null,
) {
  const { tx } = scope;
  const debtIds = new Set<string>();
  for (const t of [before, after]) {
    for (const line of t?.lines ?? []) if (line.kind === "debt") debtIds.add(line.debtId);
  }
  if (debtIds.size === 0) return;

  const id = (after ?? before)!.id;
  const others = transactionsForDebts(tx, [...debtIds]).filter((t) => t.id !== id);
  const adjusted = after ? [...others, after] : others;
  for (const debtId of debtIds) {
    const debt = tx
      .select()
      .from(debts)
      .where(and(eq(debts.id, debtId), isNull(debts.deletedAt)))
      .get();
    if (!debt) throw new RepoError("REFERENCE_MISSING", "That debt doesn't exist");
    if (after?.lines.some((l) => l.kind === "debt" && l.debtId === debtId)) {
      ensure(checkDebtMovement(debt.direction, after.type));
    }
    const summary = summarizeDebt(debtId, adjusted, debtAdjustmentsOf(tx, debtId));
    if (summary.outstandingSen < 0) {
      throw new RepoError(
        "DEBT_EXCEEDS_OUTSTANDING",
        "That's more than is still owed on this debt",
      );
    }
  }
}

/** Audited adjustments of one debt (BR-22). */
export function debtAdjustmentsOf(tx: Db, debtId: string): Sen[] {
  return tx
    .select({ deltaSen: debtAdjustments.deltaSen })
    .from(debtAdjustments)
    .where(and(eq(debtAdjustments.debtId, debtId), isNull(debtAdjustments.deletedAt)))
    .all()
    .map((a) => sen(a.deltaSen));
}

function insertRows(scope: WriteScope, t: TransactionView) {
  const meta = {
    userId: null,
    version: 1,
    createdAt: scope.at,
    updatedAt: scope.at,
    deletedAt: null,
  };
  scope.tx
    .insert(transactions)
    .values({
      ...meta,
      id: t.id,
      syncStatus: "pending",
      type: t.type,
      amountSen: t.amountSen,
      occurredAt: t.occurredAt,
      localDate: t.localDate,
      source: t.source,
      note: t.note,
      refundsTransactionId: t.refundsTransactionId ?? null,
      writeOffCategoryId: t.writeOffCategoryId ?? null,
      isEstimate: t.isEstimate ?? false,
    })
    .run();
  insertLines(scope, t.id, t.lines);
}

function insertLines(scope: WriteScope, transactionId: string, lines: TransactionView["lines"]) {
  if (lines.length === 0) return;
  scope.tx
    .insert(transactionLines)
    .values(
      lines.map((l) => ({
        id: l.id,
        userId: null,
        version: 1,
        createdAt: scope.at,
        updatedAt: scope.at,
        deletedAt: null,
        syncStatus: "pending" as const,
        transactionId,
        kind: l.kind,
        categoryId: l.kind === "spending" ? l.categoryId : null,
        debtId: l.kind === "debt" ? l.debtId : null,
        amountSen: l.amountSen,
      })),
    )
    .run();
}

/** Saves a new transaction with its lines and one outbox operation (FR-TXN-01, FR-SYNC-04). */
export function recordTransactionIn(scope: WriteScope, input: TransactionInput) {
  const t = build(scope, scope.newId(), input, undefined);
  enqueueUpsert(scope, "transaction", t.id, null, payload(t)); // shape first (contracts)
  checkRules(scope, undefined, t);
  insertRows(scope, t);
  return { id: t.id };
}

export function recordTransaction(ctx: RepoContext, input: TransactionInput) {
  return write(ctx, (scope) => recordTransactionIn(scope, input));
}

/** Quick add's plain purchase: an amount and a category (FR-TXN-10). */
export interface PurchaseInput {
  readonly amountSen: Sen;
  readonly categoryId: string;
  readonly occurredAt: string;
  readonly localDate: string;
  readonly note?: string;
}

export function purchaseInput(input: PurchaseInput): TransactionInput {
  return {
    type: "purchase",
    amountSen: input.amountSen,
    occurredAt: input.occurredAt,
    localDate: input.localDate,
    note: input.note,
    lines: [{ kind: "spending", categoryId: input.categoryId, amountSen: input.amountSen }],
  };
}

export function recordPurchase(ctx: RepoContext, input: PurchaseInput) {
  return recordTransaction(ctx, purchaseInput(input));
}

/** Money in: never spending, never changes the budget by itself (FR-TXN-11, D-26). */
export function recordMoneyIn(
  ctx: RepoContext,
  input: { amountSen: Sen; occurredAt: string; localDate: string; note?: string },
) {
  return recordTransaction(ctx, { ...input, type: "income", lines: [] });
}

/**
 * Changes a transaction: a new version of the same aggregate plus an edit-history entry
 * (FR-TXN-01, FR-TXN-07, AC-05). Lines passed with their existing `id` are kept.
 */
export function editTransactionIn(scope: WriteScope, id: string, input: TransactionInput) {
  const before = getTransaction(scope.tx, id);
  if (!before) throw new RepoError("NOT_FOUND", "That transaction doesn't exist");
  const after = build(scope, id, input, before);
  enqueueUpsert(scope, "transaction", id, before.version, payload(after));
  checkRules(scope, before, after);

  scope.tx
    .update(transactions)
    .set({
      ...touched(scope.at),
      type: after.type,
      amountSen: after.amountSen,
      occurredAt: after.occurredAt,
      localDate: after.localDate,
      note: after.note,
      refundsTransactionId: after.refundsTransactionId ?? null,
      writeOffCategoryId: after.writeOffCategoryId ?? null,
      isEstimate: after.isEstimate ?? false,
    })
    .where(eq(transactions.id, id))
    .run();

  const kept = new Map(after.lines.map((l) => [l.id, l]));
  for (const old of before.lines) {
    const next = kept.get(old.id);
    if (!next) {
      scope.tx
        .update(transactionLines)
        .set({ deletedAt: scope.at, ...touched(scope.at) })
        .where(eq(transactionLines.id, old.id))
        .run();
    } else {
      scope.tx
        .update(transactionLines)
        .set({
          ...touched(scope.at),
          kind: next.kind,
          categoryId: next.kind === "spending" ? next.categoryId : null,
          debtId: next.kind === "debt" ? next.debtId : null,
          amountSen: next.amountSen,
        })
        .where(eq(transactionLines.id, old.id))
        .run();
    }
  }
  const oldIds = new Set(before.lines.map((l) => l.id));
  insertLines(
    scope,
    id,
    after.lines.filter((l) => !oldIds.has(l.id)),
  );

  const edit = {
    id: scope.newId(),
    transactionId: id,
    changedAt: scope.at,
    before: payload(before),
    after: payload(after),
  };
  enqueueUpsert(scope, "transaction_edit", edit.id, null, {
    transactionId: id,
    changedAt: edit.changedAt,
    before: edit.before,
    after: edit.after,
  });
  scope.tx
    .insert(transactionEdits)
    .values({ ...edit, createdAt: scope.at, updatedAt: scope.at })
    .run();
  return { id };
}

export function editTransaction(ctx: RepoContext, id: string, input: TransactionInput) {
  return write(ctx, (scope) => editTransactionIn(scope, id, input));
}

/** Deletes with a delete marker so other phones learn about it (FR-SYNC-09, S-07). Also Undo (FR-TXN-10). */
export function deleteTransactionIn(scope: WriteScope, id: string) {
  const before = getTransaction(scope.tx, id);
  if (!before) throw new RepoError("NOT_FOUND", "That transaction doesn't exist");
  checkRules(scope, before, null);
  releaseScheduledItem(scope, id); // a deleted bill payment puts the item back (R-05)
  enqueueDelete(scope, "transaction", id, before.version);
  const marker = { deletedAt: scope.at, ...touched(scope.at) };
  scope.tx.update(transactions).set(marker).where(eq(transactions.id, id)).run();
  scope.tx
    .update(transactionLines)
    .set(marker)
    .where(and(eq(transactionLines.transactionId, id), liveLine))
    .run();
}

export function deleteTransaction(ctx: RepoContext, id: string) {
  return write(ctx, (scope) => deleteTransactionIn(scope, id));
}
