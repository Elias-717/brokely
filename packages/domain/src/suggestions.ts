import { DEFAULT_CATEGORIES } from "./categories";
import { contains, type DateRange } from "./cycle";
import type { LocalDate } from "./dates";
import { divideSen, roundHalfEven, sen, type Sen } from "./money";
import { coveredDates, elapsedDays, percentHalfEven } from "./progress";
import { spendingByCategory } from "./spending";
import type { DebtDirectionOf, Transaction } from "./transactions";

/**
 * "A healthy plan" hints (D-46): Brokely suggests a share of the budget per default category
 * while the student plans. Suggestions only: nothing is filled in or applied, the student types
 * their own amounts. Shares are the author's starting guide for a student budget in Malaysia,
 * to be tuned with pilot data; they add up to 100%.
 */
export const HEALTHY_SHARES: Readonly<Record<string, number>> = {
  meals: 45,
  groceries: 10, // Home necessities (D-43)
  transport: 8,
  phone: 5,
  laundry: 4,
  health: 3,
  snacks: 5,
  fun: 5,
  shopping: 3,
  gifts: 2,
  emergency: 5,
  savings: 5,
};

export interface ShareSuggestion {
  readonly percent: number;
  /** percent × budget, rounded half-even to whole sen for display (R-03). */
  readonly totalSen: Sen;
  /** The same spread over the plan's days, for daily things like meals. */
  readonly perDaySen: Sen;
}

/** The suggestion for a category by its name, or null for categories without one. */
export function healthySuggestion(
  categoryName: string,
  budgetSen: Sen,
  planDays: number,
): ShareSuggestion | null {
  const key = DEFAULT_CATEGORIES.find((c) => c.name === categoryName)?.key;
  const percent = key ? HEALTHY_SHARES[key] : undefined;
  if (percent === undefined || budgetSen <= 0 || planDays <= 0) return null;
  const totalSen = roundHalfEven(divideSen(sen(budgetSen * percent), 100));
  return {
    percent,
    totalSen,
    perDaySen: roundHalfEven(divideSen(sen(budgetSen * percent), 100 * planDays)),
  };
}

/** What a suggestion from history is based on, always shown with it (FR-PLN-13). */
export interface HistoryBasis {
  /** Days of history counted: days before today, plus today once logged (BR-16). */
  readonly days: number;
  /** Of those, days with a spending entry or a "No spending today" check-in (BR-15). */
  readonly coveredDays: number;
  /** coveredDays ÷ days as a whole percent, half-even (R-03). */
  readonly coveragePercent: number;
}

export interface HistorySuggestion {
  readonly basis: HistoryBasis;
  /** Per category id: what was spent, and that rate over the new plan's days. */
  readonly byCategory: ReadonlyMap<string, { spentSen: Sen; suggestedSen: Sen }>;
}

/**
 * Suggestions from the student's own spending (FR-PLN-13, AC-18, D-46 part 2): after a finished
 * plan, or from records kept without a plan (track-first). Per category, spending ÷ days of
 * history × the new plan's days. Days without records count as nothing spent, so no amount is
 * ever invented for them; the basis (days, coverage) is shown so the student can judge it.
 * Suggestions only: nothing is filled in (D-46). Null when there is no spending to go on.
 */
export function suggestFromHistory(input: {
  readonly range: DateRange;
  readonly today: LocalDate;
  readonly transactions: readonly Transaction[];
  readonly checkIns: readonly LocalDate[];
  readonly debtDirectionOf: DebtDirectionOf;
  readonly targetDays: number;
}): HistorySuggestion | null {
  const { range, today, targetDays } = input;
  const inRange = input.transactions.filter((t) => contains(range, t.localDate));
  const covered = coveredDates(range, inRange, input.checkIns);
  const days = elapsedDays(range, today, covered);
  if (days <= 0 || targetDays <= 0) return null;
  const spent = spendingByCategory(inRange, input.debtDirectionOf);
  const byCategory = new Map<string, { spentSen: Sen; suggestedSen: Sen }>();
  for (const [categoryId, spentSen] of spent) {
    if (spentSen <= 0) continue;
    byCategory.set(categoryId, {
      spentSen,
      suggestedSen: roundHalfEven(divideSen(sen(spentSen * targetDays), days)),
    });
  }
  if (byCategory.size === 0) return null;
  const coveredDays = [...covered].filter((d) => d <= today).length;
  return {
    basis: {
      days,
      coveredDays,
      coveragePercent: percentHalfEven({ numerator: coveredDays, denominator: days }),
    },
    byCategory,
  };
}
