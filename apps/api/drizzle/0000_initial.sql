CREATE SCHEMA "brokely";
--> statement-breakpoint
CREATE SEQUENCE "brokely"."server_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "brokely"."allocations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"amount_sen" bigint NOT NULL,
	CONSTRAINT "allocations_amount_check" CHECK ("brokely"."allocations"."amount_sen" >= 0)
);
--> statement-breakpoint
ALTER TABLE "brokely"."allocations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "brokely"."bills" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_seq" bigint NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"amount_sen" bigint NOT NULL,
	"repeat_kind" text NOT NULL,
	"repeat_params" jsonb NOT NULL,
	"anchor_date" date NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "bills_amount_check" CHECK ("brokely"."bills"."amount_sen" > 0),
	CONSTRAINT "bills_repeat_kind_check" CHECK ("brokely"."bills"."repeat_kind" in ('daily', 'weekdays', 'every_n_days', 'every_n_weeks', 'monthly', 'once'))
);
--> statement-breakpoint
ALTER TABLE "brokely"."bills" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "brokely"."categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_seq" bigint NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"sort_order" integer NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "categories_kind_check" CHECK ("brokely"."categories"."kind" in ('essential', 'optional', 'set_aside'))
);
--> statement-breakpoint
ALTER TABLE "brokely"."categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "brokely"."day_check_ins" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_seq" bigint NOT NULL,
	"local_date" date NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brokely"."day_check_ins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "brokely"."debt_adjustments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_seq" bigint NOT NULL,
	"debt_id" uuid NOT NULL,
	"delta_sen" bigint NOT NULL,
	"reason" text NOT NULL,
	CONSTRAINT "debt_adjustments_delta_check" CHECK ("brokely"."debt_adjustments"."delta_sen" <> 0)
);
--> statement-breakpoint
ALTER TABLE "brokely"."debt_adjustments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "brokely"."debts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_seq" bigint NOT NULL,
	"direction" text NOT NULL,
	"counterparty" text NOT NULL,
	"due_date" date,
	"notes" text NOT NULL,
	CONSTRAINT "debts_direction_check" CHECK ("brokely"."debts"."direction" in ('owed_by_me', 'owed_to_me'))
);
--> statement-breakpoint
ALTER TABLE "brokely"."debts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "brokely"."plan_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_seq" bigint NOT NULL,
	"cycle_id" uuid NOT NULL,
	"revision_no" integer NOT NULL,
	"budget_sen" bigint NOT NULL,
	"approved_at" timestamp with time zone,
	"shortfall_acknowledged" boolean NOT NULL,
	CONSTRAINT "plan_revisions_budget_check" CHECK ("brokely"."plan_revisions"."budget_sen" > 0),
	CONSTRAINT "plan_revisions_number_check" CHECK ("brokely"."plan_revisions"."revision_no" >= 1)
);
--> statement-breakpoint
ALTER TABLE "brokely"."plan_revisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "brokely"."planning_cycles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_seq" bigint NOT NULL,
	"start_date" date NOT NULL,
	"end_date_exclusive" date NOT NULL,
	"tracking_start_date" date NOT NULL,
	"status" text NOT NULL,
	CONSTRAINT "planning_cycles_dates_check" CHECK ("brokely"."planning_cycles"."start_date" < "brokely"."planning_cycles"."end_date_exclusive"),
	CONSTRAINT "planning_cycles_tracking_check" CHECK ("brokely"."planning_cycles"."start_date" <= "brokely"."planning_cycles"."tracking_start_date" and "brokely"."planning_cycles"."tracking_start_date" < "brokely"."planning_cycles"."end_date_exclusive"),
	CONSTRAINT "planning_cycles_status_check" CHECK ("brokely"."planning_cycles"."status" in ('draft', 'active', 'completed', 'archived'))
);
--> statement-breakpoint
ALTER TABLE "brokely"."planning_cycles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "brokely"."processed_operations" (
	"user_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"result" jsonb NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processed_operations_user_id_operation_id_pk" PRIMARY KEY("user_id","operation_id")
);
--> statement-breakpoint
ALTER TABLE "brokely"."processed_operations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "brokely"."scheduled_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_seq" bigint NOT NULL,
	"bill_id" uuid NOT NULL,
	"due_date" date NOT NULL,
	"amount_sen" bigint NOT NULL,
	"status" text NOT NULL,
	"transaction_id" uuid,
	CONSTRAINT "scheduled_items_amount_check" CHECK ("brokely"."scheduled_items"."amount_sen" > 0),
	CONSTRAINT "scheduled_items_status_check" CHECK ("brokely"."scheduled_items"."status" in ('upcoming', 'paid', 'skipped')),
	CONSTRAINT "scheduled_items_paid_check" CHECK (("brokely"."scheduled_items"."status" = 'paid') = ("brokely"."scheduled_items"."transaction_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "brokely"."scheduled_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "brokely"."transaction_edits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_seq" bigint NOT NULL,
	"transaction_id" uuid NOT NULL,
	"changed_at" timestamp with time zone NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brokely"."transaction_edits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "brokely"."transaction_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"category_id" uuid,
	"debt_id" uuid,
	"amount_sen" bigint NOT NULL,
	CONSTRAINT "transaction_lines_amount_check" CHECK ("brokely"."transaction_lines"."amount_sen" > 0),
	CONSTRAINT "transaction_lines_target_check" CHECK (("brokely"."transaction_lines"."kind" = 'spending' and "brokely"."transaction_lines"."category_id" is not null and "brokely"."transaction_lines"."debt_id" is null)
         or ("brokely"."transaction_lines"."kind" = 'debt' and "brokely"."transaction_lines"."debt_id" is not null and "brokely"."transaction_lines"."category_id" is null))
);
--> statement-breakpoint
ALTER TABLE "brokely"."transaction_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "brokely"."transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_seq" bigint NOT NULL,
	"type" text NOT NULL,
	"amount_sen" bigint NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"local_date" date NOT NULL,
	"source" text NOT NULL,
	"note" text NOT NULL,
	"refunds_transaction_id" uuid,
	"write_off_category_id" uuid,
	"is_estimate" boolean NOT NULL,
	CONSTRAINT "transactions_amount_check" CHECK ("brokely"."transactions"."amount_sen" > 0),
	CONSTRAINT "transactions_type_check" CHECK ("brokely"."transactions"."type" in ('purchase', 'refund', 'transfer', 'borrow', 'lend', 'repayment_received', 'repayment_made', 'write_off', 'income')),
	CONSTRAINT "transactions_source_check" CHECK ("brokely"."transactions"."source" in ('manual', 'import')),
	CONSTRAINT "transactions_refund_link_check" CHECK (("brokely"."transactions"."type" = 'refund') = ("brokely"."transactions"."refunds_transaction_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "brokely"."transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "brokely"."user_settings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_seq" bigint NOT NULL,
	"time_zone" text NOT NULL,
	"week_start" integer NOT NULL,
	"mascot_visible" boolean NOT NULL,
	CONSTRAINT "user_settings_week_start_check" CHECK ("brokely"."user_settings"."week_start" between 0 and 6)
);
--> statement-breakpoint
ALTER TABLE "brokely"."user_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "brokely"."wallet_checks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_seq" bigint NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"local_date" date NOT NULL,
	"amount_sen" bigint NOT NULL,
	"note" text NOT NULL,
	CONSTRAINT "wallet_checks_amount_check" CHECK ("brokely"."wallet_checks"."amount_sen" >= 0)
);
--> statement-breakpoint
ALTER TABLE "brokely"."wallet_checks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "brokely"."allocations" ADD CONSTRAINT "allocations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brokely"."allocations" ADD CONSTRAINT "allocations_revision_id_plan_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "brokely"."plan_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brokely"."allocations" ADD CONSTRAINT "allocations_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "brokely"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brokely"."bills" ADD CONSTRAINT "bills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brokely"."bills" ADD CONSTRAINT "bills_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "brokely"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brokely"."categories" ADD CONSTRAINT "categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brokely"."day_check_ins" ADD CONSTRAINT "day_check_ins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brokely"."debt_adjustments" ADD CONSTRAINT "debt_adjustments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brokely"."debt_adjustments" ADD CONSTRAINT "debt_adjustments_debt_id_debts_id_fk" FOREIGN KEY ("debt_id") REFERENCES "brokely"."debts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brokely"."debts" ADD CONSTRAINT "debts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brokely"."plan_revisions" ADD CONSTRAINT "plan_revisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brokely"."plan_revisions" ADD CONSTRAINT "plan_revisions_cycle_id_planning_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "brokely"."planning_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brokely"."planning_cycles" ADD CONSTRAINT "planning_cycles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brokely"."processed_operations" ADD CONSTRAINT "processed_operations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brokely"."scheduled_items" ADD CONSTRAINT "scheduled_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brokely"."scheduled_items" ADD CONSTRAINT "scheduled_items_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "brokely"."bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brokely"."scheduled_items" ADD CONSTRAINT "scheduled_items_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "brokely"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brokely"."transaction_edits" ADD CONSTRAINT "transaction_edits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brokely"."transaction_edits" ADD CONSTRAINT "transaction_edits_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "brokely"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brokely"."transaction_lines" ADD CONSTRAINT "transaction_lines_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brokely"."transaction_lines" ADD CONSTRAINT "transaction_lines_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "brokely"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brokely"."transaction_lines" ADD CONSTRAINT "transaction_lines_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "brokely"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brokely"."transaction_lines" ADD CONSTRAINT "transaction_lines_debt_id_debts_id_fk" FOREIGN KEY ("debt_id") REFERENCES "brokely"."debts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brokely"."transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brokely"."transactions" ADD CONSTRAINT "transactions_refunds_transaction_id_transactions_id_fk" FOREIGN KEY ("refunds_transaction_id") REFERENCES "brokely"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brokely"."transactions" ADD CONSTRAINT "transactions_write_off_category_id_categories_id_fk" FOREIGN KEY ("write_off_category_id") REFERENCES "brokely"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brokely"."user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brokely"."wallet_checks" ADD CONSTRAINT "wallet_checks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "allocations_revision_category_unique" ON "brokely"."allocations" USING btree ("revision_id","category_id");--> statement-breakpoint
CREATE INDEX "allocations_category_idx" ON "brokely"."allocations" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "bills_seq_idx" ON "brokely"."bills" USING btree ("user_id","server_seq");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_live_name_unique" ON "brokely"."categories" USING btree ("user_id","name") WHERE "brokely"."categories"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "categories_seq_idx" ON "brokely"."categories" USING btree ("user_id","server_seq");--> statement-breakpoint
CREATE UNIQUE INDEX "day_check_ins_live_date_unique" ON "brokely"."day_check_ins" USING btree ("user_id","local_date") WHERE "brokely"."day_check_ins"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "day_check_ins_seq_idx" ON "brokely"."day_check_ins" USING btree ("user_id","server_seq");--> statement-breakpoint
CREATE INDEX "debt_adjustments_debt_idx" ON "brokely"."debt_adjustments" USING btree ("debt_id");--> statement-breakpoint
CREATE INDEX "debt_adjustments_seq_idx" ON "brokely"."debt_adjustments" USING btree ("user_id","server_seq");--> statement-breakpoint
CREATE INDEX "debts_seq_idx" ON "brokely"."debts" USING btree ("user_id","server_seq");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_revisions_cycle_number_unique" ON "brokely"."plan_revisions" USING btree ("cycle_id","revision_no");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_revisions_one_draft_unique" ON "brokely"."plan_revisions" USING btree ("cycle_id") WHERE "brokely"."plan_revisions"."approved_at" is null and "brokely"."plan_revisions"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "plan_revisions_seq_idx" ON "brokely"."plan_revisions" USING btree ("user_id","server_seq");--> statement-breakpoint
CREATE INDEX "planning_cycles_seq_idx" ON "brokely"."planning_cycles" USING btree ("user_id","server_seq");--> statement-breakpoint
CREATE UNIQUE INDEX "scheduled_items_bill_date_unique" ON "brokely"."scheduled_items" USING btree ("bill_id","due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "scheduled_items_transaction_unique" ON "brokely"."scheduled_items" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "scheduled_items_seq_idx" ON "brokely"."scheduled_items" USING btree ("user_id","server_seq");--> statement-breakpoint
CREATE INDEX "transaction_edits_transaction_idx" ON "brokely"."transaction_edits" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "transaction_edits_seq_idx" ON "brokely"."transaction_edits" USING btree ("user_id","server_seq");--> statement-breakpoint
CREATE INDEX "transaction_lines_transaction_idx" ON "brokely"."transaction_lines" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "transaction_lines_category_idx" ON "brokely"."transaction_lines" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "transaction_lines_debt_idx" ON "brokely"."transaction_lines" USING btree ("debt_id");--> statement-breakpoint
CREATE INDEX "transactions_refunds_idx" ON "brokely"."transactions" USING btree ("refunds_transaction_id");--> statement-breakpoint
CREATE INDEX "transactions_seq_idx" ON "brokely"."transactions" USING btree ("user_id","server_seq");--> statement-breakpoint
CREATE UNIQUE INDEX "user_settings_live_user_unique" ON "brokely"."user_settings" USING btree ("user_id") WHERE "brokely"."user_settings"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "user_settings_seq_idx" ON "brokely"."user_settings" USING btree ("user_id","server_seq");--> statement-breakpoint
CREATE INDEX "wallet_checks_seq_idx" ON "brokely"."wallet_checks" USING btree ("user_id","server_seq");