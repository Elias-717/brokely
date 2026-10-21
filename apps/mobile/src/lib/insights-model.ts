import {
  computeProgress,
  FORECAST_MIN_COVERAGE_PERCENT,
  FORECAST_MIN_DAYS,
  forecastCanShow,
  lengthInDays,
  localDate,
  percentHalfEven,
  remaining,
  roundHalfEven,
  sen,
  shareOfSpending,
  spendingByCategory,
  type DateRange,
  type Forecast,
  type LocalDate,
  type Sen,
} from "@brokely/domain";
import {
  findCycleOn,
  getPlan,
  listCategories,
  listCheckInDates,
  listDebts,
  listScheduledItems,
  listTransactions,
  type Db,
} from "@brokely/local-db";

export interface CategoryLine {
  readonly id: string;
  readonly name: string;
  readonly kind: "essential" | "optional" | "set_aside";
  readonly spentSen: Sen;
  /** Share of all spending, whole percent, half-even (FR-INS-04); 0 when nothing is spent (AC-17). */
  readonly percent: number;
  readonly allocationSen: Sen;
  /** Cᵢ − Nᵢ, may be negative (BR-11). */
  readonly remainingSen: Sen;
}

export type InsightsModel =
  | {
      /**
       * No plan covers today. Spending still counts (FR-PLN-04): this calendar month so far,
       * by category, so a student who only tracks still sees where it went (S8 B, D-77).
       */
      readonly kind: "no-plan";
      readonly month: DateRange;
      readonly spentSen: Sen;
      readonly slices: readonly CategoryLine[];
    }
  | {
      readonly kind: "plan";
      readonly range: DateRange;
      readonly spentSen: Sen;
      readonly budgetSen: Sen;
      readonly plannedSen: Sen;
      readonly setAsideSen: Sen;
      readonly stillToComeSen: Sen;
      /** Slices: categories with spending, biggest first. */
      readonly slices: readonly CategoryLine[];
      /** Every category with an amount in the plan or spending (FR-INS-02). */
      readonly lines: readonly CategoryLine[];
      readonly dailyAverageSen: Sen | null;
      readonly coveragePercent: number | null;
      readonly coveredDays: number;
      readonly elapsedDays: number;
      readonly forecast:
        | { kind: "hidden" }
        | { kind: "waiting"; daysToGo: number; coverageShort: boolean }
        | { kind: "shown"; value: Forecast };
    };

/** S8 Insights from the phone database with the domain rules (FR-INS-02…08). */
export function readInsights(db: Db, today: LocalDate): InsightsModel {
  const cycle = findCycleOn(db, today);
  const plan = cycle ? getPlan(db, cycle.id) : undefined;
  if (!cycle || !plan) return readMonth(db, today);

  const range = {
    start: localDate(cycle.startDate),
    endExclusive: localDate(cycle.endDateExclusive),
  };
  const trackingStart = localDate(cycle.trackingStartDate);
  const transactions = listTransactions(db, range);
  const directions = new Map(listDebts(db).map((d) => [d.id, d.direction]));
  const directionOf = (id: string) => directions.get(id);
  const items = listScheduledItems(db, range);
  const budgetSen = sen(plan.revision.budgetSen);

  const progress = computeProgress({
    range,
    today,
    transactions,
    checkIns: listCheckInDates(db, range).map(localDate),
    scheduledItems: items.map((i) => ({
      dueDate: localDate(i.dueDate),
      amountSen: sen(i.amountSen),
      status: i.status,
      transactionId: i.transactionId,
    })),
    plannedSpendingSen: plan.totals.plannedSpendingSen,
    budgetSen,
    trackingStart,
    debtDirectionOf: directionOf,
  });

  const spent = spendingByCategory(transactions, directionOf);
  const allocations = new Map(plan.allocations.map((a) => [a.categoryId, a.amountSen]));
  const lines: CategoryLine[] = listCategories(db, { includeArchived: true })
    .filter((c) => (spent.get(c.id) ?? 0) !== 0 || (allocations.get(c.id) ?? 0) > 0)
    .map((c) => {
      const spentSen = spent.get(c.id) ?? sen(0);
      const allocationSen = allocations.get(c.id) ?? sen(0);
      const share = shareOfSpending(spentSen, progress.spentSen);
      return {
        id: c.id,
        name: c.name,
        kind: c.kind,
        spentSen,
        percent: share ? percentHalfEven(share) : 0,
        allocationSen,
        remainingSen: remaining(allocationSen, spentSen),
      };
    });

  const planDays = lengthInDays({ start: trackingStart, endExclusive: range.endExclusive });
  const coveragePercent = progress.coverage ? percentHalfEven(progress.coverage) : null;

  return {
    kind: "plan",
    range,
    spentSen: progress.spentSen,
    budgetSen,
    plannedSen: plan.totals.plannedSpendingSen,
    setAsideSen: plan.totals.setAsideSen,
    stillToComeSen: progress.stillToComeSen,
    slices: lines.filter((l) => l.spentSen > 0).sort((a, b) => b.spentSen - a.spentSen),
    lines: [...lines].sort((a, b) => kindOrder(a.kind) - kindOrder(b.kind)),
    dailyAverageSen: progress.dailyAverage ? roundHalfEven(progress.dailyAverage) : null,
    coveragePercent,
    coveredDays: progress.coveredDays,
    elapsedDays: progress.elapsedDays,
    forecast: !forecastCanShow(planDays)
      ? { kind: "hidden" }
      : progress.forecast
        ? { kind: "shown", value: progress.forecast }
        : {
            kind: "waiting",
            daysToGo: Math.max(0, FORECAST_MIN_DAYS - progress.elapsedDays),
            coverageShort:
              coveragePercent !== null && coveragePercent < FORECAST_MIN_COVERAGE_PERCENT,
          },
  };
}

/** The calendar month containing `today`: [1st, 1st of next month). */
export function monthOf(today: LocalDate): DateRange {
  const [y, m] = today.split("-").map(Number) as [number, number];
  const pad = (n: number) => String(n).padStart(2, "0");
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
  return { start: localDate(`${y}-${pad(m)}-01`), endExclusive: localDate(next) };
}

/** Without a plan: this month's spending by category, the same rules as in a plan (BR-09). */
function readMonth(db: Db, today: LocalDate): InsightsModel {
  const month = monthOf(today);
  const transactions = listTransactions(db, month);
  const directions = new Map(listDebts(db).map((d) => [d.id, d.direction]));
  const spent = spendingByCategory(transactions, (id) => directions.get(id));
  const spentSen = sen([...spent.values()].reduce((sum, v) => sum + v, 0));
  const slices = listCategories(db, { includeArchived: true })
    .map((c) => ({ c, spentSen: spent.get(c.id) ?? sen(0) }))
    .filter(({ spentSen: s }) => s > 0)
    .map(({ c, spentSen: s }): CategoryLine => {
      const share = shareOfSpending(s, spentSen);
      return {
        id: c.id,
        name: c.name,
        kind: c.kind,
        spentSen: s,
        percent: share ? percentHalfEven(share) : 0,
        allocationSen: sen(0),
        remainingSen: sen(0),
      };
    })
    .sort((a, b) => b.spentSen - a.spentSen);
  return { kind: "no-plan", month, spentSen, slices };
}

const kindOrder = (kind: CategoryLine["kind"]) =>
  kind === "essential" ? 0 : kind === "optional" ? 1 : 2;

/** The records behind a slice, newest first (FR-INS-04, AC-17). */
export function categoryRecords(db: Db, range: DateRange, categoryId: string) {
  return listTransactions(db, range)
    .filter(
      (t) =>
        t.lines.some((l) => l.kind === "spending" && l.categoryId === categoryId) ||
        t.writeOffCategoryId === categoryId,
    )
    .map((t) => {
      const line = t.lines.find((l) => l.kind === "spending" && l.categoryId === categoryId);
      return {
        id: t.id,
        date: t.localDate,
        title:
          t.note ||
          (t.type === "refund" ? "Refund" : t.type === "write_off" ? "Written off" : "Spent"),
        amountSen: line ? line.amountSen : t.amountSen,
        refund: t.type === "refund",
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
