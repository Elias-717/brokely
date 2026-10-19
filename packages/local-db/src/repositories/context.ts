import { localDate, type LocalDate, type RuleErrorCode, type RuleResult } from "@brokely/domain";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type * as schema from "../schema";

/**
 * What every repository needs (Phase 3).
 *
 * - `db`: a synchronous Drizzle database. better-sqlite3 (tests) and expo-sqlite (phone) are both
 *   synchronous, so the same repository code runs on both.
 * - `newId`: makes record and operation IDs. The app passes UUIDv7 (FR-SYNC-03); tests pass a counter.
 * - `now`: the current moment as an ISO-8601 UTC instant. Injected so tests are repeatable (NFR-02).
 *
 * Local dates ("today") are always passed in by the caller, never read from the clock here.
 */
export interface RepoContext {
  // The run-result type differs per driver; repositories never read it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly db: BaseSQLiteDatabase<"sync", any, typeof schema>;
  readonly newId: () => string;
  readonly now: () => string;
}

/** A database or an open transaction: both have the same query builder. */
export type Db = RepoContext["db"];

/** Codes a repository can refuse with: the domain's rule codes plus the sync reference codes. */
export type RepoErrorCode = RuleErrorCode | "NOT_FOUND" | "REFERENCE_MISSING";

export type RepoResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: RepoErrorCode; readonly message: string };

/** Thrown inside a write to roll the whole SQLite transaction back. */
export class RepoError extends Error {
  constructor(
    readonly code: RepoErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RepoError";
  }
}

/** Stops the write when a domain rule fails. */
export function ensure(result: RuleResult): void {
  if (!result.ok) throw new RepoError(result.code, result.message);
}

/** Validates a "YYYY-MM-DD" date from the caller (BR-03). */
export function asLocalDate(value: string): LocalDate {
  try {
    return localDate(value);
  } catch (error) {
    throw new RepoError("VALIDATION_FAILED", (error as Error).message);
  }
}

/** The values one write uses: one transaction, one timestamp, one ID source. */
export interface WriteScope {
  readonly tx: Db;
  readonly at: string;
  readonly newId: () => string;
}

/**
 * Runs one user action in ONE SQLite transaction (rule 5, FR-SYNC-04): the records and their
 * outbox operations are saved together or not at all. Rule failures come back as a result;
 * anything else (a bug, a broken constraint) is thrown.
 */
export function write<T>(ctx: RepoContext, action: (scope: WriteScope) => T): RepoResult<T> {
  try {
    const value = ctx.db.transaction((tx) => action({ tx, at: ctx.now(), newId: ctx.newId }));
    return { ok: true, value };
  } catch (error) {
    if (error instanceof RepoError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}
