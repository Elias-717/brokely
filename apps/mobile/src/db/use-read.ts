import { addDatabaseChangeListener } from "expo-sqlite";
import { useEffect, useMemo, useState } from "react";
import { db } from "./client";

type Db = typeof db;

/**
 * Runs a read against the phone database and runs it again after any change to the database,
 * so screens show a saved record straight away. Reads are synchronous and small (one student's
 * data), so they run during render.
 */
export function useRead<T>(read: (db: Db) => T, deps: readonly unknown[] = []): T {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const subscription = addDatabaseChangeListener(() => setVersion((v) => v + 1));
    return () => subscription.remove();
  }, []);
  // `read` is a new function every render, so only the change counter and `deps` re-run it.
  return useMemo(() => read(db), [version, ...deps]);
}
