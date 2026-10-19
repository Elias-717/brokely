import { z } from "zod";
import {
  BillSchema,
  CategorySchema,
  DayCheckInSchema,
  DebtAdjustmentSchema,
  DebtSchema,
  PlanRevisionSchema,
  PlanningCycleSchema,
  ScheduledItemSchema,
  TransactionEditSchema,
  TransactionSchema,
  UserSettingsSchema,
  WalletCheckSchema,
} from "./entities";
import { IdSchema, InstantSchema, VersionSchema } from "./primitives";

/** Sync envelopes for POST /v1/sync/push and GET /v1/sync/pull (docs/design/sync-api.md). */

/** Each synced entity and the schema of its `data` (sync-api §3). */
export const entityDataSchemas = {
  category: CategorySchema,
  planning_cycle: PlanningCycleSchema,
  plan_revision: PlanRevisionSchema,
  bill: BillSchema,
  scheduled_item: ScheduledItemSchema,
  transaction: TransactionSchema,
  transaction_edit: TransactionEditSchema,
  debt: DebtSchema,
  debt_adjustment: DebtAdjustmentSchema,
  day_check_in: DayCheckInSchema,
  wallet_check: WalletCheckSchema,
  user_settings: UserSettingsSchema,
} as const;

export type EntityName = keyof typeof entityDataSchemas;
export const EntityNameSchema = z.enum(
  Object.keys(entityDataSchemas) as [EntityName, ...EntityName[]],
);

/** Limits from sync-api §4. */
export const MAX_OPERATIONS_PER_PUSH = 100;
export const MAX_PULL_LIMIT = 500;

const operationBase = {
  operationId: IdSchema,
  entityId: IdSchema,
  baseVersion: VersionSchema.nullable(), // null = create (S-04)
};

const upsertOperations = (Object.keys(entityDataSchemas) as EntityName[]).map((entity) =>
  z.object({
    ...operationBase,
    entity: z.literal(entity),
    op: z.literal("upsert"),
    data: entityDataSchemas[entity],
  }),
);

const deleteOperation = z.object({
  ...operationBase,
  entity: EntityNameSchema,
  op: z.literal("delete"),
  baseVersion: VersionSchema, // deleting always needs the version the phone saw
});

/**
 * One change from the outbox. An upsert carries `data` checked against its entity's schema;
 * a delete carries no data (S-07).
 */
export const PushOperationSchema = z.union([
  deleteOperation.strict(),
  ...upsertOperations.map((schema) => schema.strict()),
] as unknown as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
export type PushOperation =
  | z.infer<typeof deleteOperation>
  | {
      [E in EntityName]: {
        operationId: string;
        entityId: string;
        baseVersion: number | null;
        entity: E;
        op: "upsert";
        data: z.infer<(typeof entityDataSchemas)[E]>;
      };
    }[EntityName];

export const PushRequestSchema = z.object({
  deviceId: IdSchema,
  operations: z.array(PushOperationSchema).min(1).max(MAX_OPERATIONS_PER_PUSH),
});
export type PushRequest = { deviceId: string; operations: PushOperation[] };

/** Error codes from sync-api §6. */
export const SyncErrorCodeSchema = z.enum([
  "VALIDATION_FAILED",
  "LINES_DO_NOT_SUM",
  "REFUND_EXCEEDS_PURCHASE",
  "CYCLE_OVERLAP",
  "REVISION_IMMUTABLE",
  "DRAFT_REVISION_EXISTS",
  "SHORTFALL_NOT_ACKNOWLEDGED",
  "CATEGORY_IN_USE",
  "DEBT_EXCEEDS_OUTSTANDING",
  "REFERENCE_MISSING",
  "NOT_FOUND",
]);
export type SyncErrorCode = z.infer<typeof SyncErrorCodeSchema>;

const serverRow = z.object({
  entityId: IdSchema,
  version: VersionSchema,
  serverSeq: z.number().int().positive(),
  deletedAt: InstantSchema.nullable(),
  data: z.record(z.unknown()).nullable(),
});

/** Result for one operation, in the same order as the request (sync-api §4). */
export const PushResultSchema = z.discriminatedUnion("status", [
  z.object({
    operationId: IdSchema,
    status: z.literal("applied"),
    version: VersionSchema,
    serverSeq: z.number().int().positive(),
  }),
  z.object({
    operationId: IdSchema,
    status: z.literal("duplicate"),
    version: VersionSchema,
    serverSeq: z.number().int().positive(),
    entityId: IdSchema.optional(), // set when a natural-key merge picked another ID (S-06)
  }),
  z.object({ operationId: IdSchema, status: z.literal("conflict"), current: serverRow }),
  z.object({
    operationId: IdSchema,
    status: z.literal("rejected"),
    error: z.object({ code: SyncErrorCodeSchema, message: z.string() }),
  }),
]);
export type PushResult = z.infer<typeof PushResultSchema>;

export const PushResponseSchema = z.object({ results: z.array(PushResultSchema) });
export type PushResponse = z.infer<typeof PushResponseSchema>;

/** Query string of GET /v1/sync/pull. Values arrive as strings, so they are coerced. */
export const PullQuerySchema = z.object({
  since: z.coerce.number().int().nonnegative(),
  limit: z.coerce.number().int().min(1).max(MAX_PULL_LIMIT).default(MAX_PULL_LIMIT),
});
export type PullQuery = z.infer<typeof PullQuerySchema>;

export const PullChangeSchema = serverRow.extend({ entity: EntityNameSchema });
export type PullChange = z.infer<typeof PullChangeSchema>;

export const PullResponseSchema = z.object({
  changes: z.array(PullChangeSchema),
  nextSince: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});
export type PullResponse = z.infer<typeof PullResponseSchema>;
