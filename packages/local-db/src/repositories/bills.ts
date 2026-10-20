import { scheduledItemId, type EntityData } from "@brokely/contracts";
import { billDates, localDate, type DateRange, type RepeatRule, type Sen } from "@brokely/domain";
import { and, asc, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { bills, planningCycles, scheduledItems } from "../schema";
import { liveCategory } from "./categories";
import {
  asLocalDate,
  RepoError,
  write,
  type Db,
  type RepoContext,
  type WriteScope,
} from "./context";
import { enqueueDelete, enqueueUpsert, freshRow, touched } from "./outbox";
import { scheduledItemData, updateScheduledItem, type ScheduledItemRow } from "./scheduled-items";
import { purchaseInput, recordTransactionIn } from "./transactions";

/**
 * Bills and their scheduled items: FR-CAT-03…07, BR-09, R-05, D-17, S-05.
 * Items are stored rows, one per real bill date inside a cycle, with a deterministic ID so two
 * phones never create the same item twice. Editing a bill changes only upcoming items.
 */

type BillRow = typeof bills.$inferSelect;

export interface BillInput {
  readonly categoryId: string;
  readonly name: string;
  readonly amountSen: Sen;
  readonly repeat: RepeatRule;
  /** First date the bill can fall on. */
  readonly anchorDate: string;
}

/** A scheduled item with what the Bills screen shows next to it. */
export type ScheduledItemView = ScheduledItemRow & {
  readonly billName: string;
  readonly categoryId: string;
};

function ruleOf(row: BillRow): RepeatRule {
  return { kind: row.repeatKind, ...(row.repeatParams as object) } as RepeatRule;
}

/** The rule without its kind, as stored in `repeat_params`, e.g. {"n":2}. */
function paramsOf(rule: RepeatRule): Record<string, unknown> {
  return Object.fromEntries(Object.entries(rule).filter(([key]) => key !== "kind"));
}

function billData(row: BillRow): EntityData<"bill"> {
  const rule = ruleOf(row);
  return {
    categoryId: row.categoryId,
    name: row.name,
    amountSen: row.amountSen,
    repeat: rule.kind === "weekdays" ? { kind: "weekdays", days: [...rule.days] } : rule,
    anchorDate: row.anchorDate,
    archivedAt: row.archivedAt,
  };
}

/** Date ranges of the cycles that own dates (active or completed, BR-05). */
function cycleRanges(tx: Db): DateRange[] {
  return tx
    .select()
    .from(planningCycles)
    .where(
      and(
        isNull(planningCycles.deletedAt),
        inArray(planningCycles.status, ["active", "completed"]),
      ),
    )
    .all()
    .map((c) => ({ start: localDate(c.startDate), endExclusive: localDate(c.endDateExclusive) }));
}

/**
 * Makes one bill's items match its current rule in every cycle (FR-CAT-04). Paid and skipped
 * items are never touched (FR-CAT-07); upcoming ones get the new amount or are removed.
 */
function syncItems(scope: WriteScope, bill: BillRow) {
  const wanted = new Set<string>();
  if (!bill.archivedAt && !bill.deletedAt) {
    const rule = ruleOf(bill);
    const anchor = localDate(bill.anchorDate);
    for (const range of cycleRanges(scope.tx)) {
      for (const date of billDates(rule, anchor, range)) wanted.add(date);
    }
  }
  // Including deleted rows: (bill, date) is unique, so a removed item is revived, not re-added.
  const existing = scope.tx
    .select()
    .from(scheduledItems)
    .where(eq(scheduledItems.billId, bill.id))
    .all();
  const byDate = new Map(existing.map((i) => [i.dueDate, i]));

  for (const item of existing) {
    if (item.deletedAt || item.status !== "upcoming") continue;
    if (!wanted.has(item.dueDate)) {
      enqueueDelete(scope, "scheduled_item", item.id, item.version);
      scope.tx
        .update(scheduledItems)
        .set({ deletedAt: scope.at, ...touched(scope.at) })
        .where(eq(scheduledItems.id, item.id))
        .run();
    } else if (item.amountSen !== bill.amountSen) {
      updateScheduledItem(scope, item, { amountSen: bill.amountSen });
    }
  }

  for (const dueDate of [...wanted].sort()) {
    const old = byDate.get(dueDate);
    if (old && !old.deletedAt) continue;
    if (old) {
      updateScheduledItem(scope, old, {
        deletedAt: null,
        status: "upcoming",
        transactionId: null,
        amountSen: bill.amountSen,
      });
      continue;
    }
    const row: ScheduledItemRow = {
      ...freshRow(scope),
      id: scheduledItemId(bill.id, dueDate), // S-05
      billId: bill.id,
      dueDate,
      amountSen: bill.amountSen,
      status: "upcoming",
      transactionId: null,
    };
    enqueueUpsert(scope, "scheduled_item", row.id, null, scheduledItemData(row));
    scope.tx.insert(scheduledItems).values(row).run();
  }
}

/** Generates items for every live bill, e.g. when a new cycle starts. */
export function syncAllBillItems(scope: WriteScope) {
  const live = scope.tx
    .select()
    .from(bills)
    .where(and(isNull(bills.deletedAt), isNull(bills.archivedAt)))
    .all();
  for (const bill of live) syncItems(scope, bill);
}

function liveBill(tx: Db, id: string): BillRow {
  const row = tx
    .select()
    .from(bills)
    .where(and(eq(bills.id, id), isNull(bills.deletedAt)))
    .get();
  if (!row) throw new RepoError("NOT_FOUND", "That bill doesn't exist");
  return row;
}

/** A new bill and its items in every cycle (FR-CAT-03). */
export function createBillIn(scope: WriteScope, input: BillInput) {
  liveCategory(scope.tx, input.categoryId, "REFERENCE_MISSING");
  const row: BillRow = {
    ...freshRow(scope),
    categoryId: input.categoryId,
    name: input.name.trim(),
    amountSen: input.amountSen,
    repeatKind: input.repeat.kind,
    repeatParams: paramsOf(input.repeat),
    anchorDate: asLocalDate(input.anchorDate),
    archivedAt: null,
  };
  enqueueUpsert(scope, "bill", row.id, null, billData(row));
  scope.tx.insert(bills).values(row).run();
  syncItems(scope, row);
  return { billId: row.id };
}

export function createBill(ctx: RepoContext, input: BillInput) {
  return write(ctx, (scope) => createBillIn(scope, input));
}

/** Changes a bill; only upcoming items follow, paid history stays (FR-CAT-07, AC-26). */
export function editBill(ctx: RepoContext, id: string, input: BillInput) {
  return write(ctx, (scope) => {
    const before = liveBill(scope.tx, id);
    liveCategory(scope.tx, input.categoryId, "REFERENCE_MISSING");
    const after: BillRow = {
      ...before,
      ...touched(scope.at),
      categoryId: input.categoryId,
      name: input.name.trim(),
      amountSen: input.amountSen,
      repeatKind: input.repeat.kind,
      repeatParams: paramsOf(input.repeat),
      anchorDate: asLocalDate(input.anchorDate),
    };
    enqueueUpsert(scope, "bill", id, before.version, billData(after));
    scope.tx.update(bills).set(after).where(eq(bills.id, id)).run();
    syncItems(scope, after);
  });
}

/** Stops a bill: upcoming items go, paid ones stay in history. */
export function archiveBill(ctx: RepoContext, id: string) {
  return write(ctx, (scope) => {
    const before = liveBill(scope.tx, id);
    const after: BillRow = { ...before, ...touched(scope.at), archivedAt: scope.at };
    enqueueUpsert(scope, "bill", id, before.version, billData(after));
    scope.tx.update(bills).set(after).where(eq(bills.id, id)).run();
    syncItems(scope, after);
  });
}

/** Undo of Stop: the bill is live again and gets its upcoming items back (FR-TXN-10). */
export function unarchiveBill(ctx: RepoContext, id: string) {
  return write(ctx, (scope) => {
    const before = liveBill(scope.tx, id);
    if (!before.archivedAt) throw new RepoError("VALIDATION_FAILED", "This bill wasn't stopped");
    const after: BillRow = { ...before, ...touched(scope.at), archivedAt: null };
    enqueueUpsert(scope, "bill", id, before.version, billData(after));
    scope.tx.update(bills).set(after).where(eq(bills.id, id)).run();
    syncItems(scope, after);
  });
}

/** A bill as the Bills screen and its form show it. */
export interface BillView {
  readonly id: string;
  readonly name: string;
  readonly categoryId: string;
  readonly amountSen: Sen;
  readonly repeat: RepeatRule;
  readonly anchorDate: string;
}

function billView(row: BillRow): BillView {
  return {
    id: row.id,
    name: row.name,
    categoryId: row.categoryId,
    amountSen: row.amountSen as Sen,
    repeat: ruleOf(row),
    anchorDate: row.anchorDate,
  };
}

/** Live bills (not stopped), by name (FR-CAT-03). */
export function listBills(db: Db): BillView[] {
  return db
    .select()
    .from(bills)
    .where(and(isNull(bills.deletedAt), isNull(bills.archivedAt)))
    .orderBy(asc(bills.name))
    .all()
    .map(billView);
}

export function getBill(db: Db, id: string): BillView | undefined {
  const row = db
    .select()
    .from(bills)
    .where(and(eq(bills.id, id), isNull(bills.deletedAt)))
    .get();
  return row ? billView(row) : undefined;
}

/** Items due inside a date range, earliest first, with their bill's name (FR-INS-07). */
export function listScheduledItems(
  db: Db,
  range: { readonly start: string; readonly endExclusive: string },
): ScheduledItemView[] {
  return db
    .select({ item: scheduledItems, billName: bills.name, categoryId: bills.categoryId })
    .from(scheduledItems)
    .innerJoin(bills, eq(bills.id, scheduledItems.billId))
    .where(
      and(
        isNull(scheduledItems.deletedAt),
        gte(scheduledItems.dueDate, range.start),
        lt(scheduledItems.dueDate, range.endExclusive),
      ),
    )
    .orderBy(asc(scheduledItems.dueDate), asc(bills.name))
    .all()
    .map(({ item, billName, categoryId }) => ({ ...item, billName, categoryId }));
}

function liveItem(tx: Db, id: string): ScheduledItemRow {
  const item = tx
    .select()
    .from(scheduledItems)
    .where(and(eq(scheduledItems.id, id), isNull(scheduledItems.deletedAt)))
    .get();
  if (!item) throw new RepoError("NOT_FOUND", "That bill date doesn't exist");
  return item;
}

/**
 * Mark paid: one purchase linked to the item, with an amount the student can change; the item
 * leaves still to come (FR-CAT-05, R-05, AC-12). Never twice for the same item.
 */
export function markBillPaid(
  ctx: RepoContext,
  input: { scheduledItemId: string; amountSen: Sen; localDate: string; occurredAt: string },
) {
  return write(ctx, (scope) => {
    const item = liveItem(scope.tx, input.scheduledItemId);
    if (item.status === "paid") throw new RepoError("VALIDATION_FAILED", "Already marked paid");
    const bill = scope.tx.select().from(bills).where(eq(bills.id, item.billId)).get()!;
    const { id: transactionId } = recordTransactionIn(
      scope,
      purchaseInput({
        amountSen: input.amountSen,
        categoryId: bill.categoryId,
        localDate: input.localDate,
        occurredAt: input.occurredAt,
        note: bill.name,
      }),
    );
    updateScheduledItem(scope, item, { status: "paid", transactionId });
    return { transactionId };
  });
}

/** Skip: the item leaves still to come without any spending (FR-CAT-06). */
export function skipScheduledItem(ctx: RepoContext, id: string) {
  return write(ctx, (scope) => {
    const item = liveItem(scope.tx, id);
    if (item.status !== "upcoming") {
      throw new RepoError("VALIDATION_FAILED", "Only an upcoming bill can be skipped");
    }
    updateScheduledItem(scope, item, { status: "skipped" });
  });
}

/** Undo of Skip (FR-TXN-10). */
export function unskipScheduledItem(ctx: RepoContext, id: string) {
  return write(ctx, (scope) => {
    const item = liveItem(scope.tx, id);
    if (item.status !== "skipped")
      throw new RepoError("VALIDATION_FAILED", "This bill wasn't skipped");
    updateScheduledItem(scope, item, { status: "upcoming" });
  });
}

/** Transactions that paid a bill item (Mark paid), e.g. to label them in Records (R-05). */
export function paidBillTransactionIds(db: Db): Set<string> {
  const rows = db
    .select({ transactionId: scheduledItems.transactionId })
    .from(scheduledItems)
    .where(and(isNull(scheduledItems.deletedAt), eq(scheduledItems.status, "paid")))
    .all();
  return new Set(rows.flatMap((r) => (r.transactionId ? [r.transactionId] : [])));
}
