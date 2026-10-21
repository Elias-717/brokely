import { sen } from "@brokely/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { outboxOperations, planningCycles } from "../schema";
import { createTestContext, NOW } from "../test-db";
import { createBill, listScheduledItems } from "./bills";
import { listCategories, seedDefaultCategories } from "./categories";
import type { RepoContext } from "./context";
import {
  approveDraftCycle,
  completeEndedCycles,
  cycleSummary,
  discardDraftCycle,
  getDraftCycle,
  lastEndedCycle,
  startNextCycle,
} from "./cycles";
import { findCycleOn, getPlan, quickStart, revisePlan } from "./plan";
import { recordPurchase } from "./transactions";

describe("cycle lifecycle (BR-27, D-18, FR-PLN-14, FR-PLN-17)", () => {
  let ctx: RepoContext;
  let cycleId: string;
  const category = (name: string) => listCategories(ctx.db).find((c) => c.name === name)!.id;

  beforeEach(async () => {
    ({ ctx } = await createTestContext());
    seedDefaultCategories(ctx);
    const plan = quickStart(ctx, {
      budgetSen: sen(40000),
      startDate: "2026-11-01",
      endDateInclusive: "2026-11-30",
    });
    if (!plan.ok) throw new Error(plan.message);
    cycleId = plan.value.cycleId;
    revisePlan(ctx, {
      cycleId,
      budgetSen: sen(40000),
      allocations: [{ categoryId: category("Meals"), amountSen: sen(25000) }],
      shortfallAcknowledged: false,
    });
    revisePlan(ctx, {
      cycleId,
      budgetSen: sen(42000),
      allocations: [{ categoryId: category("Meals"), amountSen: sen(28000) }],
      shortfallAcknowledged: false,
    });
    recordPurchase(ctx, {
      amountSen: sen(1250),
      categoryId: category("Meals"),
      occurredAt: NOW,
      localDate: "2026-11-02",
    });
  });

  it("an active cycle completes the day after its end date, not before (AC-48)", () => {
    expect(completeEndedCycles(ctx, "2026-11-30")).toMatchObject({
      ok: true,
      value: { completed: 0 },
    });
    expect(completeEndedCycles(ctx, "2026-12-01")).toMatchObject({
      ok: true,
      value: { completed: 1 },
    });
    expect(ctx.db.select().from(planningCycles).get()?.status).toBe("completed");
    expect(lastEndedCycle(ctx.db, "2026-12-01")?.id).toBe(cycleId);
    // Completed cycles keep their dates (BR-05) and stay findable for edits (D-19).
    expect(findCycleOn(ctx.db, "2026-11-15")?.id).toBe(cycleId);
  });

  it("a completed plan stays editable: a late record and a raised amount both count (AC-49, D-19)", () => {
    completeEndedCycles(ctx, "2026-12-01");
    const late = recordPurchase(ctx, {
      amountSen: sen(800),
      categoryId: category("Meals"),
      occurredAt: NOW,
      localDate: "2026-11-20",
    });
    expect(late.ok).toBe(true);
    const raised = revisePlan(ctx, {
      cycleId,
      budgetSen: sen(42000),
      allocations: [{ categoryId: category("Meals"), amountSen: sen(30000) }],
      shortfallAcknowledged: false,
    });
    expect(raised.ok).toBe(true);

    expect(ctx.db.select().from(planningCycles).get()?.status).toBe("completed");
    const summary = cycleSummary(ctx.db, cycleId)!;
    expect(summary).toMatchObject({ originalBudgetSen: 40000, spentSen: 2050 });
    // Original kept, newest amount as final, the late RM8 in the actual (FR-PLN-14).
    expect(summary.lines).toEqual([
      expect.objectContaining({ name: "Meals", originalSen: 0, finalSen: 30000, actualSen: 2050 }),
    ]);
  });

  it("the summary shows original → final → actual per category (FR-PLN-14)", () => {
    const summary = cycleSummary(ctx.db, cycleId)!;
    expect(summary).toMatchObject({
      originalBudgetSen: 40000,
      finalBudgetSen: 42000,
      spentSen: 1250,
    });
    expect(summary.lines).toEqual([
      expect.objectContaining({ name: "Meals", originalSen: 0, finalSen: 28000, actualSen: 1250 }),
    ]);
  });

  it("Start next cycle makes one draft starting the next day with the same amounts (AC-48)", () => {
    completeEndedCycles(ctx, "2026-12-01");
    const first = startNextCycle(ctx, cycleId);
    const again = startNextCycle(ctx, cycleId);
    if (!first.ok || !again.ok) throw new Error("start");
    expect(again.value.cycleId).toBe(first.value.cycleId);

    const draft = getDraftCycle(ctx.db)!;
    expect(draft.cycle).toMatchObject({
      status: "draft",
      startDate: "2026-12-01",
      endDateExclusive: "2026-12-31", // same length: 30 days
    });
    expect(draft.revision).toMatchObject({ budgetSen: 42000, approvedAt: null });
    expect(draft.allocations).toEqual([{ categoryId: category("Meals"), amountSen: 28000 }]);
    // A draft owns no dates: today still has no active plan.
    expect(findCycleOn(ctx.db, "2026-12-01")).toBeUndefined();
  });

  it("approving the draft makes it active with an approved original; bills get dates in it", () => {
    completeEndedCycles(ctx, "2026-12-01");
    createBill(ctx, {
      categoryId: category("Phone & internet"),
      name: "Phone plan",
      amountSen: sen(3000),
      repeat: { kind: "monthly", day: 5 },
      anchorDate: "2026-11-05",
    });
    const started = startNextCycle(ctx, cycleId);
    if (!started.ok) throw new Error("start");
    const approved = approveDraftCycle(ctx, {
      cycleId: started.value.cycleId,
      startDate: "2026-12-01",
      endDateInclusive: "2026-12-31",
      budgetSen: sen(45000),
      allocations: [{ categoryId: category("Meals"), amountSen: sen(30000) }],
      shortfallAcknowledged: false,
    });
    expect(approved.ok).toBe(true);
    const plan = getPlan(ctx.db, started.value.cycleId)!;
    expect(plan.cycle.status).toBe("active");
    expect(plan.revision).toMatchObject({ revisionNo: 1, budgetSen: 45000 });
    expect(plan.revision.approvedAt).not.toBeNull();
    expect(getDraftCycle(ctx.db)).toBeUndefined();
    expect(
      listScheduledItems(ctx.db, { start: "2026-12-01", endExclusive: "2027-01-01" }).map(
        (i) => i.dueDate,
      ),
    ).toEqual(["2026-12-05"]);
  });

  it("refuses to approve dates that overlap the finished cycle and writes nothing (BR-05)", () => {
    const started = startNextCycle(ctx, cycleId);
    if (!started.ok) throw new Error("start");
    const before = ctx.db.select().from(outboxOperations).all().length;
    const result = approveDraftCycle(ctx, {
      cycleId: started.value.cycleId,
      startDate: "2026-11-30",
      endDateInclusive: "2026-12-30",
      budgetSen: sen(40000),
      allocations: [],
      shortfallAcknowledged: false,
    });
    expect(result).toMatchObject({ ok: false, code: "CYCLE_OVERLAP" });
    expect(ctx.db.select().from(outboxOperations).all()).toHaveLength(before);
    expect(getDraftCycle(ctx.db)?.cycle.status).toBe("draft");
  });

  it("discarding the draft leaves no draft behind (BR-27)", () => {
    const started = startNextCycle(ctx, cycleId);
    if (!started.ok) throw new Error("start");
    expect(discardDraftCycle(ctx, started.value.cycleId).ok).toBe(true);
    expect(getDraftCycle(ctx.db)).toBeUndefined();
  });
});
