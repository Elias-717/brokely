import type { EntityData } from "@brokely/contracts";
import { and, eq, isNull } from "drizzle-orm";
import { scheduledItems } from "../schema";
import type { WriteScope } from "./context";
import { enqueueUpsert, touched } from "./outbox";

/** Shared by bills (generate, pay, skip) and transactions (undo of Mark paid). */

export type ScheduledItemRow = typeof scheduledItems.$inferSelect;

export function scheduledItemData(row: ScheduledItemRow): EntityData<"scheduled_item"> {
  return {
    billId: row.billId,
    dueDate: row.dueDate,
    amountSen: row.amountSen,
    status: row.status,
    transactionId: row.transactionId,
  };
}

/** Changes an item and tells sync, keeping the version the server last confirmed. */
export function updateScheduledItem(
  scope: WriteScope,
  before: ScheduledItemRow,
  change: Partial<Pick<ScheduledItemRow, "amountSen" | "status" | "transactionId" | "deletedAt">>,
) {
  const after = { ...before, ...change, ...touched(scope.at) };
  enqueueUpsert(scope, "scheduled_item", before.id, before.version, scheduledItemData(after));
  scope.tx
    .update(scheduledItems)
    .set({ ...change, ...touched(scope.at) })
    .where(eq(scheduledItems.id, before.id))
    .run();
}

/**
 * When the transaction that paid an item is deleted (e.g. Undo), the item goes back to
 * still to come, so a bill is never counted as both paid and not paid (R-05).
 */
export function releaseScheduledItem(scope: WriteScope, transactionId: string) {
  const item = scope.tx
    .select()
    .from(scheduledItems)
    .where(and(eq(scheduledItems.transactionId, transactionId), isNull(scheduledItems.deletedAt)))
    .get();
  if (item) updateScheduledItem(scope, item, { status: "upcoming", transactionId: null });
}
