import { describe, expect, it } from "vitest";
import { budgetUsed, dailyGuide, todayGuide } from "./guide";
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

describe("left to spend today (D-95)", () => {
  it("RM220 free at the start of a 10-day stretch: RM22.00 today, RM22.00 a day after", () => {
    expect(todayGuide({ freeSen: sen(22000), everydayTodaySen: sen(0), daysLeft: 10 })).toEqual({
      todaySen: 2200,
      leftTodaySen: 2200,
      thenPerDaySen: 2200,
    });
  });

  it("logging RM7.80 lowers what is left today, not today's share", () => {
    // Free now RM212.20 after the RM7.80 lunch; at the start of the day it was RM220.00.
    expect(todayGuide({ freeSen: sen(21220), everydayTodaySen: sen(780), daysLeft: 10 })).toEqual({
      todaySen: 2200,
      leftTodaySen: 1420,
      thenPerDaySen: 2200,
    });
  });

  it("over today's share: left today is negative and the days after get less", () => {
    // RM28.50 spent of RM22.00: RM6.50 over; RM191.50 free over 9 days = RM21.28 a day.
    const guide = todayGuide({ freeSen: sen(19150), everydayTodaySen: sen(2850), daysLeft: 10 });
    expect(guide).toEqual({ todaySen: 2200, leftTodaySen: -650, thenPerDaySen: 2128 });
  });

  it("the last day has no days after", () => {
    expect(todayGuide({ freeSen: sen(1500), everydayTodaySen: sen(500), daysLeft: 1 })).toEqual({
      todaySen: 2000,
      leftTodaySen: 1500,
      thenPerDaySen: null,
    });
  });

  it("nothing free (bills and set-asides need it all): today's share is RM0.00", () => {
    expect(todayGuide({ freeSen: sen(-3000), everydayTodaySen: sen(1000), daysLeft: 5 })).toEqual({
      todaySen: 0,
      leftTodaySen: -1000,
      thenPerDaySen: 0,
    });
  });

  it("is null once the plan has ended", () => {
    expect(todayGuide({ freeSen: sen(0), everydayTodaySen: sen(0), daysLeft: 0 })).toBeNull();
  });
});
