import { sen, type Sen } from "./money";

/**
 * Essential cards: how often something happens and how much it adds up to in a plan
 * (FR-PLN-05, FR-PLN-06, D-35, D-36).
 */

export type Period = "day" | "week" | "month";

/** "2 a month", "1 a day", "1 a week". */
export interface Frequency {
  readonly times: number;
  readonly per: Period;
}

const DAYS_PER: Record<Exclude<Period, "month">, number> = { day: 1, week: 7 };

/**
 * How many times it happens in a plan of `planDays` days: times per period × plan days ÷ period
 * days, rounded up, never less than 1 (D-36). A month is the number of days in the month the
 * plan starts (`monthDays`), so a whole October plan with "2 a month" gives exactly 2.
 * Integer maths only.
 */
export function timesInPlan(frequency: Frequency, planDays: number, monthDays: number): number {
  const { times, per } = frequency;
  for (const [name, value] of [
    ["times", times],
    ["planDays", planDays],
    ["monthDays", monthDays],
  ] as const) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError(`${name} must be a whole number above zero, got ${value}`);
    }
  }
  const periodDays = per === "month" ? monthDays : DAYS_PER[per];
  const numerator = times * planDays;
  const roundedUp = Math.floor((numerator + periodDays - 1) / periodDays);
  return Math.max(1, roundedUp);
}

/** The card's suggestion and its working: "1 × RM16 = RM16" (FR-PLN-06). */
export function essentialSuggestion(
  amountEachSen: Sen,
  frequency: Frequency,
  planDays: number,
  monthDays: number,
): { times: number; totalSen: Sen } {
  const times = timesInPlan(frequency, planDays, monthDays);
  return { times, totalSen: sen(times * amountEachSen) };
}

/** What the student has done with essential cards in this cycle (D-30). */
export interface CardChoices {
  /** Essentials that already have an amount in the current plan. */
  readonly allocated: readonly string[];
  /** "Not for me" in this cycle. */
  readonly dismissed: readonly string[];
  /** "Later", oldest first: these go to the back of the queue in this order. */
  readonly later: readonly string[];
}

/**
 * The next essential card to show on Home, one at a time (FR-PLN-20, D-23, D-24, D-30):
 * essentials in their usual order, skipping covered and dismissed ones, with postponed ones
 * at the back. `position` is its place among all essentials ("3 of 6"). Null when none is left.
 */
export function nextEssentialCard(
  essentials: readonly string[],
  choices: CardChoices,
): { id: string; position: number; total: number } | null {
  const skip = new Set([...choices.allocated, ...choices.dismissed]);
  const later = new Set(choices.later);
  const fresh = essentials.filter((id) => !skip.has(id) && !later.has(id));
  const postponed = choices.later.filter((id) => essentials.includes(id) && !skip.has(id));
  const id = fresh[0] ?? postponed[0];
  return id === undefined
    ? null
    : { id, position: essentials.indexOf(id) + 1, total: essentials.length };
}

/**
 * Money not planned yet, counting what is already spent (R-14):
 * B − Σ over categories of max(planned Cᵢ, spent Nᵢ). Spent money is spoken for even when no
 * amount was planned for it; a plan amount bigger than the spending counts in full.
 * Set-asides are categories too, so they count (D-04).
 */
export function unplannedSen(
  budgetSen: Sen,
  allocations: readonly { categoryId: string; amountSen: Sen }[],
  spentByCategory: ReadonlyMap<string, Sen>,
): Sen {
  const planned = new Map(allocations.map((a) => [a.categoryId, a.amountSen as number]));
  const ids = new Set([...planned.keys(), ...spentByCategory.keys()]);
  let spokenFor = 0;
  for (const id of ids) {
    spokenFor += Math.max(planned.get(id) ?? 0, spentByCategory.get(id) ?? 0, 0);
  }
  return sen(budgetSen - spokenFor);
}

/**
 * A card's amount covers the plan's tracked days (R-12); spending in that category from before
 * tracking started (the catch-up "Spent before Brokely" entry) is added on top (R-14).
 */
export function essentialAllocation(cardTotalSen: Sen, spentBeforeTrackingSen: Sen): Sen {
  return sen(cardTotalSen + Math.max(0, spentBeforeTrackingSen));
}
