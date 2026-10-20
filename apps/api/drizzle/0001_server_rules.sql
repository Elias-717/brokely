-- Rules Drizzle can't express (hand-written; keep in step with src/db/schema.ts).

-- No two active or completed cycles of one student share a date (BR-05, D-18, FR-PLN-03).
-- Drafts, archived and deleted cycles may overlap. btree_gist lets uuid equality join a GiST index.
CREATE SCHEMA IF NOT EXISTS extensions;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;--> statement-breakpoint
ALTER TABLE "brokely"."planning_cycles"
  ADD CONSTRAINT "planning_cycles_no_overlap"
  EXCLUDE USING gist ("user_id" WITH =, daterange("start_date", "end_date_exclusive") WITH &&)
  WHERE ("status" IN ('active', 'completed') AND "deleted_at" IS NULL);--> statement-breakpoint

-- The sync API is the only way in (S-09). Supabase's Data API roles get nothing here, and
-- row-level security (enabled on every table, no policies) refuses them even if granted later.
REVOKE ALL ON SCHEMA "brokely" FROM anon, authenticated;
