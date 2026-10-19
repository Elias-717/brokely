import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * Phone database (SQLite), release 0.1. Source: docs/design/erd.md v0.2.
 *
 * Conventions
 * - Money: INTEGER sen. Transactions and lines are > 0 (BR-01, R-04); allocations ≥ 0;
 *   only debt adjustments are signed (BR-22).
 * - Dates people see: TEXT 'YYYY-MM-DD' local dates (BR-03). Moments: TEXT ISO-8601 UTC instants.
 * - Facts are stored; totals, remaining amounts, coverage, forecast and debt status are derived
 *   by @brokely/domain and never stored (ERD §1).
 * - Foreign keys need `PRAGMA foreign_keys = ON` on every connection.
 */

export const SYNC_STATUSES = ["pending", "synced", "failed", "conflict"] as const; // FR-SYNC-06

/** Columns every synced row has (ERD §1 rule 4, FR-SYNC-03/06/09). */
const synced = () => ({
  id: text("id").primaryKey(), // UUIDv7 made on the phone
  userId: text("user_id"), // NULL in local-only mode (D-05)
  version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  deletedAt: text("deleted_at"), // delete marker
  syncStatus: text("sync_status", { enum: SYNC_STATUSES }).notNull().default("pending"),
});

const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(", "));

// ── Categories ──────────────────────────────────────────────────────────────

export const CATEGORY_KINDS = ["essential", "optional", "set_aside"] as const; // D-04

export const categories = sqliteTable(
  "categories",
  {
    ...synced(),
    name: text("name").notNull(),
    kind: text("kind", { enum: CATEGORY_KINDS }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: text("archived_at"), // archive-only once used (D-21, BR-28)
  },
  (t) => [
    check("categories_kind_check", sql`${t.kind} in (${inList(CATEGORY_KINDS)})`),
    uniqueIndex("categories_live_name_unique")
      .on(t.name)
      .where(sql`${t.deletedAt} is null`),
  ],
);

// ── Plan ────────────────────────────────────────────────────────────────────

export const CYCLE_STATUSES = ["draft", "active", "completed", "archived"] as const; // BR-27

export const planningCycles = sqliteTable(
  "planning_cycles",
  {
    ...synced(),
    startDate: text("start_date").notNull(),
    endDateExclusive: text("end_date_exclusive").notNull(), // inclusive end + 1 day (BR-03)
    // First tracked day; equals start_date unless the student caught up mid-month (R-12, D-25).
    trackingStartDate: text("tracking_start_date").notNull(),
    status: text("status", { enum: CYCLE_STATUSES }).notNull().default("draft"),
  },
  (t) => [
    check("planning_cycles_dates_check", sql`${t.startDate} < ${t.endDateExclusive}`),
    check(
      "planning_cycles_tracking_check",
      sql`${t.startDate} <= ${t.trackingStartDate} and ${t.trackingStartDate} < ${t.endDateExclusive}`,
    ),
    check("planning_cycles_status_check", sql`${t.status} in (${inList(CYCLE_STATUSES)})`),
    // No overlap between active/completed cycles (BR-05) is checked by @brokely/domain before
    // saving; SQLite has no exclusion constraints. The server enforces it too (sync-api §6).
    index("planning_cycles_dates_idx").on(t.startDate, t.endDateExclusive),
  ],
);

export const planRevisions = sqliteTable(
  "plan_revisions",
  {
    ...synced(),
    cycleId: text("cycle_id")
      .notNull()
      .references(() => planningCycles.id),
    revisionNo: integer("revision_no").notNull(), // 1 = original (D-03)
    budgetSen: integer("budget_sen").notNull(),
    approvedAt: text("approved_at"), // NULL while draft; one draft per cycle (D-20)
    shortfallAcknowledged: integer("shortfall_acknowledged", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (t) => [
    check("plan_revisions_budget_check", sql`${t.budgetSen} > 0`),
    check("plan_revisions_number_check", sql`${t.revisionNo} >= 1`),
    uniqueIndex("plan_revisions_cycle_number_unique").on(t.cycleId, t.revisionNo),
    // At most one unapproved draft per cycle (D-20, FR-PLN-16).
    uniqueIndex("plan_revisions_one_draft_unique")
      .on(t.cycleId)
      .where(sql`${t.approvedAt} is null and ${t.deletedAt} is null`),
  ],
);

export const allocations = sqliteTable(
  "allocations",
  {
    ...synced(),
    revisionId: text("revision_id")
      .notNull()
      .references(() => planRevisions.id),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id),
    amountSen: integer("amount_sen").notNull(),
  },
  (t) => [
    check("allocations_amount_check", sql`${t.amountSen} >= 0`),
    uniqueIndex("allocations_revision_category_unique").on(t.revisionId, t.categoryId),
  ],
);

// ── Bills ───────────────────────────────────────────────────────────────────

export const REPEAT_KINDS = [
  "daily",
  "weekdays",
  "every_n_days",
  "every_n_weeks",
  "monthly",
  "once",
] as const; // D-17

export const bills = sqliteTable(
  "bills",
  {
    ...synced(),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id),
    name: text("name").notNull(),
    amountSen: integer("amount_sen").notNull(),
    repeatKind: text("repeat_kind", { enum: REPEAT_KINDS }).notNull(),
    repeatParams: text("repeat_params", { mode: "json" }).notNull(), // e.g. {"n":2} (contracts RepeatRule)
    anchorDate: text("anchor_date").notNull(),
    archivedAt: text("archived_at"),
  },
  (t) => [
    check("bills_amount_check", sql`${t.amountSen} > 0`),
    check("bills_repeat_kind_check", sql`${t.repeatKind} in (${inList(REPEAT_KINDS)})`),
  ],
);

export const SCHEDULED_ITEM_STATUSES = ["upcoming", "paid", "skipped"] as const;

export const scheduledItems = sqliteTable(
  "scheduled_items",
  {
    ...synced(), // id = UUIDv5(bill_id + due_date), deterministic (sync-api S-05)
    billId: text("bill_id")
      .notNull()
      .references(() => bills.id),
    dueDate: text("due_date").notNull(),
    amountSen: integer("amount_sen").notNull(),
    status: text("status", { enum: SCHEDULED_ITEM_STATUSES }).notNull().default("upcoming"),
    transactionId: text("transaction_id").references((): AnySQLiteColumn => transactions.id),
  },
  (t) => [
    check("scheduled_items_amount_check", sql`${t.amountSen} > 0`),
    check("scheduled_items_status_check", sql`${t.status} in (${inList(SCHEDULED_ITEM_STATUSES)})`),
    // A paid item has exactly one transaction; others have none (R-05).
    check(
      "scheduled_items_paid_check",
      sql`(${t.status} = 'paid') = (${t.transactionId} is not null)`,
    ),
    uniqueIndex("scheduled_items_bill_date_unique").on(t.billId, t.dueDate),
    uniqueIndex("scheduled_items_transaction_unique").on(t.transactionId),
    index("scheduled_items_due_date_idx").on(t.dueDate),
  ],
);

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
  "income", // money received; never spending (FR-TXN-11, D-26)
] as const;

export const transactions = sqliteTable(
  "transactions",
  {
    ...synced(),
    type: text("type", { enum: TRANSACTION_TYPES }).notNull(),
    amountSen: integer("amount_sen").notNull(),
    occurredAt: text("occurred_at").notNull(),
    localDate: text("local_date").notNull(), // fixed at entry (BR-03, BR-04)
    source: text("source", { enum: ["manual", "import"] })
      .notNull()
      .default("manual"),
    note: text("note").notNull().default(""),
    refundsTransactionId: text("refunds_transaction_id").references(
      (): AnySQLiteColumn => transactions.id,
    ),
    writeOffCategoryId: text("write_off_category_id").references(() => categories.id),
    isEstimate: integer("is_estimate", { mode: "boolean" }).notNull().default(false), // D-15
  },
  (t) => [
    check("transactions_amount_check", sql`${t.amountSen} > 0`),
    check("transactions_type_check", sql`${t.type} in (${inList(TRANSACTION_TYPES)})`),
    check("transactions_source_check", sql`${t.source} in ('manual', 'import')`),
    check(
      "transactions_refund_link_check",
      sql`(${t.type} = 'refund') = (${t.refundsTransactionId} is not null)`,
    ),
    index("transactions_local_date_idx").on(t.localDate),
  ],
);

export const LINE_KINDS = ["spending", "debt"] as const;

export const transactionLines = sqliteTable(
  "transaction_lines",
  {
    ...synced(),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.id),
    kind: text("kind", { enum: LINE_KINDS }).notNull(),
    categoryId: text("category_id").references(() => categories.id),
    debtId: text("debt_id").references(() => debts.id),
    amountSen: integer("amount_sen").notNull(),
  },
  (t) => [
    check("transaction_lines_amount_check", sql`${t.amountSen} > 0`),
    // Spending lines point to a category, debt lines to a debt, never both (D-01).
    check(
      "transaction_lines_target_check",
      sql`(${t.kind} = 'spending' and ${t.categoryId} is not null and ${t.debtId} is null)
       or (${t.kind} = 'debt' and ${t.debtId} is not null and ${t.categoryId} is null)`,
    ),
    // Lines adding up to the transaction amount (FR-TXN-04) is checked by @brokely/domain.
    index("transaction_lines_transaction_idx").on(t.transactionId),
    index("transaction_lines_category_idx").on(t.categoryId),
    index("transaction_lines_debt_idx").on(t.debtId),
  ],
);

export const transactionEdits = sqliteTable(
  "transaction_edits",
  {
    ...synced(),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.id),
    changedAt: text("changed_at").notNull(),
    before: text("before", { mode: "json" }).notNull(),
    after: text("after", { mode: "json" }).notNull(),
  },
  (t) => [index("transaction_edits_transaction_idx").on(t.transactionId)],
);

// ── Debts ───────────────────────────────────────────────────────────────────

export const DEBT_DIRECTIONS = ["owed_by_me", "owed_to_me"] as const;

/** Principal, outstanding and status are derived from transactions (BR-22). */
export const debts = sqliteTable(
  "debts",
  {
    ...synced(),
    direction: text("direction", { enum: DEBT_DIRECTIONS }).notNull(),
    counterparty: text("counterparty").notNull(),
    dueDate: text("due_date"),
    notes: text("notes").notNull().default(""),
  },
  (t) => [check("debts_direction_check", sql`${t.direction} in (${inList(DEBT_DIRECTIONS)})`)],
);

export const debtAdjustments = sqliteTable(
  "debt_adjustments",
  {
    ...synced(),
    debtId: text("debt_id")
      .notNull()
      .references(() => debts.id),
    deltaSen: integer("delta_sen").notNull(), // the only signed amount (BR-22)
    reason: text("reason").notNull(),
  },
  (t) => [check("debt_adjustments_delta_check", sql`${t.deltaSen} <> 0`)],
);

// ── Progress and settings ───────────────────────────────────────────────────

export const dayCheckIns = sqliteTable(
  "day_check_ins",
  {
    ...synced(),
    localDate: text("local_date").notNull(), // "No spending today" (R-01)
  },
  (t) => [
    uniqueIndex("day_check_ins_live_date_unique")
      .on(t.localDate)
      .where(sql`${t.deletedAt} is null`),
  ],
);

/** What the student says they have in total: cash, TNG and bank (FR-WAL-01, D-27). */
export const walletChecks = sqliteTable(
  "wallet_checks",
  {
    ...synced(),
    checkedAt: text("checked_at").notNull(),
    localDate: text("local_date").notNull(),
    amountSen: integer("amount_sen").notNull(),
    note: text("note").notNull().default(""),
  },
  (t) => [
    check("wallet_checks_amount_check", sql`${t.amountSen} >= 0`),
    index("wallet_checks_checked_at_idx").on(t.checkedAt),
  ],
);

export const userSettings = sqliteTable("user_settings", {
  ...synced(),
  timeZone: text("time_zone").notNull(),
  weekStart: integer("week_start").notNull().default(1),
  mascotVisible: integer("mascot_visible", { mode: "boolean" }).notNull().default(true),
});

// ── Sync (phone only) ───────────────────────────────────────────────────────

export const OUTBOX_STATUSES = ["pending", "failed", "conflict"] as const;

/**
 * Changes waiting for the server: one row per aggregate change, written in the SAME SQLite
 * transaction as the change itself (FR-SYNC-04, sync-api S-01).
 */
export const outboxOperations = sqliteTable(
  "outbox_operations",
  {
    operationId: text("operation_id").primaryKey(), // UUIDv7
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    op: text("op", { enum: ["upsert", "delete"] }).notNull(),
    baseVersion: integer("base_version"),
    payload: text("payload", { mode: "json" }),
    status: text("status", { enum: OUTBOX_STATUSES }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    check("outbox_operations_op_check", sql`${t.op} in ('upsert', 'delete')`),
    check("outbox_operations_status_check", sql`${t.status} in (${inList(OUTBOX_STATUSES)})`),
    index("outbox_operations_queue_idx").on(t.status, t.createdAt),
  ],
);

/** Small key/value store: pull cursor, linked account id (sync-api §5, §8). */
export const syncState = sqliteTable("sync_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/**
 * Phone-only preferences that never sync and never enter the outbox: the appearance choice
 * (D-32) and the essential-card queue (D-30). Values are JSON.
 */
export const localPrefs = sqliteTable("local_prefs", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
  updatedAt: text("updated_at").notNull(),
});
