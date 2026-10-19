import { describe, expect, it } from "vitest";
import { essentialSuggestion, timesInPlan } from "./essentials";
import { sen } from "./money";

describe("timesInPlan (D-36, FR-PLN-05/06)", () => {
  it("every day: once for each day of the plan (meals RM12 a day, 20-31 Oct)", () => {
    expect(timesInPlan({ times: 1, per: "day" }, 12, 31)).toBe(12);
  });

  it("every week: 12 days is two weeks once rounded up", () => {
    expect(timesInPlan({ times: 1, per: "week" }, 12, 31)).toBe(2);
  });

  it("2 washes a month over 12 of October's 31 days: 0.77, rounded up to 1 (D-36 example)", () => {
    expect(timesInPlan({ times: 2, per: "month" }, 12, 31)).toBe(1);
  });

  it("a whole month gives exactly what the student said, in 30- and 31-day months", () => {
    expect(timesInPlan({ times: 2, per: "month" }, 31, 31)).toBe(2);
    expect(timesInPlan({ times: 2, per: "month" }, 30, 30)).toBe(2);
    expect(timesInPlan({ times: 4, per: "month" }, 28, 28)).toBe(4);
  });

  it("rounds up partial counts: 4 a month over 12 of 31 days = 1.55 -> 2", () => {
    expect(timesInPlan({ times: 4, per: "month" }, 12, 31)).toBe(2);
  });

  it("never plans zero for something the student does: at least 1", () => {
    expect(timesInPlan({ times: 1, per: "month" }, 1, 31)).toBe(1);
  });

  it("refuses counts that are not whole and positive", () => {
    expect(() => timesInPlan({ times: 0, per: "day" }, 12, 31)).toThrow(RangeError);
    expect(() => timesInPlan({ times: 1.5, per: "week" }, 12, 31)).toThrow(RangeError);
    expect(() => timesInPlan({ times: 1, per: "day" }, 0, 31)).toThrow(RangeError);
  });
});

describe("essentialSuggestion shows how it was worked out (FR-PLN-06)", () => {
  it("meals: RM12 x 12 days = RM144", () => {
    expect(essentialSuggestion(sen(1200), { times: 1, per: "day" }, 12, 31)).toEqual({
      times: 12,
      totalSen: 14400,
    });
  });

  it("laundry: 2 a month, RM16 each, 20-31 Oct = 1 x RM16", () => {
    expect(essentialSuggestion(sen(1600), { times: 2, per: "month" }, 12, 31)).toEqual({
      times: 1,
      totalSen: 1600,
    });
  });
});
