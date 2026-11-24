import { describe, expect, it } from "vitest";
import { sen } from "./money";
import { budgetAfterLending } from "./plan";

describe("lending counted in the plan (D-141, FR-DEBT-06)", () => {
  it("lowers the budget by what was lent: RM500 − RM3 = RM497", () => {
    expect(budgetAfterLending(sen(50_000), sen(300))).toBe(sen(49_700));
  });

  it("refuses to leave no budget", () => {
    expect(budgetAfterLending(sen(300), sen(300))).toBeNull();
  });
});
