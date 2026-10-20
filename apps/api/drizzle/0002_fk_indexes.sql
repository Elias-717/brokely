CREATE INDEX "allocations_user_idx" ON "brokely"."allocations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bills_category_idx" ON "brokely"."bills" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "transaction_lines_user_idx" ON "brokely"."transaction_lines" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transactions_write_off_category_idx" ON "brokely"."transactions" USING btree ("write_off_category_id");