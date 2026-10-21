import { describe, expect, it } from "vitest";
import { guessCategory, normalizeNote, type GuessHistory } from "./category-guess";

const CATEGORIES = [
  { id: "meals", name: "Meals" },
  { id: "transport", name: "Transport" },
  { id: "laundry", name: "Laundry" },
  { id: "snacks", name: "Snacks & treats" },
  { id: "phone", name: "Phone & internet" },
  { id: "home", name: "Home necessities" },
  { id: "gym", name: "Gym" },
];

const said = (note: string, categoryId: string, times = 1): GuessHistory =>
  Array.from({ length: times }, () => ({ note, categoryId }));

describe("smart categorization from the note (D-84)", () => {
  it("reads notes the same way however they're typed", () => {
    expect(normalizeNote("  Nasi  LEMAK!! ")).toBe("nasi lemak");
    expect(normalizeNote("Teh-tarik, kurang manis")).toBe("teh tarik kurang manis");
  });

  it("knows nothing without a note", () => {
    expect(guessCategory("", [], CATEGORIES)).toBeNull();
    expect(guessCategory("   ", said("lunch", "meals", 3), CATEGORIES)).toBeNull();
  });

  it("follows what the student chose before for the same note", () => {
    const history = [...said("nasi lemak", "meals", 3), ...said("nasi lemak", "snacks")];
    expect(guessCategory("Nasi lemak", history, CATEGORIES)).toEqual({
      categoryId: "meals",
      source: "history",
      matched: "nasi lemak",
    });
  });

  it("learns the student's own words, even for their own categories", () => {
    const history = [...said("gym membership", "gym"), ...said("gym day pass", "gym")];
    expect(guessCategory("gym towel", history, CATEGORIES)).toMatchObject({
      categoryId: "gym",
      source: "history",
      matched: "gym",
    });
  });

  it("doesn't guess from a word the student used for different things", () => {
    const history = [...said("ali lunch", "meals"), ...said("ali grab", "transport")];
    expect(guessCategory("ali", history, CATEGORIES)).toBeNull();
  });

  it("starts with common student words before there is any history", () => {
    expect(guessCategory("grab to campus", [], CATEGORIES)).toMatchObject({
      categoryId: "transport",
      source: "starter",
      matched: "grab",
    });
    expect(guessCategory("teh tarik", [], CATEGORIES)).toMatchObject({
      categoryId: "snacks",
      source: "starter",
      matched: "teh tarik",
    });
    expect(guessCategory("dobi", [], CATEGORIES)?.categoryId).toBe("laundry");
  });

  it("prefers the student's own habit over the starter list", () => {
    // This student logs Grab food as meals.
    const history = said("grab", "meals", 2);
    expect(guessCategory("grab", history, CATEGORIES)).toMatchObject({
      categoryId: "meals",
      source: "history",
    });
  });

  it("matches whole words only", () => {
    // "bus" is a starter word; "business" is not a bus ride.
    expect(guessCategory("business card", [], CATEGORIES)).toBeNull();
  });

  it("never points at a category the student no longer has", () => {
    const without = CATEGORIES.filter((c) => c.id !== "laundry");
    expect(guessCategory("dobi", [], without)).toBeNull();
    expect(guessCategory("wash", said("wash", "laundry", 3), without)).toBeNull();
  });
});
