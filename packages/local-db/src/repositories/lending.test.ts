import { sen } from "@brokely/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestContext } from "../test-db";
import { seedDefaultCategories } from "./categories";
import type { RepoContext } from "./context";
import { listDebts } from "./debts";
import { lendFromPlan, undoLendFromPlan } from "./lending";
import { getPlan, listPlanHistory, quickStart } from "./plan";

describe("lending counted in the plan (D-141)", () => {
  let ctx: RepoContext;
  let cycleId: string;
  const loan = {
    direction: "owed_to_me" as const,
    counterparty: "[FRIEND A]",
    amountSen: sen(300),
    occurredAt: "2026-11-19T04:00:00.000Z",
    localDate: "2026-11-19",
  };

  beforeEach(async () => {
    ({ ctx } = await createTestContext());
    seedDefaultCategories(ctx);
    const started = quickStart(ctx, {
      budgetSen: sen(50_000),
      startDate: "2026-11-01",
      endDateInclusive: "2026-11-30",
    });
    if (!started.ok) throw new Error(started.message);
    cycleId = started.value.cycleId;
  });

  it("saves the loan and lowers the budget in one step: RM500 → RM497", () => {
    const saved = lendFromPlan(ctx, { ...loan, cycleId, reason: "Lent RM3.00 to [FRIEND A]" });
    expect(saved.ok).toBe(true);
    expect(getPlan(ctx.db, cycleId)?.revision.budgetSen).toBe(49_700);
    expect(listDebts(ctx.db)).toHaveLength(1);
    expect(listPlanHistory(ctx.db, cycleId).at(-1)?.reason).toBe("Lent RM3.00 to [FRIEND A]");
  });

  it("Undo removes the loan and puts the budget back as one more revision (D-03)", () => {
    const saved = lendFromPlan(ctx, { ...loan, cycleId, reason: "Lent RM3.00 to [FRIEND A]" });
    if (!saved.ok) throw new Error(saved.message);
    expect(undoLendFromPlan(ctx, saved.value).ok).toBe(true);
    expect(getPlan(ctx.db, cycleId)?.revision.budgetSen).toBe(50_000);
    expect(listDebts(ctx.db)).toHaveLength(0);
  });

  it("refuses a loan bigger than the whole plan, saving nothing", () => {
    const saved = lendFromPlan(ctx, { ...loan, amountSen: sen(50_000), cycleId, reason: "x" });
    expect(saved.ok).toBe(false);
    expect(listDebts(ctx.db)).toHaveLength(0);
  });
});
