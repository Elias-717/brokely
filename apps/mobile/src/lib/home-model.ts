import {
  addDays,
  budgetUsed,
  computeProgress,
  dailyGuide,
  daysBetween,
  forecastCanShow,
  lengthInDays,
  localDate,
  nextEssentialCard,
  percentHalfEven,
  sen,
  spendingByCategory,
  type Forecast,
  type LocalDate,
  type Sen,
} from "@brokely/domain";
import {
  findCycleOn,
  getCardChoices,
  getDraftCycle,
  getPlan,
  lastEndedCycle,
  listCategories,
  listCheckInDates,
  listDebts,
  listScheduledItems,
  listTransactions,
  OPENING_SPEND_NOTE,
  type Db,
  type TransactionView,
} from "@brokely/local-db";

/** Everything Home shows, worked out from the phone database with the domain rules. */
export type HomeModel =
  | {
      readonly kind: "no-plan";
      /** The plan that just ended, for its summary (FR-PLN-17). */
      readonly ended: { readonly id: string; readonly lastDay: LocalDate } | null;
      /** A next plan started but not approved yet (AC-48). */
      readonly draftId: string | null;
    }
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
      /** Money a day that keeps the plan, after bills and set-asides (D-58); null at the end. */
      readonly perDaySen: Sen | null;
      /** Left in plan minus bills still to come and unused set-asides (D-58). */
      readonly freeSen: Sen;
      /** % of the budget spent: the real figure for the label, capped 0…1 for the circle. */
      readonly usedPercent: number;
      readonly usedArc: number;
      /** Brokely's one-line status under the greeting (D-58). */
      readonly status: "fresh" | "on-plan" | "ahead" | "over";
      /** The latest spending, newest first (D-58). */
      readonly recent: readonly {
        id: string;
        title: string;
        categoryName: string;
        date: LocalDate;
        amountSen: Sen;
      }[];
      readonly spentByCategory: readonly {
        name: string;
        amountSen: Sen;
        /** Share of all spending, 0…1, for the row's thin bar. */
        share: number;
        /** What it was: the notes typed on its records, newest first, without repeats. */
        notes: readonly string[];
      }[];
      readonly card: { categoryId: string; name: string; position: number; total: number } | null;
      /** Nothing logged today yet: offer "No spending today" (FR-TXN-08, R-01). */
      readonly offerCheckIn: boolean;
    };

export function readHome(db: Db, today: LocalDate): HomeModel {
  const cycle = findCycleOn(db, today);
  const plan = cycle ? getPlan(db, cycle.id) : undefined;
  if (!cycle || !plan) {
    const ended = lastEndedCycle(db, today);
    return {
      kind: "no-plan",
      ended: ended
        ? { id: ended.id, lastDay: addDays(localDate(ended.endDateExclusive), -1) }
        : null,
      draftId: getDraftCycle(db)?.cycle.id ?? null,
    };
  }

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
  const loggedToday =
    transactions.some((t) => t.localDate === today) || listCheckInDates(db, range).includes(today);
  const categories = listCategories(db, { includeArchived: true });
  const nameOf = new Map(categories.map((c) => [c.id, c.name]));

  const spentByCategory = [...spendingByCategory(transactions, directionOf)]
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id, amountSen]) => ({
      name: nameOf.get(id) ?? "Other",
      amountSen,
      share: progress.spentSen > 0 ? amountSen / progress.spentSen : 0,
      notes: notesFor(transactions, id),
    }));

  // Daily guide (D-58): set-aside money not used yet is kept apart from everyday spending.
  const byCategory = spendingByCategory(transactions, directionOf);
  const setAsideLeftSen = sen(
    plan.allocations
      .filter((a) => a.kind === "set_aside")
      .reduce((sum, a) => sum + Math.max(0, a.amountSen - (byCategory.get(a.categoryId) ?? 0)), 0),
  );
  const leftInPlanSen = sen(budgetSen - progress.spentSen);
  const daysLeft = daysBetween(today, range.endExclusive);
  const guide = dailyGuide({
    leftInPlanSen,
    stillToComeSen: progress.stillToComeSen,
    setAsideLeftSen,
    daysLeft,
  });
  const used = budgetUsed(progress.spentSen, budgetSen);
  const status =
    leftInPlanSen < 0
      ? "over"
      : progress.spentSen === 0
        ? "fresh"
        : progress.forecast?.pace === "over_pace"
          ? "ahead"
          : "on-plan";
  const recent = [...transactions]
    .filter((t) => t.type === "purchase")
    .sort((a, b) =>
      a.localDate === b.localDate
        ? b.occurredAt.localeCompare(a.occurredAt)
        : b.localDate.localeCompare(a.localDate),
    )
    .slice(0, 3)
    .map((t) => {
      const line = t.lines.find((l) => l.kind === "spending");
      const categoryName =
        line?.kind === "spending" ? (nameOf.get(line.categoryId) ?? "Other") : "Spent";
      return {
        id: t.id,
        title: t.note.trim() || categoryName,
        categoryName,
        date: t.localDate,
        amountSen: t.amountSen,
      };
    });

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
    leftInPlanSen,
    perDaySen: guide.perDaySen,
    freeSen: guide.freeSen,
    usedPercent: used ? percentHalfEven(used.label) : 0,
    usedArc: used?.arc ?? 0,
    status,
    recent,
    dayOfPlan: Math.min(planDays, Math.max(1, daysBetween(trackingStart, today) + 1)),
    planDays,
    daysLeft,
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
    offerCheckIn: !loggedToday && today >= trackingStart,
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

/**
 * The notes on a category's spending records ("nasi lemak", "teh tarik"), newest first, each
 * once (case-insensitive). The catch-up entry's built-in note is left out.
 */
function notesFor(transactions: readonly TransactionView[], categoryId: string): string[] {
  const seen = new Set<string>();
  const notes: string[] = [];
  const newestFirst = [...transactions].sort((a, b) =>
    a.localDate === b.localDate
      ? b.occurredAt.localeCompare(a.occurredAt)
      : b.localDate.localeCompare(a.localDate),
  );
  for (const t of newestFirst) {
    if (t.type !== "purchase" || !t.note.trim() || t.note === OPENING_SPEND_NOTE) continue;
    if (!t.lines.some((l) => l.kind === "spending" && l.categoryId === categoryId)) continue;
    const key = t.note.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    notes.push(t.note.trim());
  }
  return notes;
}
