import { describe, expect, it } from "vitest";
import { billDates, billSuggestion } from "./bills";
import {
  checkNoOverlap,
  contains,
  cycleFromInclusive,
  inclusiveEnd,
  lengthInDays,
  midMonthStart,
  nextCycleRange,
  offersCatchUp,
  statusOn,
  type CycleLike,
} from "./cycle";
import { addDays, daysBetween, localDate, weekday } from "./dates";
import { sen } from "./money";

const d = localDate;
const november = cycleFromInclusive(d("2026-11-02"), d("2026-11-29")); // SRS AC-02

describe("dates", () => {
  it("rejects impossible dates", () => {
    expect(() => d("2026-02-30")).toThrow(RangeError);
    expect(() => d("2026/11/02")).toThrow(RangeError);
  });

  it("adds days across months and years", () => {
    expect(addDays(d("2026-12-31"), 1)).toBe("2027-01-01");
    expect(daysBetween(d("2026-11-02"), d("2026-12-02"))).toBe(30);
  });

  it("knows 2 Nov 2026 is a Monday", () => {
    expect(weekday(d("2026-11-02"))).toBe(1);
  });
});

describe("cycle dates (BR-03, BR-04)", () => {
  it("stores the inclusive end as end + 1 day", () => {
    expect(november).toEqual({ start: "2026-11-02", endExclusive: "2026-11-30" });
    expect(inclusiveEnd(november)).toBe("2026-11-29");
    expect(lengthInDays(november)).toBe(28);
  });

  it("includes the start and end days, not the day after", () => {
    expect(contains(november, d("2026-11-02"))).toBe(true);
    expect(contains(november, d("2026-11-29"))).toBe(true);
    expect(contains(november, d("2026-11-30"))).toBe(false);
  });

  it("refuses an end before the start", () => {
    expect(() => cycleFromInclusive(d("2026-11-10"), d("2026-11-09"))).toThrow(RangeError);
  });
});

describe("no overlapping cycles (BR-05, AC-29)", () => {
  const active: CycleLike = { id: "a", range: november, status: "active" };
  const candidate: CycleLike = {
    id: "b",
    range: cycleFromInclusive(d("2026-11-29"), d("2026-12-28")),
    status: "draft",
  };

  it("refuses to activate a cycle that overlaps an active one by one day", () => {
    const result = checkNoOverlap(candidate, [active]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("CYCLE_OVERLAP");
  });

  it("also refuses an overlap with a completed cycle (D-18)", () => {
    expect(checkNoOverlap(candidate, [{ ...active, status: "completed" }]).ok).toBe(false);
  });

  it("allows overlap with drafts and archived cycles", () => {
    expect(checkNoOverlap(candidate, [{ ...active, status: "draft" }]).ok).toBe(true);
    expect(checkNoOverlap(candidate, [{ ...active, status: "archived" }]).ok).toBe(true);
  });

  it("allows a cycle that starts the day after another ends", () => {
    const next: CycleLike = { id: "c", range: nextCycleRange(november), status: "draft" };
    expect(checkNoOverlap(next, [active]).ok).toBe(true);
  });
});

describe("cycle lifecycle (BR-27, AC-48)", () => {
  const active: CycleLike = { id: "a", range: november, status: "active" };

  it("stays active on its last day", () => {
    expect(statusOn(active, d("2026-11-29"))).toBe("active");
  });

  it("completes automatically the day after its end date", () => {
    expect(statusOn(active, d("2026-11-30"))).toBe("completed");
  });

  it("offers a next cycle starting the next day with the same length (D-18)", () => {
    expect(nextCycleRange(november)).toEqual({ start: "2026-11-30", endExclusive: "2026-12-28" });
  });
});

describe("bill dates and suggestions (BR-09, FR-CAT-04, AC-02)", () => {
  it("laundry every 2 weeks from Mon 2 Nov at RM16 = 2 × RM16 = RM32 (D-17)", () => {
    const rule = { kind: "every_n_weeks", n: 2 } as const;
    expect(billDates(rule, d("2026-11-02"), november)).toEqual(["2026-11-02", "2026-11-16"]);
    expect(billSuggestion(sen(1600), rule, d("2026-11-02"), november)).toEqual({
      count: 2,
      totalSen: 3200,
    });
  });

  it("a Mon and Thu bill at RM5 = 8 × RM5 = RM40", () => {
    const rule = { kind: "weekdays", days: [1, 4] } as const;
    expect(billSuggestion(sen(500), rule, d("2026-11-02"), november)).toEqual({
      count: 8,
      totalSen: 4000,
    });
  });

  it("never counts dates before the anchor", () => {
    const daily = { kind: "daily" } as const;
    expect(billDates(daily, d("2026-11-27"), november)).toEqual([
      "2026-11-27",
      "2026-11-28",
      "2026-11-29",
    ]);
  });

  it("puts a monthly bill on day 31 on the last day of a shorter month", () => {
    const fullNov = cycleFromInclusive(d("2026-11-01"), d("2026-11-30"));
    expect(billDates({ kind: "monthly", day: 31 }, d("2026-10-31"), fullNov)).toEqual([
      "2026-11-30",
    ]);
  });

  it("counts every N days and one-off bills only on real dates in the cycle", () => {
    expect(billDates({ kind: "every_n_days", n: 10 }, d("2026-11-02"), november)).toEqual([
      "2026-11-02",
      "2026-11-12",
      "2026-11-22",
    ]);
    expect(billDates({ kind: "once" }, d("2026-12-05"), november)).toEqual([]);
  });
});

describe("mid-month start (FR-PLN-21, D-25, AC-58, AC-59)", () => {
  const today = localDate("2026-11-15");

  it("start fresh: today to the end of the month, tracked from today", () => {
    const fresh = midMonthStart(today, "fresh");
    expect(fresh.range).toEqual(
      cycleFromInclusive(localDate("2026-11-15"), localDate("2026-11-30")),
    );
    expect(fresh.trackingStart).toBe("2026-11-15");
    expect(fresh.openingEntryDate).toBe(null);
  });

  it("catch me up: the whole month, tracked from today, opening entry the day before", () => {
    const catchUp = midMonthStart(today, "catch_up");
    expect(catchUp.range).toEqual(
      cycleFromInclusive(localDate("2026-11-01"), localDate("2026-11-30")),
    );
    expect(catchUp.trackingStart).toBe("2026-11-15");
    expect(catchUp.openingEntryDate).toBe("2026-11-14");
  });

  it("offers no catch-up on the 1st (nothing to catch up)", () => {
    expect(offersCatchUp(localDate("2026-11-01"))).toBe(false);
    expect(offersCatchUp(today)).toBe(true);
  });
});
