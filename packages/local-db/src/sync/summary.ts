import type { PullChange } from "@brokely/contracts";
import { inArray, isNull, and } from "drizzle-orm";
import type { Db } from "../repositories/context";
import { debts, outboxOperations, planningCycles, transactions } from "../schema";

/**
 * What a side holds, for the "Your account already has records" choice (D-73 b): concrete
 * counts instead of an abstract question. Plans are the ones that own dates (active or
 * completed, BR-05); drafts and archived plans are left out.
 */
export interface RecordSummary {
  /** Inclusive local dates, oldest first. */
  readonly plans: readonly { readonly start: string; readonly endExclusive: string }[];
  readonly records: number;
  readonly debts: number;
}

const OWNS_DATES = ["active", "completed"] as const;

/** This phone's records. */
export function phoneSummary(db: Db): RecordSummary {
  const plans = db
    .select({ start: planningCycles.startDate, endExclusive: planningCycles.endDateExclusive })
    .from(planningCycles)
    .where(and(inArray(planningCycles.status, [...OWNS_DATES]), isNull(planningCycles.deletedAt)))
    .all()
    .sort((a, b) => a.start.localeCompare(b.start));
  const live = <T extends typeof transactions | typeof debts>(table: T) =>
    db.select({ id: table.id }).from(table).where(isNull(table.deletedAt)).all().length;
  return { plans, records: live(transactions), debts: live(debts) };
}

/** The account's records, from a full pull (every row's latest state, delete markers too). */
export function summarizeChanges(changes: readonly PullChange[]): RecordSummary {
  const latest = new Map<string, PullChange>();
  for (const c of changes) latest.set(`${c.entity}:${c.entityId}`, c); // pages are oldest first
  const live = [...latest.values()].filter((c) => !c.deletedAt && c.data);
  const plans = live
    .filter((c) => c.entity === "planning_cycle")
    .map((c) => c.data as { startDate: string; endDateExclusive: string; status: string })
    .filter((d) => (OWNS_DATES as readonly string[]).includes(d.status))
    .map((d) => ({ start: d.startDate, endExclusive: d.endDateExclusive }))
    .sort((a, b) => a.start.localeCompare(b.start));
  return {
    plans,
    records: live.filter((c) => c.entity === "transaction").length,
    debts: live.filter((c) => c.entity === "debt").length,
  };
}

/**
 * Changes that couldn't be backed up and need the student (FR-SYNC-06, FR-SYNC-08), in words:
 * what it is (a category's name, a record's note or type and amount) and why.
 */
export interface StuckChange {
  readonly operationId: string;
  readonly entity: string;
  readonly entityId: string;
  readonly status: "conflict" | "failed";
  /** "Laundry & ironing", "Lunch", "Debt with Ali"… */
  readonly label: string;
  /** Present for records, in sen, so the app formats it. */
  readonly amountSen: number | null;
  /** The kind of thing, e.g. "Category", "Record". */
  readonly kind: string;
  /** Why, in plain words. */
  readonly reason: string;
}

const KINDS: Record<string, string> = {
  category: "Category",
  planning_cycle: "Plan dates",
  plan_revision: "Plan",
  bill: "Bill",
  scheduled_item: "Bill date",
  transaction: "Record",
  transaction_edit: "Record history",
  debt: "Debt",
  debt_adjustment: "Debt correction",
  day_check_in: "No-spending day",
  wallet_check: "Wallet check",
  user_settings: "Settings",
};

export function stuckChanges(db: Db): StuckChange[] {
  return db
    .select()
    .from(outboxOperations)
    .where(inArray(outboxOperations.status, ["conflict", "failed"]))
    .all()
    .map((op) => {
      const data = (op.payload ?? {}) as Record<string, unknown>;
      const kind = KINDS[op.entity] ?? "Change";
      const label =
        (typeof data.name === "string" && data.name) ||
        (typeof data.note === "string" && data.note) ||
        (typeof data.counterparty === "string" && `Debt with ${data.counterparty}`) ||
        (op.op === "delete" ? `Deleted ${kind.toLowerCase()}` : kind);
      const reason =
        op.status === "conflict"
          ? "Changed on another phone too"
          : (op.lastError ?? "").replace(/^[A-Z_]+: /, "") || "The server refused this change";
      return {
        operationId: op.operationId,
        entity: op.entity,
        entityId: op.entityId,
        status: op.status as "conflict" | "failed",
        label,
        amountSen: typeof data.amountSen === "number" ? data.amountSen : null,
        kind,
        reason,
      };
    });
}
