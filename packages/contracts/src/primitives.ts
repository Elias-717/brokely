import { z } from "zod";

/**
 * Building blocks shared by every contract.
 * Money is whole sen (BR-01). Dates people see are local dates; moments are UTC instants (ERD §1).
 */

/** Record and operation IDs: UUIDs created on the phone (FR-SYNC-03). */
export const IdSchema = z.string().uuid();

/** A stored amount: whole sen, always greater than zero (BR-01, R-04). */
export const AmountSenSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

/** An allocation may be zero (a category the student keeps but gives no money this cycle). */
export const AllocationSenSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

/** The only signed amount in the model: an audited debt adjustment (BR-22). Never zero. */
export const SignedSenSchema = z
  .number()
  .int()
  .refine((value) => value !== 0, "An adjustment cannot be zero")
  .refine((value) => Math.abs(value) <= Number.MAX_SAFE_INTEGER, "Amount too large");

/** Row version for optimistic concurrency (D-06). Starts at 1. */
export const VersionSchema = z.number().int().positive();

/** A calendar date in the student's time zone, e.g. "2026-11-02" (BR-03). */
export const LocalDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine(isRealDate, "Not a real calendar date");

/** A moment in time in UTC, e.g. "2026-11-02T04:15:00Z". */
export const InstantSchema = z.string().datetime({ offset: true });

function isRealDate(value: string): boolean {
  const [y, m, d] = value.split("-").map(Number);
  if (y === undefined || m === undefined || d === undefined) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Short free text typed by the student (names, notes). */
export const NameSchema = z.string().trim().min(1).max(60);
export const NoteSchema = z.string().max(500);
