/**
 * Example payloads shared by tests (and later by app and API tests).
 * IDs are fixed so failures are easy to read. Based on the golden path (SRS AC-04).
 */
export const ids = {
  device: "0192f3a4-0000-7000-8000-000000000001",
  laundry: "0192f3a1-0000-7000-8000-000000000010",
  meals: "0192f3a1-0000-7000-8000-000000000011",
  cycle: "0192f3a2-0000-7000-8000-000000000020",
  revision: "0192f3a2-0000-7000-8000-000000000021",
  debt: "0192f3a3-0000-7000-8000-000000000030",
  purchase: "0192f3a5-0000-7000-8000-000000000040",
  line1: "0192f3a5-0000-7000-8000-000000000041",
  line2: "0192f3a5-0000-7000-8000-000000000042",
  operation: "0192f3a5-0000-7000-8000-000000000050",
} as const;

/** RM5 laundry purchase (AC-04). */
export const laundryPurchase = {
  type: "purchase",
  amountSen: 500,
  occurredAt: "2026-11-02T04:15:00Z",
  localDate: "2026-11-02",
  source: "manual",
  note: "Laundry",
  refundsTransactionId: null,
  writeOffCategoryId: null,
  isEstimate: false,
  lines: [{ id: ids.line1, kind: "spending", categoryId: ids.laundry, amountSen: 500 }],
} as const;

/** RM20 group meal: RM10 my meal + RM10 a friend owes me (AC-10, D-01). */
export const splitMeal = {
  ...laundryPurchase,
  amountSen: 2000,
  note: "Group dinner",
  lines: [
    { id: ids.line1, kind: "spending", categoryId: ids.meals, amountSen: 1000 },
    { id: ids.line2, kind: "debt", debtId: ids.debt, amountSen: 1000 },
  ],
} as const;
