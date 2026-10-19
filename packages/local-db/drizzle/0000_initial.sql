CREATE TABLE `allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`sync_status` text DEFAULT 'pending' NOT NULL,
	`revision_id` text NOT NULL,
	`category_id` text NOT NULL,
	`amount_sen` integer NOT NULL,
	FOREIGN KEY (`revision_id`) REFERENCES `plan_revisions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "allocations_amount_check" CHECK("allocations"."amount_sen" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `allocations_revision_category_unique` ON `allocations` (`revision_id`,`category_id`);--> statement-breakpoint
CREATE TABLE `bills` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`sync_status` text DEFAULT 'pending' NOT NULL,
	`category_id` text NOT NULL,
	`name` text NOT NULL,
	`amount_sen` integer NOT NULL,
	`repeat_kind` text NOT NULL,
	`repeat_params` text NOT NULL,
	`anchor_date` text NOT NULL,
	`archived_at` text,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bills_amount_check" CHECK("bills"."amount_sen" > 0),
	CONSTRAINT "bills_repeat_kind_check" CHECK("bills"."repeat_kind" in ('daily', 'weekdays', 'every_n_days', 'every_n_weeks', 'monthly', 'once'))
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`sync_status` text DEFAULT 'pending' NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` text,
	CONSTRAINT "categories_kind_check" CHECK("categories"."kind" in ('essential', 'optional', 'set_aside'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_live_name_unique` ON `categories` (`name`) WHERE "categories"."deleted_at" is null;--> statement-breakpoint
CREATE TABLE `day_check_ins` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`sync_status` text DEFAULT 'pending' NOT NULL,
	`local_date` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `day_check_ins_live_date_unique` ON `day_check_ins` (`local_date`) WHERE "day_check_ins"."deleted_at" is null;--> statement-breakpoint
CREATE TABLE `debt_adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`sync_status` text DEFAULT 'pending' NOT NULL,
	`debt_id` text NOT NULL,
	`delta_sen` integer NOT NULL,
	`reason` text NOT NULL,
	FOREIGN KEY (`debt_id`) REFERENCES `debts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "debt_adjustments_delta_check" CHECK("debt_adjustments"."delta_sen" <> 0)
);
--> statement-breakpoint
CREATE TABLE `debts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`sync_status` text DEFAULT 'pending' NOT NULL,
	`direction` text NOT NULL,
	`counterparty` text NOT NULL,
	`due_date` text,
	`notes` text DEFAULT '' NOT NULL,
	CONSTRAINT "debts_direction_check" CHECK("debts"."direction" in ('owed_by_me', 'owed_to_me'))
);
--> statement-breakpoint
CREATE TABLE `outbox_operations` (
	`operation_id` text PRIMARY KEY NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`op` text NOT NULL,
	`base_version` integer,
	`payload` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` text NOT NULL,
	CONSTRAINT "outbox_operations_op_check" CHECK("outbox_operations"."op" in ('upsert', 'delete')),
	CONSTRAINT "outbox_operations_status_check" CHECK("outbox_operations"."status" in ('pending', 'failed', 'conflict'))
);
--> statement-breakpoint
CREATE INDEX `outbox_operations_queue_idx` ON `outbox_operations` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `plan_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`sync_status` text DEFAULT 'pending' NOT NULL,
	`cycle_id` text NOT NULL,
	`revision_no` integer NOT NULL,
	`budget_sen` integer NOT NULL,
	`approved_at` text,
	`shortfall_acknowledged` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`cycle_id`) REFERENCES `planning_cycles`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "plan_revisions_budget_check" CHECK("plan_revisions"."budget_sen" > 0),
	CONSTRAINT "plan_revisions_number_check" CHECK("plan_revisions"."revision_no" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_revisions_cycle_number_unique` ON `plan_revisions` (`cycle_id`,`revision_no`);--> statement-breakpoint
CREATE UNIQUE INDEX `plan_revisions_one_draft_unique` ON `plan_revisions` (`cycle_id`) WHERE "plan_revisions"."approved_at" is null and "plan_revisions"."deleted_at" is null;--> statement-breakpoint
CREATE TABLE `planning_cycles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`sync_status` text DEFAULT 'pending' NOT NULL,
	`start_date` text NOT NULL,
	`end_date_exclusive` text NOT NULL,
	`tracking_start_date` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	CONSTRAINT "planning_cycles_dates_check" CHECK("planning_cycles"."start_date" < "planning_cycles"."end_date_exclusive"),
	CONSTRAINT "planning_cycles_tracking_check" CHECK("planning_cycles"."start_date" <= "planning_cycles"."tracking_start_date" and "planning_cycles"."tracking_start_date" < "planning_cycles"."end_date_exclusive"),
	CONSTRAINT "planning_cycles_status_check" CHECK("planning_cycles"."status" in ('draft', 'active', 'completed', 'archived'))
);
--> statement-breakpoint
CREATE INDEX `planning_cycles_dates_idx` ON `planning_cycles` (`start_date`,`end_date_exclusive`);--> statement-breakpoint
CREATE TABLE `scheduled_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`sync_status` text DEFAULT 'pending' NOT NULL,
	`bill_id` text NOT NULL,
	`due_date` text NOT NULL,
	`amount_sen` integer NOT NULL,
	`status` text DEFAULT 'upcoming' NOT NULL,
	`transaction_id` text,
	FOREIGN KEY (`bill_id`) REFERENCES `bills`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "scheduled_items_amount_check" CHECK("scheduled_items"."amount_sen" > 0),
	CONSTRAINT "scheduled_items_status_check" CHECK("scheduled_items"."status" in ('upcoming', 'paid', 'skipped')),
	CONSTRAINT "scheduled_items_paid_check" CHECK(("scheduled_items"."status" = 'paid') = ("scheduled_items"."transaction_id" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scheduled_items_bill_date_unique` ON `scheduled_items` (`bill_id`,`due_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `scheduled_items_transaction_unique` ON `scheduled_items` (`transaction_id`);--> statement-breakpoint
CREATE INDEX `scheduled_items_due_date_idx` ON `scheduled_items` (`due_date`);--> statement-breakpoint
CREATE TABLE `sync_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transaction_edits` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`sync_status` text DEFAULT 'pending' NOT NULL,
	`transaction_id` text NOT NULL,
	`changed_at` text NOT NULL,
	`before` text NOT NULL,
	`after` text NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `transaction_edits_transaction_idx` ON `transaction_edits` (`transaction_id`);--> statement-breakpoint
CREATE TABLE `transaction_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`sync_status` text DEFAULT 'pending' NOT NULL,
	`transaction_id` text NOT NULL,
	`kind` text NOT NULL,
	`category_id` text,
	`debt_id` text,
	`amount_sen` integer NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`debt_id`) REFERENCES `debts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "transaction_lines_amount_check" CHECK("transaction_lines"."amount_sen" > 0),
	CONSTRAINT "transaction_lines_target_check" CHECK(("transaction_lines"."kind" = 'spending' and "transaction_lines"."category_id" is not null and "transaction_lines"."debt_id" is null)
       or ("transaction_lines"."kind" = 'debt' and "transaction_lines"."debt_id" is not null and "transaction_lines"."category_id" is null))
);
--> statement-breakpoint
CREATE INDEX `transaction_lines_transaction_idx` ON `transaction_lines` (`transaction_id`);--> statement-breakpoint
CREATE INDEX `transaction_lines_category_idx` ON `transaction_lines` (`category_id`);--> statement-breakpoint
CREATE INDEX `transaction_lines_debt_idx` ON `transaction_lines` (`debt_id`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`sync_status` text DEFAULT 'pending' NOT NULL,
	`type` text NOT NULL,
	`amount_sen` integer NOT NULL,
	`occurred_at` text NOT NULL,
	`local_date` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`refunds_transaction_id` text,
	`write_off_category_id` text,
	`is_estimate` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`refunds_transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`write_off_category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "transactions_amount_check" CHECK("transactions"."amount_sen" > 0),
	CONSTRAINT "transactions_type_check" CHECK("transactions"."type" in ('purchase', 'refund', 'transfer', 'borrow', 'lend', 'repayment_received', 'repayment_made', 'write_off', 'income')),
	CONSTRAINT "transactions_source_check" CHECK("transactions"."source" in ('manual', 'import')),
	CONSTRAINT "transactions_refund_link_check" CHECK(("transactions"."type" = 'refund') = ("transactions"."refunds_transaction_id" is not null))
);
--> statement-breakpoint
CREATE INDEX `transactions_local_date_idx` ON `transactions` (`local_date`);--> statement-breakpoint
CREATE TABLE `user_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`sync_status` text DEFAULT 'pending' NOT NULL,
	`time_zone` text NOT NULL,
	`week_start` integer DEFAULT 1 NOT NULL,
	`mascot_visible` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wallet_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`sync_status` text DEFAULT 'pending' NOT NULL,
	`checked_at` text NOT NULL,
	`local_date` text NOT NULL,
	`amount_sen` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	CONSTRAINT "wallet_checks_amount_check" CHECK("wallet_checks"."amount_sen" >= 0)
);
--> statement-breakpoint
CREATE INDEX `wallet_checks_checked_at_idx` ON `wallet_checks` (`checked_at`);