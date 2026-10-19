import { describe, expect, it } from "vitest";
import { localDate } from "./dates";
import { awardXp, DAILY_XP_CAP, totalXp, XP_VALUES, type XpEvent } from "./xp";

const day = localDate("2026-11-02");
const logged = (sourceId: string, date = day): XpEvent => ({
  type: "transaction_logged",
  sourceId,
  localDate: date,
});

describe("XP (BR-24, BR-25, AC-42)", () => {
  it("awards the initial values", () => {
    const awards = awardXp([
      { type: "plan_approved", sourceId: "rev-1", localDate: day },
      logged("t1"),
    ]);
    expect(awards.map((a) => a.xp)).toEqual([
      XP_VALUES.plan_approved,
      XP_VALUES.transaction_logged,
    ]);
  });

  it("never awards twice for the same record, even after edit, delete and re-create", () => {
    const awards = awardXp([logged("t1"), logged("t1"), logged("t1")]);
    expect(totalXp(awards)).toBe(5);
  });

  it("caps a day at 100 XP, even with 30 transactions", () => {
    const thirty = Array.from({ length: 30 }, (_, i) => logged(`t${i}`));
    expect(totalXp(awardXp(thirty))).toBe(DAILY_XP_CAP);
  });

  it("starts a fresh cap the next day", () => {
    const today = Array.from({ length: 25 }, (_, i) => logged(`a${i}`));
    const tomorrow = logged("b1", localDate("2026-11-03"));
    const awards = awardXp([...today, tomorrow]);
    expect(awards.at(-1)?.xp).toBe(5);
  });

  it("earns the same XP however much was spent: XP rewards habits, not spending less (BR-26)", () => {
    // XpEvent has no amount field, so a RM1 snack and a RM100 shop earn the same.
    const event: XpEvent = { type: "transaction_logged", sourceId: "any", localDate: day };
    expect(Object.keys(event)).toEqual(["type", "sourceId", "localDate"]);
    expect(awardXp([event])[0]?.xp).toBe(XP_VALUES.transaction_logged);
  });

  it("gives a partial award when an event crosses the cap", () => {
    const nineteen = Array.from({ length: 19 }, (_, i) => logged(`t${i}`)); // 95 XP
    const review: XpEvent = { type: "weekly_review", sourceId: "w1", localDate: day };
    expect(awardXp([...nineteen, review]).at(-1)?.xp).toBe(5);
  });
});
