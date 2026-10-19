import { describe, expect, it } from "vitest";
import { DEFAULT_CATEGORIES } from "./categories";

describe("default categories (D-22, FR-CAT-01, AC-52)", () => {
  it("offers 13 defaults: 6 essential, 5 optional, 2 set-asides", () => {
    const count = (kind: string) => DEFAULT_CATEGORIES.filter((c) => c.kind === kind).length;
    expect(DEFAULT_CATEGORIES.length).toBe(13);
    expect([count("essential"), count("optional"), count("set_aside")]).toEqual([6, 5, 2]);
  });

  it("has unique keys and names", () => {
    expect(new Set(DEFAULT_CATEGORIES.map((c) => c.key)).size).toBe(13);
    expect(new Set(DEFAULT_CATEGORIES.map((c) => c.name)).size).toBe(13);
  });

  it("uses only glossary-safe names (no 'balance', no 'Uncategorized')", () => {
    for (const c of DEFAULT_CATEGORIES) expect(/balance|uncategorized/i.test(c.name)).toBe(false);
  });
});
