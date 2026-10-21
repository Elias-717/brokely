import {
  MAX_OPERATIONS_PER_PUSH,
  MAX_PULL_LIMIT,
  type EntityName,
  type PullChange,
  type PullResponse,
  type PushOperation,
  type PushRequest,
  type PushResponse,
  type PushResult,
} from "@brokely/contracts";
import { and, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import type { Db, RepoContext } from "../repositories/context";
import {
  allocations,
  bills,
  categories,
  dayCheckIns,
  debts,
  outboxOperations,
  planningCycles,
  syncState,
  transactionLines,
  transactions,
  walletChecks,
  type OUTBOX_STATUSES,
} from "../schema";
import { columnsOf, entityTables, partsOf, partTables } from "./tables";

/**
 * The phone's side of sync (docs/design/sync-api.md §5, §7, §8): push the outbox, then pull.
 * The network is injected (`SyncTransport`), so the same code runs on the phone and in tests
 * against the real API.
 */

export interface SyncTransport {
  push(request: PushRequest): Promise<PushResponse>;
  pull(since: number, limit: number): Promise<PullResponse>;
}

export interface SyncReport {
  /** Operations the server applied (or already had). */
  readonly pushed: number;
  /** Operations based on an out-of-date copy, still waiting for the student (FR-SYNC-08). */
  readonly conflicts: number;
  /** Operations the server refused for a rule, still waiting for the student. */
  readonly failed: number;
  /** Changes from the server written on this phone. */
  readonly pulled: number;
}

export const SYNC_KEYS = {
  cursor: "pull_cursor",
  account: "account_id",
  device: "device_id",
} as const;

/** Raised when the phone is linked to another account than the one signing in. */
export class AccountMismatchError extends Error {
  constructor() {
    super("This phone's records belong to another account");
    this.name = "AccountMismatchError";
  }
}

/**
 * One sync (sync-api §7): link the account if needed, push until the outbox has nothing more
 * to send, then pull everything new. Throws on network or sign-in errors; whatever was done
 * before the error is kept, so the next run continues from there.
 */
export async function syncNow(
  ctx: RepoContext,
  transport: SyncTransport,
  account: { userId: string; deviceId: string },
): Promise<SyncReport> {
  linkAccount(ctx.db, account.userId);
  let { pushed } = await pushAll(ctx, transport, account.deviceId);
  const pulled = await pullAll(ctx, transport, account.userId);
  // A pull can unblock waiting changes (a category merged into the account's): send them now.
  if (pulled > 0 && nextBatch(ctx.db).length > 0) {
    pushed += (await pushAll(ctx, transport, account.deviceId)).pushed;
  }
  const stuck = ctx.db.select({ status: outboxOperations.status }).from(outboxOperations).all();
  return {
    pushed,
    conflicts: stuck.filter((op) => op.status === "conflict").length,
    failed: stuck.filter((op) => op.status === "failed").length,
    pulled,
  };
}

// ── Account linking (sync-api §8, FR-ACC-03) ────────────────────────────────

/** The account this phone's records belong to, or undefined in local-only mode (D-05). */
export function linkedAccount(db: Db): string | undefined {
  return readState(db, SYNC_KEYS.account);
}

/** This install's ID for push requests; made once, forgotten with the phone's data. */
export function deviceIdOf(ctx: RepoContext): string {
  const known = readState(ctx.db, SYNC_KEYS.device);
  if (known) return known;
  const id = ctx.newId();
  writeState(ctx.db, SYNC_KEYS.device, id);
  return id;
}

/** Changes not yet on the server, and ones that need the student (FR-SYNC-06). */
export function syncCounts(db: Db): { waiting: number; needsAttention: number } {
  const ops = db.select({ status: outboxOperations.status }).from(outboxOperations).all();
  return {
    waiting: ops.length,
    needsAttention: ops.filter((op) => op.status !== "pending").length,
  };
}

// ── Conflicts (FR-SYNC-08, AC-21) ───────────────────────────────────────────

/** A change refused because the record changed on another phone first. */
export interface Conflict {
  readonly operationId: string;
  readonly entity: EntityName;
  readonly entityId: string;
  /** This phone's change as it would be sent; null when it deletes the record. */
  readonly mine: Record<string, unknown> | null;
  /** The server's latest copy; null when the record was deleted there. */
  readonly latest: Record<string, unknown> | null;
  readonly latestVersion: number;
}

type ServerRow = Extract<PushResult, { status: "conflict" }>["current"];

function serverRowOf(op: OutboxRow): ServerRow | null {
  try {
    return op.lastError ? (JSON.parse(op.lastError) as ServerRow) : null;
  } catch {
    return null;
  }
}

/** Every waiting conflict, oldest first, with both versions side by side. */
export function listConflicts(db: Db): Conflict[] {
  return db
    .select()
    .from(outboxOperations)
    .where(eq(outboxOperations.status, "conflict"))
    .orderBy(sql`rowid`)
    .all()
    .flatMap((op) => {
      const current = serverRowOf(op);
      if (!current) return [];
      return [
        {
          operationId: op.operationId,
          entity: op.entity as EntityName,
          entityId: op.entityId,
          mine: op.op === "delete" ? null : ((op.payload ?? {}) as Record<string, unknown>),
          latest: current.deletedAt ? null : (current.data ?? null),
          latestVersion: current.version,
        },
      ];
    });
}

/**
 * The student's choice for one conflict (FR-SYNC-08). Nothing is lost until they choose:
 * - `mine`: the change is sent again, now based on the latest version, so it replaces it on
 *   every phone (an upsert also brings back a record deleted elsewhere, S-07);
 * - `latest`: this phone's waiting changes to the record are dropped and the server's copy is
 *   written here, exactly as a pull would.
 * Returns false when there is no such conflict (already resolved).
 */
export function resolveConflict(ctx: RepoContext, operationId: string, keep: "mine" | "latest") {
  return ctx.db.transaction((tx) => {
    const op = tx
      .select()
      .from(outboxOperations)
      .where(
        and(eq(outboxOperations.operationId, operationId), eq(outboxOperations.status, "conflict")),
      )
      .get();
    const current = op ? serverRowOf(op) : null;
    if (!op || !current) return false;
    const entity = op.entity as EntityName;
    const table = entityTables[entity];

    if (keep === "mine") {
      tx.update(outboxOperations)
        .set({ status: "pending", baseVersion: current.version, lastError: null })
        .where(eq(outboxOperations.operationId, operationId))
        .run();
      tx.update(table).set({ syncStatus: "pending" }).where(eq(table.id, op.entityId)).run();
      return true;
    }

    tx.delete(outboxOperations)
      .where(
        and(eq(outboxOperations.entity, op.entity), eq(outboxOperations.entityId, op.entityId)),
      )
      .run();
    const local = tx.select().from(table).where(eq(table.id, op.entityId)).get();
    const userId = readState(tx, SYNC_KEYS.account) ?? local?.userId ?? "";
    tx.run(sql`PRAGMA defer_foreign_keys = ON`);
    applyChange(tx, { ...current, entity } as PullChange, userId, ctx.now());
    return true;
  });
}

/**
 * When the newest change still waiting to be sent was made. The app syncs a few seconds after a
 * change newer than its last sync, so a sync's own writes never start another (sync-api §7).
 */
export function latestChangeAt(db: Db): string | undefined {
  return db
    .select({ at: outboxOperations.createdAt })
    .from(outboxOperations)
    .where(eq(outboxOperations.status, "pending"))
    .orderBy(sql`created_at desc`)
    .limit(1)
    .get()?.at;
}

/**
 * Whether the student has made anything beyond the untouched first-run setup (default
 * categories): a plan, a record, a debt, a bill, a check-in or a wallet check (D-73 b).
 */
export function hasOwnRecords(db: Db): boolean {
  return [planningCycles, transactions, debts, bills, dayCheckIns, walletChecks].some(
    (table) => db.select({ id: table.id }).from(table).limit(1).get() !== undefined,
  );
}

/**
 * What signing in should do on this phone (D-73):
 * - `sync`: the phone is this account's, or the account has nothing yet: sync as usual;
 * - `replace`: the account has records and the phone only has the first-run setup: erase the
 *   phone, then download the account's records;
 * - `ask`: both have records: the student chooses (use the account's, or add this phone's);
 * - `other-account`: the phone holds another account's records: never mixed.
 */
export type SignInStep = "sync" | "replace" | "ask" | "other-account";

export function signInStep(db: Db, userId: string, accountHasRecords: boolean): SignInStep {
  const linked = linkedAccount(db);
  if (linked !== undefined) return linked === userId ? "sync" : "other-account";
  if (!accountHasRecords) return "sync";
  return hasOwnRecords(db) ? "ask" : "replace";
}

/**
 * The first sign-in claims this phone's records for the account. The outbox already holds
 * every change since install, in order, so the normal push replays them; IDs never change, so
 * a retry is a duplicate, never a copy (AC-22).
 */
export function linkAccount(db: Db, userId: string): void {
  db.transaction((tx) => {
    const linked = readState(tx, SYNC_KEYS.account);
    if (linked === userId) return;
    if (linked !== undefined) throw new AccountMismatchError();
    for (const table of Object.values(entityTables)) {
      tx.update(table).set({ userId }).where(isNull(table.userId)).run();
    }
    for (const { table } of Object.values(partTables)) {
      tx.update(table).set({ userId }).where(isNull(table.userId)).run();
    }
    writeState(tx, SYNC_KEYS.account, userId);
  });
}

// ── Push ────────────────────────────────────────────────────────────────────

type OutboxRow = typeof outboxOperations.$inferSelect;
type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

/**
 * The next batch: the oldest waiting operation of each record, in outbox order. A record whose
 * oldest operation is stuck (conflict or failed) sends nothing until the student resolves it;
 * its later edits would only conflict too.
 */
function nextBatch(db: Db): OutboxRow[] {
  const all = db
    .select()
    .from(outboxOperations)
    .orderBy(sql`rowid`)
    .all();
  const seen = new Set<string>();
  const batch: OutboxRow[] = [];
  for (const op of all) {
    const key = `${op.entity}:${op.entityId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (op.status === "pending") batch.push(op);
    if (batch.length === MAX_OPERATIONS_PER_PUSH) break;
  }
  return batch;
}

function toPushOperation(op: OutboxRow): PushOperation {
  return op.op === "delete"
    ? {
        operationId: op.operationId,
        entity: op.entity as EntityName,
        entityId: op.entityId,
        op: "delete",
        baseVersion: op.baseVersion!,
      }
    : ({
        operationId: op.operationId,
        entity: op.entity,
        entityId: op.entityId,
        op: "upsert",
        baseVersion: op.baseVersion,
        data: op.payload,
      } as PushOperation);
}

async function pushAll(ctx: RepoContext, transport: SyncTransport, deviceId: string) {
  let pushed = 0;
  let conflicts = 0;
  let failed = 0;
  let sent = new Set<string>();
  for (;;) {
    const batch = nextBatch(ctx.db);
    // Stop when nothing new can be sent: an empty outbox, or only operations that already
    // came back REFERENCE_MISSING with nothing applied since (they wait for the next sync).
    if (batch.length === 0 || batch.every((op) => sent.has(op.operationId))) break;
    const { results } = await transport.push({ deviceId, operations: batch.map(toPushOperation) });
    const progress = ctx.db.transaction((tx) => {
      let applied = 0;
      batch.forEach((op, i) => {
        const outcome = applyResult(tx, op, results[i]);
        if (outcome === "done") applied++;
        if (outcome === "conflict") conflicts++;
        if (outcome === "failed") failed++;
      });
      return applied;
    });
    pushed += progress;
    sent = progress > 0 ? new Set() : new Set([...sent, ...batch.map((op) => op.operationId)]);
  }
  return { pushed, conflicts, failed };
}

type Outcome = "done" | "conflict" | "failed" | "retry";

function applyResult(tx: Db, op: OutboxRow, result: PushResult | undefined): Outcome {
  if (!result || result.operationId !== op.operationId) return "retry"; // never guess
  const entity = op.entity as EntityName;
  const table = entityTables[entity];

  if (result.status === "applied" || result.status === "duplicate") {
    tx.delete(outboxOperations).where(eq(outboxOperations.operationId, op.operationId)).run();
    // Later edits of the record were queued against the old version: move them onto the new one.
    tx.update(outboxOperations)
      .set({ baseVersion: result.version })
      .where(
        and(
          eq(outboxOperations.entity, op.entity),
          eq(outboxOperations.entityId, op.entityId),
          isNotNull(outboxOperations.baseVersion),
        ),
      )
      .run();
    let entityId = op.entityId;
    // S-06: the server already had this day's check-in (or settings) under another ID.
    if (result.status === "duplicate" && result.entityId && result.entityId !== op.entityId) {
      entityId = result.entityId;
      adoptServerId(tx, entity, op.entityId, entityId);
    }
    const waiting = tx
      .select({ id: outboxOperations.operationId })
      .from(outboxOperations)
      .where(and(eq(outboxOperations.entity, op.entity), eq(outboxOperations.entityId, entityId)))
      .get();
    tx.update(table)
      .set({ version: result.version, syncStatus: waiting ? "pending" : "synced" })
      .where(eq(table.id, entityId))
      .run();
    markParts(tx, entity, entityId, waiting ? "pending" : "synced");
    return "done";
  }

  if (result.status === "rejected" && result.error.code === "REFERENCE_MISSING") {
    // Its parent is still on the way (or waiting itself); try again on the next round.
    tx.update(outboxOperations)
      .set({ attempts: op.attempts + 1, lastError: result.error.message })
      .where(eq(outboxOperations.operationId, op.operationId))
      .run();
    return "retry";
  }

  const status: OutboxStatus = result.status === "conflict" ? "conflict" : "failed";
  tx.update(outboxOperations)
    .set({
      status,
      attempts: op.attempts + 1,
      // A conflict keeps the server's current row for the re-apply screen (FR-SYNC-08).
      lastError:
        result.status === "conflict"
          ? JSON.stringify(result.current)
          : `${result.error.code}: ${result.error.message}`,
    })
    .where(eq(outboxOperations.operationId, op.operationId))
    .run();
  tx.update(table).set({ syncStatus: status }).where(eq(table.id, op.entityId)).run();
  return status;
}

/** S-06 merge: the record becomes the server's copy. Check-ins and settings have no children. */
function adoptServerId(tx: Db, entity: EntityName, localId: string, serverId: string) {
  const table = entityTables[entity];
  const already = tx.select({ id: table.id }).from(table).where(eq(table.id, serverId)).get();
  if (already) tx.delete(table).where(eq(table.id, localId)).run();
  else tx.update(table).set({ id: serverId }).where(eq(table.id, localId)).run();
  tx.update(outboxOperations)
    .set({ entityId: serverId })
    .where(and(eq(outboxOperations.entity, entity), eq(outboxOperations.entityId, localId)))
    .run();
}

function markParts(tx: Db, entity: EntityName, parentId: string, syncStatus: "pending" | "synced") {
  const part = partTables[entity as keyof typeof partTables];
  if (!part) return;
  tx.update(part.table).set({ syncStatus }).where(eq(part.parentColumn, parentId)).run();
}

// ── Pull ────────────────────────────────────────────────────────────────────

async function pullAll(ctx: RepoContext, transport: SyncTransport, userId: string) {
  let since = Number(readState(ctx.db, SYNC_KEYS.cursor) ?? 0);
  const changes: PullChange[] = [];
  for (;;) {
    const page = await transport.pull(since, MAX_PULL_LIMIT);
    changes.push(...page.changes);
    since = page.nextSince;
    if (!page.hasMore) break;
  }
  if (changes.length === 0) return 0;

  // One transaction for everything, foreign keys checked at the end: a record can arrive before
  // a parent that was edited later (each row carries its newest server_seq).
  return ctx.db.transaction((tx) => {
    tx.run(sql`PRAGMA defer_foreign_keys = ON`);
    let written = 0;
    for (const change of changes) {
      if (applyChange(tx, change, userId, ctx.now())) written++;
    }
    writeState(tx, SYNC_KEYS.cursor, String(since));
    return written;
  });
}

/** Writes one server change unless this phone has its own edit waiting (sync-api §5). */
function applyChange(tx: Db, change: PullChange, userId: string, at: string): boolean {
  const { entity, entityId } = change;
  const table = entityTables[entity];
  const waiting = tx
    .select({ id: outboxOperations.operationId })
    .from(outboxOperations)
    .where(and(eq(outboxOperations.entity, entity), eq(outboxOperations.entityId, entityId)))
    .get();
  if (waiting) return false; // the next push applies it or comes back as a conflict

  const local = tx.select().from(table).where(eq(table.id, entityId)).get();
  if (local && local.version >= change.version) return false; // already have it

  const synced = { userId, version: change.version, updatedAt: at, syncStatus: "synced" as const };

  if (change.deletedAt || !change.data) {
    if (!local) return false; // never had it: nothing to remove
    tx.update(table)
      .set({ ...synced, deletedAt: change.deletedAt })
      .where(eq(table.id, entityId))
      .run();
    // Parts go with their record, with the same marker (so Undo can bring them back together).
    const part = partTables[entity as keyof typeof partTables];
    if (part) {
      tx.update(part.table)
        .set({ deletedAt: change.deletedAt, updatedAt: at, syncStatus: "synced" })
        .where(and(eq(part.parentColumn, entityId), isNull(part.table.deletedAt)))
        .run();
    }
    return true;
  }

  if (entity === "day_check_in") clearLocalTwin(tx, change.data.localDate as string, entityId);
  if (entity === "category") mergeLocalCategory(tx, change.data.name as string, entityId);

  const columns = { ...columnsOf(entity, change.data), ...synced, deletedAt: null };
  if (local) {
    tx.update(table).set(columns).where(eq(table.id, entityId)).run();
  } else {
    tx.insert(table)
      .values({ ...columns, id: entityId, createdAt: at } as typeof table.$inferInsert)
      .run();
  }

  const part = partTables[entity as keyof typeof partTables];
  if (part) {
    tx.delete(part.table).where(eq(part.parentColumn, entityId)).run();
    const rows = partsOf(entity, entityId, change.data);
    if (rows.length > 0) {
      tx.insert(part.table)
        .values(
          rows.map((r) => ({
            ...r,
            userId,
            version: 1,
            createdAt: at,
            updatedAt: at,
            deletedAt: null,
            syncStatus: "synced" as const,
          })) as never,
        )
        .run();
    }
  }
  return true;
}

/**
 * One live check-in per day (S-06): a synced local one for the same day under another ID is
 * replaced by the server's. (One with an edit waiting never gets here: push merged it first.)
 */
function clearLocalTwin(tx: Db, localDate: string, serverId: string) {
  tx.delete(dayCheckIns)
    .where(
      and(
        eq(dayCheckIns.localDate, localDate),
        ne(dayCheckIns.id, serverId),
        isNull(dayCheckIns.deletedAt),
        inArray(dayCheckIns.syncStatus, ["synced"]),
      ),
    )
    .run();
}

/**
 * A phone that started on its own made its own default categories; the account has its own
 * "Meals", "Laundry"… under other IDs, and names are unique (D-73 b, sync-api open point 3).
 * When the account's category arrives, a same-named one that never reached the server merges
 * into it: this phone's records and waiting changes point to the account's category instead,
 * and the duplicate (and its refused create) disappears.
 */
function mergeLocalCategory(tx: Db, name: string, serverId: string) {
  const twin = tx
    .select({ id: categories.id, syncStatus: categories.syncStatus })
    .from(categories)
    .where(
      and(eq(categories.name, name), ne(categories.id, serverId), isNull(categories.deletedAt)),
    )
    .get();
  if (!twin || twin.syncStatus === "synced") return;
  const from = twin.id;
  tx.update(allocations)
    .set({ categoryId: serverId })
    .where(eq(allocations.categoryId, from))
    .run();
  tx.update(transactionLines)
    .set({ categoryId: serverId })
    .where(eq(transactionLines.categoryId, from))
    .run();
  tx.update(bills).set({ categoryId: serverId }).where(eq(bills.categoryId, from)).run();
  tx.update(transactions)
    .set({ writeOffCategoryId: serverId })
    .where(eq(transactions.writeOffCategoryId, from))
    .run();
  tx.delete(outboxOperations)
    .where(and(eq(outboxOperations.entity, "category"), eq(outboxOperations.entityId, from)))
    .run();
  // IDs are UUIDs, so a plain text replace in the queued payloads can't hit anything else.
  tx.run(
    sql`update outbox_operations set payload = replace(payload, ${from}, ${serverId}), status = 'pending'
        where payload like ${`%${from}%`}`,
  );
  tx.delete(categories).where(eq(categories.id, from)).run();
}

// ── Sync state ──────────────────────────────────────────────────────────────

function readState(db: Db, key: string): string | undefined {
  return db.select().from(syncState).where(eq(syncState.key, key)).get()?.value;
}

function writeState(db: Db, key: string, value: string) {
  db.insert(syncState)
    .values({ key, value })
    .onConflictDoUpdate({ target: syncState.key, set: { value } })
    .run();
}
