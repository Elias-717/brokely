import {
  PushOperationSchema,
  type EntityName,
  type PushOperation,
  type PushResult,
  type SyncErrorCode,
} from "@brokely/contracts";
import { and, eq, getTableName, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { processedOperations } from "../db/schema";
import {
  checkReferences,
  handlers,
  type Reference,
  type SyncedRow,
  type SyncedTable,
} from "./entities";

/**
 * POST /v1/sync/push (sync-api §4). The database is tens of milliseconds away, so round trips
 * are what make a backup slow (speed check, D-89). The whole batch runs in one transaction under
 * the per-student lock, which keeps one student's writes in server_seq order so pull never
 * skips a row that commits late (S-08, S-09). What every change needs to know (already applied?
 * the row it changes, the rows it points to) is read for the whole batch in a few queries.
 *
 * A rule the database itself enforces (overlapping plans, a category name used twice) fails the
 * whole transaction; then nothing of the batch is kept and it runs again one change per
 * transaction (S-03), so only that change is refused and the others are applied.
 */
export async function push(db: Db, userId: string, operations: readonly unknown[]) {
  try {
    return await pushBatch(db, userId, operations);
  } catch (error) {
    if (!constraintRefusal(error)) throw error;
    const results: PushResult[] = [];
    for (const raw of operations) results.push(await pushOne(db, userId, raw));
    return results;
  }
}

/**
 * What the batch already knows: rows read up front (null when missing) and which rows the
 * student has live, kept up to date as the batch writes. Unknown keys fall back to a query.
 */
interface BatchCache {
  readonly rows: Map<string, SyncedRow | null>;
  readonly live: Set<string>;
}

const rowKey = (entity: EntityName, id: string) => `${entity}:${id}`;
const liveKey = (table: SyncedTable, id: string) => `${getTableName(table)}:${id}`;

async function pushBatch(db: Db, userId: string, operations: readonly unknown[]) {
  const parsed = operations.map((raw) => {
    const operationId = (raw as { operationId: string }).operationId;
    const result = PushOperationSchema.safeParse(raw);
    if (result.success) return { operationId, op: result.data as PushOperation, refused: null };
    const message = result.error.issues[0]?.message ?? "Invalid change";
    return { operationId, op: null, refused: rejected(operationId, "VALIDATION_FAILED", message) };
  });

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);
    // Step 1 for the whole batch: already applied? Answer as before (FR-SYNC-05).
    const done = new Map<string, PushResult>();
    const found = await tx
      .select({ operationId: processedOperations.operationId, result: processedOperations.result })
      .from(processedOperations)
      .where(
        and(
          eq(processedOperations.userId, userId),
          inArray(
            processedOperations.operationId,
            parsed.map((p) => p.operationId),
          ),
        ),
      );
    for (const r of found) done.set(r.operationId, r.result as PushResult);
    const cache = await prefetch(
      tx,
      userId,
      parsed.flatMap((p) => (p.op && !done.has(p.operationId) ? [p.op] : [])),
    );

    const results: PushResult[] = [];
    const remember: { userId: string; operationId: string; result: PushResult }[] = [];
    for (const p of parsed) {
      const prior = done.get(p.operationId);
      if (prior) {
        results.push({ ...prior, status: "duplicate" } as PushResult);
        continue;
      }
      if (!p.op) {
        results.push(p.refused!);
        continue;
      }
      const result = await apply(tx, userId, p.op, cache);
      // Only successes are remembered; a refused change is checked afresh if sent again.
      if (result.status === "applied" || result.status === "duplicate") {
        remember.push({ userId, operationId: p.operationId, result });
        done.set(p.operationId, result);
      }
      results.push(result);
    }
    if (remember.length > 0) await tx.insert(processedOperations).values(remember);
    return results;
  });
}

/** The rows the batch changes and the rows it points to: one query per table. */
async function prefetch(tx: Db, userId: string, ops: readonly PushOperation[]) {
  const cache: BatchCache = { rows: new Map(), live: new Set() };
  const byEntity = new Map<EntityName, Set<string>>();
  for (const op of ops) {
    byEntity.set(op.entity, (byEntity.get(op.entity) ?? new Set()).add(op.entityId));
  }
  for (const [entity, ids] of byEntity) {
    const table = handlers[entity].table;
    const rows = (await tx
      .select()
      .from(table)
      .where(inArray(table.id, [...ids]))) as SyncedRow[];
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const id of ids) cache.rows.set(rowKey(entity, id), byId.get(id) ?? null);
  }

  const refs = new Map<SyncedTable, Set<string>>();
  for (const op of ops) {
    if (op.op !== "upsert") continue;
    for (const ref of handlers[op.entity].references?.(op.data as never) ?? []) {
      refs.set(ref.table, (refs.get(ref.table) ?? new Set()).add(ref.id));
    }
  }
  for (const [table, ids] of refs) {
    const live = await tx
      .select({ id: table.id })
      .from(table)
      .where(and(inArray(table.id, [...ids]), eq(table.userId, userId), isNull(table.deletedAt)));
    for (const r of live) cache.live.add(liveKey(table, r.id));
  }
  return cache;
}

/** Step 5 from what the batch knows, without a query per reference. */
function missingIn(cache: BatchCache, references: readonly Reference[]): string | undefined {
  for (const ref of references) {
    if (!cache.live.has(liveKey(ref.table, ref.id))) return `The ${ref.what} is not on the server`;
  }
  return undefined;
}

const NEXT_SEQ = sql`nextval('brokely.server_seq')`;

async function pushOne(db: Db, userId: string, raw: unknown): Promise<PushResult> {
  const operationId = (raw as { operationId: string }).operationId;
  // Step 2: the shape of the change, against the shared contract.
  const parsed = PushOperationSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return rejected(operationId, "VALIDATION_FAILED", issue?.message ?? "Invalid change");
  }
  const op = parsed.data as PushOperation;

  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);

      // Step 1: already applied? Answer as before (FR-SYNC-05).
      const [done] = await tx
        .select({ result: processedOperations.result })
        .from(processedOperations)
        .where(
          and(
            eq(processedOperations.userId, userId),
            eq(processedOperations.operationId, operationId),
          ),
        );
      if (done) return { ...(done.result as PushResult), status: "duplicate" } as PushResult;

      const result = await apply(tx, userId, op, null);
      // Only successes are remembered; a refused change is checked afresh if sent again.
      if (result.status === "applied" || result.status === "duplicate") {
        await tx.insert(processedOperations).values({ userId, operationId, result });
      }
      return result;
    });
  } catch (error) {
    const refused = constraintRefusal(error);
    if (refused) return rejected(operationId, refused.code, refused.message);
    throw error;
  }
}

async function apply(
  tx: Db,
  userId: string,
  op: PushOperation,
  cache: BatchCache | null,
): Promise<PushResult> {
  const { operationId, entityId } = op;
  const handler = handlers[op.entity];
  const table = handler.table;
  const key = rowKey(op.entity, entityId);
  let row: SyncedRow | undefined;
  if (cache?.rows.has(key)) row = cache.rows.get(key) ?? undefined;
  else {
    const [found] = await tx.select().from(table).where(eq(table.id, entityId));
    row = found as SyncedRow | undefined;
  }
  /** After a write: a second change to the same row reads it afresh; references follow. */
  const wrote = (live: boolean) => {
    if (!cache) return;
    cache.rows.delete(key);
    if (live) cache.live.add(liveKey(table, entityId));
    else cache.live.delete(liveKey(table, entityId));
  };

  // Step 3: another student's row looks exactly like a missing one (FR-ACC-04).
  if (row && row.userId !== userId) {
    return rejected(operationId, "NOT_FOUND", "This record is not on the server");
  }

  if (op.op === "delete") {
    if (!row) return rejected(operationId, "NOT_FOUND", "This record is not on the server");
    if (row.version !== op.baseVersion) return conflict(tx, op.entity, operationId, row);
    if (row.deletedAt) return seen(operationId, row);
    const rule = await handler.checkDelete?.(tx, userId, row);
    if (rule && !rule.ok) return rejected(operationId, rule.code, rule.message);
    const [written] = await tx
      .update(table)
      .set({
        deletedAt: sql`now()`,
        updatedAt: sql`now()`,
        version: row.version + 1,
        serverSeq: NEXT_SEQ,
      } as never)
      .where(eq(table.id, entityId))
      .returning({ version: table.version, serverSeq: table.serverSeq });
    wrote(false);
    return { operationId, status: "applied", ...written! };
  }

  // Step 4: versions (S-04), and merges of the same thing made on two phones (S-05, S-06).
  if (op.baseVersion === null) {
    if (row && op.entity === "scheduled_item") {
      // Same bill and date, same ID (S-05): another phone made it. If that copy was deleted,
      // this create brings the date back (written below as an update).
      if (!row.deletedAt) return seen(operationId, row);
    } else if (row) {
      return conflict(tx, op.entity, operationId, row);
    }
    const twin = await handler.mergeTarget?.(tx, userId, entityId, op.data as never);
    if (twin) return { ...seen(operationId, twin), entityId: twin.id };
  } else {
    if (!row) return rejected(operationId, "NOT_FOUND", "This record is not on the server");
    if (row.version !== op.baseVersion) return conflict(tx, op.entity, operationId, row);
  }

  // Step 5: what it points to exists for this student.
  const references = handler.references?.(op.data as never) ?? [];
  const missing = cache
    ? missingIn(cache, references)
    : await checkReferences(tx, userId, references);
  if (missing) return rejected(operationId, "REFERENCE_MISSING", missing);

  // Step 6: business rules, the same functions the phone runs (sync-api §6).
  const rule = await handler.check?.({
    tx,
    userId,
    entityId,
    data: op.data as never,
    existing: row,
  });
  if (rule && !rule.ok) return rejected(operationId, rule.code, rule.message);

  // Step 7: write. An upsert always leaves the row live (Undo of a delete, S-07).
  const columns = handler.columns(op.data as never);
  const [written] = row
    ? await tx
        .update(table)
        .set({
          ...columns,
          deletedAt: null,
          updatedAt: sql`now()`,
          version: row.version + 1,
          serverSeq: NEXT_SEQ,
        } as never)
        .where(eq(table.id, entityId))
        .returning({ version: table.version, serverSeq: table.serverSeq })
    : await tx
        .insert(table)
        .values({ ...columns, id: entityId, userId, version: 1, serverSeq: NEXT_SEQ } as never)
        .returning({ version: table.version, serverSeq: table.serverSeq });
  await handler.writeParts?.(tx, userId, entityId, op.data as never, !row);
  wrote(true);
  return { operationId, status: "applied", ...written! };
}

function seen(operationId: string, row: SyncedRow) {
  return {
    operationId,
    status: "duplicate" as const,
    version: row.version,
    serverSeq: row.serverSeq,
  };
}

function rejected(operationId: string, code: SyncErrorCode, message: string): PushResult {
  return { operationId, status: "rejected", error: { code, message } };
}

/** Out of date (D-06): send the server's row so the student can re-apply their change. */
async function conflict(
  tx: Db,
  entity: EntityName,
  operationId: string,
  row: SyncedRow,
): Promise<PushResult> {
  return { operationId, status: "conflict", current: await serverRow(tx, entity, row) };
}

/** A stored row as sync sends it; a delete marker carries no data (S-07). */
export async function serverRow(tx: Db, entity: EntityName, row: SyncedRow) {
  const data = row.deletedAt
    ? null
    : ((await handlers[entity].toData(tx, [row])).get(row.id) as Record<string, unknown>);
  return {
    entityId: row.id,
    version: row.version,
    serverSeq: row.serverSeq,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    data,
  };
}

/**
 * Rules the database itself enforces, as sync error codes. Messages never include the
 * student's data (NFR-17).
 */
function constraintRefusal(error: unknown): { code: SyncErrorCode; message: string } | undefined {
  const e = error as {
    code?: string;
    constraint?: string;
    constraint_name?: string;
    cause?: unknown;
  };
  if (!e?.code && e?.cause) return constraintRefusal(e.cause);
  const constraint = e.constraint ?? e.constraint_name;
  if (e.code === "23P01") {
    return { code: "CYCLE_OVERLAP", message: "These dates overlap another plan" }; // BR-05
  }
  if (e.code === "23505" && constraint === "plan_revisions_one_draft_unique") {
    return { code: "DRAFT_REVISION_EXISTS", message: "This plan already has unsaved changes" };
  }
  if (e.code === "23505" && constraint === "categories_live_name_unique") {
    return { code: "VALIDATION_FAILED", message: "You already have a category with this name" };
  }
  if (e.code?.startsWith("23")) {
    return { code: "VALIDATION_FAILED", message: "This change doesn't fit the saved records" };
  }
  return undefined;
}
