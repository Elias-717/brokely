// Hand-written types for the generated migrations.js (drizzle-kit does not emit them).
// Used by the app with `migrate()` / `useMigrations()` from drizzle-orm/expo-sqlite/migrator.
declare const migrations: {
  journal: { entries: { idx: number; when: number; tag: string; breakpoints: boolean }[] };
  migrations: Record<string, string>;
};
export default migrations;
