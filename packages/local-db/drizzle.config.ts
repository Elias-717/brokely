import { defineConfig } from "drizzle-kit";

/**
 * `pnpm --filter @brokely/local-db db:generate` writes SQL migrations to ./drizzle.
 * `driver: "expo"` also writes a migrations bundle the Expo app can import (Phase 3).
 */
export default defineConfig({
  dialect: "sqlite",
  driver: "expo",
  schema: "./src/schema.ts",
  out: "./drizzle",
});
