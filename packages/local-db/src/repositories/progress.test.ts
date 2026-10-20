import { sen } from "@brokely/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { outboxOperations } from "../schema";
import { createTestContext } from "../test-db";
import { listCategories, seedDefaultCategories } from "./categories";
import { checkInNoSpending, listCheckInDates, undoCheckIn } from "./check-ins";
import type { RepoContext } from "./context";
import { createDebt } from "./debts";
import { listTransactions, recordMoneyIn, recordPurchase, recordTransaction } from "./transactions";
import { compareWithLastCheck, logWalletDifference, recordWalletCheck } from "./wallet";

describe("check-in repository", () => {
  let ctx: RepoContext;

  beforeEach(async () => {
    ({ ctx } = await createTestContext());
  });

  it("an earlier day can be marked no-spend from Records; a day still to come can't (D-60)", () => {
    expect(checkInNoSpending(ctx, "2026-11-01", "2026-11-03").ok).toBe(true);
    expect(checkInNoSpending(ctx, "2026-11-04", "2026-11-03")).toMatchObject({
      ok: false,
      code: "VALIDATION_FAILED",
    });
    expect(listCheckInDates(ctx.db)).toEqual(["2026-11-01"]);
  });

  it("'No spending today' covers the day, and Undo removes it (AC-30, FR-TXN-08, R-01)", () => {
    expect(checkInNoSpending(ctx, "2026-11-02").ok).toBe(true);
    expect(listCheckInDates(ctx.db)).toEqual(["2026-11-02"]);

    expect(undoCheckIn(ctx, "2026-11-02").ok).toBe(true);
    expect(listCheckInDates(ctx.db)).toEqual([]);

    const ops = ctx.db.select().from(outboxOperations).all();
    expect(ops.map((o) => [o.entity, o.op])).toEqual([
      ["day_check_in", "upsert"],
      ["day_check_in", "delete"],
    ]);
    expect(ops[0]?.payload).toEqual({ localDate: "2026-11-02" });
  });

  it("a second tap on the same day changes nothing (S-06)", () => {
    checkInNoSpending(ctx, "2026-11-02");
    expect(checkInNoSpending(ctx, "2026-11-02").ok).toBe(true);
    expect(listCheckInDates(ctx.db)).toEqual(["2026-11-02"]);
    expect(ctx.db.select().from(outboxOperations).all()).toHaveLength(1);
  });

  it("the day can be checked in again after an undo", () => {
    checkInNoSpending(ctx, "2026-11-02");
    undoCheckIn(ctx, "2026-11-02");
    expect(checkInNoSpending(ctx, "2026-11-02").ok).toBe(true);
    expect(listCheckInDates(ctx.db)).toEqual(["2026-11-02"]);
  });

  it("undo of a day without a check-in is NOT_FOUND", () => {
    expect(undoCheckIn(ctx, "2026-11-03")).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});

describe("wallet check repository (FR-WAL-01…04, R-13)", () => {
  let ctx: RepoContext;
  let setNow: (instant: string) => void;
  const category = (name: string) => listCategories(ctx.db).find((c) => c.name === name)!.id;

  beforeEach(async () => {
    ({ ctx, setNow } = await createTestContext());
    seedDefaultCategories(ctx);
  });

  // Malaysia is UTC+8: Mon 16 Nov 12:00 local = 04:00Z.
  const MON_NOON = "2026-11-16T04:00:00.000Z";
  const THU_NOON = "2026-11-19T04:00:00.000Z";
  const at = (instant: string, localDate: string) => ({ occurredAt: instant, localDate });

  const mondayToThursday = () => {
    setNow(MON_NOON);
    const first = recordWalletCheck(ctx, { amountSen: sen(20000), localDate: "2026-11-16" });
    const tue = at("2026-11-17T04:00:00.000Z", "2026-11-17");
    recordPurchase(ctx, { amountSen: sen(1200), categoryId: category("Meals"), ...tue });
    recordPurchase(ctx, { amountSen: sen(1600), categoryId: category("Laundry"), ...tue });
    createDebt(ctx, {
      direction: "owed_to_me",
      counterparty: "[FRIEND A]",
      amountSen: sen(2000),
      ...tue,
    });
    recordMoneyIn(ctx, { amountSen: sen(5000), ...tue });
    recordTransaction(ctx, { type: "transfer", amountSen: sen(3000), ...tue, lines: [] });
    setNow(THU_NOON);
    return first;
  };

  it("the first check only sets the starting point (AC-62, FR-WAL-02)", () => {
    const first = mondayToThursday();
    expect(first).toMatchObject({ ok: true, value: { comparison: null } });
  });

  it("Thursday's RM180 is RM22 missing against the expected RM202; the top-up is ignored (AC-62, BR-30, BR-31)", () => {
    mondayToThursday();

    expect(compareWithLastCheck(ctx.db, sen(18000), THU_NOON)).toMatchObject({
      lastCheck: { checkedAt: MON_NOON, amountSen: 20000 },
      expectedSen: 20200,
      difference: { kind: "missing", amountSen: 2200 },
    });
    const second = recordWalletCheck(ctx, { amountSen: sen(18000), localDate: "2026-11-19" });
    expect(second).toMatchObject({
      ok: true,
      value: { comparison: { expectedSen: 20200, difference: { kind: "missing" } } },
    });
    const ops = ctx.db.select().from(outboxOperations).all();
    expect(ops.filter((o) => o.entity === "wallet_check")).toHaveLength(2);
  });

  it("nothing is logged until the student taps Log it; then the RM22 belongs before the check (AC-63, FR-WAL-03)", () => {
    mondayToThursday();
    const before = listTransactions(ctx.db).length;
    const second = recordWalletCheck(ctx, { amountSen: sen(18000), localDate: "2026-11-19" });
    if (!second.ok) throw new Error(second.message);
    expect(listTransactions(ctx.db)).toHaveLength(before); // nothing automatic

    const logged = logWalletDifference(ctx, {
      checkId: second.value.id,
      categoryId: category("Snacks & treats"),
    });

    expect(logged.ok).toBe(true);
    const entry = listTransactions(ctx.db).find((t) => t.id === (logged.ok && logged.value.id))!;
    expect(entry).toMatchObject({
      type: "purchase",
      amountSen: 2200,
      localDate: "2026-11-19",
      occurredAt: "2026-11-19T03:59:59.999Z",
    });
    expect(entry.lines[0]).toMatchObject({ categoryId: category("Snacks & treats") });
    // The next check starts from RM180 and is not thrown off by the logged RM22.
    setNow("2026-11-20T04:00:00.000Z");
    expect(compareWithLastCheck(ctx.db, sen(18500), "2026-11-20T04:00:00.000Z")).toMatchObject({
      expectedSen: 18000,
      difference: { kind: "extra", amountSen: 500 },
    });
  });

  it("extra money is offered as money in (AC-63, FR-WAL-03)", () => {
    setNow(MON_NOON);
    recordWalletCheck(ctx, { amountSen: sen(18000), localDate: "2026-11-16" });
    setNow(THU_NOON);
    const extra = recordWalletCheck(ctx, { amountSen: sen(18500), localDate: "2026-11-19" });
    if (!extra.ok) throw new Error(extra.message);

    const logged = logWalletDifference(ctx, { checkId: extra.value.id });

    expect(logged.ok).toBe(true);
    expect(listTransactions(ctx.db)[0]).toMatchObject({ type: "income", amountSen: 500 });
  });

  it("a missing difference needs a category; a matching check has nothing to log", () => {
    setNow(MON_NOON);
    recordWalletCheck(ctx, { amountSen: sen(18000), localDate: "2026-11-16" });
    setNow(THU_NOON);
    const missing = recordWalletCheck(ctx, { amountSen: sen(17000), localDate: "2026-11-19" });
    setNow("2026-11-19T05:00:00.000Z");
    const match = recordWalletCheck(ctx, { amountSen: sen(17000), localDate: "2026-11-19" });
    if (!missing.ok || !match.ok) throw new Error("setup");

    expect(logWalletDifference(ctx, { checkId: missing.value.id })).toMatchObject({
      ok: false,
      code: "VALIDATION_FAILED",
    });
    expect(logWalletDifference(ctx, { checkId: match.value.id })).toMatchObject({
      ok: false,
      code: "VALIDATION_FAILED",
    });
  });
});
