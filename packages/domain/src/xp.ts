import type { LocalDate } from "./dates";

/**
 * XP for the Brokely mascot (release 0.2): BR-24, BR-25, BR-26, FR-MAS-04/05.
 * XP comes only from habits. Events carry no amounts, so spending less can never earn XP,
 * and XP can never change a financial number (BR-26, rule 10).
 */

export type XpEventType =
  | "plan_approved"
  | "transaction_logged"
  | "check_in"
  | "bill_marked_paid"
  | "import_confirmed"
  | "weekly_review";

/** Initial values, to tune in the pilot (BR-24). */
export const XP_VALUES: Readonly<Record<XpEventType, number>> = {
  plan_approved: 50,
  transaction_logged: 5,
  check_in: 5,
  bill_marked_paid: 5,
  import_confirmed: 2,
  weekly_review: 20,
};

export const DAILY_XP_CAP = 100;

export interface XpEvent {
  readonly type: XpEventType;
  /** The record that earned it, e.g. the transaction ID (BR-25). */
  readonly sourceId: string;
  readonly localDate: LocalDate;
}

export interface XpAward {
  readonly event: XpEvent;
  readonly xp: number;
}

/**
 * Awards XP in order: each (type, source) earns once, ever (BR-25), and a day never
 * exceeds the daily cap (BR-24). Editing, deleting and re-creating a record with the
 * same source never earns again.
 */
export function awardXp(events: readonly XpEvent[]): XpAward[] {
  const seen = new Set<string>();
  const perDay = new Map<string, number>();
  return events.map((event) => {
    const key = `${event.type}:${event.sourceId}`;
    if (seen.has(key)) return { event, xp: 0 };
    seen.add(key);
    const used = perDay.get(event.localDate) ?? 0;
    const xp = Math.max(0, Math.min(XP_VALUES[event.type], DAILY_XP_CAP - used));
    perDay.set(event.localDate, used + xp);
    return { event, xp };
  });
}

export function totalXp(awards: readonly XpAward[]): number {
  return awards.reduce((sum, a) => sum + a.xp, 0);
}
