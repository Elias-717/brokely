import { describe, expect, it } from "vitest";
import { localDate } from "./dates";
import { checkDebtMovement, checkWithinOutstanding, payBackPresets, summarizeDebt } from "./debts";
import { sen } from "./money";
import { cat, debtLine, spend, txn } from "./test-fixtures";

describe("debt outstanding and status (BR-22, FR-DEBT-02/03)", () => {
  it("borrow RM50, repay RM20: RM30 still owed, open (AC-08)", () => {
    const moves = [
      txn("borrow", 5000, [debtLine("d1", 5000)]),
      txn("repayment_made", 2000, [debtLine("d1", 2000)]),
    ];
    expect(summarizeDebt("d1", moves)).toMatchObject({
      principalSen: 5000,
      repaidSen: 2000,
      outstandingSen: 3000,
      status: "open",
    });
  });

  it("supports several partial repayments until settled", () => {
    const moves = [
      txn("lend", 3000, [debtLine("d2", 3000)]),
      txn("repayment_received", 1000, [debtLine("d2", 1000)]),
      txn("repayment_received", 2000, [debtLine("d2", 2000)]),
    ];
    expect(summarizeDebt("d2", moves)).toMatchObject({ outstandingSen: 0, status: "settled" });
  });

  it("opens a debt from a split meal (D-01, FR-DEBT-05)", () => {
    const meal = txn("purchase", 2000, [spend(cat.meals, 1000), debtLine("d3", 1000)]);
    expect(summarizeDebt("d3", [meal]).principalSen).toBe(1000);
  });

  it("a RM15 write-off closes the debt as written off (AC-11, R-07)", () => {
    const moves = [
      txn("lend", 1500, [debtLine("d4", 1500)]),
      txn("write_off", 1500, [debtLine("d4", 1500)], { writeOffCategoryId: cat.gifts }),
    ];
    expect(summarizeDebt("d4", moves)).toMatchObject({ outstandingSen: 0, status: "written_off" });
  });

  it("ignores lines that belong to other debts", () => {
    const other = txn("lend", 900, [debtLine("other", 900)]);
    expect(summarizeDebt("d5", [other]).principalSen).toBe(0);
  });

  it("applies audited adjustments (BR-22)", () => {
    const moves = [txn("lend", 1000, [debtLine("d6", 1000)])];
    expect(summarizeDebt("d6", moves, [sen(-200)]).outstandingSen).toBe(800);
  });
});

describe("debt rules", () => {
  it("refuses a repayment larger than what is outstanding (BR-22)", () => {
    const summary = summarizeDebt("d1", [txn("borrow", 5000, [debtLine("d1", 5000)])]);
    expect(checkWithinOutstanding(summary, sen(5000)).ok).toBe(true);
    const result = checkWithinOutstanding(summary, sen(5001));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("DEBT_EXCEEDS_OUTSTANDING");
  });

  it("only allows movements that match the debt's direction (FR-DEBT-01)", () => {
    expect(checkDebtMovement("owed_to_me", "lend").ok).toBe(true);
    expect(checkDebtMovement("owed_to_me", "repayment_received").ok).toBe(true);
    expect(checkDebtMovement("owed_by_me", "repayment_received").ok).toBe(false);
    expect(checkDebtMovement("owed_by_me", "lend").ok).toBe(false);
    expect(checkDebtMovement("owed_by_me", "write_off").ok).toBe(true);
  });
});

describe("pay back by shortcuts (D-103)", () => {
  it("in a week, and the end of this month", () => {
    expect(payBackPresets(localDate("2026-10-23"))).toEqual({
      inAWeek: "2026-10-30",
      endOfMonth: "2026-10-31",
    });
  });

  it("on the last day of a month, the end of next month", () => {
    expect(payBackPresets(localDate("2026-10-31")).endOfMonth).toBe("2026-11-30");
    expect(payBackPresets(localDate("2026-12-31"))).toEqual({
      inAWeek: "2027-01-07",
      endOfMonth: "2027-01-31",
    });
  });

  it("February in a leap year", () => {
    expect(payBackPresets(localDate("2028-02-10")).endOfMonth).toBe("2028-02-29");
  });
});
