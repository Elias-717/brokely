import { z } from "zod";

export * from "./primitives";
export * from "./entities";
export * from "./sync";
export * from "./ids";
export * from "./privacy-notice";
export * from "./terms";

/** Response of GET /health. */
export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
