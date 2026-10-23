import { divideSen, roundHalfEven, sen, type Sen } from "./money";
import type { Ratio } from "./progress";

/**
 * Home's daily guide (D-58): about how much a day keeps the student inside the plan.
 * Free to spend = left in plan − bills still to come − set-aside money not used yet; it is
 * spread over the days left (today included). Wording stays "left in plan" and "a day", never a
 * balance (BR-12, rule 6). Display only: nothing is stored.
 */
export interface DailyGuideInput {
  /** B − N (BR-12). */
  readonly leftInPlanSen: Sen;
  /** Upcoming bill items in this cycle (BR-19). */
  readonly stillToComeSen: Sen;
  /** Σ max(0, set-aside allocation − its spending): kept apart, not for everyday spending. */
  readonly setAsideLeftSen: Sen;
  /** Days from today to the end, today included. */
  readonly daysLeft: number;
}

export interface DailyGuide {
  /** May be negative when bills and set-asides need more than is left. */
  readonly freeSen: Sen;
  /** max(0, free) ÷ days left, rounded half-even for display (R-03); null with no days left. */
  readonly perDaySen: Sen | null;
}

export function dailyGuide(input: DailyGuideInput): DailyGuide {
  const freeSen = sen(input.leftInPlanSen - input.stillToComeSen - input.setAsideLeftSen);
  return {
    freeSen,
    perDaySen:
      input.daysLeft > 0
        ? roundHalfEven(divideSen(sen(Math.max(0, freeSen)), input.daysLeft))
        : null,
  };
}

/**
 * Share of the budget spent, for Home's circle (D-58): the real ratio for the label, and the
 * ratio capped to 0…1 for the arc. Null with no budget.
 */
export function budgetUsed(spentSen: Sen, budgetSen: Sen): { label: Ratio; arc: number } | null {
  if (budgetSen <= 0) return null;
  const spent = Math.max(0, spentSen);
  return {
    label: { numerator: spent, denominator: budgetSen },
    arc: Math.min(1, spent / budgetSen),
  };
}

/**
 * Left to spend today (D-95): today's share of the free money, minus everyday spending already
 * logged today. Today's share is fixed for the day: it is worked out as if today's spending had
 * not happened yet, so logging a meal lowers "left today" instead of moving the target.
 * Everyday spending leaves out bill payments, estimates and set-aside spending (BR-18), because
 * those were never part of the free money. Display only: nothing is stored or blocked (D-63).
 */
export interface TodayGuideInput {
  /** Free money now, from `dailyGuide` (today's spending already taken off). */
  readonly freeSen: Sen;
  /** Everyday spending dated today. */
  readonly everydayTodaySen: Sen;
  /** Days from today to the end, today included. */
  readonly daysLeft: number;
}

export interface TodayGuide {
  /** Today's share at the start of the day, rounded half-even (R-03); never negative. */
  readonly todaySen: Sen;
  /** todaySen − today's everyday spending; negative when over today's share. */
  readonly leftTodaySen: Sen;
  /** About a day for the days after today, if today's share is used up; null on the last day. */
  readonly thenPerDaySen: Sen | null;
}

export function todayGuide(input: TodayGuideInput): TodayGuide | null {
  if (input.daysLeft <= 0) return null;
  const startFree = Math.max(0, input.freeSen + input.everydayTodaySen);
  const todaySen = roundHalfEven(divideSen(sen(startFree), input.daysLeft));
  const leftTodaySen = sen(todaySen - input.everydayTodaySen);
  const daysAfter = input.daysLeft - 1;
  return {
    todaySen,
    leftTodaySen,
    thenPerDaySen:
      daysAfter > 0
        ? roundHalfEven(
            divideSen(sen(Math.max(0, input.freeSen - Math.max(0, leftTodaySen))), daysAfter),
          )
        : null,
  };
}
