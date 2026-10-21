import { HealthResponseSchema, PullResponseSchema, PushResponseSchema } from "@brokely/contracts";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app";
import { rowsOf } from "./db/client";
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

describe("error logs (NFR-17)", () => {
  it("log the kind of a database error, never the query's values", async () => {
    const { db, close } = await createTestDb();
    const student = randomUUID();
    await addUsers(db, student);
    await db.execute(sql`drop table brokely.categories cascade`); // any failing query will do
    const lines: string[] = [];
    const app = buildApp(
      { db, verifyToken: async () => student },
      { logStream: { write: (line) => void lines.push(line) } },
    );

    const res = await app.inject({
      method: "GET",
      url: "/v1/sync/pull?since=0",
      headers: { authorization: "Bearer t" },
    });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: "Server error" });
    const log = lines.join("");
    expect(log).toContain('"code":"42P01"'); // relation does not exist: enough to act on
    expect(log).not.toContain(student); // the query's parameters stay out
    expect(log).not.toContain("select ");
    await app.close();
    await close();
  });
});

describe("DELETE /v1/account (FR-ACC-07)", () => {
  it("removes the student's sign-in and every backed-up row, and nobody else's", async () => {
    const { db, close } = await createTestDb();
    const me = randomUUID();
    const other = randomUUID();
    await addUsers(db, me, other);
    const tokens: Record<string, string> = { mine: me, theirs: other };
    const app = buildApp({ db, verifyToken: async (t) => tokens[t] ?? null });
    const category = (name: string) => ({
      deviceId: randomUUID(),
      operations: [
        {
          operationId: randomUUID(),
          entity: "category",
          entityId: randomUUID(),
          op: "upsert",
          baseVersion: null,
          data: { name, kind: "essential", sortOrder: 0, archivedAt: null },
        },
      ],
    });
    for (const [token, name] of [
      ["mine", "Meals"],
      ["theirs", "Laundry"],
    ] as const) {
      await app.inject({
        method: "POST",
        url: "/v1/sync/push",
        headers: { authorization: `Bearer ${token}` },
        payload: category(name),
      });
    }

    const denied = await app.inject({ method: "DELETE", url: "/v1/account" });
    expect(denied.statusCode).toBe(401);
    const deleted = await app.inject({
      method: "DELETE",
      url: "/v1/account",
      headers: { authorization: "Bearer mine" },
    });
    expect(deleted.statusCode).toBe(204);

    const users = rowsOf<{ id: string }>(await db.execute(sql`select id from auth.users`));
    expect(users.map((u) => u.id)).toEqual([other]);
    const left = rowsOf<{ user_id: string; name: string }>(
      await db.execute(sql`select user_id, name from brokely.categories`),
    );
    expect(left).toEqual([{ user_id: other, name: "Laundry" }]);
    const ops = rowsOf<{ n: number }>(
      await db.execute(
        sql`select count(*)::int as n from brokely.processed_operations where user_id = ${me}`,
      ),
    );
    expect(ops[0]?.n).toBe(0);
    await app.close();
    await close();
  });
});
