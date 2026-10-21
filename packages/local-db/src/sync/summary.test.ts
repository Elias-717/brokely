import type { PullChange } from "@brokely/contracts";
import { sen } from "@brokely/domain";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { listCategories, quickStart, recordPurchase, seedDefaultCategories } from "../repositories";
import { createTestContext, testId } from "../test-db";
import { outboxOperations } from "../schema";
import { phoneSummary, stuckChanges, summarizeChanges } from "./summary";

describe("what each side holds (D-73 b)", () => {
  it("counts this phone's plans, records and debts", async () => {
    const { ctx } = await createTestContext();
    seedDefaultCategories(ctx);
    expect(phoneSummary(ctx.db)).toEqual({ plans: [], records: 0, debts: 0 });
    quickStart(ctx, {
      budgetSen: sen(40000),
      startDate: "2026-11-01",
      endDateInclusive: "2026-11-30",
    });
    const meals = listCategories(ctx.db).find((c) => c.name === "Meals")!.id;
    recordPurchase(ctx, {
      amountSen: sen(800),
      categoryId: meals,
      occurredAt: "2026-11-02T04:00:00Z",
      localDate: "2026-11-02",
    });
    expect(phoneSummary(ctx.db)).toEqual({
      plans: [{ start: "2026-11-01", endExclusive: "2026-12-01" }],
      records: 1,
      debts: 0,
    });
  });

  it("counts the account's latest state from a pull, without deleted rows or drafts", () => {
    const change = (
      n: number,
      entity: PullChange["entity"],
      data: object | null,
      deleted = false,
    ): PullChange => ({
      entity,
      entityId: testId(n),
      version: 1,
      serverSeq: n,
      deletedAt: deleted ? "2026-11-03T00:00:00.000Z" : null,
      data: data as Record<string, unknown> | null,
    });
    const cycle = (status: string) => ({
      startDate: "2026-10-01",
      endDateExclusive: "2026-12-01",
      trackingStartDate: "2026-10-01",
      status,
    });
    expect(
      summarizeChanges([
        change(1, "planning_cycle", cycle("active")),
        change(2, "planning_cycle", cycle("draft")),
        change(3, "transaction", {}),
        change(4, "transaction", {}),
        change(4, "transaction", null, true), // the same record, deleted later
        change(5, "debt", {}),
      ]),
    ).toEqual({
      plans: [{ start: "2026-10-01", endExclusive: "2026-12-01" }],
      records: 1,
      debts: 1,
    });
  });
});

describe("changes that need a look (FR-SYNC-06, FR-SYNC-08)", () => {
  it("say what they are and why, in plain words", async () => {
    const { ctx } = await createTestContext();
    seedDefaultCategories(ctx);
    const meals = listCategories(ctx.db).find((c) => c.name === "Meals")!.id;
    recordPurchase(ctx, {
      amountSen: sen(900),
      categoryId: meals,
      occurredAt: "2026-11-02T04:00:00Z",
      localDate: "2026-11-02",
      note: "Lunch",
    });
    const ops = ctx.db.select().from(outboxOperations).all();
    const category = ops.find(
      (o) => o.entity === "category" && (o.payload as { name: string }).name === "Meals",
    )!;
    const purchase = ops.find((o) => o.entity === "transaction")!;
    ctx.db
      .update(outboxOperations)
      .set({ status: "conflict" })
      .where(eq(outboxOperations.operationId, category.operationId))
      .run();
    ctx.db
      .update(outboxOperations)
      .set({
        status: "failed",
        lastError: "LINES_DO_NOT_SUM: The parts add up to 800 sen, not 900 sen",
      })
      .where(eq(outboxOperations.operationId, purchase.operationId))
      .run();

    expect(stuckChanges(ctx.db).map((c) => [c.kind, c.label, c.amountSen, c.reason])).toEqual([
      ["Category", "Meals", null, "Changed on another phone too"],
      ["Record", "Lunch", 900, "The parts add up to 800 sen, not 900 sen"],
    ]);
  });
});
