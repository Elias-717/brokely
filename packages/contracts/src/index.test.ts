import { describe, expect, it } from "vitest";
import { AmountSenSchema } from "./index";

describe("AmountSenSchema", () => {
  it("accepts positive whole sen", () => {
    expect(AmountSenSchema.safeParse(500).success).toBe(true);
  });

  it("rejects zero, negatives and fractions (R-04)", () => {
    expect(AmountSenSchema.safeParse(0).success).toBe(false);
    expect(AmountSenSchema.safeParse(-500).success).toBe(false);
    expect(AmountSenSchema.safeParse(5.5).success).toBe(false);
  });
});
