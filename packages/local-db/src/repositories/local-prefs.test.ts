import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { outboxOperations } from "../schema";
import { createTestContext } from "../test-db";
import type { RepoContext } from "./context";
import { getAppearance, setAppearance } from "./local-prefs";

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
});
