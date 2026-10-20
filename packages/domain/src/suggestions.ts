import { DEFAULT_CATEGORIES } from "./categories";
import { divideSen, roundHalfEven, sen, type Sen } from "./money";

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
