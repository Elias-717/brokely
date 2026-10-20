import { describe, expect, it } from "vitest";
import { sen } from "./money";
import { txn } from "./test-fixtures";
import {
  budgetAfterPayback,
  checkPayback,
  checkCanApprove,
  checkCanCreateDraft,
  checkCanDeleteCategory,
  checkCanEditRevision,
  currentRevision,
  moneyInSuggestion,
  nextRevisionNo,
  originalRevision,
  planTotals,
  type AllocationInput,
} from "./plan";

const alloc = (
  categoryId: string,
  amount: number,
  kind: AllocationInput["kind"] = "essential",
): AllocationInput => ({ categoryId, kind, amountSen: sen(amount) });

/** SRS AC-04 golden-path plan: RM400 budget. */
const goldenPlan = [
  alloc("meals", 25000),
  alloc("laundry", 4000),
  alloc("transport", 2000),
  alloc("phone", 2000),
  alloc("emergency", 3000, "set_aside"),
  alloc("fun", 4000, "optional"),
];

describe("plan totals (BR-06, BR-07)", () => {
  it("splits planned spending from set-asides and reconciles to the budget (AC-04)", () => {
    expect(planTotals(sen(40000), goldenPlan)).toEqual({
      plannedSpendingSen: 37000,
      setAsideSen: 3000,
      unallocatedSen: 0,
      shortfallSen: 0,
    });
  });

  it("shows a RM30 shortfall when RM430 is allocated from a RM400 budget (AC-03)", () => {
    const over = [...goldenPlan, alloc("snacks", 3000, "optional")];
    const totals = planTotals(sen(40000), over);
    expect(totals.unallocatedSen).toBe(-3000);
    expect(totals.shortfallSen).toBe(3000);
  });
});

describe("approval (FR-PLN-09, FR-PLN-10, AC-03)", () => {
  const over = [...goldenPlan, alloc("snacks", 3000, "optional")];

  it("blocks a plan with a shortfall until it is acknowledged", () => {
    const blocked = checkCanApprove(sen(40000), over, false);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.code).toBe("SHORTFALL_NOT_ACKNOWLEDGED");
    expect(checkCanApprove(sen(40000), over, true).ok).toBe(true);
  });

  it("approves a balanced plan without acknowledgement", () => {
    expect(checkCanApprove(sen(40000), goldenPlan, false).ok).toBe(true);
  });
});

describe("revisions (BR-08, FR-PLN-11, FR-PLN-16, D-03, D-20)", () => {
  const revisions = [
    { id: "r1", revisionNo: 1, approved: true },
    { id: "r2", revisionNo: 2, approved: true },
  ];

  it("uses the highest approved revision as current, and keeps the original (AC-06)", () => {
    expect(currentRevision(revisions)?.id).toBe("r2");
    expect(originalRevision(revisions)?.id).toBe("r1");
  });

  it("ignores an unapproved draft when picking the current revision", () => {
    expect(currentRevision([...revisions, { id: "r3", revisionNo: 3, approved: false }])?.id).toBe(
      "r2",
    );
  });

  it("never edits an approved revision", () => {
    const result = checkCanEditRevision({ id: "r2", revisionNo: 2, approved: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("REVISION_IMMUTABLE");
  });

  it("allows only one draft revision at a time (AC-47)", () => {
    expect(checkCanCreateDraft(revisions).ok).toBe(true);
    const withDraft = [...revisions, { id: "r3", revisionNo: 3, approved: false }];
    const result = checkCanCreateDraft(withDraft);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("DRAFT_REVISION_EXISTS");
    expect(nextRevisionNo(revisions)).toBe(3);
  });
});

describe("category deletion (BR-28, D-21, AC-27)", () => {
  it("refuses to delete a used category; archive is offered instead", () => {
    const result = checkCanDeleteCategory({ allocations: 0, transactionLines: 3 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("CATEGORY_IN_USE");
  });

  it("allows deleting a category that was never used", () => {
    expect(checkCanDeleteCategory({ allocations: 0, transactionLines: 0 }).ok).toBe(true);
  });
});

describe("money in suggests a plan change (FR-TXN-11, D-26, AC-61)", () => {
  const income = (amount: number) => txn("income", amount, []);
  it("suggests adding RM100 when RM500 came in against a RM400 budget", () => {
    expect(moneyInSuggestion([income(30000), income(20000)], sen(40000))).toBe(10000);
  });
  it("suggests nothing when money in does not exceed the budget", () => {
    expect(moneyInSuggestion([income(40000)], sen(40000))).toBe(null);
    expect(moneyInSuggestion([], sen(40000))).toBe(null);
  });
  it("ignores everything that is not money in", () => {
    expect(moneyInSuggestion([txn("borrow", 90000, [])], sen(40000))).toBe(null);
  });
});

describe("debts from before the plan (D-41)", () => {
  it("takes the paybacks out of the money: RM500 − RM60 − RM40 = RM400", () => {
    expect(budgetAfterPayback(sen(50000), [sen(6000), sen(4000)])).toBe(40000);
    expect(budgetAfterPayback(sen(50000), [])).toBe(50000);
  });
  it("accepts paying back part or all of what is owed", () => {
    expect(checkPayback(sen(50000), sen(0), sen(10000), sen(6000)).ok).toBe(true);
    expect(checkPayback(sen(50000), sen(0), sen(10000), sen(10000)).ok).toBe(true);
  });
  it("refuses zero and more than is owed", () => {
    expect(checkPayback(sen(50000), sen(0), sen(10000), sen(0))).toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect(checkPayback(sen(50000), sen(0), sen(10000), sen(10001))).toMatchObject({
      code: "DEBT_EXCEEDS_OUTSTANDING",
    });
  });
  it("refuses paybacks that leave nothing to plan with", () => {
    expect(checkPayback(sen(10000), sen(4000), sen(9000), sen(6000)).ok).toBe(false);
    expect(checkPayback(sen(10000), sen(4000), sen(9000), sen(5999)).ok).toBe(true);
  });
});
