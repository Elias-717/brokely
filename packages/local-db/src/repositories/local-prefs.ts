import { eq } from "drizzle-orm";
import { localPrefs } from "../schema";
import type { Db, RepoContext } from "./context";

/**
 * Preferences that belong to this phone only (D-30, D-32). Unlike every other repository these
 * never write to the outbox: they are not synced records (rule 5 covers synced data).
 */

function getPref(db: Db, key: string): unknown {
  return db
    .select({ value: localPrefs.value })
    .from(localPrefs)
    .where(eq(localPrefs.key, key))
    .get()?.value;
}

function setPref(ctx: RepoContext, key: string, value: unknown): void {
  const updatedAt = ctx.now();
  ctx.db
    .insert(localPrefs)
    .values({ key, value, updatedAt })
    .onConflictDoUpdate({ target: localPrefs.key, set: { value, updatedAt } })
    .run();
}

export const APPEARANCES = ["system", "light", "dark"] as const;
/** Light / Dark / Same as phone; the default follows the phone (D-32). */
export type Appearance = (typeof APPEARANCES)[number];

export function getAppearance(db: Db): Appearance {
  const value = getPref(db, "appearance");
  return APPEARANCES.includes(value as Appearance) ? (value as Appearance) : "system";
}

export function setAppearance(ctx: RepoContext, appearance: Appearance): void {
  setPref(ctx, "appearance", appearance);
}

/** Longest nickname kept; bubbles stay readable. */
export const NICKNAME_MAX = 30;

/** What Brokely calls the student, or null (D-34). Optional, phone-only, never synced. */
export function getNickname(db: Db): string | null {
  const value = getPref(db, "nickname");
  return typeof value === "string" && value !== "" ? value : null;
}

/** A blank name clears it. */
export function setNickname(ctx: RepoContext, nickname: string): void {
  setPref(ctx, "nickname", nickname.trim().slice(0, NICKNAME_MAX));
}

/** Essential-card choices for one cycle (D-30): stored per cycle, so a new cycle starts fresh. */
export interface StoredCardChoices {
  readonly dismissed: readonly string[];
  /** Oldest first. */
  readonly later: readonly string[];
}

const cardKey = (cycleId: string) => `cards:${cycleId}`;

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

export function getCardChoices(db: Db, cycleId: string): StoredCardChoices {
  const value = getPref(db, cardKey(cycleId)) as Partial<Record<keyof StoredCardChoices, unknown>>;
  return { dismissed: strings(value?.dismissed), later: strings(value?.later) };
}

/** "Not for me": not shown again in this cycle. */
export function dismissCard(ctx: RepoContext, cycleId: string, cardId: string): void {
  const { dismissed, later } = getCardChoices(ctx.db, cycleId);
  setPref(ctx, cardKey(cycleId), {
    dismissed: dismissed.includes(cardId) ? dismissed : [...dismissed, cardId],
    later: later.filter((id) => id !== cardId),
  });
}

/** "Later": to the back of the queue. */
export function postponeCard(ctx: RepoContext, cycleId: string, cardId: string): void {
  const { dismissed, later } = getCardChoices(ctx.db, cycleId);
  setPref(ctx, cardKey(cycleId), {
    dismissed,
    later: [...later.filter((id) => id !== cardId), cardId],
  });
}

/** Money tips after saving an expense (D-39, D-67). Phone-only, never synced. */
export interface MoneyTipsState {
  /** On by default; More → Settings turns it off. */
  readonly enabled: boolean;
  /** The local date the count below belongs to. */
  readonly day: string | null;
  readonly shownToday: number;
  /** Tip IDs already shown, oldest first, so tips don't repeat until most have been seen. */
  readonly seen: readonly string[];
}

const TIPS_KEY = "money_tips";

export function getMoneyTips(db: Db): MoneyTipsState {
  const v = getPref(db, TIPS_KEY) as Partial<MoneyTipsState> | undefined;
  return {
    enabled: v?.enabled ?? true,
    day: typeof v?.day === "string" ? v.day : null,
    shownToday: typeof v?.shownToday === "number" ? v.shownToday : 0,
    seen: Array.isArray(v?.seen) ? v.seen.filter((x): x is string => typeof x === "string") : [],
  };
}

export function setMoneyTipsEnabled(ctx: RepoContext, enabled: boolean): void {
  setPref(ctx, TIPS_KEY, { ...getMoneyTips(ctx.db), enabled });
}

/**
 * Remembers a shown tip: counts it for `today` (a new day starts at 0) and adds it to `seen`.
 * Once `seen` holds `resetAfter` tips the list starts over, so every tip comes back eventually.
 */
export function recordTipShown(
  ctx: RepoContext,
  input: { tipId: string; today: string; resetAfter: number },
): void {
  const now = getMoneyTips(ctx.db);
  const shownToday = now.day === input.today ? now.shownToday + 1 : 1;
  const seen = [...now.seen.filter((id) => id !== input.tipId), input.tipId];
  setPref(ctx, TIPS_KEY, {
    ...now,
    day: input.today,
    shownToday,
    seen: seen.length >= input.resetAfter ? [input.tipId] : seen,
  });
}
