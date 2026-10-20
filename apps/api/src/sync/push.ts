import {
  PushOperationSchema,
  type EntityName,
  type PushOperation,
  type PushResult,
  type SyncErrorCode,
} from "@brokely/contracts";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { processedOperations } from "../db/schema";
import { checkReferences, handlers, type SyncedRow } from "./entities";

/**
 * POST /v1/sync/push, one operation at a time (sync-api §4).
 *
 * Each operation runs in its own database transaction (S-03), so one bad change never blocks
 * the rest, and holds a per-student lock. The lock makes one student's writes commit in
 * server_seq order, so pull can never skip a row that commits late (S-08, S-09).
 */
export async function push(db: Db, userId: string, operations: readonly unknown[]) {
  const results: PushResult[] = [];
  for (const raw of operations) results.push(await pushOne(db, userId, raw));
  return results;
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

      const result = await apply(tx, userId, op);
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

async function apply(tx: Db, userId: string, op: PushOperation): Promise<PushResult> {
  const { operationId, entityId } = op;
  const handler = handlers[op.entity];
  const table = handler.table;
  const [found] = await tx.select().from(table).where(eq(table.id, entityId));
  const row = found as SyncedRow | undefined;

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
  const missing = await checkReferences(tx, userId, handler.references?.(op.data as never) ?? []);
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
  await handler.writeParts?.(tx, userId, entityId, op.data as never);
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
