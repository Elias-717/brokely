import {
  IdSchema,
  MAX_OPERATIONS_PER_PUSH,
  PullQuerySchema,
  type HealthResponse,
  type PullResponse,
  type PushResponse,
} from "@brokely/contracts";
import { sql } from "drizzle-orm";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { z } from "zod";
import { deleteAccount } from "./account";
import type { VerifyToken } from "./auth";
import type { Db } from "./db/client";
import { createRateLimit, PUSHES_PER_MINUTE } from "./rate-limit";
import { pull } from "./sync/pull";
import { push } from "./sync/push";

/**
 * What may be logged about an error: its kind and, for a database error, Postgres's own code and
 * message (e.g. 28P01 "password authentication failed", 42P01 "relation does not exist"), which
 * never contain the query's values. Never the error's own message, query or parameters.
 */
export function errorSummary(error: unknown): Record<string, unknown> {
  let root = error as { name?: string; code?: unknown; message?: string; cause?: unknown };
  while (root.cause && typeof root.cause === "object") root = root.cause as typeof root;
  const sqlState = typeof root.code === "string" && /^[0-9A-Z]{5}$/.test(root.code);
  return {
    error: root.name ?? "Error",
    ...(sqlState ? { code: root.code, detail: root.message } : {}),
  };
}

export interface AppDeps {
  readonly db: Db;
  readonly verifyToken: VerifyToken;
  /** The clock for the push limit; tests move it forward. */
  readonly now?: () => number;
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
export function buildApp(
  deps?: AppDeps,
  options: { logger?: boolean; logStream?: { write(line: string): void } } = {},
): FastifyInstance {
  // The default logger writes method, URL and status only: never bodies (NFR-17).
  const app = Fastify({
    logger: options.logStream ? { stream: options.logStream } : (options.logger ?? false),
    bodyLimit: 1024 * 1024,
  });

  // Errors are logged by kind only. Fastify's default would log the error as thrown, and a
  // failed query's message carries its values: amounts, notes, names (NFR-17).
  app.setErrorHandler((error, request, reply) => {
    const code = (error as { statusCode?: number }).statusCode;
    const status = code && code < 500 ? code : 500;
    request.log.error(errorSummary(error), "request failed");
    return reply.code(status).send({ error: status === 500 ? "Server error" : "Bad request" });
  });

  app.get("/health", async (): Promise<HealthResponse> => ({ status: "ok" }));
  if (!deps) return app;

  /** The student from the sign-in token (S-02), or a 401 reply. */
  async function student(request: FastifyRequest): Promise<string | null> {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) return null;
    return deps!.verifyToken(header.slice("Bearer ".length));
  }

  // Speed check: the round trip from this server to the database, the main cost of a backup
  // (each pushed change makes a few). The middle of five tiny reads; no data is touched.
  app.get("/health/db", async () => {
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      await deps.db.execute(sql`select 1`);
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    return { roundTripMs: Math.round(times[2]! * 10) / 10 };
  });

  const pushLimit = createRateLimit(PUSHES_PER_MINUTE, 60_000, deps.now);

  app.post("/v1/sync/push", async (request, reply): Promise<PushResponse | void> => {
    const userId = await student(request);
    if (!userId) return reply.code(401).send({ error: "Sign in again" });
    // At most 60 pushes a minute per student (sync-api §9); the phone backs off on 429.
    const wait = pushLimit.take(userId);
    if (wait > 0) {
      return reply
        .code(429)
        .header("retry-after", String(wait))
        .send({ error: "Too many backups at once; try again soon" });
    }
    const body = PushEnvelopeSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Malformed batch" });
    const start = performance.now();
    const results = await push(deps.db, userId, body.data.operations);
    // Speed check in the server log: how many changes, how long. Counts only (NFR-17).
    request.log.info(
      { changes: results.length, pushMs: Math.round(performance.now() - start) },
      "push timed",
    );
    return { results };
  });

  app.get("/v1/sync/pull", async (request, reply): Promise<PullResponse | void> => {
    const userId = await student(request);
    if (!userId) return reply.code(401).send({ error: "Sign in again" });
    const query = PullQuerySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: "Bad since or limit" });
    return pull(deps.db, userId, query.data.since, query.data.limit);
  });

  // FR-ACC-07: the account and everything backed up with it. 204 when done (or already gone).
  app.delete("/v1/account", async (request, reply) => {
    const userId = await student(request);
    if (!userId) return reply.code(401).send({ error: "Sign in again" });
    await deleteAccount(deps.db, userId);
    return reply.code(204).send();
  });

  return app;
}
