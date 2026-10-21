import {
  accountPlans,
  archiveAccountPlans,
  deviceIdOf,
  summarizeChanges,
  type PlanCard,
  type RecordSummary,
  type SyncTransport,
} from "@brokely/local-db";
import {
  MAX_PULL_LIMIT,
  type PullChange,
  type PullResponse,
  type PushResponse,
} from "@brokely/contracts";
import { repo } from "../db/client";
import { supabase } from "./auth";
import { SYNC_API_URL } from "./config";

/** No connection, or the server didn't answer: try again later (sync-api §7 back-off). */
export class OfflineError extends Error {
  constructor() {
    super("No connection to the sync server");
    this.name = "OfflineError";
  }
}

/** The server answered with an error of its own (5xx): it's on our side, retried later. */
export class ServerError extends Error {
  constructor(readonly status: number) {
    super(`The sync server had a problem (${status})`);
    this.name = "ServerError";
  }
}

/** The session is gone or was refused: the student needs to sign in again. */
export class SignedOutError extends Error {
  constructor() {
    super("Signed out");
    this.name = "SignedOutError";
  }
}

async function call<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  // getSession renews an expired access token with the refresh token when it can.
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new SignedOutError();
  let response: Response;
  try {
    response = await fetch(`${SYNC_API_URL}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${token}`,
        // Only with a body: the server refuses "JSON" with nothing in it (400), e.g. a DELETE.
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
    });
  } catch (error) {
    console.warn("[sync]", path.split("?")[0], (error as Error).message);
    throw new OfflineError();
  }
  if (response.status === 401) {
    // An access token can expire between reading and sending: renew once, then give up.
    if (!retried && !(await supabase.auth.refreshSession()).error) return call(path, init, true);
    throw new SignedOutError();
  }
  if (response.status === 429) throw new OfflineError();
  if (response.status >= 500) {
    console.warn("[sync]", path.split("?")[0], "server error", response.status);
    throw new ServerError(response.status);
  }
  if (!response.ok) throw new Error(`Sync request refused (${response.status})`);
  if (response.status === 204) return undefined as T; // done, nothing to read
  return (await response.json()) as T;
}

/** The live sync API (POST /v1/sync/push, GET /v1/sync/pull) with the student's token. */
export const apiTransport: SyncTransport = {
  push: (request) =>
    call<PushResponse>("/v1/sync/push", { method: "POST", body: JSON.stringify(request) }),
  pull: (since, limit) => call<PullResponse>(`/v1/sync/pull?since=${since}&limit=${limit}`),
};

/**
 * Deletes the student's account and everything backed up with it (FR-ACC-07). The server takes
 * who it is from the sign-in token. Needs a connection; throws OfflineError without one.
 */
export async function deleteAccountOnServer(): Promise<void> {
  await call<void>("/v1/account", { method: "DELETE" });
}

/** Whether the account already has records on the server (D-73 b): one change is enough. */
export async function accountHasRecords(): Promise<boolean> {
  return (await apiTransport.pull(0, 1)).changes.length > 0;
}

/**
 * What the account holds (D-73 b, S13d) and its plans (D-83, S13l): every page of the account's
 * changes, counted. Read only; nothing is written to this phone until the student chooses.
 */
export async function accountSummary(): Promise<{ summary: RecordSummary; plans: PlanCard[] }> {
  const changes: PullChange[] = [];
  let since = 0;
  for (;;) {
    const page = await apiTransport.pull(since, MAX_PULL_LIMIT);
    changes.push(...page.changes);
    since = page.nextSince;
    if (!page.hasMore) break;
  }
  return { summary: summarizeChanges(changes), plans: accountPlans(changes) };
}

/** "Keep this phone's plan" (D-83): archives the account's clashing plans on the server. */
export function archiveOnServer(plans: readonly PlanCard[]): Promise<void> {
  return archiveAccountPlans(repo, apiTransport, deviceIdOf(repo), plans);
}
