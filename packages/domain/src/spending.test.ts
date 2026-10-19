import { describe, expect, it } from "vitest";
import { cycleFromInclusive } from "./cycle";
import { localDate } from "./dates";
import { formatRM, sen } from "./money";
import {
  checkLinesSum,
  checkRefund,
  inRange,
  leftInPlan,
  refundableSen,
  remaining,
  shareOfSpending,
  spendingByCategory,
  variance,
  totalSpending,
} from "./spending";
import { percentHalfEven } from "./progress";
import { cat, debtLine, purchase, spend, txn } from "./test-fixtures";
import type { DebtDirectionOf } from "./transactions";

const debts: Record<string, "owed_to_me" | "owed_by_me"> = {
  friendOwesMe: "owed_to_me",
  iOweFriend: "owed_by_me",
};
const directionOf: DebtDirectionOf = (id) => debts[id];
const spending = (ts: Parameters<typeof spendingByCategory>[0]) =>
  spendingByCategory(ts, directionOf);

describe("spending (BR-10 to BR-12)", () => {
  it("golden path: RM5 laundry leaves RM35 for laundry and RM395 left in plan (AC-04)", () => {
    const byCat = spending([purchase(cat.laundry, 500)]);
    const n = totalSpending(byCat);
    expect(n).toBe(500);
    expect(remaining(sen(4000), byCat.get(cat.laundry) ?? sen(0))).toBe(3500);
    expect(formatRM(leftInPlan(sen(40000), n))).toBe("RM395.00");
  });

  it("editing RM5 to RM7 raises spending by RM2 (AC-05)", () => {
    const before = totalSpending(spending([purchase(cat.laundry, 500)]));
    const after = totalSpending(spending([purchase(cat.laundry, 700)]));
    expect(after - before).toBe(200);
  });

  it("never counts a TNG top-up (transfer) as spending (AC-07)", () => {
    expect(totalSpending(spending([txn("transfer", 5000, [])]))).toBe(0);
  });

  it("subtracts refunds from the refunded category (AC-09)", () => {
    const meal = purchase(cat.meals, 2500);
    const refund = txn("refund", 1000, [spend(cat.meals, 1000)], { refundsTransactionId: meal.id });
    expect(spending([meal, refund]).get(cat.meals)).toBe(1500);
  });

  it("counts only my share of a split meal; the friend's share is a debt (AC-10, D-01)", () => {
    const groupMeal = txn("purchase", 2000, [
      spend(cat.meals, 1000),
      debtLine("friendOwesMe", 1000),
    ]);
    expect(totalSpending(spending([groupMeal]))).toBe(1000);
  });

  it("never counts borrowing, lending or repayments as spending (BR-10, AC-08)", () => {
    const moves = [
      txn("borrow", 5000, [debtLine("iOweFriend", 5000)]),
      txn("repayment_made", 2000, [debtLine("iOweFriend", 2000)]),
      txn("lend", 1500, [debtLine("friendOwesMe", 1500)]),
      txn("repayment_received", 500, [debtLine("friendOwesMe", 500)]),
    ];
    expect(totalSpending(spending(moves))).toBe(0);
  });

  it("counts writing off money a friend owed me as spending in the chosen category (AC-11, R-07, BR-23)", () => {
    const writeOff = txn("write_off", 1500, [debtLine("friendOwesMe", 1500)], {
      writeOffCategoryId: cat.gifts,
    });
    expect(spending([writeOff]).get(cat.gifts)).toBe(1500);
  });

  it("does not count writing off money I owed as spending (R-07)", () => {
    const writeOff = txn("write_off", 1500, [debtLine("iOweFriend", 1500)]);
    expect(totalSpending(spending([writeOff]))).toBe(0);
  });

  it("charges spending paid from a set-aside to that set-aside only (AC-28, D-04)", () => {
    const byCat = spending([purchase(cat.emergency, 1200)]);
    expect(remaining(sen(3000), byCat.get(cat.emergency) ?? sen(0))).toBe(1800);
    expect(byCat.get(cat.meals)).toBe(undefined);
    expect(totalSpending(byCat)).toBe(1200);
  });

  it("reports variance as planned minus spent (BR-13)", () => {
    expect(variance(sen(37000), sen(29000))).toBe(8000);
  });

  it("gives chart percentages, with no error for an empty category (FR-INS-04, AC-17)", () => {
    const byCat = spending([purchase(cat.meals, 750), purchase(cat.laundry, 250)]);
    const total = totalSpending(byCat);
    const meals = shareOfSpending(byCat.get(cat.meals) ?? sen(0), total);
    expect(meals && percentHalfEven(meals)).toBe(75);
    const transport = shareOfSpending(byCat.get(cat.transport) ?? sen(0), total);
    expect(transport && percentHalfEven(transport)).toBe(0);
    expect(shareOfSpending(sen(0), sen(0))).toBe(null);
  });

  it("allows a negative remaining amount when over plan (BR-11)", () => {
    expect(remaining(sen(4000), sen(4500))).toBe(-500);
  });

  it("keeps only transactions inside the cycle (BR-04)", () => {
    const nov = cycleFromInclusive(localDate("2026-11-02"), localDate("2026-11-29"));
    const kept = inRange(
      [purchase(cat.meals, 500, "2026-11-01"), purchase(cat.meals, 600, "2026-11-29")],
      nov,
    );
    expect(kept.map((t) => t.amountSen)).toEqual([600]);
  });
});

describe("lines must add up (FR-TXN-04, AC-10)", () => {
  it("accepts lines that add up to the amount", () => {
    const ok = txn("purchase", 2000, [spend(cat.meals, 1000), debtLine("friendOwesMe", 1000)]);
    expect(checkLinesSum(ok).ok).toBe(true);
  });

  it("refuses lines totalling RM19 on a RM20 purchase", () => {
    const bad = txn("purchase", 2000, [spend(cat.meals, 1000), debtLine("friendOwesMe", 900)]);
    const result = checkLinesSum(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("LINES_DO_NOT_SUM");
  });
});

describe("refund limits (FR-TXN-06, AC-09)", () => {
  const meal = purchase(cat.meals, 2500);
  const first = txn("refund", 1000, [spend(cat.meals, 1000)], { refundsTransactionId: meal.id });

  it("allows a RM10 refund on a RM25 purchase, leaving RM15 refundable", () => {
    expect(checkRefund(first, meal, []).ok).toBe(true);
    expect(refundableSen(meal, [first])).toBe(1500);
  });

  it("refuses a further RM20 refund", () => {
    const second = txn("refund", 2000, [spend(cat.meals, 2000)], { refundsTransactionId: meal.id });
    const result = checkRefund(second, meal, [first]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("REFUND_EXCEEDS_PURCHASE");
  });

  it("does not count the refund being edited against itself", () => {
    const edited = { ...first, amountSen: sen(2500) };
    expect(checkRefund(edited, meal, [first]).ok).toBe(true);
  });
});
