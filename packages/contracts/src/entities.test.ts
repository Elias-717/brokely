import { describe, expect, it } from "vitest";
import {
  BillSchema,
  PlanRevisionSchema,
  PlanningCycleSchema,
  ScheduledItemSchema,
  TransactionSchema,
} from "./entities";
import { ids, laundryPurchase, splitMeal } from "./fixtures";
import { LocalDateSchema, SignedSenSchema } from "./primitives";

describe("primitives", () => {
  it("accepts real local dates and rejects impossible ones (BR-03)", () => {
    expect(LocalDateSchema.safeParse("2026-11-02").success).toBe(true);
    expect(LocalDateSchema.safeParse("2026-02-30").success).toBe(false);
    expect(LocalDateSchema.safeParse("2/11/2026").success).toBe(false);
  });

  it("allows signed debt adjustments but not zero (BR-22)", () => {
    expect(SignedSenSchema.safeParse(-250).success).toBe(true);
    expect(SignedSenSchema.safeParse(0).success).toBe(false);
  });
});

describe("TransactionSchema", () => {
  it("accepts the golden-path RM5 laundry purchase (AC-04)", () => {
    expect(TransactionSchema.safeParse(laundryPurchase).success).toBe(true);
  });

  it("accepts a purchase split into spending and a debt line (AC-10, D-01)", () => {
    expect(TransactionSchema.safeParse(splitMeal).success).toBe(true);
  });

  it("rejects fractional and zero amounts (R-04)", () => {
    expect(TransactionSchema.safeParse({ ...laundryPurchase, amountSen: 5.5 }).success).toBe(false);
    expect(TransactionSchema.safeParse({ ...laundryPurchase, amountSen: 0 }).success).toBe(false);
  });

  it("requires a refund to point to its purchase (FR-TXN-06)", () => {
    const refund = { ...laundryPurchase, type: "refund" };
    expect(TransactionSchema.safeParse(refund).success).toBe(false);
    expect(
      TransactionSchema.safeParse({ ...refund, refundsTransactionId: ids.purchase }).success,
    ).toBe(true);
  });

  it("rejects lines on a transfer (BR-10)", () => {
    expect(TransactionSchema.safeParse({ ...laundryPurchase, type: "transfer" }).success).toBe(
      false,
    );
    expect(
      TransactionSchema.safeParse({ ...laundryPurchase, type: "transfer", lines: [] }).success,
    ).toBe(true);
  });

  it("requires exactly one debt line for a repayment (FR-DEBT-02)", () => {
    const repayment = {
      ...laundryPurchase,
      type: "repayment_received",
      lines: [{ id: ids.line2, kind: "debt", debtId: ids.debt, amountSen: 500 }],
    };
    expect(TransactionSchema.safeParse(repayment).success).toBe(true);
    expect(
      TransactionSchema.safeParse({ ...repayment, lines: laundryPurchase.lines }).success,
    ).toBe(false);
  });

  it("allows estimates only on purchases (D-15)", () => {
    expect(TransactionSchema.safeParse({ ...laundryPurchase, isEstimate: true }).success).toBe(
      true,
    );
    expect(
      TransactionSchema.safeParse({
        ...laundryPurchase,
        type: "transfer",
        lines: [],
        isEstimate: true,
      }).success,
    ).toBe(false);
  });
});

describe("PlanningCycleSchema", () => {
  it("requires the end to be after the start (BR-03)", () => {
    const cycle = { startDate: "2026-11-02", endDateExclusive: "2026-12-02", status: "active" };
    expect(PlanningCycleSchema.safeParse(cycle).success).toBe(true);
    expect(
      PlanningCycleSchema.safeParse({ ...cycle, endDateExclusive: "2026-11-02" }).success,
    ).toBe(false);
  });
});

describe("PlanRevisionSchema", () => {
  const revision = {
    cycleId: ids.cycle,
    revisionNo: 1,
    budgetSen: 40000,
    approvedAt: null,
    shortfallAcknowledged: false,
    allocations: [{ id: ids.line1, categoryId: ids.laundry, amountSen: 4000 }],
  };

  it("accepts a draft revision with allocations (D-20)", () => {
    expect(PlanRevisionSchema.safeParse(revision).success).toBe(true);
  });

  it("rejects allocating the same category twice", () => {
    const twice = {
      ...revision,
      allocations: [
        ...revision.allocations,
        { id: ids.line2, categoryId: ids.laundry, amountSen: 1 },
      ],
    };
    expect(PlanRevisionSchema.safeParse(twice).success).toBe(false);
  });
});

describe("BillSchema", () => {
  it("supports every N weeks (D-17)", () => {
    const bill = {
      categoryId: ids.laundry,
      name: "Laundry",
      amountSen: 1600,
      repeat: { kind: "every_n_weeks", n: 2 },
      anchorDate: "2026-11-02",
      archivedAt: null,
    };
    expect(BillSchema.safeParse(bill).success).toBe(true);
    expect(BillSchema.safeParse({ ...bill, repeat: { kind: "every_n_weeks", n: 0 } }).success).toBe(
      false,
    );
  });
});

describe("ScheduledItemSchema", () => {
  it("links a transaction only when paid (R-05)", () => {
    const item = {
      billId: ids.laundry,
      dueDate: "2026-11-02",
      amountSen: 1600,
      status: "upcoming",
      transactionId: null,
    };
    expect(ScheduledItemSchema.safeParse(item).success).toBe(true);
    expect(ScheduledItemSchema.safeParse({ ...item, status: "paid" }).success).toBe(false);
    expect(
      ScheduledItemSchema.safeParse({ ...item, status: "paid", transactionId: ids.purchase })
        .success,
    ).toBe(true);
  });
});
