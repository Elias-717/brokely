import { describe, expect, it } from "vitest";
import { localDate } from "./dates";
import { loggedStreak, mascotMood, mascotStage, stageProgress } from "./mascot";

const today = localDate("2026-10-23");
const days = (...d: string[]) => new Set(d.map((x) => `2026-10-${x}`));

describe("mascot growth (D-105, BR-26)", () => {
  it("stage 1 until 7 logged days, stage 2 from 7, stage 3 from 30", () => {
    expect([0, 6, 7, 29, 30, 200].map(mascotStage)).toEqual([1, 1, 2, 2, 3, 3]);
  });
});

describe("logged streak (D-105)", () => {
  it("counts days in a row up to today", () => {
    expect(loggedStreak(today, days("21", "22", "23"))).toBe(3);
  });
  it("this morning, before logging, the streak up to yesterday still counts", () => {
    expect(loggedStreak(today, days("20", "21", "22"))).toBe(3);
  });
  it("a missed day breaks it", () => {
    expect(loggedStreak(today, days("19", "20", "22", "23"))).toBe(2);
  });
});

describe("mascot mood, sleepy > proud > worried > happy (D-105)", () => {
  it("new student, nothing logged yet: happy, not sleepy", () => {
    expect(mascotMood({ today, logged: new Set(), overPace: false })).toBe("happy");
  });
  it("nothing logged today or the 2 days before: sleepy, even over pace", () => {
    expect(mascotMood({ today, logged: days("15", "20"), overPace: true })).toBe("sleepy");
  });
  it("logged the day before yesterday: not sleepy yet", () => {
    expect(mascotMood({ today, logged: days("21"), overPace: false })).toBe("happy");
  });
  it("a 3-day streak beats over pace: proud", () => {
    expect(mascotMood({ today, logged: days("21", "22", "23"), overPace: true })).toBe("proud");
  });
  it("over pace without a streak: worried", () => {
    expect(mascotMood({ today, logged: days("23"), overPace: true })).toBe("worried");
  });
  it("on track: happy", () => {
    expect(mascotMood({ today, logged: days("22", "23"), overPace: false })).toBe("happy");
  });
});

describe("stage ring on Home (D-123)", () => {
  it("fills towards 7 days, starts again towards 30, and is full at the last stage", () => {
    expect(stageProgress(0)).toEqual({ done: 0, goal: 7, final: false });
    expect(stageProgress(3)).toEqual({ done: 3, goal: 7, final: false });
    expect(stageProgress(7)).toEqual({ done: 0, goal: 23, final: false });
    expect(stageProgress(29)).toEqual({ done: 22, goal: 23, final: false });
    expect(stageProgress(30)).toEqual({ done: 1, goal: 1, final: true });
  });
});
