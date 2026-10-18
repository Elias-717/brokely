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
