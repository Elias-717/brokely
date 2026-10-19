import {
  computeProgress,
  daysBetween,
  forecastCanShow,
  lengthInDays,
  localDate,
  nextEssentialCard,
  sen,
  spendingByCategory,
  type Forecast,
  type LocalDate,
  type Sen,
} from "@brokely/domain";
import {
  findCycleOn,
  getCardChoices,
  getPlan,
  listCategories,
  listCheckInDates,
  listDebts,
  listScheduledItems,
  listTransactions,
  type Db,
} from "@brokely/local-db";

/** Everything Home shows, worked out from the phone database with the domain rules. */
export type HomeModel =
  | { readonly kind: "no-plan" }
  | {
      readonly kind: "plan";
      readonly cycleId: string;
      readonly budgetSen: Sen;
      readonly spentSen: Sen;
      /** B − N, never called a balance (BR-12, rule 6). */
      readonly leftInPlanSen: Sen;
      readonly dayOfPlan: number;
      readonly planDays: number;
      readonly daysLeft: number;
      readonly endExclusive: LocalDate;
      /** "hidden" on plans shorter than 14 days (D-37); "waiting" before the gate opens (BR-17). */
      readonly forecast:
        { kind: "hidden" } | { kind: "waiting" } | { kind: "shown"; value: Forecast };
      readonly stillToCome: readonly {
        id: string;
        name: string;
        dueDate: LocalDate;
        amountSen: Sen;
      }[];
      readonly stillToComeSen: Sen;
      readonly spentByCategory: readonly { name: string; amountSen: Sen }[];
      readonly card: { categoryId: string; name: string; position: number; total: number } | null;
    };

export function readHome(db: Db, today: LocalDate): HomeModel {
  const cycle = findCycleOn(db, today);
  const plan = cycle ? getPlan(db, cycle.id) : undefined;
  if (!cycle || !plan) return { kind: "no-plan" };

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

  const planDays = lengthInDays({ start: trackingStart, endExclusive: range.endExclusive });
  const categories = listCategories(db, { includeArchived: true });
  const nameOf = new Map(categories.map((c) => [c.id, c.name]));

  const spentByCategory = [...spendingByCategory(transactions, directionOf)]
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id, amountSen]) => ({ name: nameOf.get(id) ?? "Other", amountSen }));

  const essentials = categories
    .filter((c) => c.kind === "essential" && !c.archivedAt)
    .map((c) => c.id);
  const allocated = plan.allocations.filter((a) => a.amountSen > 0).map((a) => a.categoryId);
  const next = nextEssentialCard(essentials, { allocated, ...getCardChoices(db, cycle.id) });

  return {
    kind: "plan",
    cycleId: cycle.id,
    budgetSen,
    spentSen: progress.spentSen,
    leftInPlanSen: sen(budgetSen - progress.spentSen),
    dayOfPlan: Math.min(planDays, Math.max(1, daysBetween(trackingStart, today) + 1)),
    planDays,
    daysLeft: daysBetween(today, range.endExclusive),
    endExclusive: range.endExclusive,
    forecast: !forecastCanShow(planDays)
      ? { kind: "hidden" }
      : progress.forecast
        ? { kind: "shown", value: progress.forecast }
        : { kind: "waiting" },
    stillToCome: items
      .filter((i) => i.status === "upcoming")
      .map((i) => ({
        id: i.id,
        name: i.billName,
        dueDate: localDate(i.dueDate),
        amountSen: sen(i.amountSen),
      })),
    stillToComeSen: progress.stillToComeSen,
    spentByCategory,
    card: next
      ? {
          categoryId: next.id,
          name: nameOf.get(next.id) ?? "",
          position: next.position,
          total: next.total,
        }
      : null,
  };
}
