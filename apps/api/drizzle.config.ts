import { defineConfig } from "drizzle-kit";

/**
 * `pnpm --filter @brokely/api db:generate` writes SQL migrations to ./drizzle.
 * They are applied to Supabase as Supabase migrations (same SQL, same order); tests apply them
 * to an in-memory PGlite database (src/db/test-db.ts).
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  schemaFilter: ["brokely"],
});
