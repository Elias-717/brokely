import { HealthResponseSchema, PullResponseSchema, PushResponseSchema } from "@brokely/contracts";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app";
import type { Db } from "./db/client";
import { addUsers, createTestDb } from "./db/test-db";

describe("GET /health", () => {
  it("responds with status ok in the shared contract shape", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(HealthResponseSchema.parse(response.json())).toEqual({ status: "ok" });
    await app.close();
  });
});

describe("sync routes (sync-api §4, §5)", () => {
  let db: Db;
  let close: () => Promise<void>;
  const student = randomUUID();
  const tokens: Record<string, string> = { "good-token": student };
  const app = () => buildApp({ db, verifyToken: async (t) => tokens[t] ?? null });

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    await addUsers(db, student);
  });
  afterAll(() => close());

  const auth = { authorization: "Bearer good-token" };
  const category = {
    operationId: randomUUID(),
    entity: "category",
    entityId: randomUUID(),
    op: "upsert",
    baseVersion: null,
    data: { name: "Laundry", kind: "essential", sortOrder: 0, archivedAt: null },
  };

  it("pushes and pulls for the student in the token", async () => {
    const server = app();
    const pushed = await server.inject({
      method: "POST",
      url: "/v1/sync/push",
      headers: auth,
      payload: { deviceId: randomUUID(), operations: [category] },
    });
    expect(pushed.statusCode).toBe(200);
    expect(PushResponseSchema.parse(pushed.json()).results[0]?.status).toBe("applied");

    const pulled = await server.inject({
      method: "GET",
      url: "/v1/sync/pull?since=0",
      headers: auth,
    });
    expect(pulled.statusCode).toBe(200);
    expect(PullResponseSchema.parse(pulled.json()).changes.map((c) => c.entityId)).toEqual([
      category.entityId,
    ]);
  });

  it("answers 401 without a valid token", async () => {
    const server = app();
    const none = await server.inject({ method: "GET", url: "/v1/sync/pull?since=0" });
    const bad = await server.inject({
      method: "GET",
      url: "/v1/sync/pull?since=0",
      headers: { authorization: "Bearer forged" },
    });
    expect([none.statusCode, bad.statusCode]).toEqual([401, 401]);
  });

  it("answers 400 for a malformed batch or cursor, but rejects a bad change on its own", async () => {
    const server = app();
    const empty = await server.inject({
      method: "POST",
      url: "/v1/sync/push",
      headers: auth,
      payload: { deviceId: randomUUID(), operations: [] },
    });
    const cursor = await server.inject({
      method: "GET",
      url: "/v1/sync/pull?since=-1",
      headers: auth,
    });
    expect([empty.statusCode, cursor.statusCode]).toEqual([400, 400]);

    const mixed = await server.inject({
      method: "POST",
      url: "/v1/sync/push",
      headers: auth,
      payload: {
        deviceId: randomUUID(),
        operations: [
          { ...category, operationId: randomUUID(), entityId: randomUUID(), data: { name: "" } },
          {
            ...category,
            operationId: randomUUID(),
            entityId: randomUUID(),
            data: { ...category.data, name: "Meals" },
          },
        ],
      },
    });
    expect(mixed.json().results.map((r: { status: string }) => r.status)).toEqual([
      "rejected",
      "applied",
    ]);
  });
});
