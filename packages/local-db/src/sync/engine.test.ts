import { sen } from "@brokely/domain";
import { describe, expect, it } from "vitest";
import {
  checkInNoSpending,
  deleteAllData,
  quickStart,
  seedDefaultCategories,
} from "../repositories";
import { createTestContext } from "../test-db";
import {
  AccountMismatchError,
  deviceIdOf,
  hasOwnRecords,
  latestChangeAt,
  linkAccount,
  linkedAccount,
  signInStep,
  syncCounts,
} from "./engine";

const ME = "0192f3a5-0000-7000-8000-00000000a11c";
const OTHER = "0192f3a5-0000-7000-8000-000000000b0b";

describe("signing in on this phone (D-73)", () => {
  it("syncs when the account has nothing yet, whatever the phone holds", async () => {
    const { ctx } = await createTestContext();
    seedDefaultCategories(ctx);
    checkInNoSpending(ctx, "2026-11-02");
    expect(signInStep(ctx.db, ME, false)).toBe("sync");
  });

  it("replaces an untouched first-run setup with the account's records (D-73 b)", async () => {
    const { ctx } = await createTestContext();
    expect(signInStep(ctx.db, ME, true)).toBe("replace"); // empty phone, e.g. from Welcome
    seedDefaultCategories(ctx);
    expect(hasOwnRecords(ctx.db)).toBe(false); // default categories alone don't count
    expect(signInStep(ctx.db, ME, true)).toBe("replace");
  });

  it("asks when both the phone and the account have records (D-73 b)", async () => {
    const { ctx } = await createTestContext();
    seedDefaultCategories(ctx);
    quickStart(ctx, {
      budgetSen: sen(40000),
      startDate: "2026-11-01",
      endDateInclusive: "2026-11-30",
    });
    expect(hasOwnRecords(ctx.db)).toBe(true);
    expect(signInStep(ctx.db, ME, true)).toBe("ask");
  });

  it("never mixes two accounts on one phone (D-73 a)", async () => {
    const { ctx } = await createTestContext();
    linkAccount(ctx.db, ME);
    expect(linkedAccount(ctx.db)).toBe(ME);
    expect(signInStep(ctx.db, ME, true)).toBe("sync");
    expect(signInStep(ctx.db, OTHER, false)).toBe("other-account");
    expect(() => linkAccount(ctx.db, OTHER)).toThrow(AccountMismatchError);

    deleteAllData(ctx.db); // "Erase this phone and use this account"
    expect(signInStep(ctx.db, OTHER, true)).toBe("replace");
  });
});

describe("sync bookkeeping on the phone", () => {
  it("counts changes not yet backed up (FR-SYNC-06, D-73 c)", async () => {
    const { ctx } = await createTestContext();
    expect(syncCounts(ctx.db)).toEqual({ waiting: 0, needsAttention: 0 });
    checkInNoSpending(ctx, "2026-11-02");
    expect(syncCounts(ctx.db)).toEqual({ waiting: 1, needsAttention: 0 });
    expect(latestChangeAt(ctx.db)).toBe(ctx.now()); // drives "sync a few seconds after a change"
  });

  it("keeps one device ID per install until the phone is erased", async () => {
    const { ctx } = await createTestContext();
    const first = deviceIdOf(ctx);
    expect(deviceIdOf(ctx)).toBe(first);
    deleteAllData(ctx.db);
    expect(deviceIdOf(ctx)).not.toBe(first);
  });
});
