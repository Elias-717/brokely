import { contains, type DateRange } from "./cycle";
import {
  addDays,
  dayOfMonth,
  daysBetween,
  lastDayOfMonth,
  maxDate,
  weekday,
  type LocalDate,
} from "./dates";
import { sen, type Sen } from "./money";

/**
 * Bills and their scheduled dates: FR-CAT-03, FR-CAT-04, BR-09, D-17.
 * Weekdays use 0 = Sunday … 6 = Saturday (same as the contracts).
 */
export type RepeatRule =
  | { kind: "daily" }
  | { kind: "weekdays"; days: readonly number[] }
  | { kind: "every_n_days"; n: number }
  | { kind: "every_n_weeks"; n: number }
  | { kind: "monthly"; day: number }
  | { kind: "once" };

function matches(rule: RepeatRule, anchor: LocalDate, date: LocalDate): boolean {
  switch (rule.kind) {
    case "daily":
      return true;
    case "weekdays":
      return rule.days.includes(weekday(date));
    case "every_n_days":
      return daysBetween(anchor, date) % rule.n === 0;
    case "every_n_weeks":
      return daysBetween(anchor, date) % (7 * rule.n) === 0;
    case "monthly":
      // A day past the end of the month means the last day (e.g. 31 → 30 Nov).
      return dayOfMonth(date) === Math.min(rule.day, lastDayOfMonth(date));
    case "once":
      return date === anchor;
  }
}

/**
 * The real dates a bill falls on inside a range, never before its anchor date
 * (FR-CAT-04: only real dates inside the cycle).
 */
export function billDates(rule: RepeatRule, anchor: LocalDate, range: DateRange): LocalDate[] {
  const dates: LocalDate[] = [];
  for (let d = maxDate(anchor, range.start); contains(range, d); d = addDays(d, 1)) {
    if (matches(rule, anchor, d)) dates.push(d);
  }
  return dates;
}

/**
 * Plan suggestion for a bill = number of real dates × amount each time (BR-09, FR-PLN-06).
 * `count` is shown as the basis, e.g. "2 × RM16.00".
 */
export function billSuggestion(
  amountSen: Sen,
  rule: RepeatRule,
  anchor: LocalDate,
  range: DateRange,
): { count: number; totalSen: Sen } {
  const count = billDates(rule, anchor, range).length;
  return { count, totalSen: sen(count * amountSen) };
}
