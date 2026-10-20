import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { outboxOperations } from "../schema";
import { createTestContext } from "../test-db";
import type { RepoContext } from "./context";
import {
  dismissCard,
  getAppearance,
  getCardChoices,
  getMoneyTips,
  getNickname,
  postponeCard,
  recordTipShown,
  setAppearance,
  setMoneyTipsEnabled,
  setNickname,
} from "./local-prefs";

describe("phone-only preferences (D-30, D-32)", () => {
  let ctx: RepoContext;

  beforeEach(async () => {
    ({ ctx } = await createTestContext());
  });

  it("appearance follows the phone until the student picks Light or Dark (D-32)", () => {
    expect(getAppearance(ctx.db)).toBe("system");

    setAppearance(ctx, "dark");
    expect(getAppearance(ctx.db)).toBe("dark");

    setAppearance(ctx, "system");
    expect(getAppearance(ctx.db)).toBe("system");
  });

  it("never writes to the outbox: preferences stay on this phone", () => {
    setAppearance(ctx, "light");
    expect(ctx.db.select().from(outboxOperations).all()).toHaveLength(0);
  });

  it("ignores an unknown stored value and falls back to the phone's setting", () => {
    setAppearance(ctx, "dark");
    ctx.db.run(sql`update local_prefs set value = '"purple"' where key = 'appearance'`);
    expect(getAppearance(ctx.db)).toBe("system");
  });

  describe("nickname (D-34)", () => {
    it("is empty until the student gives one, and is trimmed", () => {
      expect(getNickname(ctx.db)).toBeNull();
      setNickname(ctx, "  Elias ");
      expect(getNickname(ctx.db)).toBe("Elias");
    });

    it("clearing it (blank) forgets the name", () => {
      setNickname(ctx, "Elias");
      setNickname(ctx, "   ");
      expect(getNickname(ctx.db)).toBeNull();
    });

    it("keeps at most 30 characters", () => {
      setNickname(ctx, "A".repeat(40));
      expect(getNickname(ctx.db)).toHaveLength(30);
    });

    it("stays on this phone: no outbox entry", () => {
      setNickname(ctx, "Elias");
      expect(ctx.db.select().from(outboxOperations).all()).toHaveLength(0);
    });
  });

  describe("essential card choices, per cycle (D-30)", () => {
    const NOV = "0192f3a5-0000-7000-8000-000000000010";
    const DEC = "0192f3a5-0000-7000-8000-000000000011";

    it("start empty", () => {
      expect(getCardChoices(ctx.db, NOV)).toEqual({ dismissed: [], later: [] });
    });

    it("'Not for me' is remembered for this cycle only; a new cycle starts fresh", () => {
      dismissCard(ctx, NOV, "transport");
      expect(getCardChoices(ctx.db, NOV).dismissed).toEqual(["transport"]);
      expect(getCardChoices(ctx.db, DEC)).toEqual({ dismissed: [], later: [] });
    });

    it("'Later' moves a card to the back, even when postponed twice", () => {
      postponeCard(ctx, NOV, "meals");
      postponeCard(ctx, NOV, "laundry");
      postponeCard(ctx, NOV, "meals");
      expect(getCardChoices(ctx.db, NOV).later).toEqual(["laundry", "meals"]);
    });

    it("dismissing a postponed card takes it out of Later", () => {
      postponeCard(ctx, NOV, "meals");
      dismissCard(ctx, NOV, "meals");
      expect(getCardChoices(ctx.db, NOV)).toEqual({ dismissed: ["meals"], later: [] });
    });

    it("stays on this phone: no outbox entry", () => {
      dismissCard(ctx, NOV, "meals");
      expect(ctx.db.select().from(outboxOperations).all()).toHaveLength(0);
    });
  });

  it("money tips: on by default, counted per day, never repeated until most were seen (D-67)", () => {
    expect(getMoneyTips(ctx.db)).toEqual({ enabled: true, day: null, shownToday: 0, seen: [] });

    recordTipShown(ctx, { tipId: "a", today: "2026-10-21", resetAfter: 3 });
    recordTipShown(ctx, { tipId: "b", today: "2026-10-21", resetAfter: 3 });
    expect(getMoneyTips(ctx.db)).toMatchObject({
      day: "2026-10-21",
      shownToday: 2,
      seen: ["a", "b"],
    });

    // A new day starts counting again; the third tip fills the list, so it starts over.
    recordTipShown(ctx, { tipId: "c", today: "2026-10-22", resetAfter: 3 });
    expect(getMoneyTips(ctx.db)).toMatchObject({ day: "2026-10-22", shownToday: 1, seen: ["c"] });

    setMoneyTipsEnabled(ctx, false);
    expect(getMoneyTips(ctx.db).enabled).toBe(false);
    expect(ctx.db.select().from(outboxOperations).all()).toHaveLength(0); // phone-only
  });
});
