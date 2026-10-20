import type { PullResponse, PushResponse } from "@brokely/contracts";
import { sen } from "@brokely/domain";
import {
  checkInNoSpending,
  dayCheckIns,
  deleteTransaction,
  editTransaction,
  listCategories,
  listTransactions,
  outboxOperations,
  quickStart,
  recordPurchase,
  renameCategory,
  seedDefaultCategories,
  syncNow,
  type RepoContext,
  type SyncTransport,
} from "@brokely/local-db";
import { createTestDb as createPhoneDb } from "@brokely/local-db/test-db";
import { isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../app";
import type { Db } from "../db/client";
import { addUsers, createTestDb } from "../db/test-db";

/**
 * Phone ↔ server ↔ phone, end to end (AC-20…AC-23 at the code level): two real phone
 * databases using the real repositories, syncing through the real API routes into PostgreSQL.
 */

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => ({ db, close } = await createTestDb()));
afterAll(() => close());

const NOW = "2026-11-02T04:15:00.000Z";

/** A student's account, and the transport a phone signed in to it would use. */
async function account() {
  const userId = randomUUID();
  const token = randomUUID();
  await addUsers(db, userId);
  const app = buildApp({ db, verifyToken: async (t) => (t === token ? userId : null) });
  const headers = { authorization: `Bearer ${token}` };
  const transport: SyncTransport = {
    async push(request) {
      const res = await app.inject({
        method: "POST",
        url: "/v1/sync/push",
        headers,
        payload: request,
      });
      expect(res.statusCode).toBe(200);
      return res.json() as PushResponse;
    },
    async pull(since, limit) {
      const url = `/v1/sync/pull?since=${since}&limit=${limit}`;
      const res = await app.inject({ method: "GET", url, headers });
      expect(res.statusCode).toBe(200);
      return res.json() as PullResponse;
    },
  };
  return { userId, transport };
}

async function phone(acct: Awaited<ReturnType<typeof account>>) {
  const { db: phoneDb } = await createPhoneDb();
  const ctx: RepoContext = { db: phoneDb, newId: randomUUID, now: () => NOW };
  const deviceId = randomUUID();
  return { ctx, sync: () => syncNow(ctx, acct.transport, { userId: acct.userId, deviceId }) };
}
type Phone = Awaited<ReturnType<typeof phone>>;

function unwrap<T>(result: { ok: true; value: T } | { ok: false; message: string }): T {
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

/** A first run like the app's: default categories, quick start, a few records. */
function useTheApp(p: Phone) {
  unwrap(seedDefaultCategories(p.ctx));
  unwrap(
    quickStart(p.ctx, {
      budgetSen: sen(40000),
      startDate: "2026-11-01",
      endDateInclusive: "2026-11-30",
    }),
  );
  const laundry = listCategories(p.ctx.db).find((c) => c.name === "Laundry")!.id;
  const meals = listCategories(p.ctx.db).find((c) => c.name === "Meals")!.id;
  const purchase = (amountSen: number, categoryId: string) =>
    unwrap(
      recordPurchase(p.ctx, {
        amountSen: sen(amountSen),
        categoryId,
        occurredAt: NOW,
        localDate: "2026-11-02",
      }),
    ).id;
  const wash = purchase(500, laundry);
  const lunch = purchase(800, meals);
  return { laundry, meals, wash, lunch };
}

const spending = (p: Phone) =>
  listTransactions(p.ctx.db)
    .map((t) => [t.id, t.amountSen])
    .sort();

describe("two phones on one account", () => {
  it("replays a local-only phone's history into the account, then a new phone gets it all (FR-ACC-03, AC-22)", async () => {
    const acct = await account();
    const a = await phone(acct);
    const { meals, lunch } = useTheApp(a);
    // Two edits of one record before the first sync: the second must be moved onto the
    // version the first one creates, or it would conflict with itself.
    for (const amountSen of [900, 1000]) {
      unwrap(
        editTransaction(a.ctx, lunch, {
          type: "purchase",
          amountSen: sen(amountSen),
          occurredAt: NOW,
          localDate: "2026-11-02",
          lines: [{ kind: "spending", categoryId: meals, amountSen: sen(amountSen) }],
        }),
      );
    }

    const first = await a.sync();
    expect(first).toMatchObject({ conflicts: 0, failed: 0 });
    expect(first.pushed).toBeGreaterThan(20);
    expect(a.ctx.db.select().from(outboxOperations).all()).toEqual([]);
    expect(
      listCategories(a.ctx.db).every((c) => c.syncStatus === "synced" && c.userId === acct.userId),
    ).toBe(true);

    // Nothing new either way: its own changes come back at the versions it already has.
    expect(await a.sync()).toEqual({ pushed: 0, conflicts: 0, failed: 0, pulled: 0 });

    const b = await phone(acct);
    const got = await b.sync();
    expect(got.pulled).toBe(first.pushed - 2); // the two edits rewrote one record
    expect(spending(b)).toEqual(spending(a));
    expect(listTransactions(b.ctx.db).find((t) => t.id === lunch)?.amountSen).toBe(1000);
    expect(listCategories(b.ctx.db).map((c) => c.name)).toEqual(
      listCategories(a.ctx.db).map((c) => c.name),
    );
  });

  it("brings deletes to the other phone (FR-SYNC-09, AC-23)", async () => {
    const acct = await account();
    const a = await phone(acct);
    const { wash } = useTheApp(a);
    await a.sync();
    const b = await phone(acct);
    await b.sync();

    unwrap(deleteTransaction(a.ctx, wash));
    await a.sync();
    expect(await b.sync()).toMatchObject({ pulled: 1 });
    expect(listTransactions(b.ctx.db).map((t) => t.id)).not.toContain(wash);
  });

  it("keeps an out-of-date edit as a conflict, never overwriting (D-06, FR-SYNC-07/08, AC-21)", async () => {
    const acct = await account();
    const a = await phone(acct);
    const { laundry } = useTheApp(a);
    await a.sync();
    const b = await phone(acct);
    await b.sync();

    unwrap(renameCategory(a.ctx, laundry, "Laundry & ironing"));
    unwrap(renameCategory(b.ctx, laundry, "Dobi"));
    await a.sync();
    expect(await b.sync()).toMatchObject({ conflicts: 1 });

    const mine = listCategories(b.ctx.db).find((c) => c.id === laundry)!;
    expect(mine).toMatchObject({ name: "Dobi", syncStatus: "conflict" }); // not lost
    const [op] = b.ctx.db.select().from(outboxOperations).all();
    expect(op?.status).toBe("conflict");
    expect(JSON.parse(op!.lastError!)).toMatchObject({ data: { name: "Laundry & ironing" } });
  });

  it("merges the same day's check-in made on both phones (S-06)", async () => {
    const acct = await account();
    const a = await phone(acct);
    const b = await phone(acct);
    const fromA = unwrap(checkInNoSpending(a.ctx, "2026-11-03")).id;
    unwrap(checkInNoSpending(b.ctx, "2026-11-03"));
    await a.sync();
    await b.sync();

    const live = b.ctx.db.select().from(dayCheckIns).where(isNull(dayCheckIns.deletedAt)).all();
    expect(live.map((c) => [c.id, c.syncStatus])).toEqual([[fromA, "synced"]]);
  });
});
