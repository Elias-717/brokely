import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import type { Db } from "./client";
import * as schema from "./schema";

const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

/**
 * A fresh in-memory PostgreSQL (PGlite, Postgres 17 like Supabase) with every migration applied.
 * Supabase's own pieces the migrations rely on (the `auth.users` table, the Data API roles) are
 * stubbed first.
 */
export async function createTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const client = new PGlite({ extensions: { btree_gist } });
  await client.exec(`
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE ROLE anon;
    CREATE ROLE authenticated;
  `);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return { db: db as unknown as Db, close: () => client.close() };
}

/** Adds sign-in users (what Supabase does on sign-up). */
export async function addUsers(db: Db, ...ids: string[]): Promise<void> {
  for (const id of ids) await db.execute(sql`insert into auth.users (id) values (${id})`);
}
