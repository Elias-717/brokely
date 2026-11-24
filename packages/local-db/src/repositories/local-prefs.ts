import {
  DEFAULT_NOTIFICATION_SETTINGS,
  readTngQueue,
  sen,
  type MoneyInRoute,
  type MoneyInRouteRecord,
  type NotificationSettings,
  type TngQueue,
} from "@brokely/domain";
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

/**
 * Hidden heads-ups in Insights (D-102), per cycle like the essential cards: category → how far
 * ahead it was when hidden, in sen. Phone-only, never synced.
 */
const headsUpKey = (cycleId: string) => `heads_up:${cycleId}`;

export function getHiddenHeadsUps(db: Db, cycleId: string): Record<string, number> {
  const value = getPref(db, headsUpKey(cycleId));
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (e): e is [string, number] => typeof e[1] === "number",
    ),
  );
}

export function hideHeadsUp(ctx: RepoContext, cycleId: string, categoryId: string, gapSen: number) {
  setPref(ctx, headsUpKey(cycleId), {
    ...getHiddenHeadsUps(ctx.db, cycleId),
    [categoryId]: gapSen,
  });
}

/** Undo of a hide. */
export function showHeadsUp(ctx: RepoContext, cycleId: string, categoryId: string) {
  const hidden = getHiddenHeadsUps(ctx.db, cycleId);
  delete hidden[categoryId];
  setPref(ctx, headsUpKey(cycleId), hidden);
}

/**
 * "Add RMx to your plan?" after money in (D-125), per cycle: the suggestion in sen when the
 * student tapped Not now. It comes back only when more money in makes the suggestion bigger.
 * Phone-only, never synced.
 */
const moneyInKey = (cycleId: string) => `money_in_hidden:${cycleId}`;

export function getHiddenMoneyIn(db: Db, cycleId: string): number | null {
  const value = getPref(db, moneyInKey(cycleId));
  return typeof value === "number" ? value : null;
}

export function hideMoneyIn(ctx: RepoContext, cycleId: string, suggestionSen: number): void {
  setPref(ctx, moneyInKey(cycleId), suggestionSen);
}

/** Undo of Not now. */
export function showMoneyIn(ctx: RepoContext, cycleId: string): void {
  ctx.db
    .delete(localPrefs)
    .where(eq(localPrefs.key, moneyInKey(cycleId)))
    .run();
}

/**
 * The highest Brokely stage the student has seen celebrated (D-109); null before Home first
 * stores it. Phone-only, so a new phone celebrates nothing it has already passed.
 */
export function getSeenMascotStage(db: Db): number | null {
  const value = getPref(db, "mascot_stage_seen");
  return typeof value === "number" ? value : null;
}

export function setSeenMascotStage(ctx: RepoContext, stage: number): void {
  setPref(ctx, "mascot_stage_seen", stage);
}

/** The one-time "how Brokely grows" card on Profile (D-110): gone after "Got it". */
export function getMascotIntroSeen(db: Db): boolean {
  return getPref(db, "mascot_intro_seen") === true;
}

export function setMascotIntroSeen(ctx: RepoContext): void {
  setPref(ctx, "mascot_intro_seen", true);
}

/** The one-time "Catch your TNG payments" sheet on Home (D-140): gone once closed. */
export function getTngPromptSeen(db: Db): boolean {
  return getPref(db, "tng_prompt_seen") === true;
}

export function setTngPromptSeen(ctx: RepoContext): void {
  setPref(ctx, "tng_prompt_seen", true);
}

/** Vibration when saving (D-111): on by default; More → Settings turns it off. */
export function getHapticsEnabled(db: Db): boolean {
  return getPref(db, "haptics") !== false;
}

export function setHapticsEnabled(ctx: RepoContext, enabled: boolean): void {
  setPref(ctx, "haptics", enabled);
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

// ── Notifications (D-94): settings and a little state, this phone only ─────────

const NOTIFY_KEY = "notifications";

export interface NotificationPrefs {
  readonly settings: NotificationSettings;
  /** Brokely explained and Android asked once (N2); never ask again unprompted. */
  readonly asked: boolean;
  /** The day the last pace heads-up was planned: at most one a week. */
  readonly lastPaceDate: string | null;
  /** The streak milestone already celebrated. */
  readonly celebratedStreak: number;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const time = (value: unknown, fallback: string) =>
  typeof value === "string" && HHMM.test(value) ? value : fallback;

/** The stored preferences, with defaults for anything missing or malformed. */
export function getNotificationPrefs(db: Db): NotificationPrefs {
  const v = (getPref(db, NOTIFY_KEY) ?? {}) as {
    settings?: Partial<NotificationSettings> & { kinds?: Partial<NotificationSettings["kinds"]> };
    asked?: unknown;
    lastPaceDate?: unknown;
    celebratedStreak?: unknown;
  };
  const d = DEFAULT_NOTIFICATION_SETTINGS;
  const s = v.settings ?? {};
  const kinds = Object.fromEntries(
    Object.entries(d.kinds).map(([k, on]) => [
      k,
      typeof s.kinds?.[k as keyof typeof d.kinds] === "boolean"
        ? s.kinds[k as keyof typeof d.kinds]
        : on,
    ]),
  ) as unknown as NotificationSettings["kinds"];
  return {
    settings: {
      enabled: typeof s.enabled === "boolean" ? s.enabled : d.enabled,
      kinds,
      eveningTime: time(s.eveningTime, d.eveningTime),
      tone: s.tone === "cheeky" || s.tone === "friendly" ? s.tone : d.tone,
      quietStart: time(s.quietStart, d.quietStart),
      quietEnd: time(s.quietEnd, d.quietEnd),
    },
    asked: v.asked === true,
    lastPaceDate: typeof v.lastPaceDate === "string" ? v.lastPaceDate : null,
    celebratedStreak: typeof v.celebratedStreak === "number" ? v.celebratedStreak : 0,
  };
}

/** Changes settings; `kinds` merges, so one switch can change alone (FR-NOT-05). */
export function setNotificationSettings(
  ctx: RepoContext,
  change: Partial<Omit<NotificationSettings, "kinds">> & {
    kinds?: Partial<NotificationSettings["kinds"]>;
  },
): void {
  const now = getNotificationPrefs(ctx.db);
  setPref(ctx, NOTIFY_KEY, {
    ...now,
    settings: { ...now.settings, ...change, kinds: { ...now.settings.kinds, ...change.kinds } },
  });
}

export function setNotificationState(
  ctx: RepoContext,
  change: Partial<Omit<NotificationPrefs, "settings">>,
): void {
  setPref(ctx, NOTIFY_KEY, { ...getNotificationPrefs(ctx.db), ...change });
}

// ── Add sheet draft (D-117) ─────────────────────────────────────────────────────

/**
 * What was typed in Add when the sheet closed without saving, so a slipped swipe loses
 * nothing. Phone-only, never synced; kept for the day it was typed (`day`), then forgotten.
 * The fields are the sheet's own; this file only stores and expires them.
 */
export interface AddDraft {
  readonly day: string;
  readonly fields: Readonly<Record<string, string | boolean | null>>;
}

const ADD_DRAFT_KEY = "add_draft";

/** Today's draft, or null if there is none or it is from another day. */
export function getAddDraft(db: Db, today: string): AddDraft | null {
  const v = getPref(db, ADD_DRAFT_KEY) as Partial<AddDraft> | undefined;
  if (!v || v.day !== today || !v.fields || typeof v.fields !== "object") return null;
  const fields = Object.fromEntries(
    Object.entries(v.fields).filter(
      ([, x]) => x === null || typeof x === "string" || typeof x === "boolean",
    ),
  );
  return { day: v.day, fields };
}

export function setAddDraft(ctx: RepoContext, draft: AddDraft): void {
  setPref(ctx, ADD_DRAFT_KEY, draft);
}

export function clearAddDraft(ctx: RepoContext): void {
  if (getPref(ctx.db, ADD_DRAFT_KEY) === undefined) return; // no write, so no screen re-reads
  ctx.db.delete(localPrefs).where(eq(localPrefs.key, ADD_DRAFT_KEY)).run();
}

// ── TNG imports waiting for the student (D-02, D-128) ──────────────────────────

const TNG_QUEUE_KEY = "tng_queue";

/**
 * The TNG transfers the phone caught that the student has not dealt with yet, plus a short memory
 * of those already dealt with (FR-IMP-04, FR-IMP-05). Phone-only, never synced: it holds other
 * people's names. It is wiped with everything else by "Delete everything" (FR-ACC-07).
 */
export function getTngQueue(db: Db): TngQueue {
  return readTngQueue(getPref(db, TNG_QUEUE_KEY));
}

/** Callers write only when the queue changed: each write makes every open screen read again. */
export function setTngQueue(ctx: RepoContext, queue: TngQueue): void {
  setPref(ctx, TNG_QUEUE_KEY, queue);
}

/**
 * Where each money in went (D-130, D-134), per plan, by record id: Home uses it for today's
 * boost and to leave money already in the plan out of "Add RMx to your plan?" (D-125).
 * Phone-only, never synced: on another phone the plan revision arrives, the boost does not.
 */
const moneyInRoutesKey = (cycleId: string) => `money_in_routes:${cycleId}`;
const ROUTES: readonly MoneyInRoute[] = ["plan", "set_aside", "today", "debt", "record"];

export function getMoneyInRoutes(db: Db, cycleId: string): Record<string, MoneyInRouteRecord> {
  const value = getPref(db, moneyInRoutesKey(cycleId));
  if (typeof value !== "object" || value === null) return {};
  const out: Record<string, MoneyInRouteRecord> = {};
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    const r = raw as Partial<Record<keyof MoneyInRouteRecord, unknown>> | null;
    if (!r || !ROUTES.includes(r.to as MoneyInRoute)) continue;
    if (typeof r.amountSen !== "number" || typeof r.localDate !== "string") continue;
    out[id] = {
      to: r.to as MoneyInRoute,
      amountSen: sen(r.amountSen),
      localDate: r.localDate,
      ...(typeof r.revisionId === "string" ? { revisionId: r.revisionId } : {}),
    };
  }
  return out;
}

export function setMoneyInRoute(
  ctx: RepoContext,
  cycleId: string,
  transactionId: string,
  route: MoneyInRouteRecord,
): void {
  setPref(ctx, moneyInRoutesKey(cycleId), {
    ...getMoneyInRoutes(ctx.db, cycleId),
    [transactionId]: route,
  });
}

/** Undo of {@link setMoneyInRoute}. */
export function removeMoneyInRoute(ctx: RepoContext, cycleId: string, transactionId: string): void {
  const routes = getMoneyInRoutes(ctx.db, cycleId);
  delete routes[transactionId];
  setPref(ctx, moneyInRoutesKey(cycleId), routes);
}

/**
 * Which plan revision a loan made when it was counted in the plan (D-141), per cycle, by the
 * lend record's id: deleting the loan from Records undoes that revision. Phone-only.
 */
const planLinksKey = (cycleId: string) => `plan_links:${cycleId}`;

export function getPlanLinks(db: Db, cycleId: string): Record<string, string> {
  const value = getPref(db, planLinksKey(cycleId));
  if (typeof value !== "object" || value === null) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (e): e is [string, string] => typeof e[1] === "string",
    ),
  );
}

export function setPlanLink(
  ctx: RepoContext,
  cycleId: string,
  transactionId: string,
  revisionId: string,
): void {
  setPref(ctx, planLinksKey(cycleId), {
    ...getPlanLinks(ctx.db, cycleId),
    [transactionId]: revisionId,
  });
}

export function removePlanLink(ctx: RepoContext, cycleId: string, transactionId: string): void {
  const links = getPlanLinks(ctx.db, cycleId);
  delete links[transactionId];
  setPref(ctx, planLinksKey(cycleId), links);
}

/**
 * Note suggestions in Add (D-112, D-143): on or off, and the past notes the student removed, by
 * `suggestionNotes` key. Removing one only hides it: the record keeps its note. Phone-only.
 */
const NOTE_SUGGESTIONS_KEY = "note_suggestions";

export interface NoteSuggestionPrefs {
  readonly enabled: boolean;
  readonly hidden: readonly string[];
}

export function getNoteSuggestionPrefs(db: Db): NoteSuggestionPrefs {
  const v = getPref(db, NOTE_SUGGESTIONS_KEY) as Partial<NoteSuggestionPrefs> | undefined;
  return {
    enabled: v?.enabled ?? true,
    hidden: Array.isArray(v?.hidden)
      ? v.hidden.filter((x): x is string => typeof x === "string")
      : [],
  };
}

export function setNoteSuggestionsEnabled(ctx: RepoContext, enabled: boolean): void {
  setPref(ctx, NOTE_SUGGESTIONS_KEY, { ...getNoteSuggestionPrefs(ctx.db), enabled });
}

/** Removes past notes from the suggestions (one, or all for Clear all). */
export function hideNoteSuggestions(ctx: RepoContext, keys: readonly string[]): void {
  const now = getNoteSuggestionPrefs(ctx.db);
  setPref(ctx, NOTE_SUGGESTIONS_KEY, { ...now, hidden: [...new Set([...now.hidden, ...keys])] });
}

/** Undo of {@link hideNoteSuggestions}. */
export function showNoteSuggestions(ctx: RepoContext, keys: readonly string[]): void {
  const now = getNoteSuggestionPrefs(ctx.db);
  const back = new Set(keys);
  setPref(ctx, NOTE_SUGGESTIONS_KEY, { ...now, hidden: now.hidden.filter((k) => !back.has(k)) });
}
