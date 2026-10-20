import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/** A Drizzle database or an open transaction: postgres.js in production, PGlite in tests. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Rows of a raw `db.execute`: postgres.js returns an array, PGlite an object with `rows`. */
export function rowsOf<T>(result: unknown): T[] {
  return (Array.isArray(result) ? result : (result as { rows: T[] }).rows) as T[];
}

/**
 * Connects to Supabase PostgreSQL. Use the pooler URL (IPv4); on the transaction pooler
 * (port 6543) prepared statements must be off, so they are off everywhere.
 */
export function connect(databaseUrl: string): { db: Db; close: () => Promise<void> } {
  const client = postgres(databaseUrl, { prepare: false, max: 5 });
  return { db: drizzle(client, { schema }), close: () => client.end() };
}
