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
