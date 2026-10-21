import { describe, expect, it } from "vitest";
import { sen } from "./money";
import { localDate } from "./dates";
import { HEALTHY_SHARES, healthySuggestion, suggestFromHistory } from "./suggestions";
import { cat, purchase, txn } from "./test-fixtures";

describe("healthy plan suggestions (D-46)", () => {
  it("the shares add up to the whole budget", () => {
    expect(Object.values(HEALTHY_SHARES).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("Meals on RM500 for 30 days: 45% = RM225, about RM7.50 a day", () => {
    expect(healthySuggestion("Meals", sen(50000), 30)).toEqual({
      percent: 45,
      totalSen: 22500,
      perDaySen: 750,
    });
  });

  it("uses the renamed Home necessities (D-43) and rounds half-even to sen", () => {
    // 10% of RM333.35 = 3333.5 sen → 3334 (half-even rounds to the even neighbour, R-03)
    expect(healthySuggestion("Home necessities", sen(33335), 30)?.totalSen).toBe(3334);
  });

  it("has nothing for Other, the student's own categories, or an empty budget", () => {
    expect(healthySuggestion("Other", sen(50000), 30)).toBeNull();
    expect(healthySuggestion("Gym", sen(50000), 30)).toBeNull();
    expect(healthySuggestion("Meals", sen(0), 30)).toBeNull();
  });
});

describe("suggestions from the student's own spending (FR-PLN-13, AC-18, D-46 part 2)", () => {
  const nov = (d: number) => `2026-11-${String(d).padStart(2, "0")}`;
  const tenDays = { start: localDate(nov(1)), endExclusive: localDate(nov(11)) };
  const noDebts = () => undefined;

  it("AC-18: 10 days with 8 logged says so, and scales what was spent to the new plan", () => {
    // RM10 of meals on 8 of the 10 days, RM16 of laundry once; days 4 and 9 not logged.
    const days = [1, 2, 3, 5, 6, 7, 8, 10];
    const transactions = [
      ...days.map((d) => purchase(cat.meals, 1000, nov(d))),
      purchase(cat.laundry, 1600, nov(6)),
    ];
    const result = suggestFromHistory({
      range: tenDays,
      today: localDate(nov(20)),
      transactions,
      checkIns: [],
      debtDirectionOf: noDebts,
      targetDays: 30,
    });
    expect(result?.basis).toEqual({ days: 10, coveredDays: 8, coveragePercent: 80 });
    // RM80 over 10 days → RM240 for 30; nothing is added for the 2 days not logged.
    expect(result?.byCategory.get(cat.meals)).toEqual({ spentSen: 8000, suggestedSen: 24000 });
    expect(result?.byCategory.get(cat.laundry)).toEqual({ spentSen: 1600, suggestedSen: 4800 });
    expect(result?.byCategory.has(cat.transport)).toBe(false); // never invented
  });

  it("counts only the days so far while the history is still running (BR-16)", () => {
    const result = suggestFromHistory({
      range: tenDays,
      today: localDate(nov(5)), // days 1-4 have passed; today (5) is not logged yet
      transactions: [purchase(cat.meals, 1200, nov(2))],
      checkIns: [localDate(nov(1))],
      debtDirectionOf: noDebts,
      targetDays: 30,
    });
    expect(result?.basis).toEqual({ days: 4, coveredDays: 2, coveragePercent: 50 });
    expect(result?.byCategory.get(cat.meals)?.suggestedSen).toBe(9000); // RM12 / 4 × 30
  });

  it("has nothing to suggest without spending, and leaves refunds and transfers to the rules", () => {
    const empty = suggestFromHistory({
      range: tenDays,
      today: localDate(nov(20)),
      transactions: [txn("transfer", 5000, [], { date: nov(3) })],
      checkIns: [localDate(nov(4))],
      debtDirectionOf: noDebts,
      targetDays: 30,
    });
    expect(empty).toBeNull();
  });
});
