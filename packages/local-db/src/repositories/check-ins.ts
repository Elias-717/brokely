import { and, asc, eq, gte, isNull, lt } from "drizzle-orm";
import { dayCheckIns } from "../schema";
import { checkCheckInDate } from "@brokely/domain";
import { asLocalDate, ensure, RepoError, write, type Db, type RepoContext } from "./context";
import { enqueueDelete, enqueueUpsert, freshRow, touched } from "./outbox";

/** "No spending today" check-ins: a covered day without a purchase (FR-TXN-08, R-01, AC-30). */

const live = isNull(dayCheckIns.deletedAt);

function liveOn(db: Db, localDate: string) {
  return db
    .select()
    .from(dayCheckIns)
    .where(and(eq(dayCheckIns.localDate, localDate), live))
    .get();
}

/** Dates with a live check-in, oldest first; optionally only inside a date range. */
export function listCheckInDates(
  db: Db,
  range?: { readonly start: string; readonly endExclusive: string },
): string[] {
  return db
    .select({ localDate: dayCheckIns.localDate })
    .from(dayCheckIns)
    .where(
      range
        ? and(
            live,
            gte(dayCheckIns.localDate, range.start),
            lt(dayCheckIns.localDate, range.endExclusive),
          )
        : live,
    )
    .orderBy(asc(dayCheckIns.localDate))
    .all()
    .map((r) => r.localDate);
}

/**
 * One check-in per day: tapping twice keeps the first (S-06). With `today`, a day still to come
 * is refused (D-60: earlier days can be marked from Records).
 */
export function checkInNoSpending(ctx: RepoContext, localDate: string, today?: string) {
  return write(ctx, (scope) => {
    const date = asLocalDate(localDate);
    if (today) ensure(checkCheckInDate(date, asLocalDate(today)));
    const existing = liveOn(scope.tx, date);
    if (existing) return { id: existing.id };
    const row = { ...freshRow(scope), localDate: date };
    enqueueUpsert(scope, "day_check_in", row.id, null, { localDate: date });
    scope.tx.insert(dayCheckIns).values(row).run();
    return { id: row.id };
  });
}

export function undoCheckIn(ctx: RepoContext, localDate: string) {
  return write(ctx, (scope) => {
    const existing = liveOn(scope.tx, asLocalDate(localDate));
    if (!existing) throw new RepoError("NOT_FOUND", "No check-in on that day");
    enqueueDelete(scope, "day_check_in", existing.id, existing.version);
    scope.tx
      .update(dayCheckIns)
      .set({ deletedAt: scope.at, ...touched(scope.at) })
      .where(eq(dayCheckIns.id, existing.id))
      .run();
  });
}
