import {
  addDays,
  localDate,
  sen,
  spendingByCategory,
  type LocalDate,
  type Sen,
} from "@brokely/domain";
import {
  findCycleOn,
  getPlan,
  getTransaction,
  listDebts,
  listScheduledItems,
  listTransactions,
  OPENING_SPEND_NOTE,
  type Db,
} from "@brokely/local-db";

/**
 * What the sheets show once pulled up to full screen (D-87): context that helps finish the
 * entry being made. Read only; a tap on any of it only fills the form.
 */

/** This plan's dates and transactions, or null without a plan. */
function thisPlan(db: Db, today: LocalDate) {
  const cycle = findCycleOn(db, today);
  const plan = cycle ? getPlan(db, cycle.id) : undefined;
  if (!cycle || !plan) return null;
  const range = {
    start: localDate(cycle.startDate),
    endExclusive: localDate(cycle.endDateExclusive),
  };
  return { plan, range, transactions: listTransactions(db, range) };
}

/** How much of a category's plan is used: "Meals · RM 85.50 left of RM 250.00" (BR-12). */
export function categoryInPlan(
  db: Db,
  today: LocalDate,
  categoryId: string,
): { plannedSen: Sen | null; spentSen: Sen } | null {
  const current = thisPlan(db, today);
  if (!current) return null;
  const directions = new Map(listDebts(db).map((d) => [d.id, d.direction]));
  const spent = spendingByCategory(current.transactions, (id) => directions.get(id));
  const allocation = current.plan.allocations.find((a) => a.categoryId === categoryId);
  return {
    plannedSen: allocation ? allocation.amountSen : null,
    spentSen: spent.get(categoryId) ?? sen(0),
  };
}

export interface RecentPurchase {
  readonly amountSen: Sen;
  readonly categoryId: string;
  readonly note: string;
  readonly localDate: LocalDate;
}

/**
 * Recent plain purchases to repeat with one tap, newest first, each once (same amount,
 * category and note). Splits are left out: repeating one would need the friend's share too.
 */
export function recentPurchases(db: Db, today: LocalDate, max = 4): RecentPurchase[] {
  const seen = new Set<string>();
  const out: RecentPurchase[] = [];
  const recent = listTransactions(db, {
    start: addDays(today, -30),
    endExclusive: addDays(today, 1),
  })
    .filter((t) => t.type === "purchase" && t.note !== OPENING_SPEND_NOTE && t.lines.length === 1)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  for (const t of recent) {
    const line = t.lines[0];
    if (line?.kind !== "spending") continue;
    const key = `${t.amountSen}|${line.categoryId}|${t.note.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      amountSen: t.amountSen,
      categoryId: line.categoryId,
      note: t.note.trim(),
      localDate: t.localDate,
    });
    if (out.length >= max) break;
  }
  return out;
}

/** Money in during this plan, against its budget (D-26), and recent money in to repeat. */
export function moneyInContext(db: Db, today: LocalDate, max = 3) {
  const current = thisPlan(db, today);
  const recent = listTransactions(db, {
    start: addDays(today, -60),
    endExclusive: addDays(today, 1),
  })
    .filter((t) => t.type === "income")
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const seen = new Set<string>();
  const repeat: { amountSen: Sen; note: string; localDate: LocalDate }[] = [];
  for (const t of recent) {
    const key = `${t.amountSen}|${t.note.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    repeat.push({ amountSen: t.amountSen, note: t.note.trim(), localDate: t.localDate });
    if (repeat.length >= max) break;
  }
  return {
    plan: current
      ? {
          inSen: sen(
            current.transactions
              .filter((t) => t.type === "income")
              .reduce((s, t) => s + t.amountSen, 0),
          ),
          budgetSen: sen(current.plan.revision.budgetSen),
        }
      : null,
    repeat,
  };
}

/** A bill's earlier payments (newest first) and its next date after this one. */
export function billHistory(db: Db, billId: string, dueDate: LocalDate, max = 3) {
  const items = listScheduledItems(db, {
    start: addDays(dueDate, -366),
    endExclusive: addDays(dueDate, 366),
  }).filter((i) => i.billId === billId);
  const paid = items
    .filter((i) => i.status === "paid" && i.transactionId)
    .map((i) => {
      const t = getTransaction(db, i.transactionId!);
      return t
        ? { dueDate: localDate(i.dueDate), paidSen: t.amountSen, paidOn: t.localDate }
        : null;
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
    .slice(0, max);
  const next = items
    .filter((i) => i.status === "upcoming" && i.dueDate > dueDate)
    .map((i) => localDate(i.dueDate))
    .sort()[0];
  return { paid, next: next ?? null };
}
