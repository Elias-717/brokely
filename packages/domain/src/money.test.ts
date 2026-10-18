import { describe, expect, it } from "vitest";
import { divideSen, formatRM, roundHalfEven, sen, sumSen } from "./money";

describe("sen", () => {
  it("accepts whole numbers of sen", () => {
    expect(sen(500)).toBe(500);
  });

  it("refuses fractions of a sen (BR-01)", () => {
    expect(() => sen(5.5)).toThrow(RangeError);
  });
});

describe("sumSen", () => {
  it("adds exactly, with no floating-point drift", () => {
    // 0.10 + 0.20 in floating-point ringgit is 0.30000000000000004
    expect(sumSen([sen(10), sen(20)])).toBe(30);
  });

  it("reconciles the golden-path plan to the budget (SRS AC-04)", () => {
    const allocations = [25000, 4000, 2000, 2000, 3000, 4000].map(sen);
    expect(sumSen(allocations)).toBe(40000);
  });
});

describe("roundHalfEven (BR-02, R-03)", () => {
  it("rounds an exact half down to the even sen (SRS AC-16: RM12.50 over 4 days)", () => {
    const dailyAverage = divideSen(sen(1250), 4); // 312.5 sen
    expect(roundHalfEven(dailyAverage)).toBe(312);
    expect(formatRM(roundHalfEven(dailyAverage))).toBe("RM3.12");
  });

  it("rounds an exact half up when that gives the even sen", () => {
    expect(roundHalfEven(divideSen(sen(1254), 4))).toBe(314); // 313.5
  });

  it("rounds non-halves to the nearest sen", () => {
    expect(roundHalfEven(divideSen(sen(2500), 3))).toBe(833); // 833.33
    expect(roundHalfEven(divideSen(sen(40000), 30))).toBe(1333); // RM400 over 30 days
  });

  it("handles negative values symmetrically (net refunds)", () => {
    expect(roundHalfEven(divideSen(sen(-1250), 4))).toBe(-312);
  });

  it("refuses division by zero days", () => {
    expect(() => divideSen(sen(100), 0)).toThrow(RangeError);
  });
});

describe("formatRM", () => {
  it("always shows two decimals", () => {
    expect(formatRM(sen(500))).toBe("RM5.00");
    expect(formatRM(sen(5))).toBe("RM0.05");
  });

  it("shows negatives with a leading minus", () => {
    expect(formatRM(sen(-3000))).toBe("-RM30.00");
  });

  it("groups thousands", () => {
    expect(formatRM(sen(123456))).toBe("RM1,234.56");
  });
});
