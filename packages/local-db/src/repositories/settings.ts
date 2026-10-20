import { isNull } from "drizzle-orm";
import { userSettings } from "../schema";
import { RepoError, write, type Db, type RepoContext } from "./context";
import { enqueueUpsert, freshRow, touched } from "./outbox";

/**
 * Student settings that sync (FR-ACC-05): time zone and first day of the week (0 = Sunday,
 * 1 = Monday). Currency is always MYR, so it is not a setting. One row per student.
 */

type SettingsRow = typeof userSettings.$inferSelect;

export interface Settings {
  readonly timeZone: string;
  readonly weekStart: number;
  readonly mascotVisible: boolean;
}

/** Brokely starts in Malaysia (first pilot at AIU); a Monday week is the local habit. */
export const DEFAULT_SETTINGS: Settings = {
  timeZone: "Asia/Kuala_Lumpur",
  weekStart: 1,
  mascotVisible: true,
};

function row(db: Db): SettingsRow | undefined {
  return db.select().from(userSettings).where(isNull(userSettings.deletedAt)).get();
}

/** The saved settings, or the defaults before the student changes anything. */
export function getSettings(db: Db): Settings {
  const r = row(db);
  return r
    ? { timeZone: r.timeZone, weekStart: r.weekStart, mascotVisible: r.mascotVisible }
    : DEFAULT_SETTINGS;
}

/** Changes some settings; the first change creates the row (FR-ACC-05). */
export function updateSettings(ctx: RepoContext, change: Partial<Settings>) {
  return write(ctx, (scope) => {
    if (change.weekStart !== undefined && ![0, 1, 2, 3, 4, 5, 6].includes(change.weekStart)) {
      throw new RepoError("VALIDATION_FAILED", "The week starts on a day from Sunday to Saturday");
    }
    const before = row(scope.tx);
    const next: Settings = { ...(before ? getSettings(scope.tx) : DEFAULT_SETTINGS), ...change };
    if (before) {
      enqueueUpsert(scope, "user_settings", before.id, before.version, next);
      scope.tx
        .update(userSettings)
        .set({ ...next, ...touched(scope.at) })
        .run();
    } else {
      const fresh: SettingsRow = { ...freshRow(scope), ...next };
      enqueueUpsert(scope, "user_settings", fresh.id, null, next);
      scope.tx.insert(userSettings).values(fresh).run();
    }
  });
}
