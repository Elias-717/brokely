import { z } from "zod";

/** A stored amount: whole sen, always greater than zero (BR-01, R-04). */
export const AmountSenSchema = z.number().int().positive();

/** IDs are UUIDs created on the phone (FR-SYNC-03). */
export const IdSchema = z.string().uuid();

/** Response of GET /health. */
export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
