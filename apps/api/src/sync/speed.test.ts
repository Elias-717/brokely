import type { PullResponse, PushResponse } from "@brokely/contracts";
import { sen } from "@brokely/domain";
import {
  listCategories,
  outboxOperations,
  quickStart,
  recordPurchase,
  seedDefaultCategories,
  syncNow,
  type RepoContext,
  type SyncTransport,
} from "@brokely/local-db";
import { createTestDb as createPhoneDb } from "@brokely/local-db/test-db";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../app";
import type { Db } from "../db/client";
import { addUsers, createTestDb } from "../db/test-db";

/**
 * Speed check (Phase 4): how many database round trips a backup costs. The API (Azure, Hong
 * Kong) and the database (Supabase, Singapore) are tens of milliseconds apart, so time on the
 * wire ≈ round trips × that distance. GET /health/db measures the distance live.
 */

let db: Db;
let close: () => Promise<void>;
let queries = 0;
beforeAll(async () => ({ db, close } = await createTestDb(() => queries++)));
afterAll(() => close());

const NOW = "2026-11-02T04:15:00.000Z";
const unwrap = <T>(r: { ok: true; value: T } | { ok: false; message: string }): T => {
  if (!r.ok) throw new Error(r.message);
  return r.value;
};

/** Upper bounds that fail the test if a change makes a backup slower. */
const MAX_QUERIES_PER_PUSHED_CHANGE = 8;
const MAX_QUERIES_PER_PULL_PAGE = 20;

describe("speed check (sync-api §4, §5)", () => {
  it("a first backup of 100+ changes stays within a few round trips per change", async () => {
    const userId = randomUUID();
    await addUsers(db, userId);
    const app = buildApp({ db, verifyToken: async () => userId });
    const headers = { authorization: "Bearer t" };
    let pushes = 0;
    const transport: SyncTransport = {
      async push(request) {
        pushes++;
        const res = await app.inject({
          method: "POST",
          url: "/v1/sync/push",
          headers,
          payload: request,
        });
        return res.json() as PushResponse;
      },
      async pull(since, limit) {
        const url = `/v1/sync/pull?since=${since}&limit=${limit}`;
        return (await app.inject({ method: "GET", url, headers })).json() as PullResponse;
      },
    };

    // A phone used for a while: setup, a plan, 100 purchases.
    const { db: phoneDb } = await createPhoneDb();
    const ctx: RepoContext = { db: phoneDb, newId: randomUUID, now: () => NOW };
    unwrap(seedDefaultCategories(ctx));
    unwrap(
      quickStart(ctx, {
        budgetSen: sen(40000),
        startDate: "2026-11-01",
        endDateInclusive: "2026-11-30",
      }),
    );
    const meals = listCategories(ctx.db).find((c) => c.name === "Meals")!.id;
    for (let i = 0; i < 100; i++) {
      unwrap(
        recordPurchase(ctx, {
          amountSen: sen(500 + i),
          categoryId: meals,
          occurredAt: NOW,
          localDate: "2026-11-02",
        }),
      );
    }
    const changes = ctx.db.select().from(outboxOperations).all().length;

    queries = 0;
    const report = await syncNow(ctx, transport, { userId, deviceId: randomUUID() });
    expect(report).toMatchObject({ pushed: changes, conflicts: 0, failed: 0 });
    const perChange = queries / changes;

    // Printed for the record: multiply by GET /health/db's round trip for the live time.
    console.info(
      `speed check: ${changes} changes in ${pushes} pushes, ${queries} queries` +
        ` (${perChange.toFixed(1)} per change)`,
    );
    expect(perChange).toBeLessThanOrEqual(MAX_QUERIES_PER_PUSHED_CHANGE);

    // A second phone downloading it all: pages, not one query per record.
    queries = 0;
    const page = await transport.pull(0, 500);
    expect(page.changes.length).toBeGreaterThan(100);
    console.info(
      `speed check: one pull page of ${page.changes.length} changes, ${queries} queries`,
    );
    expect(queries).toBeLessThanOrEqual(MAX_QUERIES_PER_PULL_PAGE);
  });
});
