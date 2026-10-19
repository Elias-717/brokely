import { describe, expect, it } from "vitest";
import { sen } from "./money";
import { cat, debtLine, purchase, spend, txn } from "./test-fixtures";
import type { Transaction } from "./transactions";
import { expectedSinceLastCheck, moneyEffect, walletDifference } from "./wallet";

const at = (t: Transaction, occurredAt: string) => ({ ...t, occurredAt });

describe("money in and out (BR-31, R-13)", () => {
  it("classifies every transaction type", () => {
    expect(moneyEffect("income")).toBe("in");
    expect(moneyEffect("borrow")).toBe("in");
    expect(moneyEffect("repayment_received")).toBe("in");
    expect(moneyEffect("refund")).toBe("in");
    expect(moneyEffect("purchase")).toBe("out");
    expect(moneyEffect("lend")).toBe("out");
    expect(moneyEffect("repayment_made")).toBe("out");
    expect(moneyEffect("transfer")).toBe("none"); // between your own wallets
    expect(moneyEffect("write_off")).toBe("none"); // no money moves
  });
});

describe("wallet check since the last check (FR-WAL-02, BR-30, R-13, AC-62)", () => {
  const last = { checkedAt: "2026-11-16T12:00:00+08:00", amountSen: sen(20000) }; // Mon: RM200
  const before = at(purchase(cat.meals, 900, "2026-11-16"), "2026-11-16T08:00:00+08:00");
  const lunch = at(purchase(cat.meals, 1200, "2026-11-17"), "2026-11-17T13:00:00+08:00");
  const laundry = at(purchase(cat.laundry, 1600, "2026-11-18"), "2026-11-18T19:00:00+08:00");
  const lent = at(
    txn("lend", 2000, [debtLine("d1", 2000)], { date: "2026-11-18" }),
    "2026-11-18T20:00:00+08:00",
  );
  const allowance = at(
    txn("income", 5000, [], { date: "2026-11-19" }),
    "2026-11-19T09:00:00+08:00",
  );
  const topUp = at(txn("transfer", 3000, [], { date: "2026-11-19" }), "2026-11-19T10:00:00+08:00");
  const later = at(purchase(cat.meals, 800, "2026-11-20"), "2026-11-20T12:00:00+08:00");
  const all = [before, lunch, laundry, lent, allowance, topUp, later];

  it("expects RM200 − 12 − 16 − 20 + 50 = RM202 on Thu morning", () => {
    expect(expectedSinceLastCheck(last, all, "2026-11-19T11:00:00+08:00")).toBe(20200);
  });

  it("finds RM22 missing when the student says RM180", () => {
    expect(walletDifference(sen(18000), sen(20200))).toEqual({ kind: "missing", amountSen: 2200 });
  });

  it("finds RM5 extra when the student says RM207", () => {
    expect(walletDifference(sen(20700), sen(20200))).toEqual({ kind: "extra", amountSen: 500 });
  });

  it("matches exactly", () => {
    expect(walletDifference(sen(20200), sen(20200))).toEqual({ kind: "match", amountSen: 0 });
  });

  it("uses the full purchase amount, even when part is owed by a friend", () => {
    const shared = at(
      txn("purchase", 2000, [spend(cat.meals, 1000), debtLine("d2", 1000)], { date: "2026-11-17" }),
      "2026-11-17T19:00:00+08:00",
    );
    expect(expectedSinceLastCheck(last, [shared], "2026-11-18T00:00:00+08:00")).toBe(18000);
  });
});
