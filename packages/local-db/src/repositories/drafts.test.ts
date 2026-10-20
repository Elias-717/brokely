import { sen } from "@brokely/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestContext } from "../test-db";
import { listCategories, seedDefaultCategories } from "./categories";
import type { RepoContext } from "./context";
import { approveDraftCycle, getDraftCycle } from "./cycles";
import {
  approveRevisionDraft,
  datesClash,
  discardRevisionDraft,
  getRevisionDraft,
  saveDraftCycle,
  saveRevisionDraft,
} from "./drafts";
import { getPlan, quickStart, revisePlan, setAllocation } from "./plan";

describe("guided setup drafts (D-20, FR-PLN-16, AC-47, D-63)", () => {
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
  });

  it("AC-47: an unapproved edit continues the same draft; discarding leaves the plan unchanged", () => {
    const meals = category("Meals");
    saveRevisionDraft(ctx, {
      cycleId,
      budgetSen: sen(40000),
      allocations: [{ categoryId: meals, amountSen: sen(30000) }],
    });
    const first = getRevisionDraft(ctx.db, cycleId)!;
    // Open the editor again: same draft, now with Transport too.
    saveRevisionDraft(ctx, {
      cycleId,
      budgetSen: sen(40000),
      allocations: [
        { categoryId: meals, amountSen: sen(30000) },
        { categoryId: category("Transport"), amountSen: sen(4000) },
      ],
    });
    const again = getRevisionDraft(ctx.db, cycleId)!;
    expect(again.revision.id).toBe(first.revision.id);
    expect(again.allocations).toHaveLength(2);
    // The plan in use is still the approved one.
    expect(getPlan(ctx.db, cycleId)!.allocations).toEqual([
      expect.objectContaining({ categoryId: meals, amountSen: 25000 }),
    ]);

    discardRevisionDraft(ctx, cycleId);
    expect(getRevisionDraft(ctx.db, cycleId)).toBeUndefined();
    expect(getPlan(ctx.db, cycleId)!.revision.revisionNo).toBe(2);
  });

  it("approving makes the draft the plan, newest even after a card was approved meanwhile", () => {
    saveRevisionDraft(ctx, {
      cycleId,
      budgetSen: sen(45000),
      allocations: [{ categoryId: category("Meals"), amountSen: sen(30000) }],
    });
    // An essential card approved while the draft is open.
    setAllocation(ctx, { cycleId, categoryId: category("Laundry"), amountSen: sen(1600) });

    expect(approveRevisionDraft(ctx, { cycleId, shortfallAcknowledged: false }).ok).toBe(true);
    const plan = getPlan(ctx.db, cycleId)!;
    expect(plan.revision.budgetSen).toBe(45000);
    expect(plan.allocations.map((a) => a.amountSen)).toEqual([30000]);
    expect(getRevisionDraft(ctx.db, cycleId)).toBeUndefined();
  });

  it('an over-budget draft needs "Approve anyway" (FR-PLN-10, D-28)', () => {
    saveRevisionDraft(ctx, {
      cycleId,
      budgetSen: sen(40000),
      allocations: [{ categoryId: category("Meals"), amountSen: sen(41700) }],
    });
    expect(approveRevisionDraft(ctx, { cycleId, shortfallAcknowledged: false })).toMatchObject({
      ok: false,
      code: "SHORTFALL_NOT_ACKNOWLEDGED",
    });
    expect(approveRevisionDraft(ctx, { cycleId, shortfallAcknowledged: true }).ok).toBe(true);
  });

  it("without an active plan the draft is a draft cycle, approved into a new plan", async () => {
    ({ ctx } = await createTestContext());
    seedDefaultCategories(ctx);
    const saved = saveDraftCycle(ctx, {
      startDate: "2026-12-01",
      endDateInclusive: "2026-12-31",
      budgetSen: sen(50000),
      allocations: [{ categoryId: category("Meals"), amountSen: sen(27000) }],
    });
    if (!saved.ok) throw new Error(saved.message);
    // Saving again continues the same draft cycle.
    saveDraftCycle(ctx, {
      startDate: "2026-12-01",
      endDateInclusive: "2026-12-31",
      budgetSen: sen(48000),
      allocations: [{ categoryId: category("Meals"), amountSen: sen(27000) }],
    });
    const draft = getDraftCycle(ctx.db)!;
    expect(draft.cycle.id).toBe(saved.value.cycleId);
    expect(draft.revision.budgetSen).toBe(48000);

    const approved = approveDraftCycle(ctx, {
      cycleId: draft.cycle.id,
      startDate: "2026-12-01",
      endDateInclusive: "2026-12-31",
      budgetSen: sen(48000),
      allocations: draft.allocations,
      shortfallAcknowledged: false,
    });
    expect(approved.ok).toBe(true);
    expect(getPlan(ctx.db, draft.cycle.id)?.cycle.status).toBe("active");
  });

  it("warns about dates that clash with an existing plan (BR-05)", () => {
    expect(datesClash(ctx.db, "2026-11-30", "2026-12-30")).toBe(true);
    expect(datesClash(ctx.db, "2026-12-01", "2026-12-31")).toBe(false);
  });
});
