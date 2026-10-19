import { contains, lengthInDays, type DateRange } from "./cycle";
import { daysBetween, type LocalDate } from "./dates";
import { divideSen, sen, sumSen, type Sen, type SenRatio } from "./money";
import { spendingByCategory, totalSpending } from "./spending";
import type { DebtDirectionOf, Transaction } from "./transactions";

/**
 * Progress and forecast: BR-15 to BR-21, R-01, R-02, R-06, R-08, R-09, R-10, D-15.
 * Every division is kept as an exact fraction; rounding happens only for display (R-03).
 */

/** Forecast gate (BR-17, R-09): at least 14 elapsed days and at least 70% of them logged. */
export const FORECAST_MIN_DAYS = 14;
export const FORECAST_MIN_COVERAGE_PERCENT = 70;
/** Range around the everyday part of the forecast (R-10). */
export const FORECAST_RANGE_PERCENT = 15;
const RM10 = 1000;

export interface Ratio {
  readonly numerator: number;
  readonly denominator: number;
}

export interface ScheduledItemLike {
  readonly dueDate: LocalDate;
  readonly amountSen: Sen;
  readonly status: "upcoming" | "paid" | "skipped";
  readonly transactionId: string | null;
}

export interface ProgressInput {
  readonly range: DateRange;
  readonly today: LocalDate;
  /** Transactions of the student; only those inside the range are used (BR-04). */
  readonly transactions: readonly Transaction[];
  /** Dates of live "No spending today" check-ins (R-01). */
  readonly checkIns: readonly LocalDate[];
  readonly scheduledItems: readonly ScheduledItemLike[];
  /** P from the current revision (BR-06). */
  readonly plannedSpendingSen: Sen;
  /** B from the current revision; pace compares with it while P is 0 (R-11). */
  readonly budgetSen: Sen;
  readonly debtDirectionOf: DebtDirectionOf;
}

export interface Forecast {
  /** Exact middle; round with roundHalfEven for display (BR-20). */
  readonly middle: SenRatio;
  /** Rounded down to RM10 (R-10). */
  readonly lowSen: Sen;
  /** Rounded up to RM10 (R-10). */
  readonly highSen: Sen;
  /** Compares the unrounded middle with planned spending, or the budget while P is 0 (BR-21, R-11). */
  readonly pace: "on_track" | "over_pace";
}

export interface Progress {
  readonly spentSen: Sen;
  readonly elapsedDays: number;
  readonly daysLeft: number;
  readonly coveredDays: number;
  /** Covered ÷ elapsed; null before any day has elapsed. */
  readonly coverage: Ratio | null;
  readonly dailyAverage: SenRatio | null;
  readonly everydayRate: SenRatio | null;
  readonly stillToComeSen: Sen;
  /** null when the gate is not met: show "not enough data yet" (FR-INS-06). */
  readonly forecast: Forecast | null;
}

/**
 * A day is covered by a spending entry that is not an estimate, or a check-in
 * (BR-15, R-01, D-15).
 */
export function coveredDates(
  range: DateRange,
  transactions: readonly Transaction[],
  checkIns: readonly LocalDate[],
): Set<LocalDate> {
  const covered = new Set<LocalDate>();
  for (const t of transactions) {
    if (t.type === "purchase" && !t.isEstimate && contains(range, t.localDate))
      covered.add(t.localDate);
  }
  for (const date of checkIns) if (contains(range, date)) covered.add(date);
  return covered;
}

/**
 * Elapsed days = cycle days before today, plus today once it is covered (BR-16, R-06).
 * Before the cycle: 0. After it ends: the whole cycle.
 */
export function elapsedDays(
  range: DateRange,
  today: LocalDate,
  covered: ReadonlySet<LocalDate>,
): number {
  if (today < range.start) return 0;
  if (today >= range.endExclusive) return lengthInDays(range);
  return daysBetween(range.start, today) + (covered.has(today) ? 1 : 0);
}

/** Whole percent, rounded half-even, for display (R-03). */
export function percentHalfEven(ratio: Ratio): number {
  return Number(roundDiv(BigInt(ratio.numerator) * 100n, BigInt(ratio.denominator)));
}

export function computeProgress(input: ProgressInput): Progress {
  const { range, today } = input;
  const transactions = input.transactions.filter((t) => contains(range, t.localDate));
  const spentSen = totalSpending(spendingByCategory(transactions, input.debtDirectionOf));

  const covered = coveredDates(range, transactions, input.checkIns);
  const elapsed = elapsedDays(range, today, covered);
  const daysLeft = lengthInDays(range) - elapsed;
  const windowEnd = today >= range.endExclusive ? range.endExclusive : today;
  const coveredDays = [...covered].filter(
    (d) => d < windowEnd || (d === today && covered.has(today)),
  ).length;

  // Everyday spending leaves out bill payments and estimates (BR-18, R-02, D-15).
  const billTransactionIds = new Set(
    input.scheduledItems
      .filter((s) => s.status === "paid" && s.transactionId)
      .map((s) => s.transactionId),
  );
  const nonEveryday = transactions.filter((t) => billTransactionIds.has(t.id) || t.isEstimate);
  const nonEverydaySen = totalSpending(spendingByCategory(nonEveryday, input.debtDirectionOf));
  const everydaySen = sen(spentSen - nonEverydaySen);

  // Still to come = upcoming (not paid, not skipped) items in this cycle (BR-19).
  const stillToComeSen = sumSen(
    input.scheduledItems
      .filter((s) => s.status === "upcoming" && contains(range, s.dueDate))
      .map((s) => s.amountSen),
  );

  const hasElapsed = elapsed > 0;
  const gateMet =
    elapsed >= FORECAST_MIN_DAYS && coveredDays * 100 >= elapsed * FORECAST_MIN_COVERAGE_PERCENT;

  return {
    spentSen,
    elapsedDays: elapsed,
    daysLeft,
    coveredDays,
    coverage: hasElapsed ? { numerator: coveredDays, denominator: elapsed } : null,
    dailyAverage: hasElapsed ? divideSen(spentSen, elapsed) : null,
    everydayRate: hasElapsed ? divideSen(everydaySen, elapsed) : null,
    stillToComeSen,
    forecast: gateMet
      ? forecast(spentSen, stillToComeSen, everydaySen, elapsed, daysLeft, paceTarget(input))
      : null,
  };
}

/**
 * Forecast middle = N + still to come + everyday rate × days left (BR-20).
 * Low/high scale the everyday part by 0.85/1.15, then round down/up to RM10 (R-10).
 * Exact integer maths throughout (BigInt), so no floating-point drift.
 */
/**
 * What pace compares the forecast with: planned spending P, or the budget B while no
 * spending category has an amount yet, e.g. right after a quick start (BR-21, R-11, D-23).
 */
export function paceTarget(input: Pick<ProgressInput, "plannedSpendingSen" | "budgetSen">): Sen {
  return input.plannedSpendingSen > 0 ? input.plannedSpendingSen : input.budgetSen;
}

function forecast(
  spent: Sen,
  stillToCome: Sen,
  everyday: Sen,
  elapsed: number,
  daysLeft: number,
  paceTargetSen: Sen,
): Forecast {
  const known = BigInt(spent + stillToCome);
  const e = BigInt(elapsed);
  const ahead = BigInt(everyday) * BigInt(daysLeft); // everyday rate × days left, times `elapsed`

  const middleNumerator = known * e + ahead; // over `elapsed`
  const scaled = (percent: number) => known * e * 100n + ahead * BigInt(percent); // over elapsed×100
  const unit = e * 100n * BigInt(RM10);

  const low = floorDiv(scaled(100 - FORECAST_RANGE_PERCENT), unit) * BigInt(RM10);
  const high = ceilDiv(scaled(100 + FORECAST_RANGE_PERCENT), unit) * BigInt(RM10);

  return {
    middle: divideSen(sen(Number(middleNumerator)), elapsed),
    lowSen: sen(Number(low)),
    highSen: sen(Number(high)),
    pace: middleNumerator > BigInt(paceTargetSen) * e ? "over_pace" : "on_track",
  };
}

function floorDiv(a: bigint, b: bigint): bigint {
  const q = a / b;
  return a % b !== 0n && a < 0n !== b < 0n ? q - 1n : q;
}

function ceilDiv(a: bigint, b: bigint): bigint {
  return -floorDiv(-a, b);
}

/** Half-even rounding of a / b for b > 0. */
function roundDiv(a: bigint, b: bigint): bigint {
  const q = floorDiv(a, b);
  const twiceRemainder = 2n * (a - q * b);
  if (twiceRemainder > b || (twiceRemainder === b && q % 2n !== 0n)) return q + 1n;
  return q;
}
