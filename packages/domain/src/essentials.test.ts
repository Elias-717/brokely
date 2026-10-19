import { describe, expect, it } from "vitest";
import { essentialSuggestion, nextEssentialCard, timesInPlan } from "./essentials";
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

describe("nextEssentialCard (FR-PLN-20, D-30)", () => {
  const order = ["meals", "groceries", "laundry", "transport", "phone", "health"];
  const none = { allocated: [], dismissed: [], later: [] };

  it("starts with the first essential", () => {
    expect(nextEssentialCard(order, none)).toEqual({ id: "meals", position: 1, total: 6 });
  });

  it("skips essentials that already have an amount in the plan", () => {
    expect(nextEssentialCard(order, { ...none, allocated: ["meals", "groceries"] })?.id).toBe(
      "laundry",
    );
  });

  it("'Not for me' is not shown again in this cycle", () => {
    expect(nextEssentialCard(order, { ...none, dismissed: ["meals"] })?.id).toBe("groceries");
  });

  it("'Later' moves a card to the back of the queue, in the order they were postponed (AC-54)", () => {
    const next = (later: string[]) => nextEssentialCard(order, { ...none, later })?.id;
    expect(next(["meals"])).toBe("groceries");
    expect(
      nextEssentialCard(order, {
        allocated: ["groceries", "laundry", "transport", "phone", "health"],
        dismissed: [],
        later: ["meals"],
      })?.id,
    ).toBe("meals");
    expect(
      nextEssentialCard(order, {
        allocated: ["groceries", "transport", "phone", "health"],
        dismissed: [],
        later: ["meals", "laundry"],
      })?.id,
    ).toBe("meals");
  });

  it("position counts within all essentials, so the student sees 3 of 6", () => {
    expect(nextEssentialCard(order, { ...none, allocated: ["meals", "groceries"] })).toMatchObject({
      position: 3,
      total: 6,
    });
  });

  it("returns null when every essential is covered or set aside", () => {
    expect(
      nextEssentialCard(order, {
        allocated: ["meals", "groceries", "laundry"],
        dismissed: ["transport", "phone", "health"],
        later: [],
      }),
    ).toBeNull();
  });
});
