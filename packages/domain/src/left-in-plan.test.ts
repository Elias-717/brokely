import { describe, expect, it } from "vitest";
import { sen } from "./money";
import { budgetForLeftInPlan } from "./plan";

describe("fixing left in plan (D-138, BR-12)", () => {
  it("moves the budget so left in plan is what the student has: RM380 spent, RM100 left", () => {
    expect(budgetForLeftInPlan(sen(38_000), sen(10_000))).toBe(sen(48_000));
  });

  it("can raise the budget too, when there is more than Brokely thought", () => {
    expect(budgetForLeftInPlan(sen(38_000), sen(15_000))).toBe(sen(53_000));
  });

  it("with nothing left, the budget is what was spent", () => {
    expect(budgetForLeftInPlan(sen(38_000), sen(0))).toBe(sen(38_000));
  });
});
