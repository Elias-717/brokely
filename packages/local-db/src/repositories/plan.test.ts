import { budgetAfterPayback, moneyInSuggestion, sen } from "@brokely/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { outboxOperations, planningCycles, planRevisions } from "../schema";
import { createTestContext } from "../test-db";
import { listCategories, seedDefaultCategories } from "./categories";
import type { RepoContext } from "./context";
import { listDebts } from "./debts";
import {
  findCycleOn,
  getPlan,
  listRevisions,
  OPENING_DEBT_NOTE,
  quickStart,
  revisePlan,
  setAllocation,
  setPlanBudget,
} from "./plan";
import { listTransactions, recordMoneyIn } from "./transactions";

describe("plan repository", () => {
  let ctx: RepoContext;
  const category = (name: string) => listCategories(ctx.db).find((c) => c.name === name)!.id;
  const outbox = () => ctx.db.select().from(outboxOperations).all();

  beforeEach(async () => {
    ({ ctx } = await createTestContext());
    seedDefaultCategories(ctx);
    ctx.db.delete(outboxOperations).run(); // only count what each test writes
  });

  const novemberQuickStart = () => {
    const result = quickStart(ctx, {
      budgetSen: sen(40000),
      startDate: "2026-11-01",
      endDateInclusive: "2026-11-30",
    });
    if (!result.ok) throw new Error(result.message);
    return result.value;
  };

  it("quick start saves an active cycle and an approved revision with no amounts, plus two outbox entries (AC-53, FR-PLN-19, FR-PLN-09)", () => {
    const { cycleId, revisionId } = novemberQuickStart();

    const cycle = ctx.db.select().from(planningCycles).get();
    expect(cycle).toMatchObject({
      id: cycleId,
      startDate: "2026-11-01",
      endDateExclusive: "2026-12-01", // inclusive end + 1 day (BR-03)
      trackingStartDate: "2026-11-01",
      status: "active",
    });
    const plan = getPlan(ctx.db, cycleId)!;
    expect(plan.revision).toMatchObject({ id: revisionId, revisionNo: 1, budgetSen: 40000 });
    expect(plan.revision.approvedAt).not.toBeNull();
    expect(plan.allocations).toEqual([]);
    expect(plan.totals).toMatchObject({ plannedSpendingSen: 0, unallocatedSen: 40000 });

    expect(outbox().map((o) => [o.entity, o.entityId, o.baseVersion])).toEqual([
      ["planning_cycle", cycleId, null],
      ["plan_revision", revisionId, null],
    ]);
    expect(outbox()[1]?.payload).toMatchObject({ budgetSen: 40000, allocations: [] });
  });

  it("finds the cycle that contains a date (BR-04)", () => {
    const { cycleId } = novemberQuickStart();
    expect(findCycleOn(ctx.db, "2026-11-30")?.id).toBe(cycleId);
    expect(findCycleOn(ctx.db, "2026-12-01")).toBeUndefined();
  });

  it("starts tracking on the given day for a mid-month start (FR-PLN-21, R-12)", () => {
    const result = quickStart(ctx, {
      budgetSen: sen(25000),
      startDate: "2026-11-15",
      endDateInclusive: "2026-11-30",
      trackingStartDate: "2026-11-15",
    });
    expect(result.ok).toBe(true);
    expect(ctx.db.select().from(planningCycles).get()?.trackingStartDate).toBe("2026-11-15");
  });

  it("refuses a cycle that overlaps an active one by one day and writes nothing (AC-29, FR-PLN-03, BR-05)", () => {
    novemberQuickStart();
    const before = outbox().length;

    const result = quickStart(ctx, {
      budgetSen: sen(40000),
      startDate: "2026-11-30",
      endDateInclusive: "2026-12-29",
    });

    expect(result).toMatchObject({ ok: false, code: "CYCLE_OVERLAP" });
    expect(ctx.db.select().from(planningCycles).all()).toHaveLength(1);
    expect(outbox()).toHaveLength(before);
  });

  it("records debts from before the plan in Debts, dated the day before, never as spending (D-41)", () => {
    const result = quickStart(ctx, {
      budgetSen: budgetAfterPayback(sen(50000), [sen(6000)]),
      startDate: "2026-11-01",
      endDateInclusive: "2026-11-30",
      openingDebts: [
        {
          direction: "owed_by_me",
          counterparty: "[FRIEND A]",
          amountSen: sen(10000),
          paybackSen: sen(6000),
        },
        { direction: "owed_to_me", counterparty: "[FRIEND B]", amountSen: sen(2000) },
      ],
    });
    if (!result.ok) throw new Error(result.message);

    expect(getPlan(ctx.db, result.value.cycleId)?.revision.budgetSen).toBe(44000);
    const debts = listDebts(ctx.db);
    const owedByMe = debts.find((d) => d.direction === "owed_by_me");
    const owedToMe = debts.find((d) => d.direction === "owed_to_me");
    expect(owedByMe).toMatchObject({
      direction: "owed_by_me",
      dueDate: "2026-11-30",
      notes: OPENING_DEBT_NOTE,
      summary: { outstandingSen: 10000 },
    });
    expect(owedToMe).toMatchObject({ direction: "owed_to_me", dueDate: null });
    expect(listTransactions(ctx.db).map((t) => [t.type, t.localDate])).toEqual(
      expect.arrayContaining([
        ["borrow", "2026-10-31"],
        ["lend", "2026-10-31"],
      ]),
    );
    expect(outbox().map((o) => o.entity)).toEqual([
      "planning_cycle",
      "plan_revision",
      "debt",
      "transaction",
      "debt",
      "transaction",
    ]);
  });

  it("refuses a payback on money owed to the student and writes nothing (D-41)", () => {
    const result = quickStart(ctx, {
      budgetSen: sen(40000),
      startDate: "2026-11-01",
      endDateInclusive: "2026-11-30",
      openingDebts: [
        {
          direction: "owed_to_me",
          counterparty: "[FRIEND B]",
          amountSen: sen(2000),
          paybackSen: sen(1000),
        },
      ],
    });
    expect(result).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });
    expect(outbox()).toHaveLength(0);
  });

  it("lists revisions oldest first, so the original is kept beside the current one (D-03)", () => {
    const { cycleId } = novemberQuickStart();
    revisePlan(ctx, {
      cycleId,
      budgetSen: sen(45000),
      allocations: [],
      shortfallAcknowledged: false,
    });
    expect(listRevisions(ctx.db, cycleId).map((r) => [r.revisionNo, r.budgetSen])).toEqual([
      [1, 40000],
      [2, 45000],
    ]);
  });

  it("refuses an end date before the start date", () => {
    const result = quickStart(ctx, {
      budgetSen: sen(40000),
      startDate: "2026-11-30",
      endDateInclusive: "2026-11-01",
    });
    expect(result).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });
  });

  it("a plan change makes a new revision and keeps the original (AC-06, FR-PLN-11, D-03)", () => {
    const { cycleId, revisionId } = novemberQuickStart();
    const meals = category("Meals");

    const first = revisePlan(ctx, {
      cycleId,
      budgetSen: sen(40000),
      allocations: [{ categoryId: meals, amountSen: sen(25000) }],
      shortfallAcknowledged: false,
    });
    const second = revisePlan(ctx, {
      cycleId,
      budgetSen: sen(40000),
      allocations: [{ categoryId: meals, amountSen: sen(30000) }],
      shortfallAcknowledged: false,
    });

    expect(first).toMatchObject({ ok: true, value: { revisionNo: 2 } });
    expect(second).toMatchObject({ ok: true, value: { revisionNo: 3 } });
    const revisions = ctx.db.select().from(planRevisions).all();
    expect(revisions.map((r) => [r.revisionNo, r.budgetSen])).toEqual([
      [1, 40000],
      [2, 40000],
      [3, 40000],
    ]);
    expect(revisions[0]?.id).toBe(revisionId); // original untouched
    const plan = getPlan(ctx.db, cycleId)!;
    expect(plan.revision.revisionNo).toBe(3);
    expect(plan.allocations).toEqual([{ categoryId: meals, kind: "essential", amountSen: 30000 }]);
    // One outbox entry per revision, carrying its allocations (S-01).
    const ops = outbox().slice(2); // after the quick start's cycle + revision 1
    expect(ops.map((o) => o.entity)).toEqual(["plan_revision", "plan_revision"]);
    expect(ops[1]?.payload).toMatchObject({
      revisionNo: 3,
      allocations: [{ categoryId: meals, amountSen: 30000 }],
    });
  });

  it("blocks a plan over budget until the shortfall is acknowledged (AC-03, FR-PLN-10)", () => {
    const { cycleId } = novemberQuickStart();
    const input = {
      cycleId,
      budgetSen: sen(40000),
      allocations: [
        { categoryId: category("Meals"), amountSen: sen(30000) },
        { categoryId: category("Fun & trips"), amountSen: sen(13000) },
      ],
    };

    expect(revisePlan(ctx, { ...input, shortfallAcknowledged: false })).toMatchObject({
      ok: false,
      code: "SHORTFALL_NOT_ACKNOWLEDGED",
    });
    expect(getPlan(ctx.db, cycleId)!.revision.revisionNo).toBe(1);

    expect(revisePlan(ctx, { ...input, shortfallAcknowledged: true }).ok).toBe(true);
    expect(getPlan(ctx.db, cycleId)!.totals.shortfallSen).toBe(3000);
  });

  it("setAllocation copies the current plan and changes one category (FR-PLN-20, AC-54)", () => {
    const { cycleId } = novemberQuickStart();
    const laundry = category("Laundry");
    const meals = category("Meals");
    setAllocation(ctx, { cycleId, categoryId: meals, amountSen: sen(25000) });

    const result = setAllocation(ctx, { cycleId, categoryId: laundry, amountSen: sen(4800) });

    expect(result).toMatchObject({ ok: true, value: { revisionNo: 3 } });
    const plan = getPlan(ctx.db, cycleId)!;
    expect(plan.allocations.map((a) => [a.categoryId, a.amountSen])).toEqual([
      [meals, 25000],
      [laundry, 4800],
    ]);
    expect(plan.totals.unallocatedSen).toBe(40000 - 25000 - 4800);
  });

  it("refuses an allocation to an unknown category (REFERENCE_MISSING)", () => {
    const { cycleId } = novemberQuickStart();
    const result = setAllocation(ctx, {
      cycleId,
      categoryId: "0192f3a5-0000-7000-8000-000000000999",
      amountSen: sen(100),
    });
    expect(result).toMatchObject({ ok: false, code: "REFERENCE_MISSING" });
  });

  it("money in over the budget: adding the difference is a new revision with the same amounts, Undo another (AC-61, FR-TXN-11, D-125)", () => {
    const { cycleId } = novemberQuickStart();
    setAllocation(ctx, { cycleId, categoryId: category("Meals"), amountSen: sen(30000) });
    for (const amountSen of [sen(30000), sen(20000)]) {
      const r = recordMoneyIn(ctx, {
        amountSen,
        occurredAt: "2026-11-03T04:00:00.000Z",
        localDate: "2026-11-03",
      });
      if (!r.ok) throw new Error(r.message);
    }

    // Nothing changes until the student taps: spending and the budget stay as they were.
    const before = getPlan(ctx.db, cycleId)!;
    expect(before.revision.budgetSen).toBe(40000);
    const suggestion = moneyInSuggestion(listTransactions(ctx.db), sen(before.revision.budgetSen));
    expect(suggestion).toBe(10000);

    const added = setPlanBudget(ctx, {
      cycleId,
      budgetSen: sen(40000 + suggestion!),
      shortfallAcknowledged: before.revision.shortfallAcknowledged,
    });
    expect(added.ok).toBe(true);
    const after = getPlan(ctx.db, cycleId)!;
    expect(after.revision).toMatchObject({
      budgetSen: 50000,
      revisionNo: before.revision.revisionNo + 1,
    });
    expect(after.allocations.map((a) => [a.categoryId, a.amountSen])).toEqual([
      [category("Meals"), 30000],
    ]);
    expect(moneyInSuggestion(listTransactions(ctx.db), sen(50000))).toBe(null);

    // Undo: one more revision with the old budget; the earlier ones are kept (D-03).
    setPlanBudget(ctx, { cycleId, budgetSen: sen(40000), shortfallAcknowledged: false });
    expect(getPlan(ctx.db, cycleId)!.revision.budgetSen).toBe(40000);
    expect(listRevisions(ctx.db, cycleId)).toHaveLength(before.revision.revisionNo + 2);
  });
});
