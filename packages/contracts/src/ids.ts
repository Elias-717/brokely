import { v5 } from "uuid";

/**
 * IDs that the phone and the server both derive from the same facts, so two phones that
 * generate the same row create the same record, not a duplicate (sync-api S-05).
 */

/** Brokely's UUIDv5 namespace. Never change it: every stored deterministic ID depends on it. */
export const BROKELY_ID_NAMESPACE = "a6b6a77c-27a2-4755-93be-1da894370cfe";

/** A bill's scheduled item on one date: UUIDv5(bill_id + due_date) (ERD, S-05). */
export function scheduledItemId(billId: string, dueDate: string): string {
  return v5(`scheduled_item:${billId}:${dueDate}`, BROKELY_ID_NAMESPACE);
}
