import { addDays, dayOfMonth, daysBetween, lastDayOfMonth, type LocalDate } from "./dates";
import { fail, OK, type RuleResult } from "./result";

/**
 * Planning cycles: BR-03 (dates), BR-04 (membership), BR-05 (no overlap), BR-27 (lifecycle),
 * D-18 (automatic completion and next cycle).
 */

/** A half-open date range [start, endExclusive). */
export interface DateRange {
  readonly start: LocalDate;
  readonly endExclusive: LocalDate;
}

export type CycleStatus = "draft" | "active" | "completed" | "archived";

export interface CycleLike {
  readonly id: string;
  readonly range: DateRange;
  readonly status: CycleStatus;
}

/** The student picks an inclusive start and end; we store [start, end + 1 day) (BR-03). */
export function cycleFromInclusive(start: LocalDate, endInclusive: LocalDate): DateRange {
  if (endInclusive < start) throw new RangeError("A cycle cannot end before it starts");
  return { start, endExclusive: addDays(endInclusive, 1) };
}

/** The end date as the student sees it. */
export function inclusiveEnd(range: DateRange): LocalDate {
  return addDays(range.endExclusive, -1);
}

export function lengthInDays(range: DateRange): number {
  return daysBetween(range.start, range.endExclusive);
}

/** A record belongs to the cycle whose dates contain its local date (BR-04). */
export function contains(range: DateRange, date: LocalDate): boolean {
  return range.start <= date && date < range.endExclusive;
}

export function overlaps(a: DateRange, b: DateRange): boolean {
  return a.start < b.endExclusive && b.start < a.endExclusive;
}

const OWNS_DATES: ReadonlySet<CycleStatus> = new Set(["active", "completed"]);

/**
 * Before activating a cycle: no other active or completed cycle may share a date
 * (BR-05, D-18, FR-PLN-03). Drafts and archived cycles may overlap.
 */
export function checkNoOverlap(candidate: CycleLike, others: readonly CycleLike[]): RuleResult {
  const clash = others.find(
    (other) =>
      other.id !== candidate.id &&
      OWNS_DATES.has(other.status) &&
      overlaps(other.range, candidate.range),
  );
  return clash ? fail("CYCLE_OVERLAP", `These dates overlap another ${clash.status} cycle`) : OK;
}

/**
 * The status to show today. An active cycle whose end date has passed is completed,
 * automatically (BR-27, D-18, FR-PLN-17).
 */
export function statusOn(cycle: CycleLike, today: LocalDate): CycleStatus {
  if (cycle.status === "active" && today >= cycle.range.endExclusive) return "completed";
  return cycle.status;
}

/** "Start next cycle": the day after this one ends, with the same length (D-18). */
export function nextCycleRange(range: DateRange): DateRange {
  return {
    start: range.endExclusive,
    endExclusive: addDays(range.endExclusive, lengthInDays(range)),
  };
}

export type MidMonthMode = "fresh" | "catch_up";

export interface MidMonthStart {
  readonly range: DateRange;
  /** First day progress counts from (BR-29, R-12). */
  readonly trackingStart: LocalDate;
  /** Date for the single "Spent before Brokely" entry; null when starting fresh. */
  readonly openingEntryDate: LocalDate | null;
}

/** Catching up only makes sense after the 1st of the month (D-25). */
export function offersCatchUp(today: LocalDate): boolean {
  return dayOfMonth(today) > 1;
}

/**
 * Mid-month start (FR-PLN-21, D-25):
 * - fresh: today to the end of the month, budget = what is left to spend;
 * - catch_up: the whole month, budget = the full amount, plus one opening entry dated the day
 *   before today so it counts in N but stays outside the tracked days (R-12).
 */
export function midMonthStart(today: LocalDate, mode: MidMonthMode): MidMonthStart {
  const monthEnd = addDays(today, lastDayOfMonth(today) - dayOfMonth(today));
  if (mode === "fresh" || !offersCatchUp(today)) {
    return {
      range: cycleFromInclusive(today, monthEnd),
      trackingStart: today,
      openingEntryDate: null,
    };
  }
  const monthStart = addDays(today, 1 - dayOfMonth(today));
  return {
    range: cycleFromInclusive(monthStart, monthEnd),
    trackingStart: today,
    openingEntryDate: addDays(today, -1),
  };
}
