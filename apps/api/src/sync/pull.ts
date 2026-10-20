import type { EntityName, PullChange, PullResponse } from "@brokely/contracts";
import { and, asc, eq, gt } from "drizzle-orm";
import type { Db } from "../db/client";
import { handlers, type SyncedRow } from "./entities";

/**
 * GET /v1/sync/pull?since=&limit= (sync-api §5, S-08): this student's rows changed after the
 * cursor, oldest first, delete markers included. Every table shares one sequence, so the oldest
 * `limit + 1` rows of each table are enough to find the overall first `limit` and whether more
 * remain.
 */
export async function pull(
  db: Db,
  userId: string,
  since: number,
  limit: number,
): Promise<PullResponse> {
  const found: { entity: EntityName; row: SyncedRow }[] = [];
  for (const entity of Object.keys(handlers) as EntityName[]) {
    const table = handlers[entity].table;
    const rows = await db
      .select()
      .from(table)
      .where(and(eq(table.userId, userId), gt(table.serverSeq, since)))
      .orderBy(asc(table.serverSeq))
      .limit(limit + 1); // one more than a page, so hasMore is known

    for (const row of rows) found.push({ entity, row: row as SyncedRow });
  }
  found.sort((a, b) => a.row.serverSeq - b.row.serverSeq);
  const page = found.slice(0, limit);

  // One query per entity for the parts (lines, allocations), not one per row.
  const data = new Map<string, unknown>();
  for (const entity of new Set(page.map((f) => f.entity))) {
    const live = page.filter((f) => f.entity === entity && !f.row.deletedAt).map((f) => f.row);
    for (const [id, d] of await handlers[entity].toData(db, live)) data.set(id, d);
  }
  const changes: PullChange[] = page.map(({ entity, row }) => ({
    entity,
    entityId: row.id,
    version: row.version,
    serverSeq: row.serverSeq,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    data: (data.get(row.id) as Record<string, unknown> | undefined) ?? null, // S-07
  }));
  return {
    changes,
    nextSince: page.at(-1)?.row.serverSeq ?? since,
    hasMore: found.length > limit,
  };
}
