import { sql } from "drizzle-orm";
import type { Db } from "./db/client";

/**
 * Deletes a student's account (FR-ACC-07): their Supabase sign-in, and with it, through the
 * `on delete cascade` links, every row they have on the server (records, plans, debts, the
 * operations log). Supabase's own sign-in tables (sessions, identities) cascade the same way.
 * The ID comes from the sign-in token only (S-02), so nobody can delete someone else.
 */
export async function deleteAccount(db: Db, userId: string): Promise<void> {
  await db.execute(sql`delete from auth.users where id = ${userId}`);
}
