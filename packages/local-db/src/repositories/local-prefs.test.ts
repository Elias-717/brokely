import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { outboxOperations } from "../schema";
import { createTestContext } from "../test-db";
import type { RepoContext } from "./context";
import { getAppearance, getNickname, setAppearance, setNickname } from "./local-prefs";

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
});
