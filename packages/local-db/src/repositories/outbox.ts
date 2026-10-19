import { entityDataSchemas, type EntityData, type EntityName } from "@brokely/contracts";
import { outboxOperations } from "../schema";
import { RepoError, type WriteScope } from "./context";

/**
 * Outbox writer (FR-SYNC-03/04, sync-api §4, S-01). One operation per aggregate change,
 * written inside the same transaction as the change.
 *
 * The payload is checked against the same Zod contract the server uses, so a change the
 * server would refuse for its shape is refused here already (VALIDATION_FAILED).
 */
export function enqueueUpsert<E extends EntityName>(
  { tx, at, newId }: WriteScope,
  entity: E,
  entityId: string,
  /** null = create; otherwise the version the phone last saw (S-04). */
  baseVersion: number | null,
  data: EntityData<E>,
): void {
  const parsed = entityDataSchemas[entity].safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new RepoError("VALIDATION_FAILED", issue?.message ?? `Invalid ${entity}`);
  }
  tx.insert(outboxOperations)
    .values({
      operationId: newId(),
      entity,
      entityId,
      op: "upsert",
      baseVersion,
      payload: parsed.data,
      createdAt: at,
    })
    .run();
}

/** A delete marker for the server (S-07). Deleting always needs the version the phone saw. */
export function enqueueDelete(
  { tx, at, newId }: WriteScope,
  entity: EntityName,
  entityId: string,
  baseVersion: number,
): void {
  tx.insert(outboxOperations)
    .values({
      operationId: newId(),
      entity,
      entityId,
      op: "delete",
      baseVersion,
      payload: null,
      createdAt: at,
    })
    .run();
}

/**
 * Columns to set on every local change. The row's `version` stays the version the server last
 * confirmed; the sync loop updates it when the operation is applied (sync-api §4).
 */
export function touched(at: string) {
  return { updatedAt: at, syncStatus: "pending" as const };
}
