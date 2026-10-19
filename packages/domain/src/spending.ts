import { contains, type DateRange } from "./cycle";
import type { Ratio } from "./progress";
import { sen, sumSen, type Sen } from "./money";
import { fail, OK, type RuleResult } from "./result";
import type { DebtDirectionOf, Transaction } from "./transactions";

/**
 * Spending: BR-10 to BR-13, FR-TXN-04, FR-TXN-06, R-04, R-07, D-01, D-04.
 *
 * Spending N = purchase spending lines − refund lines + write-offs of money owed to the student.
 * Transfers, borrowing, lending and repayments are never spending.
 */

/** Spending per category id (set-asides included; they are categories of kind set_aside). */
export function spendingByCategory(
  transactions: readonly Transaction[],
  debtDirectionOf: DebtDirectionOf,
): Map<string, Sen> {
  const totals = new Map<string, number>();
  const add = (categoryId: string, amount: number) =>
    totals.set(categoryId, (totals.get(categoryId) ?? 0) + amount);

  for (const t of transactions) {
    if (t.type === "purchase" || t.type === "refund") {
      const sign = t.type === "purchase" ? 1 : -1;
      for (const line of t.lines)
        if (line.kind === "spending") add(line.categoryId, sign * line.amountSen);
    } else if (t.type === "write_off" && t.writeOffCategoryId) {
      // Writing off money a friend owed me: the money is gone, so it is spending (R-07, BR-23).
      for (const line of t.lines) {
        if (line.kind === "debt" && debtDirectionOf(line.debtId) === "owed_to_me") {
          add(t.writeOffCategoryId, line.amountSen);
        }
      }
    }
  }
  return new Map([...totals].map(([id, amount]) => [id, sen(amount)]));
}

/** N for a set of transactions (BR-10). */
export function totalSpending(byCategory: ReadonlyMap<string, Sen>): Sen {
  return sumSen([...byCategory.values()]);
}

/** Transactions whose local date is inside the range (BR-04). */
export function inRange<T extends { localDate: Transaction["localDate"] }>(
  items: readonly T[],
  range: DateRange,
): T[] {
  return items.filter((item) => contains(range, item.localDate));
}

/** Left in plan = B − N. Shown as "left in plan", never "balance" (BR-12). */
export function leftInPlan(budgetSen: Sen, spentSen: Sen): Sen {
  return sen(budgetSen - spentSen);
}

/** Category (or set-aside) remaining = allocation − spending; may be negative (BR-11). */
export function remaining(allocationSen: Sen, spentSen: Sen): Sen {
  return sen(allocationSen - spentSen);
}

/** Variance = planned − spent (BR-13). Positive means under plan. */
export const variance = remaining;

/** Lines must add up exactly to the transaction amount (FR-TXN-04, AC-10). */
export function checkLinesSum(t: Transaction): RuleResult {
  if (t.lines.length === 0) return OK; // transfers have no lines (shape checked by contracts)
  const total = sumSen(t.lines.map((l) => l.amountSen));
  return total === t.amountSen
    ? OK
    : fail("LINES_DO_NOT_SUM", `The parts add up to ${total} sen, not ${t.amountSen} sen`);
}

/** What is still refundable on a purchase, given its existing refunds (FR-TXN-06). */
export function refundableSen(purchase: Transaction, existingRefunds: readonly Transaction[]): Sen {
  const refunded = sumSen(
    existingRefunds.filter((r) => r.refundsTransactionId === purchase.id).map((r) => r.amountSen),
  );
  return sen(purchase.amountSen - refunded);
}

/** A refund cannot exceed what is left unrefunded on its purchase (FR-TXN-06, AC-09). */
export function checkRefund(
  refund: Transaction,
  purchase: Transaction,
  existingRefunds: readonly Transaction[],
): RuleResult {
  if (purchase.type !== "purchase" || refund.refundsTransactionId !== purchase.id) {
    return fail("VALIDATION_FAILED", "A refund must point to the purchase it reverses");
  }
  const others = existingRefunds.filter((r) => r.id !== refund.id);
  const available = refundableSen(purchase, others);
  return refund.amountSen <= available
    ? OK
    : fail(
        "REFUND_EXCEEDS_PURCHASE",
        `Only ${available} sen of this purchase can still be refunded`,
      );
}

/**
 * A category's share of total spending for the chart (FR-INS-03/04). Returns null when there
 * is nothing to share yet, so the chart shows RM0.00 and 0% instead of dividing by zero (AC-17).
 */
export function shareOfSpending(categorySen: Sen, totalSen: Sen): Ratio | null {
  if (totalSen <= 0) return null;
  return { numerator: Math.max(0, categorySen), denominator: totalSen };
}
