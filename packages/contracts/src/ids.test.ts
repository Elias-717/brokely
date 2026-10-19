import { describe, expect, it } from "vitest";
import { scheduledItemId } from "./ids";
import { IdSchema } from "./primitives";

describe("deterministic IDs (S-05)", () => {
  const bill = "0192f3a5-0000-7000-8000-000000000001";

  it("gives the same scheduled item ID for the same bill and date, on any phone or the server", () => {
    expect(scheduledItemId(bill, "2026-11-15")).toBe(scheduledItemId(bill, "2026-11-15"));
    expect(IdSchema.safeParse(scheduledItemId(bill, "2026-11-15")).success).toBe(true);
  });

  it("gives different IDs for different dates or bills", () => {
    expect(scheduledItemId(bill, "2026-11-15")).not.toBe(scheduledItemId(bill, "2026-11-29"));
    expect(scheduledItemId(bill, "2026-11-15")).not.toBe(
      scheduledItemId("0192f3a5-0000-7000-8000-000000000002", "2026-11-15"),
    );
  });

  it("never changes (the server derives the same value)", () => {
    expect(scheduledItemId(bill, "2026-11-15")).toMatchInlineSnapshot(
      `"134cacc8-ccdb-5f3c-ae19-43da5e3641cb"`,
    );
  });
});
