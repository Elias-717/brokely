import { addDays, type LocalDate } from "./dates";

/**
 * The Brokely mascot in 0.1 (D-105): 3 growth stages × 4 moods, without XP. Growth comes from
 * habits only (days logged, BR-26), never from spending less, and never shrinks.
 */
export type MascotMood = "happy" | "worried" | "proud" | "sleepy";
export type MascotStage = 1 | 2 | 3;

/** Logged days needed for stage 2 and stage 3 (author, D-105; tune in the pilot). */
export const STAGE_2_DAYS = 7;
export const STAGE_3_DAYS = 30;
/** Days in a row that make Brokely proud, and days without logging that make it sleepy. */
export const PROUD_STREAK = 3;
export const SLEEPY_DAYS = 3;

export function mascotStage(loggedDays: number): MascotStage {
  return loggedDays >= STAGE_3_DAYS ? 3 : loggedDays >= STAGE_2_DAYS ? 2 : 1;
}

/** Logged days in a row ending today, or yesterday while today isn't logged yet. */
export function loggedStreak(today: LocalDate, logged: ReadonlySet<string>): number {
  let day = logged.has(today) ? today : addDays(today, -1);
  let days = 0;
  while (logged.has(day)) {
    days++;
    day = addDays(day, -1);
  }
  return days;
}

/**
 * Mood, first match wins (author, D-105): sleepy (logged before, but nothing in the last 3 days)
 * > proud (3+ days in a row) > worried (over pace or past the budget) > happy.
 */
export function mascotMood(input: {
  readonly today: LocalDate;
  /** Every date with a record or a "No spending today" check-in. */
  readonly logged: ReadonlySet<string>;
  readonly overPace: boolean;
}): MascotMood {
  const { today, logged } = input;
  const recent = Array.from({ length: SLEEPY_DAYS }, (_, i) => addDays(today, -i));
  if (logged.size > 0 && !recent.some((d) => logged.has(d))) return "sleepy";
  if (loggedStreak(today, logged) >= PROUD_STREAK) return "proud";
  if (input.overPace) return "worried";
  return "happy";
}
