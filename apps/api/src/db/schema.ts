import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Server database (PostgreSQL on Supabase, Singapore, D-64). Source: docs/design/erd.md v0.2
 * and the phone schema in packages/local-db, plus what only the server needs:
 *
 * - `user_id` on every row, taken from the sign-in token (sync-api S-02), deleted with the
 *   account (`on delete cascade`, FR-ACC-07).
 * - `server_seq` from one global sequence, set on every write; pull reads it (S-08).
 * - `processed_operations`, so a repeated push is answered, not applied twice (FR-SYNC-05).
 *
 * Everything lives in the private `brokely` schema with row-level security on and no policies:
 * Supabase's public Data API can't read or write it; only the sync API (S-09) can.
 * Constraints Drizzle can't express (the cycle overlap EXCLUDE) are in a hand-written migration.
 */

export const brokely = pgSchema("brokely");

/** One sequence for every table, so pull has a single cursor (S-08). */
export const serverSeq = brokely.sequence("server_seq");

/** Supabase's sign-in users. Not exported: the table belongs to Supabase, never migrated here. */
const authUsers = pgSchema("auth").table("users", { id: uuid("id").primaryKey() });

const instant = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const localDate = (name: string) => date(name, { mode: "string" });
const userId = () =>
  uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" });

/** Columns every synced aggregate has (ERD §1 rule 4, FR-SYNC-03/09). */
const synced = () => ({
  id: uuid("id").primaryKey(), // made on the phone (FR-SYNC-03)
  userId: userId(),
  version: integer("version").notNull(), // optimistic concurrency (S-04)
  createdAt: instant("created_at").notNull().defaultNow(),
  updatedAt: instant("updated_at").notNull().defaultNow(),
  deletedAt: instant("deleted_at"), // delete marker (S-07)
  serverSeq: bigint("server_seq", { mode: "number" }).notNull(),
});

/** Parts of an aggregate (S-01): written and deleted with their parent, never on their own. */
const part = () => ({
  id: uuid("id").primaryKey(),
  userId: userId(),
});

const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(", "));

// ── Categories ──────────────────────────────────────────────────────────────

export const CATEGORY_KINDS = ["essential", "optional", "set_aside"] as const; // D-04

export const categories = brokely
  .table(
    "categories",
    {
      ...synced(),
      name: text("name").notNull(),
      kind: text("kind", { enum: CATEGORY_KINDS }).notNull(),
      sortOrder: integer("sort_order").notNull(),
      archivedAt: instant("archived_at"), // archive-only once used (D-21, BR-28)
    },
    (t) => [
      check("categories_kind_check", sql`${t.kind} in (${inList(CATEGORY_KINDS)})`),
      uniqueIndex("categories_live_name_unique")
        .on(t.userId, t.name)
        .where(sql`${t.deletedAt} is null`),
      index("categories_seq_idx").on(t.userId, t.serverSeq),
    ],
  )
  .enableRLS();

// ── Plan ────────────────────────────────────────────────────────────────────

export const CYCLE_STATUSES = ["draft", "active", "completed", "archived"] as const; // BR-27

/** No overlap of active/completed cycles (BR-05, D-18): EXCLUDE in 0001_server_rules.sql. */
export const planningCycles = brokely
  .table(
    "planning_cycles",
    {
      ...synced(),
      startDate: localDate("start_date").notNull(),
      endDateExclusive: localDate("end_date_exclusive").notNull(), // inclusive end + 1 (BR-03)
      trackingStartDate: localDate("tracking_start_date").notNull(), // R-12
      status: text("status", { enum: CYCLE_STATUSES }).notNull(),
    },
    (t) => [
      check("planning_cycles_dates_check", sql`${t.startDate} < ${t.endDateExclusive}`),
      check(
        "planning_cycles_tracking_check",
        sql`${t.startDate} <= ${t.trackingStartDate} and ${t.trackingStartDate} < ${t.endDateExclusive}`,
      ),
      check("planning_cycles_status_check", sql`${t.status} in (${inList(CYCLE_STATUSES)})`),
      index("planning_cycles_seq_idx").on(t.userId, t.serverSeq),
    ],
  )
  .enableRLS();

export const planRevisions = brokely
  .table(
    "plan_revisions",
    {
      ...synced(),
      cycleId: uuid("cycle_id")
        .notNull()
        .references(() => planningCycles.id, { onDelete: "cascade" }),
      revisionNo: integer("revision_no").notNull(), // 1 = original (D-03)
      budgetSen: bigint("budget_sen", { mode: "number" }).notNull(),
      approvedAt: instant("approved_at"), // NULL while draft (D-20)
      shortfallAcknowledged: boolean("shortfall_acknowledged").notNull(),
    },
    (t) => [
      check("plan_revisions_budget_check", sql`${t.budgetSen} > 0`),
      check("plan_revisions_number_check", sql`${t.revisionNo} >= 1`),
      uniqueIndex("plan_revisions_cycle_number_unique").on(t.cycleId, t.revisionNo),
      // At most one unapproved draft per cycle (D-20, FR-PLN-16).
      uniqueIndex("plan_revisions_one_draft_unique")
        .on(t.cycleId)
        .where(sql`${t.approvedAt} is null and ${t.deletedAt} is null`),
      index("plan_revisions_seq_idx").on(t.userId, t.serverSeq),
    ],
  )
  .enableRLS();

export const allocations = brokely
  .table(
    "allocations",
    {
      ...part(),
      revisionId: uuid("revision_id")
        .notNull()
        .references(() => planRevisions.id, { onDelete: "cascade" }),
      categoryId: uuid("category_id")
        .notNull()
        .references(() => categories.id),
      amountSen: bigint("amount_sen", { mode: "number" }).notNull(),
    },
    (t) => [
      check("allocations_amount_check", sql`${t.amountSen} >= 0`),
      uniqueIndex("allocations_revision_category_unique").on(t.revisionId, t.categoryId),
      index("allocations_category_idx").on(t.categoryId),
      index("allocations_user_idx").on(t.userId), // account deletion (FR-ACC-07)
    ],
  )
  .enableRLS();

// ── Bills ───────────────────────────────────────────────────────────────────

export const REPEAT_KINDS = [
  "daily",
  "weekdays",
  "every_n_days",
  "every_n_weeks",
  "monthly",
  "once",
] as const; // D-17

export const bills = brokely
  .table(
    "bills",
    {
      ...synced(),
      categoryId: uuid("category_id")
        .notNull()
        .references(() => categories.id),
      name: text("name").notNull(),
      amountSen: bigint("amount_sen", { mode: "number" }).notNull(),
      repeatKind: text("repeat_kind", { enum: REPEAT_KINDS }).notNull(),
      repeatParams: jsonb("repeat_params").notNull(), // the rule without `kind` (contracts RepeatRule)
      anchorDate: localDate("anchor_date").notNull(),
      archivedAt: instant("archived_at"),
    },
    (t) => [
      check("bills_amount_check", sql`${t.amountSen} > 0`),
      check("bills_repeat_kind_check", sql`${t.repeatKind} in (${inList(REPEAT_KINDS)})`),
      index("bills_category_idx").on(t.categoryId),
      index("bills_seq_idx").on(t.userId, t.serverSeq),
    ],
  )
  .enableRLS();

export const SCHEDULED_ITEM_STATUSES = ["upcoming", "paid", "skipped"] as const;

export const scheduledItems = brokely
  .table(
    "scheduled_items",
    {
      ...synced(), // id = UUIDv5(bill_id + due_date), deterministic (S-05)
      billId: uuid("bill_id")
        .notNull()
        .references(() => bills.id, { onDelete: "cascade" }),
      dueDate: localDate("due_date").notNull(),
      amountSen: bigint("amount_sen", { mode: "number" }).notNull(),
      status: text("status", { enum: SCHEDULED_ITEM_STATUSES }).notNull(),
      transactionId: uuid("transaction_id").references((): AnyPgColumn => transactions.id),
    },
    (t) => [
      check("scheduled_items_amount_check", sql`${t.amountSen} > 0`),
      check(
        "scheduled_items_status_check",
        sql`${t.status} in (${inList(SCHEDULED_ITEM_STATUSES)})`,
      ),
      check(
        "scheduled_items_paid_check",
        sql`(${t.status} = 'paid') = (${t.transactionId} is not null)`,
      ), // R-05
      uniqueIndex("scheduled_items_bill_date_unique").on(t.billId, t.dueDate),
      uniqueIndex("scheduled_items_transaction_unique").on(t.transactionId),
      index("scheduled_items_seq_idx").on(t.userId, t.serverSeq),
    ],
  )
  .enableRLS();

// ── Transactions ────────────────────────────────────────────────────────────

export const TRANSACTION_TYPES = [
  "purchase",
  "refund",
  "transfer",
  "borrow",
  "lend",
  "repayment_received",
  "repayment_made",
  "write_off",
  "income", // D-26
] as const;

export const transactions = brokely
  .table(
    "transactions",
    {
      ...synced(),
      type: text("type", { enum: TRANSACTION_TYPES }).notNull(),
      amountSen: bigint("amount_sen", { mode: "number" }).notNull(),
      occurredAt: instant("occurred_at").notNull(),
      localDate: localDate("local_date").notNull(), // fixed at entry (BR-03, BR-04)
      source: text("source", { enum: ["manual", "import"] }).notNull(),
      note: text("note").notNull(),
      refundsTransactionId: uuid("refunds_transaction_id").references(
        (): AnyPgColumn => transactions.id,
      ),
      writeOffCategoryId: uuid("write_off_category_id").references(() => categories.id),
      isEstimate: boolean("is_estimate").notNull(), // D-15
    },
    (t) => [
      check("transactions_amount_check", sql`${t.amountSen} > 0`),
      check("transactions_type_check", sql`${t.type} in (${inList(TRANSACTION_TYPES)})`),
      check("transactions_source_check", sql`${t.source} in ('manual', 'import')`),
      check(
        "transactions_refund_link_check",
        sql`(${t.type} = 'refund') = (${t.refundsTransactionId} is not null)`,
      ),
      index("transactions_refunds_idx").on(t.refundsTransactionId),
      index("transactions_write_off_category_idx").on(t.writeOffCategoryId),
      index("transactions_seq_idx").on(t.userId, t.serverSeq),
    ],
  )
  .enableRLS();

export const LINE_KINDS = ["spending", "debt"] as const;

export const transactionLines = brokely
  .table(
    "transaction_lines",
    {
      ...part(),
      transactionId: uuid("transaction_id")
        .notNull()
        .references(() => transactions.id, { onDelete: "cascade" }),
      kind: text("kind", { enum: LINE_KINDS }).notNull(),
      categoryId: uuid("category_id").references(() => categories.id),
      debtId: uuid("debt_id").references(() => debts.id),
      amountSen: bigint("amount_sen", { mode: "number" }).notNull(),
    },
    (t) => [
      check("transaction_lines_amount_check", sql`${t.amountSen} > 0`),
      check(
        "transaction_lines_target_check",
        sql`(${t.kind} = 'spending' and ${t.categoryId} is not null and ${t.debtId} is null)
         or (${t.kind} = 'debt' and ${t.debtId} is not null and ${t.categoryId} is null)`,
      ), // D-01
      index("transaction_lines_transaction_idx").on(t.transactionId),
      index("transaction_lines_category_idx").on(t.categoryId),
      index("transaction_lines_debt_idx").on(t.debtId),
      index("transaction_lines_user_idx").on(t.userId), // account deletion (FR-ACC-07)
    ],
  )
  .enableRLS();

export const transactionEdits = brokely
  .table(
    "transaction_edits",
    {
      ...synced(),
      transactionId: uuid("transaction_id")
        .notNull()
        .references(() => transactions.id, { onDelete: "cascade" }),
      changedAt: instant("changed_at").notNull(),
      before: jsonb("before").notNull(),
      after: jsonb("after").notNull(),
    },
    (t) => [
      index("transaction_edits_transaction_idx").on(t.transactionId),
      index("transaction_edits_seq_idx").on(t.userId, t.serverSeq),
    ],
  )
  .enableRLS();

// ── Debts ───────────────────────────────────────────────────────────────────

export const DEBT_DIRECTIONS = ["owed_by_me", "owed_to_me"] as const;

/** Principal, outstanding and status are derived from transactions (BR-22). */
export const debts = brokely
  .table(
    "debts",
    {
      ...synced(),
      direction: text("direction", { enum: DEBT_DIRECTIONS }).notNull(),
      counterparty: text("counterparty").notNull(),
      dueDate: localDate("due_date"),
      notes: text("notes").notNull(),
    },
    (t) => [
      check("debts_direction_check", sql`${t.direction} in (${inList(DEBT_DIRECTIONS)})`),
      index("debts_seq_idx").on(t.userId, t.serverSeq),
    ],
  )
  .enableRLS();

export const debtAdjustments = brokely
  .table(
    "debt_adjustments",
    {
      ...synced(),
      debtId: uuid("debt_id")
        .notNull()
        .references(() => debts.id, { onDelete: "cascade" }),
      deltaSen: bigint("delta_sen", { mode: "number" }).notNull(), // the only signed amount
      reason: text("reason").notNull(),
    },
    (t) => [
      check("debt_adjustments_delta_check", sql`${t.deltaSen} <> 0`),
      index("debt_adjustments_debt_idx").on(t.debtId),
      index("debt_adjustments_seq_idx").on(t.userId, t.serverSeq),
    ],
  )
  .enableRLS();

// ── Progress and settings ───────────────────────────────────────────────────

export const dayCheckIns = brokely
  .table(
    "day_check_ins",
    {
      ...synced(),
      localDate: localDate("local_date").notNull(), // R-01
    },
    (t) => [
      // One live check-in per day; a second one is merged (S-06).
      uniqueIndex("day_check_ins_live_date_unique")
        .on(t.userId, t.localDate)
        .where(sql`${t.deletedAt} is null`),
      index("day_check_ins_seq_idx").on(t.userId, t.serverSeq),
    ],
  )
  .enableRLS();

export const walletChecks = brokely
  .table(
    "wallet_checks",
    {
      ...synced(),
      checkedAt: instant("checked_at").notNull(),
      localDate: localDate("local_date").notNull(),
      amountSen: bigint("amount_sen", { mode: "number" }).notNull(),
      note: text("note").notNull(),
    },
    (t) => [
      check("wallet_checks_amount_check", sql`${t.amountSen} >= 0`),
      index("wallet_checks_seq_idx").on(t.userId, t.serverSeq),
    ],
  )
  .enableRLS();

export const userSettings = brokely
  .table(
    "user_settings",
    {
      ...synced(),
      timeZone: text("time_zone").notNull(),
      weekStart: integer("week_start").notNull(),
      mascotVisible: boolean("mascot_visible").notNull(),
    },
    (t) => [
      check("user_settings_week_start_check", sql`${t.weekStart} between 0 and 6`),
      // One live settings row per user; a second one is merged (S-06).
      uniqueIndex("user_settings_live_user_unique")
        .on(t.userId)
        .where(sql`${t.deletedAt} is null`),
      index("user_settings_seq_idx").on(t.userId, t.serverSeq),
    ],
  )
  .enableRLS();

// ── Sync (server only) ──────────────────────────────────────────────────────

/**
 * Operations already applied, with the answer given (FR-SYNC-05, S-03). Only `applied` and
 * `duplicate` answers are kept: a rejected or conflicting operation may be sent again later
 * (e.g. REFERENCE_MISSING once its parent has arrived) and must then be checked afresh.
 */
export const processedOperations = brokely
  .table(
    "processed_operations",
    {
      userId: userId(),
      operationId: uuid("operation_id").notNull(),
      result: jsonb("result").notNull(),
      processedAt: instant("processed_at").notNull().defaultNow(),
    },
    (t) => [primaryKey({ columns: [t.userId, t.operationId] })],
  )
  .enableRLS();
