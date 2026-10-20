import { buildApp } from "./app";
import { supabaseVerifier } from "./auth";
import { connect } from "./db/client";

/**
 * Starts the sync API (Azure Container Apps, D-71). Settings come from the environment, never
 * from the repo: DATABASE_URL (Supabase pooler URL, a secret), SUPABASE_URL (public), PORT.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const { db } = connect(required("DATABASE_URL"));
const app = buildApp(
  { db, verifyToken: supabaseVerifier(required("SUPABASE_URL")) },
  { logger: true },
);
const port = Number(process.env.PORT ?? 3000);

app.listen({ port, host: "0.0.0.0" }).catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
