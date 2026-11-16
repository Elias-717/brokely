import { describe, expect, it } from "vitest";
import { sen } from "./money";
import {
  defaultGoesTo,
  moneyInLeftOut,
  offersToday,
  planAfterMoneyIn,
  todayBoostSen,
} from "./money-in";

const plan = {
  budgetSen: sen(50_000),
  allocations: [
    { categoryId: "meals", amountSen: sen(30_000) },
    { categoryId: "savings", amountSen: sen(5_000) },
  ],
};

describe("where money in goes by default (D-130)", () => {
  it("sends meal money, family, a friend and other money to this month's plan", () => {
    for (const source of ["Meal money", "From family", "From a friend", "Other"]) {
      expect(defaultGoesTo(source, "savings")).toEqual({ kind: "plan" });
    }
  });

  it("sends part-time pay and gifts to Savings", () => {
    expect(defaultGoesTo("Part-time", "savings")).toEqual({
      kind: "set_aside",
      categoryId: "savings",
    });
    expect(defaultGoesTo("Gift", "savings")).toEqual({ kind: "set_aside", categoryId: "savings" });
  });

  it("falls back to the plan when there is no Savings set-aside", () => {
    expect(defaultGoesTo("Gift", null)).toEqual({ kind: "plan" });
  });
});

describe("offering today for small money in (D-134)", () => {
  it("offers today below RM50 only", () => {
    expect(offersToday(sen(200))).toBe(true);
    expect(offersToday(sen(4_999))).toBe(true);
    expect(offersToday(sen(5_000))).toBe(false);
    expect(offersToday(sen(0))).toBe(false);
  });
});

describe("the plan after money in (D-130, D-134)", () => {
  it("raises the budget and keeps every category amount for the plan (RM500 + RM2 = RM502)", () => {
    expect(planAfterMoneyIn(plan, sen(200), { kind: "plan" })).toEqual({
      budgetSen: sen(50_200),
      allocations: plan.allocations,
    });
  });

  it("raises the budget the same way for today; only today's share differs", () => {
    expect(planAfterMoneyIn(plan, sen(500), { kind: "today" })?.budgetSen).toBe(sen(50_500));
  });

  it("raises the budget and the set-aside together, so nothing becomes free to spend", () => {
    expect(
      planAfterMoneyIn(plan, sen(30_000), { kind: "set_aside", categoryId: "savings" }),
    ).toEqual({
      budgetSen: sen(80_000),
      allocations: [
        { categoryId: "meals", amountSen: sen(30_000) },
        { categoryId: "savings", amountSen: sen(35_000) },
      ],
    });
  });

  it("adds a set-aside the plan didn't have yet", () => {
    expect(
      planAfterMoneyIn(plan, sen(1_000), { kind: "set_aside", categoryId: "emergency" })
        ?.allocations,
    ).toEqual([...plan.allocations, { categoryId: "emergency", amountSen: sen(1_000) }]);
  });

  it("leaves the plan alone for a debt payback or just recording it", () => {
    expect(planAfterMoneyIn(plan, sen(1_000), { kind: "debt", debtId: "d1" })).toBeNull();
    expect(planAfterMoneyIn(plan, sen(1_000), { kind: "record" })).toBeNull();
  });
});

describe("today's boost (D-134)", () => {
  it("adds up money in sent to today, dated today", () => {
    const routes = {
      a: { to: "today" as const, amountSen: sen(500), localDate: "2026-11-17" },
      b: { to: "today" as const, amountSen: sen(200), localDate: "2026-11-16" },
      c: { to: "plan" as const, amountSen: sen(900), localDate: "2026-11-17" },
    };
    expect(todayBoostSen(routes, "2026-11-17")).toBe(sen(500));
  });
});

describe("money in left out of the plan (D-125 card after D-130)", () => {
  it("suggests money the student chose just to record", () => {
    expect(
      moneyInLeftOut(
        [
          { amountSen: sen(1_000), route: "record" },
          { amountSen: sen(9_000), route: "plan" },
        ],
        sen(50_000),
      ),
    ).toBe(sen(1_000));
  });

  it("keeps the old rule for money in saved before Goes to: only what passes the budget", () => {
    expect(moneyInLeftOut([{ amountSen: sen(60_000), route: null }], sen(50_000))).toBe(
      sen(10_000),
    );
    expect(moneyInLeftOut([{ amountSen: sen(200), route: null }], sen(50_000))).toBeNull();
  });

  it("never suggests money that paid back a debt", () => {
    expect(moneyInLeftOut([{ amountSen: sen(1_000), route: "debt" }], sen(50_000))).toBeNull();
  });
});
