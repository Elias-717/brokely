import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rowsOf, type Db } from "./client";
import { categories, planningCycles, planRevisions, transactions } from "./schema";
import { addUsers, createTestDb } from "./test-db";

const ALICE = "00000000-0000-4000-8000-00000000a11c";
const BOB = "00000000-0000-4000-8000-000000000b0b";
const id = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, "0")}`;

let db: Db;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  await addUsers(db, ALICE, BOB);
});
afterEach(() => close());

const seq = sql`nextval('brokely.server_seq')`;

function cycle(n: number, userId: string, start: string, end: string, status = "active") {
  return db.insert(planningCycles).values({
    id: id(n),
    userId,
    version: 1,
    serverSeq: seq,
    startDate: start,
    endDateExclusive: end,
    trackingStartDate: start,
    status: status as "active",
  });
}

/** Postgres error code of a failed statement (Drizzle wraps the driver error in `cause`). */
async function pgCode(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    return e.code ?? e.cause?.code;
  }
}

describe("server schema constraints (erd.md §7)", () => {
  it("refuses overlapping active/completed cycles of one student (BR-05, D-18)", async () => {
    await cycle(1, ALICE, "2026-11-01", "2026-12-01");
    expect(await pgCode(cycle(2, ALICE, "2026-11-20", "2026-12-20", "completed"))).toBe("23P01");
  });

  it("lets drafts overlap, and other students use the same dates (BR-05)", async () => {
    await cycle(1, ALICE, "2026-11-01", "2026-12-01");
    await cycle(2, ALICE, "2026-11-20", "2026-12-20", "draft");
    await cycle(3, BOB, "2026-11-01", "2026-12-01");
    expect(await pgCode(cycle(4, ALICE, "2026-12-01", "2027-01-01"))).toBeUndefined(); // touching ends
  });

  it("keeps one draft revision per cycle (D-20, FR-PLN-16)", async () => {
    await cycle(1, ALICE, "2026-11-01", "2026-12-01");
    const revision = (n: number, revisionNo: number) =>
      db.insert(planRevisions).values({
        id: id(n),
        userId: ALICE,
        version: 1,
        serverSeq: seq,
        cycleId: id(1),
        revisionNo,
        budgetSen: 40000,
        approvedAt: null,
        shortfallAcknowledged: false,
      });
    await revision(10, 1);
    expect(await pgCode(revision(11, 2))).toBe("23505");
  });

  it("stores amounts above zero only (BR-01, R-04)", async () => {
    const insert = db.insert(transactions).values({
      id: id(20),
      userId: ALICE,
      version: 1,
      serverSeq: seq,
      type: "income",
      amountSen: 0,
      occurredAt: new Date("2026-11-02T04:15:00Z"),
      localDate: "2026-11-02",
      source: "manual",
      note: "",
      isEstimate: false,
    });
    expect(await pgCode(insert)).toBe("23514");
  });

  it("deletes every row of a student with their account, and nobody else's (FR-ACC-07)", async () => {
    await cycle(1, ALICE, "2026-11-01", "2026-12-01");
    await cycle(2, BOB, "2026-11-01", "2026-12-01");
    await db.insert(categories).values({
      id: id(30),
      userId: ALICE,
      version: 1,
      serverSeq: seq,
      name: "Meals",
      kind: "essential",
      sortOrder: 0,
    });
    await db.execute(sql`delete from auth.users where id = ${ALICE}`);
    const left = await db.select({ userId: planningCycles.userId }).from(planningCycles);
    expect(left).toEqual([{ userId: BOB }]);
    expect(await db.select().from(categories)).toEqual([]);
  });

  it("closes the schema to Supabase's Data API roles (S-09)", async () => {
    const rows = await db.execute(
      sql`select has_schema_privilege('anon', 'brokely', 'USAGE') as anon,
                 has_schema_privilege('authenticated', 'brokely', 'USAGE') as authed`,
    );
    expect(rowsOf(rows)).toEqual([{ anon: false, authed: false }]);
  });
});
