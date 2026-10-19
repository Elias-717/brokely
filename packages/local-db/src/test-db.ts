import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from "drizzle-kit/api";
import * as schema from "./schema";

/**
 * A fresh in-memory database with the full schema, for tests.
 * Tables are created straight from schema.ts with drizzle-kit, so tests always match the schema.
 * (The phone uses the same schema through drizzle-orm/expo-sqlite.)
 */
export async function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");

  const empty = await generateSQLiteDrizzleJson({});
  const current = await generateSQLiteDrizzleJson(schema);
  const statements = await generateSQLiteMigration(empty, current);
  for (const statement of statements) sqlite.exec(statement);

  return { sqlite, db: drizzle(sqlite, { schema }) };
}

/** Fixed timestamps and IDs keep test failures readable. */
export const NOW = "2026-11-02T04:15:00.000Z";
export const stamp = { createdAt: NOW, updatedAt: NOW } as const;

/** Readable, valid UUIDs: testId(7) = "0192f3a5-0000-7000-8000-000000000007". */
export const testId = (n: number) => `0192f3a5-0000-7000-8000-${String(n).padStart(12, "0")}`;

/**
 * A repository context over a fresh database. IDs count up from 1000 so they never clash
 * with the small fixed IDs tests use for seeded rows.
 */
export async function createTestContext() {
  const { sqlite, db } = await createTestDb();
  let next = 1000;
  let now = NOW;
  return {
    sqlite,
    ctx: { db, newId: () => testId(next++), now: () => now },
    /** Moves the clock, e.g. to check that an edit records a new time. */
    setNow: (instant: string) => {
      now = instant;
    },
  };
}
