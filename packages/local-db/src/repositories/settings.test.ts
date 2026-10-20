import { beforeEach, describe, expect, it } from "vitest";
import { outboxOperations } from "../schema";
import { createTestContext } from "../test-db";
import type { RepoContext } from "./context";
import { DEFAULT_SETTINGS, getSettings, updateSettings } from "./settings";

describe("settings repository (FR-ACC-05)", () => {
  let ctx: RepoContext;
  beforeEach(async () => {
    ({ ctx } = await createTestContext());
  });

  it("starts with Malaysia time and a Monday week, without writing anything", () => {
    expect(getSettings(ctx.db)).toEqual(DEFAULT_SETTINGS);
    expect(ctx.db.select().from(outboxOperations).all()).toHaveLength(0);
  });

  it("saves a change and queues it for sync; a second change updates the same row", () => {
    expect(updateSettings(ctx, { weekStart: 0 }).ok).toBe(true);
    expect(updateSettings(ctx, { timeZone: "Asia/Singapore" }).ok).toBe(true);
    expect(getSettings(ctx.db)).toEqual({
      ...DEFAULT_SETTINGS,
      weekStart: 0,
      timeZone: "Asia/Singapore",
    });
    const ops = ctx.db.select().from(outboxOperations).all();
    expect(ops.map((o) => [o.entity, o.baseVersion])).toEqual([
      ["user_settings", null],
      ["user_settings", 1],
    ]);
  });

  it("refuses a week start that isn't a weekday", () => {
    expect(updateSettings(ctx, { weekStart: 7 })).toMatchObject({
      ok: false,
      code: "VALIDATION_FAILED",
    });
  });
});
