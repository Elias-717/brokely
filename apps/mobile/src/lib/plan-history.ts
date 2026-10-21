import {
  addDays,
  formatRM,
  localDate,
  suggestFromHistory,
  type HistoryBasis,
  type LocalDate,
} from "@brokely/domain";
import {
  findCycleOn,
  lastEndedCycle,
  listCheckInDates,
  listDebts,
  listTransactions,
  OPENING_SPEND_NOTE,
  type Db,
} from "@brokely/local-db";

/** How far back track-first records are looked at (records kept without any plan). */
const TRACK_FIRST_DAYS = 60;

export interface PlanHistory {
  /** "From your last plan" or "From your records so far". */
  readonly title: string;
  /** "30 days, 87% logged" (FR-PLN-13). */
  readonly basis: string;
  readonly raw: HistoryBasis;
  /** Per category id: "Spent RM 240.00 · that pace is RM 240.00 here". */
  readonly hints: ReadonlyMap<string, string>;
}

/**
 * The student's own spending as plan suggestions (FR-PLN-13, AC-18, D-46 part 2), for a new plan
 * of `targetDays` days: the last finished plan's tracked days, or else records kept without a
 * plan in the last 60 days (track-first). Null when there is nothing to go on. Suggestions only:
 * shown under each amount, never filled in (D-46).
 */
export function planHistory(db: Db, today: LocalDate, targetDays: number): PlanHistory | null {
  const directions = new Map(listDebts(db).map((d) => [d.id, d.direction]));
  const debtDirectionOf = (id: string) => directions.get(id);

  const ended = lastEndedCycle(db, today);
  let title: string;
  let range: { start: LocalDate; endExclusive: LocalDate };
  if (ended) {
    title = "From your last plan";
    range = {
      start: localDate(ended.trackingStartDate),
      endExclusive: localDate(ended.endDateExclusive),
    };
  } else {
    // Track-first: the first record kept outside every plan, up to today.
    const recent = listTransactions(db, {
      start: addDays(today, -TRACK_FIRST_DAYS),
      endExclusive: addDays(today, 1),
    }).filter(
      (t) =>
        t.type === "purchase" && t.note !== OPENING_SPEND_NOTE && !findCycleOn(db, t.localDate),
    );
    const first = recent.map((t) => t.localDate).sort()[0];
    if (!first) return null;
    title = "From your records so far";
    range = { start: first, endExclusive: addDays(today, 1) };
  }

  const transactions = listTransactions(db, range).filter(
    (t) => ended || !findCycleOn(db, t.localDate),
  );
  const result = suggestFromHistory({
    range,
    today,
    transactions,
    checkIns: listCheckInDates(db, range).map((d) => localDate(d)),
    debtDirectionOf,
    targetDays,
  });
  if (!result) return null;

  const { days, coveragePercent } = result.basis;
  const hints = new Map<string, string>();
  for (const [categoryId, s] of result.byCategory) {
    hints.set(
      categoryId,
      `Spent ${formatRM(s.spentSen)} · that pace is ${formatRM(s.suggestedSen)} here`,
    );
  }
  return {
    title,
    basis: `${days} ${days === 1 ? "day" : "days"}, ${coveragePercent}% logged`,
    raw: result.basis,
    hints,
  };
}
