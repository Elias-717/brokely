import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import * as schema from "./schema";

export * from "./schema";
export { schema };

export type CategoryRow = InferSelectModel<typeof schema.categories>;
export type PlanningCycleRow = InferSelectModel<typeof schema.planningCycles>;
export type PlanRevisionRow = InferSelectModel<typeof schema.planRevisions>;
export type AllocationRow = InferSelectModel<typeof schema.allocations>;
export type BillRow = InferSelectModel<typeof schema.bills>;
export type ScheduledItemRow = InferSelectModel<typeof schema.scheduledItems>;
export type TransactionRow = InferSelectModel<typeof schema.transactions>;
export type TransactionLineRow = InferSelectModel<typeof schema.transactionLines>;
export type DebtRow = InferSelectModel<typeof schema.debts>;
export type DayCheckInRow = InferSelectModel<typeof schema.dayCheckIns>;
export type OutboxOperationRow = InferSelectModel<typeof schema.outboxOperations>;
export type NewOutboxOperation = InferInsertModel<typeof schema.outboxOperations>;
