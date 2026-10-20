import { PushResultSchema, scheduledItemId, type EntityName } from "@brokely/contracts";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../db/client";
import { addUsers, createTestDb } from "../db/test-db";
import { pull } from "./pull";
import { push } from "./push";

/**
 * Sync API rules (docs/design/sync-api.md §4–§6) on a real PostgreSQL (PGlite).
 * One database for the file; every test signs up its own student, so tests can't see each
 * other's rows (which is itself FR-ACC-04).
 */

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => ({ db, close } = await createTestDb()));
afterAll(() => close());

type Op = {
  entity: EntityName;
  entityId: string;
  op?: "upsert" | "delete";
  baseVersion?: number | null;
  data?: unknown;
  operationId?: string;
};

/** A signed-up student with named record IDs, and push/pull as that student. */
async function student() {
  const userId = randomUUID();
  await addUsers(db, userId);
  const names = new Map<string, string>();
  const id = (name: string) => {
    if (!names.has(name)) names.set(name, randomUUID());
    return names.get(name)!;
  };
  const operation = ({ op = "upsert", baseVersion = null, operationId, ...rest }: Op) => ({
    operationId: operationId ?? randomUUID(),
    op,
    baseVersion,
    ...rest,
  });
  return {
    userId,
    id,
    push: async (...ops: Op[]) => {
      const results = await push(db, userId, ops.map(operation));
      for (const r of results) PushResultSchema.parse(r); // always the shared contract shape
      return results;
    },
    pushRaw: (ops: unknown[]) => push(db, userId, ops),
    pull: (since = 0, limit = 500) => pull(db, userId, since, limit),
  };
}
type Student = Awaited<ReturnType<typeof student>>;

// ── Golden-path builders (AC-04) ────────────────────────────────────────────

const category = (s: Student, name: string, kind = "essential"): Op => ({
  entity: "category",
  entityId: s.id(name),
  data: { name, kind, sortOrder: 0, archivedAt: null },
});
const cycle = (s: Student, start = "2026-11-01", end = "2026-12-01", status = "active"): Op => ({
  entity: "planning_cycle",
  entityId: s.id(`cycle ${start}`),
  data: { startDate: start, endDateExclusive: end, trackingStartDate: start, status },
});
const revision = (
  s: Student,
  revisionNo: number,
  opts: { approved?: boolean; budgetSen?: number; laundrySen?: number; ack?: boolean } = {},
): Op => ({
  entity: "plan_revision",
  entityId: s.id(`revision ${revisionNo}`),
  data: {
    cycleId: s.id("cycle 2026-11-01"),
    revisionNo,
    budgetSen: opts.budgetSen ?? 40000,
    approvedAt: opts.approved === false ? null : "2026-11-01T01:00:00.000Z",
    shortfallAcknowledged: opts.ack ?? false,
    allocations: [
      {
        id: s.id(`alloc ${revisionNo}`),
        categoryId: s.id("Laundry"),
        amountSen: opts.laundrySen ?? 4000,
      },
    ],
  },
});
const purchase = (s: Student, name: string, amountSen = 500, lineSen = amountSen): Op => ({
  entity: "transaction",
  entityId: s.id(name),
  data: {
    type: "purchase",
    amountSen,
    occurredAt: "2026-11-02T04:15:00.000Z",
    localDate: "2026-11-02",
    source: "manual",
    note: "Laundry",
    refundsTransactionId: null,
    writeOffCategoryId: null,
    isEstimate: false,
    lines: [
      {
        id: s.id(`${name} line`),
        kind: "spending",
        categoryId: s.id("Laundry"),
        amountSen: lineSen,
      },
    ],
  },
});
const debtMove = (s: Student, name: string, type: string, debt: string, amountSen: number): Op => ({
  entity: "transaction",
  entityId: s.id(name),
  data: {
    type,
    amountSen,
    occurredAt: "2026-11-03T04:00:00.000Z",
    localDate: "2026-11-03",
    source: "manual",
    note: "",
    refundsTransactionId: null,
    writeOffCategoryId: null,
    isEstimate: false,
    lines: [{ id: s.id(`${name} line`), kind: "debt", debtId: s.id(debt), amountSen }],
  },
});

const statuses = (results: { status: string }[]) => results.map((r) => r.status);
const errorCode = (result: unknown) => (result as { error?: { code: string } }).error?.code;

// ── Tests ───────────────────────────────────────────────────────────────────

describe("push and pull: golden path (AC-04)", () => {
  it("applies a plan and a purchase, and pull returns exactly what was sent", async () => {
    const s = await student();
    const ops = [category(s, "Laundry"), cycle(s), revision(s, 1), purchase(s, "laundry")];
    const results = await s.push(...ops);
    expect(statuses(results)).toEqual(["applied", "applied", "applied", "applied"]);
    expect(results.map((r) => (r as { version: number }).version)).toEqual([1, 1, 1, 1]);

    const pulled = await s.pull();
    expect(pulled.hasMore).toBe(false);
    expect(pulled.changes.map((c) => [c.entity, c.entityId, c.data])).toEqual(
      ops.map((o) => [o.entity, o.entityId, o.data]),
    );
    const seqs = pulled.changes.map((c) => c.serverSeq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(pulled.nextSince).toBe(seqs.at(-1));
    expect((await s.pull(pulled.nextSince)).changes).toEqual([]);
  });

  it("pages with limit and hasMore (S-08)", async () => {
    const s = await student();
    await s.push(category(s, "Laundry"), category(s, "Meals"), category(s, "Transport"));
    const first = await s.pull(0, 2);
    expect(first.changes).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    const rest = await s.pull(first.nextSince, 2);
    expect(rest.changes.map((c) => c.entityId)).toEqual([s.id("Transport")]);
    expect(rest.hasMore).toBe(false);
  });
});

describe("idempotency, versions and delete markers", () => {
  it("answers a repeated operation as a duplicate without applying it twice (FR-SYNC-05, AC-20)", async () => {
    const s = await student();
    const op = { ...category(s, "Laundry"), operationId: randomUUID() };
    const [first] = await s.push(op);
    const [again] = await s.push(op);
    expect(again).toEqual({ ...first, status: "duplicate" });
    expect((await s.pull()).changes).toHaveLength(1);
  });

  it("rejects a change made from an out-of-date copy with the current row (D-06, AC-21)", async () => {
    const s = await student();
    await s.push(category(s, "Laundry"));
    const rename = (name: string) => ({
      ...category(s, "Laundry"),
      baseVersion: 1,
      data: { name, kind: "essential", sortOrder: 0, archivedAt: null },
    });
    expect(statuses(await s.push(rename("Laundry & ironing")))).toEqual(["applied"]);
    const [stale] = await s.push(rename("Dobi")); // the other phone still had version 1
    expect(stale).toMatchObject({
      status: "conflict",
      current: { entityId: s.id("Laundry"), version: 2, data: { name: "Laundry & ironing" } },
    });
  });

  it("refuses a second create of an existing record as a conflict (S-04)", async () => {
    const s = await student();
    await s.push(category(s, "Laundry"));
    expect(statuses(await s.push(category(s, "Laundry")))).toEqual(["conflict"]);
  });

  it("sends deletes as markers, and an upsert brings the record back (S-07, AC-23, FR-TXN-10)", async () => {
    const s = await student();
    await s.push(category(s, "Laundry"), purchase(s, "laundry"));
    const tx = s.id("laundry");
    const [deleted] = await s.push({
      entity: "transaction",
      entityId: tx,
      op: "delete",
      baseVersion: 1,
    });
    expect(deleted).toMatchObject({ status: "applied", version: 2 });

    const afterDelete = await s.pull();
    expect(afterDelete.changes.at(-1)).toMatchObject({ entityId: tx, version: 2, data: null });
    expect(afterDelete.changes.at(-1)?.deletedAt).toMatch(/^\d{4}-/);

    const [undo] = await s.push({ ...purchase(s, "laundry"), baseVersion: 2 });
    expect(undo).toMatchObject({ status: "applied", version: 3 });
    expect((await s.pull()).changes.at(-1)).toMatchObject({ entityId: tx, deletedAt: null });
  });

  it("merges a second check-in for the same day into the first (S-06)", async () => {
    const s = await student();
    const checkIn = (name: string): Op => ({
      entity: "day_check_in",
      entityId: s.id(name),
      data: { localDate: "2026-11-05" },
    });
    await s.push(checkIn("phone A"));
    const [merged] = await s.push(checkIn("phone B"));
    expect(merged).toMatchObject({ status: "duplicate", entityId: s.id("phone A"), version: 1 });
    expect((await s.pull()).changes).toHaveLength(1);
  });

  it("treats the same bill date made on two phones as one item (S-05)", async () => {
    const s = await student();
    await s.push(category(s, "Laundry"), {
      entity: "bill",
      entityId: s.id("bill"),
      data: {
        categoryId: s.id("Laundry"),
        name: "Laundry",
        amountSen: 1600,
        repeat: { kind: "every_n_weeks", n: 1 },
        anchorDate: "2026-11-03",
        archivedAt: null,
      },
    });
    const item: Op = {
      entity: "scheduled_item",
      entityId: scheduledItemId(s.id("bill"), "2026-11-10"),
      data: {
        billId: s.id("bill"),
        dueDate: "2026-11-10",
        amountSen: 1600,
        status: "upcoming",
        transactionId: null,
      },
    };
    expect(statuses(await s.push(item))).toEqual(["applied"]);
    expect(statuses(await s.push(item))).toEqual(["duplicate"]); // the other phone's copy
    const pulled = (await s.pull()).changes;
    expect(pulled.filter((c) => c.entity === "scheduled_item")).toHaveLength(1);
    expect(pulled.find((c) => c.entity === "bill")?.data).toMatchObject({
      repeat: { kind: "every_n_weeks", n: 1 }, // stored as repeat_kind + repeat_params
    });
  });
});

describe("isolation between students (S-02, FR-ACC-04, AC-24)", () => {
  it("never lets one student read or change another's records", async () => {
    const alice = await student();
    const bob = await student();
    await alice.push(category(alice, "Laundry"));

    const [result] = await bob.push({
      entity: "category",
      entityId: alice.id("Laundry"),
      baseVersion: 1,
      data: { name: "Mine now", kind: "essential", sortOrder: 0, archivedAt: null },
    });
    expect(errorCode(result)).toBe("NOT_FOUND");
    expect((await bob.pull()).changes).toEqual([]);

    // Pointing at another student's category is the same as pointing at nothing.
    bob.id("Laundry"); // Bob's own name for it is unused
    const [linked] = await bob.push({
      ...purchase(bob, "sneaky"),
      data: {
        ...(purchase(bob, "sneaky").data as object),
        lines: [
          { id: randomUUID(), kind: "spending", categoryId: alice.id("Laundry"), amountSen: 500 },
        ],
      },
    });
    expect(errorCode(linked)).toBe("REFERENCE_MISSING");
  });
});

describe("business rules re-checked on the server (sync-api §6, FR-SYNC-10)", () => {
  it("VALIDATION_FAILED: a change that breaks the contract", async () => {
    const s = await student();
    const [result] = await s.pushRaw([
      {
        operationId: randomUUID(),
        entity: "category",
        entityId: s.id("x"),
        op: "upsert",
        baseVersion: null,
        data: { name: "" },
      },
    ]);
    expect(errorCode(result)).toBe("VALIDATION_FAILED");
  });

  it("REFERENCE_MISSING, then applied once the parent arrives (sync-api §4)", async () => {
    const s = await student();
    const op = { ...purchase(s, "early"), operationId: randomUUID() };
    expect(errorCode((await s.push(op))[0])).toBe("REFERENCE_MISSING");
    await s.push(category(s, "Laundry"));
    expect(statuses(await s.push(op))).toEqual(["applied"]); // the same operation, retried
  });

  it("LINES_DO_NOT_SUM (FR-TXN-04)", async () => {
    const s = await student();
    await s.push(category(s, "Laundry"));
    expect(errorCode((await s.push(purchase(s, "odd", 500, 400)))[0])).toBe("LINES_DO_NOT_SUM");
  });

  it("REFUND_EXCEEDS_PURCHASE (FR-TXN-06, AC-09)", async () => {
    const s = await student();
    await s.push(category(s, "Laundry"), purchase(s, "laundry", 500));
    const refund = (name: string, amountSen: number): Op => ({
      entity: "transaction",
      entityId: s.id(name),
      data: {
        ...(purchase(s, name, amountSen).data as object),
        type: "refund",
        refundsTransactionId: s.id("laundry"),
      },
    });
    expect(statuses(await s.push(refund("refund 1", 300)))).toEqual(["applied"]);
    expect(errorCode((await s.push(refund("refund 2", 300)))[0])).toBe("REFUND_EXCEEDS_PURCHASE");
  });

  it("CYCLE_OVERLAP (BR-05, D-18)", async () => {
    const s = await student();
    await s.push(cycle(s, "2026-11-01", "2026-12-01"));
    const [result] = await s.push(cycle(s, "2026-11-15", "2026-12-15"));
    expect(errorCode(result)).toBe("CYCLE_OVERLAP");
  });

  it("REVISION_IMMUTABLE (FR-PLN-11, BR-08)", async () => {
    const s = await student();
    await s.push(category(s, "Laundry"), cycle(s), revision(s, 1));
    const [result] = await s.push({ ...revision(s, 1, { laundrySen: 5000 }), baseVersion: 1 });
    expect(errorCode(result)).toBe("REVISION_IMMUTABLE");
  });

  it("DRAFT_REVISION_EXISTS (D-20, FR-PLN-16)", async () => {
    const s = await student();
    await s.push(
      category(s, "Laundry"),
      cycle(s),
      revision(s, 1),
      revision(s, 2, { approved: false }),
    );
    const [result] = await s.push(revision(s, 3, { approved: false }));
    expect(errorCode(result)).toBe("DRAFT_REVISION_EXISTS");
  });

  it("SHORTFALL_NOT_ACKNOWLEDGED, and approved once acknowledged (FR-PLN-10, AC-03)", async () => {
    const s = await student();
    await s.push(category(s, "Laundry"), cycle(s));
    const over = revision(s, 1, { budgetSen: 3000, laundrySen: 4000 });
    expect(errorCode((await s.push(over))[0])).toBe("SHORTFALL_NOT_ACKNOWLEDGED");
    expect(
      statuses(await s.push(revision(s, 1, { budgetSen: 3000, laundrySen: 4000, ack: true }))),
    ).toEqual(["applied"]);
  });

  it("CATEGORY_IN_USE: a category with history is archived, not deleted (BR-28, AC-27)", async () => {
    const s = await student();
    await s.push(category(s, "Laundry"), purchase(s, "laundry"), category(s, "Unused"));
    const del = (name: string): Op => ({
      entity: "category",
      entityId: s.id(name),
      op: "delete",
      baseVersion: 1,
    });
    expect(errorCode((await s.push(del("Laundry")))[0])).toBe("CATEGORY_IN_USE");
    expect(statuses(await s.push(del("Unused")))).toEqual(["applied"]);
  });

  it("DEBT_EXCEEDS_OUTSTANDING (BR-22)", async () => {
    const s = await student();
    await s.push(
      {
        entity: "debt",
        entityId: s.id("Ali"),
        data: { direction: "owed_to_me", counterparty: "[FRIEND A]", dueDate: null, notes: "" },
      },
      debtMove(s, "lent", "lend", "Ali", 1000),
      debtMove(s, "paid back", "repayment_received", "Ali", 600),
    );
    const [result] = await s.push(debtMove(s, "too much", "repayment_received", "Ali", 500));
    expect(errorCode(result)).toBe("DEBT_EXCEEDS_OUTSTANDING");
    // Editing the earlier repayment counts the debt without its old amount.
    const [edit] = await s.push({
      ...debtMove(s, "paid back", "repayment_received", "Ali", 1000),
      baseVersion: 1,
    });
    expect(edit).toMatchObject({ status: "applied", version: 2 });
  });
});
