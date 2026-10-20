import {
  AccountMismatchError,
  deviceIdOf,
  latestChangeAt,
  linkedAccount,
  syncCounts,
  syncNow,
  type SyncReport,
} from "@brokely/local-db";
import type { Session } from "@supabase/supabase-js";
import { addDatabaseChangeListener } from "expo-sqlite";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import { db, repo } from "../db/client";
import { useRead } from "../db/use-read";
import { supabase } from "./auth";
import { available } from "./session-storage";
import { apiTransport, OfflineError, SignedOutError } from "./transport";

/**
 * When the phone syncs (sync-api §7): after signing in, when the app opens or comes back to the
 * front, 5 seconds after the last change, and every 15 minutes while open. One sync at a time;
 * after a failure it waits 5 s, 15 s, 1 min, 5 min, then every 15 min (with a little jitter), and
 * starts over after a success. Signed out or local-only (D-05): it does nothing and the changes
 * wait safely in the outbox.
 */

export type SyncStatus = "signed-out" | "idle" | "syncing" | "offline" | "error";

interface SyncContextValue {
  /** This build can keep a session safely (expo-secure-store is in it). */
  readonly canSignIn: boolean;
  readonly session: Session | null;
  /** The phone's records belong to this session's account. */
  readonly linked: boolean;
  readonly status: SyncStatus;
  readonly lastSyncedAt: Date | null;
  /** Changes not yet on the server, and ones that need the student (FR-SYNC-06). */
  readonly waiting: number;
  readonly needsAttention: number;
  /** Syncs now. `firstLink` lets the sign-in screen link a phone that isn't linked yet. */
  readonly sync: (options?: { firstLink?: boolean }) => Promise<SyncReport | null>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

const AFTER_CHANGE_MS = 5_000;
const EVERY_MS = 15 * 60_000;
const BACK_OFF_MS = [5_000, 15_000, 60_000, 5 * 60_000, 15 * 60_000];

export function SyncProvider({ children }: { children: ReactNode }) {
  const [canSignIn, setCanSignIn] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<SyncStatus>("signed-out");
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const counts = useRead(syncCounts);
  const linkedTo = useRead(linkedAccount);
  const linked = session !== null && linkedTo === session.user.id;

  const running = useRef(false);
  const startedAt = useRef("");
  const failures = useRef(0);
  const retry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;

  const sync = useCallback(async (options: { firstLink?: boolean } = {}) => {
    // Right after signing in, the new session may not have reached state yet: ask for it.
    const current = sessionRef.current ?? (await supabase.auth.getSession()).data.session;
    if (!current || running.current) return null;
    // Linking is the sign-in screen's job (D-73): never link from a background trigger.
    if (!options.firstLink && linkedAccount(db) !== current.user.id) return null;
    running.current = true;
    startedAt.current = new Date().toISOString();
    clearTimeout(retry.current);
    setStatus("syncing");
    try {
      const report = await syncNow(repo, apiTransport, {
        userId: current.user.id,
        deviceId: deviceIdOf(repo),
      });
      failures.current = 0;
      setLastSyncedAt(new Date());
      setStatus("idle");
      return report;
    } catch (error) {
      if (error instanceof SignedOutError) {
        setStatus("signed-out");
        return null;
      }
      if (error instanceof AccountMismatchError) throw error; // the sign-in screen handles it
      setStatus(error instanceof OfflineError ? "offline" : "error");
      const wait = BACK_OFF_MS[Math.min(failures.current, BACK_OFF_MS.length - 1)]!;
      failures.current++;
      retry.current = setTimeout(() => void sync(), wait * (0.8 + Math.random() * 0.4));
      return null;
    } finally {
      running.current = false;
    }
  }, []);

  // The session: read once at start, then follow sign-in, sign-out and renewals.
  useEffect(() => {
    void available().then(setCanSignIn);
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  // Signed in (or app start with a session): sync once.
  useEffect(() => {
    if (!session) {
      setStatus("signed-out");
      return;
    }
    setStatus("idle");
    void sync();
  }, [session?.user.id, sync]);

  // Back to the front: renew tokens and sync; in the background: stop renewing (saves battery).
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        supabase.auth.startAutoRefresh();
        void sync();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    });
    return () => subscription.remove();
  }, [sync]);

  // 5 seconds after the last change made since the last sync started.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const subscription = addDatabaseChangeListener(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const newest = latestChangeAt(db);
        if (newest && newest > startedAt.current) void sync();
      }, AFTER_CHANGE_MS);
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [sync]);

  // Every 15 minutes while the app is open.
  useEffect(() => {
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void sync();
    }, EVERY_MS);
    return () => clearInterval(timer);
  }, [sync]);

  return (
    <SyncContext.Provider
      value={{
        canSignIn,
        session,
        linked,
        status: session ? status : "signed-out",
        lastSyncedAt,
        waiting: counts.waiting,
        needsAttention: counts.needsAttention,
        sync,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync(): SyncContextValue {
  const value = useContext(SyncContext);
  if (!value) throw new Error("useSync needs <SyncProvider>");
  return value;
}
