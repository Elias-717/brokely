import { describe, expect, it } from "vitest";
import { sen } from "./money";
import { HEALTHY_SHARES, healthySuggestion } from "./suggestions";

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
