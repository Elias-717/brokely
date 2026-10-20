import { describe, expect, it } from "vitest";
import { budgetUsed, dailyGuide } from "./guide";
import { sen } from "./money";
import { percentHalfEven } from "./progress";

describe("daily guide (D-58)", () => {
  it("RM300 left, RM30 bill to come, RM50 set aside, 10 days: RM22.00 a day", () => {
    expect(
      dailyGuide({
        leftInPlanSen: sen(30000),
        stillToComeSen: sen(3000),
        setAsideLeftSen: sen(5000),
        daysLeft: 10,
      }),
    ).toEqual({ freeSen: 22000, perDaySen: 2200 });
  });

  it("rounds half-even for display: RM10.00 over 3 days is RM3.33", () => {
    expect(
      dailyGuide({
        leftInPlanSen: sen(1000),
        stillToComeSen: sen(0),
        setAsideLeftSen: sen(0),
        daysLeft: 3,
      }).perDaySen,
    ).toBe(333);
  });

  it("never suggests a negative amount when bills need more than is left", () => {
    expect(
      dailyGuide({
        leftInPlanSen: sen(2000),
        stillToComeSen: sen(3000),
        setAsideLeftSen: sen(0),
        daysLeft: 5,
      }),
    ).toEqual({ freeSen: -1000, perDaySen: 0 });
  });

  it("has no per-day amount once no days are left", () => {
    expect(
      dailyGuide({
        leftInPlanSen: sen(2000),
        stillToComeSen: sen(0),
        setAsideLeftSen: sen(0),
        daysLeft: 0,
      }).perDaySen,
    ).toBeNull();
  });
});

describe("budget used (D-58)", () => {
  it("29% of RM400: label and arc agree", () => {
    const used = budgetUsed(sen(11600), sen(40000))!;
    expect(percentHalfEven(used.label)).toBe(29);
    expect(used.arc).toBeCloseTo(0.29);
  });

  it("over budget: the label keeps 125%, the arc stops at the full circle", () => {
    const used = budgetUsed(sen(50000), sen(40000))!;
    expect(percentHalfEven(used.label)).toBe(125);
    expect(used.arc).toBe(1);
  });

  it("nothing to show without a budget", () => {
    expect(budgetUsed(sen(100), sen(0))).toBeNull();
  });
});
