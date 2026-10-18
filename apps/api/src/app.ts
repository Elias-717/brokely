import type { HealthResponse } from "@brokely/contracts";
import Fastify, { type FastifyInstance } from "fastify";

/**
 * Builds the API without starting it, so tests can call it in memory.
 * Sync endpoints (POST /sync/push, GET /sync/pull) arrive in Phase 4.
 */
export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/health", async (): Promise<HealthResponse> => ({ status: "ok" }));

  return app;
}
