import type { EntityData, EntityName } from "@brokely/contracts";
import {
  allocations,
  bills,
  categories,
  dayCheckIns,
  debtAdjustments,
  debts,
  planningCycles,
  planRevisions,
  scheduledItems,
  transactionEdits,
  transactionLines,
  transactions,
  userSettings,
  walletChecks,
} from "../schema";

/**
 * Where each synced entity lives on the phone, and how server `data` becomes local columns
 * (the reverse of the repositories' payload builders, sync-api §3).
 */

/**
 * Every synced table has the shared sync columns. Drizzle can't type "any table with these
 * columns", so shared code treats each as this one; the columns it touches exist on all.
 */
export type SyncedTable = typeof walletChecks;

export const entityTables: Record<EntityName, SyncedTable> = {
  category: categories as unknown as SyncedTable,
  planning_cycle: planningCycles as unknown as SyncedTable,
  plan_revision: planRevisions as unknown as SyncedTable,
  bill: bills as unknown as SyncedTable,
  scheduled_item: scheduledItems as unknown as SyncedTable,
  transaction: transactions as unknown as SyncedTable,
  transaction_edit: transactionEdits as unknown as SyncedTable,
  debt: debts as unknown as SyncedTable,
  debt_adjustment: debtAdjustments as unknown as SyncedTable,
  day_check_in: dayCheckIns as unknown as SyncedTable,
  wallet_check: walletChecks as unknown as SyncedTable,
  user_settings: userSettings as unknown as SyncedTable,
};

/** Columns of the aggregate's own row for `data` (parts are written by `partsOf`). */
export function columnsOf(entity: EntityName, data: Record<string, unknown>) {
  switch (entity) {
    case "plan_revision":
    case "transaction": {
      const rest = { ...data };
      delete rest.allocations; // parts, written by partsOf
      delete rest.lines;
      return rest;
    }
    case "bill": {
      const { repeat, ...rest } = data as EntityData<"bill">;
      const { kind, ...params } = repeat;
      return { ...rest, repeatKind: kind, repeatParams: params };
    }
    default:
      return data;
  }
}

/** The parts of an aggregate (S-01): allocations of a revision, lines of a transaction. */
export const partTables = {
  plan_revision: { table: allocations, parentColumn: allocations.revisionId },
  transaction: { table: transactionLines, parentColumn: transactionLines.transactionId },
} as const;

export function partsOf(entity: EntityName, parentId: string, data: Record<string, unknown>) {
  if (entity === "plan_revision") {
    return (data as EntityData<"plan_revision">).allocations.map((a) => ({
      id: a.id,
      revisionId: parentId,
      categoryId: a.categoryId,
      amountSen: a.amountSen,
    }));
  }
  if (entity === "transaction") {
    return (data as EntityData<"transaction">).lines.map((l) => ({
      id: l.id,
      transactionId: parentId,
      kind: l.kind,
      categoryId: l.kind === "spending" ? l.categoryId : null,
      debtId: l.kind === "debt" ? l.debtId : null,
      amountSen: l.amountSen,
    }));
  }
  return [];
}
