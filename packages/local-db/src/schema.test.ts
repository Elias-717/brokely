import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
  allocations,
  categories,
  dayCheckIns,
  debts,
  outboxOperations,
  planningCycles,
  planRevisions,
  scheduledItems,
  bills,
  transactionLines,
  transactions,
} from "./schema";
import { createTestDb, stamp } from "./test-db";

type TestDb = Awaited<ReturnType<typeof createTestDb>>["db"];

const id = (n: number) => `0192f3a5-0000-7000-8000-${String(n).padStart(12, "0")}`;
const LAUNDRY = id(1);
const MEALS = id(2);
const CYCLE = id(10);
const REVISION = id(11);

async function seedPlan(db: TestDb) {
  await db.insert(categories).values([
    { id: LAUNDRY, name: "Laundry", kind: "essential", ...stamp },
    { id: MEALS, name: "Meals", kind: "essential", ...stamp },
  ]);
  await db.insert(planningCycles).values({
    id: CYCLE,
    startDate: "2026-11-02",
    endDateExclusive: "2026-12-02",
    status: "active",
    ...stamp,
  });
  await db.insert(planRevisions).values({
    id: REVISION,
    cycleId: CYCLE,
    revisionNo: 1,
    budgetSen: 40000,
    approvedAt: stamp.createdAt,
    ...stamp,
  });
  await db.insert(allocations).values([
    { id: id(20), revisionId: REVISION, categoryId: LAUNDRY, amountSen: 4000, ...stamp },
    { id: id(21), revisionId: REVISION, categoryId: MEALS, amountSen: 25000, ...stamp },
  ]);
}

const purchase = (n: number, amountSen: number) => ({
  id: id(n),
  type: "purchase" as const,
  amountSen,
  occurredAt: stamp.createdAt,
  localDate: "2026-11-02",
  ...stamp,
});

describe("phone schema", () => {
  let db: TestDb;

  beforeEach(async () => {
    ({ db } = await createTestDb());
    await seedPlan(db);
  });

  it("stores the golden-path RM5 laundry purchase with its outbox entry in one transaction (AC-04, FR-SYNC-04)", async () => {
    db.transaction((tx) => {
      tx.insert(transactions).values(purchase(30, 500)).run();
      tx.insert(transactionLines)
        .values({
          id: id(31),
          transactionId: id(30),
          kind: "spending",
          categoryId: LAUNDRY,
          amountSen: 500,
          ...stamp,
        })
        .run();
      tx.insert(outboxOperations)
        .values({
          operationId: id(32),
          entity: "transaction",
          entityId: id(30),
          op: "upsert",
          baseVersion: null,
          payload: { amountSen: 500 },
          createdAt: stamp.createdAt,
        })
        .run();
    });

    const lines = await db
      .select()
      .from(transactionLines)
      .where(eq(transactionLines.categoryId, LAUNDRY));
    expect(lines.map((l) => l.amountSen)).toEqual([500]);
    const queued = await db.select().from(outboxOperations);
    expect(queued.length).toBe(1);
    expect(queued[0]?.status).toBe("pending");
  });

  it("rolls back the outbox entry when the change fails (FR-SYNC-04)", async () => {
    expect(() =>
      db.transaction((tx) => {
        tx.insert(outboxOperations)
          .values({
            operationId: id(40),
            entity: "transaction",
            entityId: id(41),
            op: "upsert",
            createdAt: stamp.createdAt,
          })
          .run();
        tx.insert(transactions).values(purchase(41, 0)).run(); // amount 0 breaks a CHECK
      }),
    ).toThrow();
    expect((await db.select().from(outboxOperations)).length).toBe(0);
    expect((await db.select().from(transactions)).length).toBe(0);
  });

  it("rejects amounts that are not greater than zero (BR-01, R-04)", async () => {
    await expect(db.insert(transactions).values(purchase(50, 0))).rejects.toThrow();
    await expect(db.insert(transactions).values(purchase(51, -500))).rejects.toThrow();
  });

  it("requires spending lines to point to a category and debt lines to a debt (D-01)", async () => {
    await db.insert(transactions).values(purchase(60, 2000));
    await db.insert(debts).values({
      id: id(61),
      direction: "owed_to_me",
      counterparty: "[FRIEND A]",
      ...stamp,
    });
    const line = { transactionId: id(60), amountSen: 1000, ...stamp };
    await db.insert(transactionLines).values([
      { id: id(62), kind: "spending", categoryId: MEALS, ...line },
      { id: id(63), kind: "debt", debtId: id(61), ...line },
    ]);
    await expect(
      db.insert(transactionLines).values({ id: id(64), kind: "spending", debtId: id(61), ...line }),
    ).rejects.toThrow();
  });

  it("requires a refund, and only a refund, to point to a purchase (FR-TXN-06)", async () => {
    await db.insert(transactions).values(purchase(70, 2500));
    await expect(
      db.insert(transactions).values({ ...purchase(71, 1000), type: "refund" }),
    ).rejects.toThrow();
    await db
      .insert(transactions)
      .values({ ...purchase(72, 1000), type: "refund", refundsTransactionId: id(70) });
  });

  it("refuses references to rows that don't exist", async () => {
    await db.insert(transactions).values(purchase(80, 500));
    await expect(
      db.insert(transactionLines).values({
        id: id(81),
        transactionId: id(80),
        kind: "spending",
        categoryId: id(999),
        amountSen: 500,
        ...stamp,
      }),
    ).rejects.toThrow();
  });

  it("allocates each category only once per revision", async () => {
    await expect(
      db.insert(allocations).values({
        id: id(90),
        revisionId: REVISION,
        categoryId: LAUNDRY,
        amountSen: 1,
        ...stamp,
      }),
    ).rejects.toThrow();
  });

  it("allows only one draft revision per cycle (D-20, FR-PLN-16)", async () => {
    const draft = { cycleId: CYCLE, budgetSen: 40000, approvedAt: null, ...stamp };
    await db.insert(planRevisions).values({ id: id(100), revisionNo: 2, ...draft });
    await expect(
      db.insert(planRevisions).values({ id: id(101), revisionNo: 3, ...draft }),
    ).rejects.toThrow();
  });

  it("creates one scheduled item per bill and date, linked only when paid (S-05, R-05)", async () => {
    await db.insert(bills).values({
      id: id(110),
      categoryId: LAUNDRY,
      name: "Laundry",
      amountSen: 1600,
      repeatKind: "every_n_weeks",
      repeatParams: { n: 2 },
      anchorDate: "2026-11-02",
      ...stamp,
    });
    const item = { billId: id(110), dueDate: "2026-11-02", amountSen: 1600, ...stamp };
    await db.insert(scheduledItems).values({ id: id(111), ...item });
    await expect(db.insert(scheduledItems).values({ id: id(112), ...item })).rejects.toThrow();
    await expect(
      db
        .update(scheduledItems)
        .set({ status: "paid" })
        .where(eq(scheduledItems.id, id(111))),
    ).rejects.toThrow();
  });

  it("keeps one live check-in per day, and allows a new one after undo (R-01)", async () => {
    await db.insert(dayCheckIns).values({ id: id(120), localDate: "2026-11-03", ...stamp });
    await expect(
      db.insert(dayCheckIns).values({ id: id(121), localDate: "2026-11-03", ...stamp }),
    ).rejects.toThrow();
    await db
      .update(dayCheckIns)
      .set({ deletedAt: stamp.createdAt })
      .where(eq(dayCheckIns.id, id(120)));
    await db.insert(dayCheckIns).values({ id: id(122), localDate: "2026-11-03", ...stamp });
  });

  it("marks new rows as pending sync, version 1 (FR-SYNC-06, D-06)", async () => {
    const [row] = await db.select().from(categories).where(eq(categories.id, LAUNDRY));
    expect(row?.syncStatus).toBe("pending");
    expect(row?.version).toBe(1);
    expect(row?.userId).toBe(null); // local-only mode (D-05)
  });
});
