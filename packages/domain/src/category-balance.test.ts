import { describe, expect, it } from "vitest";
import { categoryHeadsUps, type CategorySpend } from "./category-balance";
import { sen } from "./money";
import type { CategoryKind } from "./plan";

const cat = (
  id: string,
  name: string,
  kind: CategoryKind,
  spent: number,
  planned = 0,
): CategorySpend => ({ id, name, kind, plannedSen: sen(planned), spentSen: sen(spent) });

describe("category heads-up (D-96)", () => {
  it("Fun & trips RM210 ahead of Meals RM180: flagged, with a per-day amount from its plan", () => {
    const result = categoryHeadsUps(
      [
        cat("meals", "Meals", "essential", 18000, 45000),
        cat("fun", "Fun & trips", "optional", 21000, 39000),
      ],
      18,
    );
    expect(result).toEqual([
      {
        categoryId: "fun",
        name: "Fun & trips",
        spentSen: 21000,
        perDaySen: 1000, // (RM390 − RM210) ÷ 18 days
        reason: "ahead_of_essential",
        essential: { id: "meals", name: "Meals", spentSen: 18000 },
      },
    ]);
  });

  it("an optional category past its plan amount is flagged even when Meals is ahead", () => {
    const [headsUp] = categoryHeadsUps(
      [
        cat("meals", "Meals", "essential", 30000, 45000),
        cat("shop", "Shopping", "optional", 8000, 5000),
      ],
      10,
    );
    expect(headsUp).toMatchObject({ reason: "over_plan", plannedSen: 5000, perDaySen: null });
  });

  it("never flags essentials or set-asides", () => {
    expect(
      categoryHeadsUps(
        [
          cat("meals", "Meals", "essential", 1000, 45000),
          cat("transport", "Transport", "essential", 40000, 10000),
          cat("savings", "Savings", "set_aside", 50000, 20000),
        ],
        10,
      ),
    ).toEqual([]);
  });

  it("stays quiet under RM20", () => {
    expect(
      categoryHeadsUps(
        [cat("meals", "Meals", "essential", 0), cat("snacks", "Snacks & treats", "optional", 1999)],
        20,
      ),
    ).toEqual([]);
  });

  it("without a Meals category, compares with the biggest essential", () => {
    const [headsUp] = categoryHeadsUps(
      [
        cat("food", "Food", "essential", 9000),
        cat("bus", "Transport", "essential", 12000),
        cat("fun", "Fun & trips", "optional", 15000),
      ],
      5,
    );
    expect(headsUp).toMatchObject({ reason: "ahead_of_essential", essential: { id: "bus" } });
  });

  it("lists the biggest gap first", () => {
    const result = categoryHeadsUps(
      [
        cat("meals", "Meals", "essential", 10000),
        cat("snacks", "Snacks & treats", "optional", 12000),
        cat("fun", "Fun & trips", "optional", 20000),
      ],
      5,
    );
    expect(result.map((h) => h.categoryId)).toEqual(["fun", "snacks"]);
  });
});
