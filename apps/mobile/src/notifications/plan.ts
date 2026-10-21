import {
  addDays,
  localDate,
  planNotifications,
  roundHalfEven,
  sen,
  type LocalDate,
  type PlannedNotification,
} from "@brokely/domain";
import {
  findCycleOn,
  getNotificationPrefs,
  getPlan,
  listCheckInDates,
  listTransactions,
  type Db,
} from "@brokely/local-db";
import { readBills } from "../lib/bills-model";
import { readDebts } from "../lib/debts-model";
import { readHome } from "../lib/home-model";
import { today as todayOf } from "../lib/today";

/** Days ahead to schedule; re-planned on every open and change, so a week is plenty. */
const HORIZON_DAYS = 7;

const hhmm = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** Logged days in a row up to yesterday: a purchase or "No spending today" (BR-15). */
function streakUpToYesterday(db: Db, today: LocalDate): number {
  const start = addDays(today, -120);
  const range = { start, endExclusive: today };
  const covered = new Set<string>([
    ...listTransactions(db, range)
      .filter((t) => t.type === "purchase" && !t.isEstimate)
      .map((t) => t.localDate),
    ...listCheckInDates(db, range),
  ]);
  let days = 0;
  for (let d = addDays(today, -1); covered.has(d) && d >= start; d = addDays(d, -1)) days++;
  return days;
}

function loggedOn(db: Db, day: LocalDate): boolean {
  const range = { start: day, endExclusive: addDays(day, 1) };
  return (
    listTransactions(db, range).some((t) => t.type === "purchase" || t.type === "income") ||
    listCheckInDates(db, range).length > 0
  );
}

/**
 * Everything to schedule from now (D-94), from this phone's own data: bill dates still to come,
 * open debts with a due date, whether today is logged, today's pace and the streak. Returns the
 * plan and what to remember once it's scheduled (the pace heads-up and streak milestone).
 */
export function buildNotificationPlan(
  db: Db,
  now: Date = new Date(),
): {
  planned: PlannedNotification[];
  remember: { lastPaceDate?: string; celebratedStreak?: number };
} {
  const today = todayOf(now);
  const prefs = getNotificationPrefs(db);

  const bills = (readBills(db, today).items ?? [])
    .filter((i) => i.status === "upcoming")
    .map((i) => ({ itemId: i.id, name: i.name, amountSen: i.amountSen, dueDate: i.dueDate }));

  const owed = readDebts(db);
  const debts = [...owed.owedToMe, ...owed.iOwe]
    .filter((d) => d.dueDate !== null)
    .map((d) => ({
      id: d.id,
      name: d.name,
      outstandingSen: d.outstandingSen,
      dueDate: localDate(d.dueDate!),
      owedToMe: d.direction === "owed_to_me",
    }));

  let pace: {
    overPace: boolean;
    forecastSen: ReturnType<typeof sen>;
    plannedSen: ReturnType<typeof sen>;
  } | null = null;
  const home = readHome(db, today);
  if (home.kind === "plan" && home.forecast.kind === "shown") {
    const cycle = findCycleOn(db, today);
    const planned = cycle ? (getPlan(db, cycle.id)?.totals.plannedSpendingSen ?? 0) : 0;
    pace = {
      overPace: home.forecast.value.pace === "over_pace",
      forecastSen: roundHalfEven(home.forecast.value.middle),
      // The forecast is compared with planned spending, or the budget while nothing is planned (R-11).
      plannedSen: sen(planned > 0 ? planned : home.budgetSen),
    };
  }

  const streakDays = streakUpToYesterday(db, today);
  const planned = planNotifications({
    today,
    now: hhmm(now),
    horizonDays: HORIZON_DAYS,
    settings: prefs.settings,
    bills,
    debts,
    loggedToday: loggedOn(db, today),
    pace,
    lastPaceDate: prefs.lastPaceDate ? localDate(prefs.lastPaceDate) : null,
    streak: { days: streakDays, celebrated: prefs.celebratedStreak },
  });

  // Only what changed: saving is a database change, which triggers another re-plan.
  const remember: { lastPaceDate?: string; celebratedStreak?: number } = {};
  if (planned.some((n) => n.kind === "pace") && prefs.lastPaceDate !== today) {
    remember.lastPaceDate = today;
  }
  if (planned.some((n) => n.kind === "streak") && prefs.celebratedStreak !== streakDays) {
    remember.celebratedStreak = streakDays;
  }
  return { planned, remember };
}
