import { describe, expect, it } from "vitest";
import { sen } from "./money";
import { planChanges, undoPlanChange, type RevisionSnapshot } from "./plan-changes";

const rev = (
  revisionNo: number,
  budget: number,
  allocations: [string, number][],
  reason: string | null = null,
): RevisionSnapshot => ({
  id: `r${revisionNo}`,
  revisionNo,
  approvedAt: `2026-11-0${revisionNo}T01:00:00.000Z`,
  budgetSen: sen(budget),
  allocations: allocations.map(([categoryId, amount]) => ({ categoryId, amountSen: sen(amount) })),
  reason,
});

const history = [
  rev(1, 19_800, [["meals", 15_000]]),
  rev(
    2,
    19_800,
    [
      ["meals", 15_000],
      ["laundry", 3_200],
    ],
    "Essentials: Laundry",
  ),
  rev(
    3,
    49_800,
    [
      ["meals", 15_000],
      ["laundry", 3_200],
      ["savings", 30_000],
    ],
    "Money in · Part-time · to Savings",
  ),
  rev(
    4,
    48_000,
    [
      ["meals", 15_000],
      ["laundry", 3_200],
      ["savings", 30_000],
    ],
    "Left in plan set to RM100.00",
  ),
];

describe("plan changes (D-139, D-03)", () => {
  it("lists every change newest first, with why and what moved", () => {
    const changes = planChanges(history);
    expect(changes.map((c) => c.reason)).toEqual([
      "Left in plan set to RM100.00",
      "Money in · Part-time · to Savings",
      "Essentials: Laundry",
      "Plan started",
    ]);
    expect(changes[0]).toMatchObject({
      budget: { from: sen(49_800), to: sen(48_000) },
      categories: [],
    });
    expect(changes[1]?.categories).toEqual([
      { categoryId: "savings", from: sen(0), to: sen(30_000) },
    ]);
    expect(changes[2]).toMatchObject({ budget: null });
    expect(changes[3]).toMatchObject({ budget: { from: null, to: sen(19_800) }, canUndo: false });
  });

  it("says 'Plan changed' when no reason was saved", () => {
    const changes = planChanges([rev(1, 10_000, []), rev(2, 12_000, [])]);
    expect(changes[0]?.reason).toBe("Plan changed");
  });
});

describe("undoing one change (D-139)", () => {
  const current = { budgetSen: sen(48_000), allocations: history[3]!.allocations };

  it("reverses only that change on today's plan: the Savings money in comes out", () => {
    const savings = planChanges(history)[1]!;
    expect(undoPlanChange(current, savings)).toEqual({
      budgetSen: sen(18_000),
      allocations: [
        { categoryId: "meals", amountSen: sen(15_000) },
        { categoryId: "laundry", amountSen: sen(3_200) },
        { categoryId: "savings", amountSen: sen(0) },
      ],
    });
  });

  it("undoes the left-in-plan fix: the budget goes back up by RM18", () => {
    expect(undoPlanChange(current, planChanges(history)[0]!)?.budgetSen).toBe(sen(49_800));
  });

  it("can't undo the first plan or leave no budget", () => {
    expect(undoPlanChange(current, planChanges(history)[3]!)).toBeNull();
    const big = planChanges([rev(1, 1_000, []), rev(2, 60_000, [])])[0]!;
    expect(undoPlanChange({ budgetSen: sen(50_000), allocations: [] }, big)).toBeNull();
  });
});
