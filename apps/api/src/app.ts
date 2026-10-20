import {
  IdSchema,
  MAX_OPERATIONS_PER_PUSH,
  PullQuerySchema,
  type HealthResponse,
  type PullResponse,
  type PushResponse,
} from "@brokely/contracts";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { z } from "zod";
import type { VerifyToken } from "./auth";
import type { Db } from "./db/client";
import { pull } from "./sync/pull";
import { push } from "./sync/push";

export interface AppDeps {
  readonly db: Db;
  readonly verifyToken: VerifyToken;
}

/**
 * The batch is checked loosely here: each operation is checked on its own in push.ts, so one
 * bad change is `rejected` without failing the others (sync-api §4 step 2).
 */
const PushEnvelopeSchema = z.object({
  deviceId: IdSchema,
  operations: z
    .array(z.object({ operationId: IdSchema }).passthrough())
    .min(1)
    .max(MAX_OPERATIONS_PER_PUSH),
});

/**
 * Builds the API without starting it, so tests can call it in memory.
 * Without `deps` only /health is served.
 */
export function buildApp(deps?: AppDeps, options: { logger?: boolean } = {}): FastifyInstance {
  // The default logger writes method, URL and status only: never bodies (NFR-17).
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 1024 * 1024 });

  app.get("/health", async (): Promise<HealthResponse> => ({ status: "ok" }));
  if (!deps) return app;

  /** The student from the sign-in token (S-02), or a 401 reply. */
  async function student(request: FastifyRequest): Promise<string | null> {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) return null;
    return deps!.verifyToken(header.slice("Bearer ".length));
  }

  app.post("/v1/sync/push", async (request, reply): Promise<PushResponse | void> => {
    const userId = await student(request);
    if (!userId) return reply.code(401).send({ error: "Sign in again" });
    const body = PushEnvelopeSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Malformed batch" });
    return { results: await push(deps.db, userId, body.data.operations) };
  });

  app.get("/v1/sync/pull", async (request, reply): Promise<PullResponse | void> => {
    const userId = await student(request);
    if (!userId) return reply.code(401).send({ error: "Sign in again" });
    const query = PullQuerySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: "Bad since or limit" });
    return pull(deps.db, userId, query.data.since, query.data.limit);
  });

  return app;
}
