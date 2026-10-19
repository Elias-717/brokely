import { schema, type RepoContext } from "@brokely/local-db";
import { drizzle } from "drizzle-orm/expo-sqlite";
import { getRandomBytes } from "expo-crypto";
import { openDatabaseSync } from "expo-sqlite";
import { v7 as uuidv7 } from "uuid";

/**
 * The phone database (FR-SYNC-01/02). One connection for the whole app.
 * `enableChangeListener` lets screens re-read after any write (see useRead).
 */
export const sqlite = openDatabaseSync("brokely.db", { enableChangeListener: true });

// SQLite turns foreign keys off on every new connection; the schema relies on them.
sqlite.execSync("PRAGMA foreign_keys = ON;");

export const db = drizzle(sqlite, { schema });

/**
 * What every repository call gets: UUIDv7 IDs made on the phone (FR-SYNC-03, rule 5) from
 * secure random bytes, and the current moment as a UTC instant.
 */
export const repo: RepoContext = {
  db,
  newId: () => uuidv7({ random: getRandomBytes(16) }),
  now: () => new Date().toISOString(),
};
