import {
  expectedSinceLastCheck,
  sen,
  walletDifference,
  type Sen,
  type WalletDifference,
} from "@brokely/domain";
import { and, desc, eq, isNull, lte, sql } from "drizzle-orm";
import { walletChecks } from "../schema";
import { asLocalDate, RepoError, write, type Db, type RepoContext } from "./context";
import { enqueueUpsert, freshRow } from "./outbox";
import { listTransactions, purchaseInput, recordTransactionIn } from "./transactions";

/**
 * Wallet checks (FR-WAL-01…04, D-27, R-13). The student types the total money they have; the
 * app compares it with what their own records say since their previous check (BR-30, BR-31).
 * It never knows a balance by itself (BR-12, rule 6) and never logs a difference on its own.
 */

type WalletCheckRow = typeof walletChecks.$inferSelect;

export interface WalletComparison {
  /** The check this one is compared with ("Based on your check on Monday…", FR-WAL-04). */
  readonly lastCheck: WalletCheckRow;
  readonly expectedSen: Sen;
  readonly difference: WalletDifference;
}

const live = isNull(walletChecks.deletedAt);
const newestFirst = [desc(walletChecks.checkedAt), desc(sql`rowid`)] as const;

/** The latest check at or before `until`, skipping `exceptId`. */
function previousCheck(db: Db, until: string, exceptId?: string): WalletCheckRow | undefined {
  return db
    .select()
    .from(walletChecks)
    .where(
      and(
        live,
        lte(walletChecks.checkedAt, until),
        exceptId ? sql`${walletChecks.id} <> ${exceptId}` : undefined,
      ),
    )
    .orderBy(...newestFirst)
    .get();
}

function compare(db: Db, last: WalletCheckRow, amountSen: Sen, now: string): WalletComparison {
  // Only transactions after the last check can matter (BR-30); the domain re-checks the window.
  const since = listTransactions(db).filter((t) => t.occurredAt > last.checkedAt);
  const expectedSen = expectedSinceLastCheck(
    { checkedAt: last.checkedAt, amountSen: sen(last.amountSen) },
    since,
    now,
  );
  return { lastCheck: last, expectedSen, difference: walletDifference(amountSen, expectedSen) };
}

/** What the screen shows while the student types: null for the very first check (FR-WAL-02). */
export function compareWithLastCheck(db: Db, amountSen: Sen, now: string): WalletComparison | null {
  const last = previousCheck(db, now);
  return last ? compare(db, last, amountSen, now) : null;
}

/** Saves a check made now (FR-WAL-01) and returns how it compares with the previous one. */
export function recordWalletCheck(
  ctx: RepoContext,
  input: { amountSen: Sen; localDate: string; note?: string },
) {
  return write(ctx, (scope) => {
    const comparison = compareWithLastCheck(scope.tx, input.amountSen, scope.at);
    const row: WalletCheckRow = {
      ...freshRow(scope),
      checkedAt: scope.at,
      localDate: asLocalDate(input.localDate),
      amountSen: input.amountSen,
      note: input.note ?? "",
    };
    enqueueUpsert(scope, "wallet_check", row.id, null, {
      checkedAt: row.checkedAt,
      localDate: row.localDate,
      amountSen: row.amountSen,
      note: row.note,
    });
    scope.tx.insert(walletChecks).values(row).run();
    return { id: row.id, comparison };
  });
}

/** One millisecond before an instant, as an ISO string. */
function justBefore(instant: string): string {
  return new Date(Date.parse(instant) - 1).toISOString();
}

/**
 * "Log it" after a check (FR-WAL-03, AC-63): missing money becomes a purchase in the category
 * the student picks; extra money becomes money in. Only ever called from the student's tap.
 *
 * The entry is dated just before the check it explains. Dated after it, the next check would
 * count the same money again (BR-30 counts what happened after the last check).
 */
export function logWalletDifference(
  ctx: RepoContext,
  input: { checkId: string; categoryId?: string },
) {
  return write(ctx, (scope) => {
    const check = scope.tx
      .select()
      .from(walletChecks)
      .where(and(eq(walletChecks.id, input.checkId), live))
      .get();
    if (!check) throw new RepoError("NOT_FOUND", "That wallet check doesn't exist");
    const last = previousCheck(scope.tx, check.checkedAt, check.id);
    if (!last) throw new RepoError("VALIDATION_FAILED", "The first check has nothing to compare");

    const { difference } = compare(scope.tx, last, sen(check.amountSen), check.checkedAt);
    const when = { occurredAt: justBefore(check.checkedAt), localDate: check.localDate };
    switch (difference.kind) {
      case "match":
        throw new RepoError("VALIDATION_FAILED", "Your check matches your records");
      case "missing":
        if (!input.categoryId) {
          throw new RepoError("VALIDATION_FAILED", "Pick the category this spending goes in");
        }
        return recordTransactionIn(
          scope,
          purchaseInput({ amountSen: difference.amountSen, categoryId: input.categoryId, ...when }),
        );
      case "extra":
        return recordTransactionIn(scope, {
          type: "income",
          amountSen: difference.amountSen,
          ...when,
          lines: [],
        });
    }
  });
}
