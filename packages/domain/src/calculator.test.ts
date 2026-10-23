import { describe, expect, it } from "vitest";
import { evaluateAmount, isSum, sumParts } from "./calculator";

describe("keypad calculator (D-115)", () => {
  it("reads a plain amount exactly like parseAmount", () => {
    expect(evaluateAmount("12.50")).toBe(1250);
    expect(evaluateAmount("0.29")).toBe(29);
    expect(evaluateAmount("")).toBeNull();
    expect(isSum("12.50")).toBe(false);
  });

  it("adds and takes away in whole sen, without floating-point drift (rule 1)", () => {
    expect(evaluateAmount("12.50+8")).toBe(2050);
    expect(evaluateAmount("0.1+0.2")).toBe(30);
    expect(evaluateAmount("20−4.50")).toBe(1550);
    expect(isSum("12.50+8")).toBe(true);
  });

  it("multiplies by a count: 3 × RM4.50 = RM13.50", () => {
    expect(evaluateAmount("3×4.50")).toBe(1350);
    expect(evaluateAmount("4.50×3")).toBe(1350);
  });

  it("splits a bill: RM36 ÷ 4 = RM9.00; RM10 ÷ 3 rounds once at the end, half-even (R-03)", () => {
    expect(evaluateAmount("36÷4")).toBe(900);
    expect(evaluateAmount("10÷3")).toBe(333);
    expect(evaluateAmount("0.25÷2")).toBe(12); // 12.5 sen → 12 (even)
    expect(evaluateAmount("0.35÷2")).toBe(18); // 17.5 sen → 18 (even)
    expect(evaluateAmount("10÷3×3")).toBe(1000); // exact until the end
  });

  it("does × and ÷ before + and −", () => {
    expect(evaluateAmount("2+3×4")).toBe(1400);
    expect(evaluateAmount("20−12÷4")).toBe(1700);
  });

  it("ignores an operator typed last, so the total shows while typing", () => {
    expect(sumParts("12+")).toEqual(["12"]);
    expect(evaluateAmount("12+")).toBe(1200);
    expect(isSum("12+")).toBe(false);
  });

  it("refuses a sum below zero or a division by zero", () => {
    expect(evaluateAmount("5−8")).toBeNull();
    expect(evaluateAmount("5÷0")).toBeNull();
    expect(evaluateAmount("5+.")).toBeNull();
  });
});
