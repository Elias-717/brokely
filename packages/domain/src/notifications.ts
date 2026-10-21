import { addDays, daysBetween, localDate, type LocalDate } from "./dates";
import { formatRM, type Sen } from "./money";

/**
 * Notifications (FR-NOT-01…07, D-07, D-45, D-94): what to schedule, worked out on the phone from
 * the student's own bills, debts, pace and streak. Pure: "today" and "now" are passed in. All
 * text comes from these local templates (FR-NOT-04, no paid AI): fact and action first, exact
 * numbers, a little fun, never shaming (D-07, rule 9). The cheeky evening tone nags about
 * logging only, never about how much was spent.
 */

export type NotificationKind = "bill_due" | "debt_due" | "evening" | "pace" | "streak";
export type EveningTone = "friendly" | "cheeky";

export interface NotificationSettings {
  /** Mute all (FR-NOT-05). */
  readonly enabled: boolean;
  readonly kinds: Readonly<Record<NotificationKind, boolean>>;
  /** "20:30", 24-hour local time. */
  readonly eveningTime: string;
  readonly tone: EveningTone;
  readonly quietStart: string;
  readonly quietEnd: string;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  kinds: { bill_due: true, debt_due: true, evening: true, pace: false, streak: true },
  eveningTime: "20:30",
  tone: "friendly",
  quietStart: "23:00",
  quietEnd: "08:00",
};

/** At most this many a day (FR-NOT-06). */
export const MAX_NOTIFICATIONS_PER_DAY = 3;
/** Days of streak worth celebrating, once each. */
export const STREAK_MILESTONES = [3, 7, 14, 21, 30, 50, 100] as const;

const BILL_TIME = "09:00";
const DEBT_TIME = "09:00";
const STREAK_TIME = "12:00";
const PACE_TIME = "18:00";
/** Most useful first, when a day has more than three (FR-NOT-06). */
const PRIORITY: Record<NotificationKind, number> = {
  bill_due: 0,
  debt_due: 1,
  evening: 2,
  pace: 3,
  streak: 4,
};

interface Template {
  readonly title: string;
  readonly body: string;
}

/** {name}, {amount}, {forecast}, {planned}, {days} are filled in. Three or more each (FR-NOT-03). */
type TemplatePool =
  | "bill_due"
  | "debt_owed_to_me"
  | "debt_i_owe"
  | "pace"
  | "streak"
  | "evening_friendly"
  | "evening_cheeky";

export const NOTIFICATION_TEMPLATES: Readonly<Record<TemplatePool, readonly Template[]>> = {
  bill_due: [
    {
      title: "🧾 {name} is due today",
      body: "{amount}. Pay it, then tap Mark paid so it leaves Still to come.",
    },
    {
      title: "📅 Bill day: {name}",
      body: "Your {amount} {name} is due today. Tap Mark paid once it's done.",
    },
    {
      title: "✅ One to tick off",
      body: "{name}, {amount}, is due today. Pay it and tap Mark paid.",
    },
  ],
  debt_owed_to_me: [
    {
      title: "🤝 Money coming back",
      body: "{name}'s {amount} is due back today. A friendly reminder never hurt anyone.",
    },
    { title: "💸 Payback day", body: "{name} said today for the {amount}. Maybe a gentle nudge?" },
    {
      title: "📬 {name} owes you {amount}",
      body: "It's due back today. Tap to record it when it's paid back.",
    },
  ],
  debt_i_owe: [
    {
      title: "🤝 Payback day",
      body: "You said you'd pay {name} {amount} today. Tap to record it when it's done.",
    },
    { title: "⏰ A promise to keep", body: "{amount} to {name} is due today." },
    { title: "💚 Keep it friendly", body: "Today's the day to pay {name} back {amount}." },
  ],
  pace: [
    {
      title: "📈 Heads up on your plan",
      body: "At this pace you'd end around {forecast} of {planned}. Want to see where it's going?",
    },
    {
      title: "🧭 A small course check",
      body: "You're heading for about {forecast} against {planned} planned. A peek at Insights?",
    },
    {
      title: "👀 Pace check",
      body: "Spending is running a bit fast: about {forecast} by the end, with {planned} planned.",
    },
  ],
  streak: [
    {
      title: "🔥 {days} days in a row!",
      body: "{days} days logged straight. Your future self says thanks.",
    },
    { title: "🥦 Streak: {days} days", body: "Brokely is growing proud. Keep it going tonight?" },
    {
      title: "⭐ {days}-day streak",
      body: "That's {days} days of knowing where your money goes. Nice.",
    },
  ],
  evening_friendly: [
    { title: "🌙 Quick one", body: "Anything spent today? 10 seconds to log it." },
    { title: "📝 Today's spending?", body: "Log it now and tomorrow-you will know where it went." },
    {
      title: "☕ Before you wind down",
      body: "Spent anything today? Log it, or tap No spending today.",
    },
  ],
  evening_cheeky: [
    {
      title: "😘 Deal?",
      body: "Log today's spending and I'll give you a kiss. A broccoli kiss. Still counts.",
    },
    {
      title: "🍲 Did you eat today?",
      body: "Then log it. Mama Brokely is waiting, and I can wait all night.",
    },
    {
      title: "👀 I can see you scrolling",
      body: "Scroll over to Brokely for 10 seconds, sayang. What did today cost?",
    },
    { title: "💚 Miss me?", body: "I miss you. And I miss today's spending even more. Come back?" },
    {
      title: "🌙 Before you sleep",
      body: "What did today cost? Don't make me ask twice. (I will ask twice.)",
    },
  ],
};

export interface NotificationInput {
  readonly today: LocalDate;
  /** "HH:MM" now, local time: nothing is scheduled in the past. */
  readonly now: string;
  /** How many days ahead to schedule, today included. */
  readonly horizonDays: number;
  readonly settings: NotificationSettings;
  /** Bill dates still to come (FR-CAT-05). */
  readonly bills: readonly { itemId: string; name: string; amountSen: Sen; dueDate: LocalDate }[];
  /** Open debts with a due date. */
  readonly debts: readonly {
    id: string;
    name: string;
    outstandingSen: Sen;
    dueDate: LocalDate;
    owedToMe: boolean;
  }[];
  /** Something (or "No spending today") logged today: no evening check-in today. */
  readonly loggedToday: boolean;
  /** Today's pace (R-11); null without a forecast. */
  readonly pace: { overPace: boolean; forecastSen: Sen; plannedSen: Sen } | null;
  /** The day a pace heads-up was last planned: at most one a week. */
  readonly lastPaceDate: LocalDate | null;
  /** Days logged in a row up to yesterday, and the milestone already celebrated. */
  readonly streak: { days: number; celebrated: number };
}

export interface PlannedNotification {
  /** Stable for the same thing on the same day, e.g. "bill_due:2026-10-23:item-1". */
  readonly key: string;
  readonly kind: NotificationKind;
  readonly date: LocalDate;
  /** "HH:MM", local time. */
  readonly time: string;
  readonly title: string;
  readonly body: string;
  /** Where a tap goes (FR-NOT-07). */
  readonly url: string;
}

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return h * 60 + m;
};

/** Moves a time out of quiet hours: to when they end if that's later the same day; else null. */
function outsideQuietHours(time: string, start: string, end: string): string | null {
  const t = minutes(time);
  const s = minutes(start);
  const e = minutes(end);
  if (s === e) return time; // no quiet hours
  const quiet = s < e ? t >= s && t < e : t >= s || t < e;
  if (!quiet) return time;
  return t < e ? end : null;
}

const EPOCH = localDate("2000-01-01");

/**
 * The wording for one notification: chosen by the date, so the same day always gets the same
 * text when re-planned, and consecutive days never repeat (FR-NOT-03). `offset` separates two of
 * the same kind on one day.
 */
function words(
  pool: TemplatePool,
  date: LocalDate,
  offset: number,
  values: Record<string, string>,
): Template {
  const variants = NOTIFICATION_TEMPLATES[pool];
  const t = variants[(daysBetween(EPOCH, date) + offset) % variants.length]!;
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? "");
  return { title: fill(t.title), body: fill(t.body) };
}

/** What to schedule from today over the next `horizonDays` days (FR-NOT-01…07). */
export function planNotifications(input: NotificationInput): PlannedNotification[] {
  const { settings, today } = input;
  if (!settings.enabled) return [];
  const on = (kind: NotificationKind) => settings.kinds[kind];
  const lastDay = addDays(today, input.horizonDays - 1);
  const inHorizon = (date: LocalDate) => date >= today && date <= lastDay;
  const all: PlannedNotification[] = [];
  const add = (
    kind: NotificationKind,
    date: LocalDate,
    time: string,
    ref: string,
    text: Template,
    url: string,
  ) => all.push({ key: `${kind}:${date}:${ref}`, kind, date, time, url, ...text });

  if (on("bill_due")) {
    const perDay = new Map<string, number>();
    for (const b of [...input.bills].sort((x, y) => x.itemId.localeCompare(y.itemId))) {
      if (!inHorizon(b.dueDate)) continue;
      const n = perDay.get(b.dueDate) ?? 0;
      perDay.set(b.dueDate, n + 1);
      const text = words("bill_due", b.dueDate, n, {
        name: b.name,
        amount: formatRM(b.amountSen),
      });
      add("bill_due", b.dueDate, BILL_TIME, b.itemId, text, `/bills/pay/${b.itemId}`);
    }
  }

  if (on("debt_due")) {
    const perDay = new Map<string, number>();
    for (const d of [...input.debts].sort((x, y) => x.id.localeCompare(y.id))) {
      if (!inHorizon(d.dueDate)) continue;
      const n = perDay.get(d.dueDate) ?? 0;
      perDay.set(d.dueDate, n + 1);
      const pool = d.owedToMe ? "debt_owed_to_me" : "debt_i_owe";
      const text = words(pool, d.dueDate, n, {
        name: d.name,
        amount: formatRM(d.outstandingSen),
      });
      add("debt_due", d.dueDate, DEBT_TIME, d.id, text, `/debts/${d.id}`);
    }
  }

  if (on("evening")) {
    const pool = settings.tone === "cheeky" ? "evening_cheeky" : "evening_friendly";
    for (let i = 0; i < input.horizonDays; i++) {
      const date = addDays(today, i);
      if (date === today && input.loggedToday) continue;
      add("evening", date, settings.eveningTime, "day", words(pool, date, 0, {}), "/quick-add");
    }
  }

  if (on("pace") && input.pace?.overPace) {
    const last = input.lastPaceDate;
    if (last === null || last === today || daysBetween(last, today) >= 7) {
      const text = words("pace", today, 0, {
        forecast: formatRM(input.pace.forecastSen),
        planned: formatRM(input.pace.plannedSen),
      });
      add("pace", today, PACE_TIME, "week", text, "/insights");
    }
  }

  const { days, celebrated } = input.streak;
  if (
    on("streak") &&
    days > celebrated &&
    (STREAK_MILESTONES as readonly number[]).includes(days)
  ) {
    add(
      "streak",
      today,
      STREAK_TIME,
      String(days),
      words("streak", today, 0, { days: String(days) }),
      "/",
    );
  }

  // Quiet hours, nothing in the past, then at most three a day, most useful first.
  const timed = all.flatMap((n) => {
    const time = outsideQuietHours(n.time, settings.quietStart, settings.quietEnd);
    if (time === null) return [];
    if (n.date === today && minutes(time) <= minutes(input.now)) return [];
    return [{ ...n, time }];
  });
  const byDay = new Map<string, PlannedNotification[]>();
  for (const n of timed) byDay.set(n.date, [...(byDay.get(n.date) ?? []), n]);
  const kept = [...byDay.values()].flatMap((list) =>
    [...list]
      .sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind])
      .slice(0, MAX_NOTIFICATIONS_PER_DAY),
  );
  return kept.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      minutes(a.time) - minutes(b.time) ||
      PRIORITY[a.kind] - PRIORITY[b.kind],
  );
}
