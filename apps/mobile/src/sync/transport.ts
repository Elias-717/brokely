import type { SyncTransport } from "@brokely/local-db";
import type { PullResponse, PushResponse } from "@brokely/contracts";
import { supabase } from "./auth";
import { SYNC_API_URL } from "./config";

/** No connection, or the server didn't answer: try again later (sync-api §7 back-off). */
export class OfflineError extends Error {
  constructor() {
    super("No connection to the sync server");
    this.name = "OfflineError";
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
        "Content-Type": "application/json",
      },
    });
  } catch {
    throw new OfflineError();
  }
  if (response.status === 401) {
    // An access token can expire between reading and sending: renew once, then give up.
    if (!retried && !(await supabase.auth.refreshSession()).error) return call(path, init, true);
    throw new SignedOutError();
  }
  if (response.status === 429 || response.status >= 500) throw new OfflineError();
  if (!response.ok) throw new Error(`Sync request refused (${response.status})`);
  return (await response.json()) as T;
}

/** The live sync API (POST /v1/sync/push, GET /v1/sync/pull) with the student's token. */
export const apiTransport: SyncTransport = {
  push: (request) =>
    call<PushResponse>("/v1/sync/push", { method: "POST", body: JSON.stringify(request) }),
  pull: (since, limit) => call<PullResponse>(`/v1/sync/pull?since=${since}&limit=${limit}`),
};

/** Whether the account already has records on the server (D-73 b): one change is enough. */
export async function accountHasRecords(): Promise<boolean> {
  return (await apiTransport.pull(0, 1)).changes.length > 0;
}
