import { z } from "zod";
import {
  AllocationSenSchema,
  AmountSenSchema,
  IdSchema,
  InstantSchema,
  LocalDateSchema,
  NameSchema,
  NoteSchema,
  SignedSenSchema,
} from "./primitives";

/**
 * Entity payloads exchanged by sync (docs/design/sync-api.md §3).
 * These check *shape*. Business rules that need other records (lines summing to the amount,
 * refund limits, cycle overlap…) are checked by @brokely/domain (sync-api §6).
 * Aggregates travel whole (S-01): a transaction with its lines, a revision with its allocations.
 */

// ── Categories ──────────────────────────────────────────────────────────────

export const CategoryKindSchema = z.enum(["essential", "optional", "set_aside"]); // D-04
export const CategorySchema = z.object({
  name: NameSchema,
  kind: CategoryKindSchema,
  sortOrder: z.number().int().nonnegative(),
  archivedAt: InstantSchema.nullable(), // archive-only once used (D-21)
});
export type Category = z.infer<typeof CategorySchema>;

// ── Plan ────────────────────────────────────────────────────────────────────

export const CycleStatusSchema = z.enum(["draft", "active", "completed", "archived"]); // BR-27
export const PlanningCycleSchema = z
  .object({
    startDate: LocalDateSchema,
    endDateExclusive: LocalDateSchema, // inclusive end + 1 day (BR-03)
    trackingStartDate: LocalDateSchema, // first tracked day; = startDate unless caught up (R-12)
    status: CycleStatusSchema,
  })
  .refine((c) => c.startDate < c.endDateExclusive, {
    message: "A cycle must end after it starts",
    path: ["endDateExclusive"],
  })
  .refine((c) => c.startDate <= c.trackingStartDate && c.trackingStartDate < c.endDateExclusive, {
    message: "Tracking must start inside the cycle (BR-29)",
    path: ["trackingStartDate"],
  });
export type PlanningCycle = z.infer<typeof PlanningCycleSchema>;

export const AllocationSchema = z.object({
  id: IdSchema,
  categoryId: IdSchema,
  amountSen: AllocationSenSchema,
});

export const PlanRevisionSchema = z
  .object({
    cycleId: IdSchema,
    revisionNo: z.number().int().positive(), // 1 = original (D-03)
    budgetSen: AmountSenSchema,
    approvedAt: InstantSchema.nullable(), // null while draft (D-20)
    shortfallAcknowledged: z.boolean(),
    allocations: z.array(AllocationSchema).max(100),
  })
  .refine((r) => new Set(r.allocations.map((a) => a.categoryId)).size === r.allocations.length, {
    message: "Each category can be allocated only once per revision",
    path: ["allocations"],
  });
export type PlanRevision = z.infer<typeof PlanRevisionSchema>;

// ── Bills ───────────────────────────────────────────────────────────────────

/** Repeat rules (FR-CAT-03, D-17). Weekdays use 0 = Sunday … 6 = Saturday. */
export const RepeatRuleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("daily") }),
  z.object({
    kind: z.literal("weekdays"),
    days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  }),
  z.object({ kind: z.literal("every_n_days"), n: z.number().int().min(1).max(365) }),
  z.object({ kind: z.literal("every_n_weeks"), n: z.number().int().min(1).max(52) }),
  z.object({ kind: z.literal("monthly"), day: z.number().int().min(1).max(31) }),
  z.object({ kind: z.literal("once") }),
]);
export type RepeatRule = z.infer<typeof RepeatRuleSchema>;

export const BillSchema = z.object({
  categoryId: IdSchema,
  name: NameSchema,
  amountSen: AmountSenSchema,
  repeat: RepeatRuleSchema,
  anchorDate: LocalDateSchema,
  archivedAt: InstantSchema.nullable(),
});
export type Bill = z.infer<typeof BillSchema>;

export const ScheduledItemStatusSchema = z.enum(["upcoming", "paid", "skipped"]);
export const ScheduledItemSchema = z
  .object({
    billId: IdSchema,
    dueDate: LocalDateSchema,
    amountSen: AmountSenSchema,
    status: ScheduledItemStatusSchema,
    transactionId: IdSchema.nullable(), // set only when paid (R-05)
  })
  .refine((s) => (s.status === "paid") === (s.transactionId !== null), {
    message: "A paid item needs its transaction, and only a paid item has one",
    path: ["transactionId"],
  });
export type ScheduledItem = z.infer<typeof ScheduledItemSchema>;

// ── Transactions ────────────────────────────────────────────────────────────

export const TransactionTypeSchema = z.enum([
  "purchase",
  "refund",
  "transfer",
  "borrow",
  "lend",
  "repayment_received",
  "repayment_made",
  "write_off",
  "income", // money received; never spending (FR-TXN-11, D-26)
]);
export type TransactionType = z.infer<typeof TransactionTypeSchema>;

export const TransactionLineSchema = z.discriminatedUnion("kind", [
  z.object({
    id: IdSchema,
    kind: z.literal("spending"),
    categoryId: IdSchema,
    amountSen: AmountSenSchema,
  }),
  z.object({ id: IdSchema, kind: z.literal("debt"), debtId: IdSchema, amountSen: AmountSenSchema }),
]);
export type TransactionLine = z.infer<typeof TransactionLineSchema>;

export const TransactionSchema = z
  .object({
    type: TransactionTypeSchema,
    amountSen: AmountSenSchema,
    occurredAt: InstantSchema,
    localDate: LocalDateSchema, // fixed when entered (BR-03, BR-04)
    source: z.enum(["manual", "import"]),
    note: NoteSchema,
    refundsTransactionId: IdSchema.nullable(),
    writeOffCategoryId: IdSchema.nullable(),
    isEstimate: z.boolean(), // gap fill (D-15)
    lines: z.array(TransactionLineSchema).max(20),
  })
  .superRefine((t, ctx) => {
    const spending = t.lines.filter((l) => l.kind === "spending").length;
    const debt = t.lines.filter((l) => l.kind === "debt").length;
    const fail = (message: string, path: (string | number)[] = ["lines"]) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message, path });

    // Which lines each type has (ERD §3 "Which lines each type has").
    switch (t.type) {
      case "purchase":
        if (spending < 1) fail("A purchase needs at least one spending line");
        break;
      case "refund":
        if (spending < 1 || debt > 0) fail("A refund has spending lines only");
        if (t.refundsTransactionId === null)
          fail("A refund must point to the purchase it reverses (FR-TXN-06)", [
            "refundsTransactionId",
          ]);
        break;
      case "transfer":
      case "income":
        if (t.lines.length > 0) fail(`A ${t.type} has no lines`);
        break;
      default:
        // borrow, lend, repayments and write-offs touch exactly one debt.
        if (debt !== 1 || spending !== 0) fail(`A ${t.type} has exactly one debt line`);
    }
    if (t.type !== "refund" && t.refundsTransactionId !== null)
      fail("Only refunds point to a purchase", ["refundsTransactionId"]);
    if (t.type !== "write_off" && t.writeOffCategoryId !== null)
      fail("Only write-offs have a write-off category", ["writeOffCategoryId"]);
    if (t.isEstimate && t.type !== "purchase")
      fail("Only purchases can be estimates (D-15)", ["isEstimate"]);
  });
export type Transaction = z.infer<typeof TransactionSchema>;

export const TransactionEditSchema = z.object({
  transactionId: IdSchema,
  changedAt: InstantSchema,
  before: z.record(z.unknown()),
  after: z.record(z.unknown()),
});
export type TransactionEdit = z.infer<typeof TransactionEditSchema>;

// ── Debts ───────────────────────────────────────────────────────────────────

export const DebtSchema = z.object({
  direction: z.enum(["owed_by_me", "owed_to_me"]),
  counterparty: NameSchema,
  dueDate: LocalDateSchema.nullable(),
  notes: NoteSchema,
});
export type Debt = z.infer<typeof DebtSchema>;

export const DebtAdjustmentSchema = z.object({
  debtId: IdSchema,
  deltaSen: SignedSenSchema,
  reason: NameSchema,
});
export type DebtAdjustment = z.infer<typeof DebtAdjustmentSchema>;

// ── Progress and settings ───────────────────────────────────────────────────

/** What the student says they have in total: cash, TNG and bank (FR-WAL-01, D-27). */
export const WalletCheckSchema = z.object({
  checkedAt: InstantSchema,
  localDate: LocalDateSchema,
  amountSen: AllocationSenSchema, // whole sen, may be 0
  note: NoteSchema,
});
export type WalletCheck = z.infer<typeof WalletCheckSchema>;

export const DayCheckInSchema = z.object({ localDate: LocalDateSchema }); // R-01
export type DayCheckIn = z.infer<typeof DayCheckInSchema>;

export const UserSettingsSchema = z.object({
  timeZone: z.string().min(1).max(64), // IANA name, e.g. "Asia/Kuala_Lumpur"
  weekStart: z.number().int().min(0).max(6),
  mascotVisible: z.boolean(),
});
export type UserSettings = z.infer<typeof UserSettingsSchema>;
