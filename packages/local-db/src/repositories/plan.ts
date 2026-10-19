import type { EntityData } from "@brokely/contracts";
import {
  addDays,
  checkCanApprove,
  checkNoOverlap,
  currentRevision,
  cycleFromInclusive,
  localDate,
  nextRevisionNo,
  planTotals,
  sen,
  type AllocationInput,
  type CycleLike,
  type PlanTotals,
  type Sen,
} from "@brokely/domain";
import { and, eq, gt, inArray, isNull, lte, sql } from "drizzle-orm";
import { allocations, planningCycles, planRevisions } from "../schema";
import { liveCategory } from "./categories";
import {
  asLocalDate,
  ensure,
  RepoError,
  write,
  type Db,
  type RepoContext,
  type WriteScope,
} from "./context";
import { enqueueUpsert } from "./outbox";
import { purchaseInput, recordTransactionIn } from "./transactions";

/**
 * Plans: quick start (FR-PLN-19, D-23), revisions (FR-PLN-11, D-03), shortfall (FR-PLN-10),
 * no overlapping cycles (FR-PLN-03, BR-05), mid-month tracking start (FR-PLN-21, R-12).
 */

type CycleRow = typeof planningCycles.$inferSelect;
type RevisionRow = typeof planRevisions.$inferSelect;

export interface PlanAllocation extends AllocationInput {
  readonly categoryId: string;
}

/** The plan daily guidance uses: the cycle and its latest approved revision (D-03). */
export interface Plan {
  readonly cycle: CycleRow;
  readonly revision: RevisionRow;
  readonly allocations: readonly PlanAllocation[];
  readonly totals: PlanTotals;
}

const liveCycle = isNull(planningCycles.deletedAt);

function cycleLike(row: CycleRow): CycleLike {
  return {
    id: row.id,
    range: { start: localDate(row.startDate), endExclusive: localDate(row.endDateExclusive) },
    status: row.status,
  };
}

/** The active or completed cycle whose dates contain `date` (BR-04). At most one (BR-05). */
export function findCycleOn(db: Db, date: string): CycleRow | undefined {
  return db
    .select()
    .from(planningCycles)
    .where(
      and(
        liveCycle,
        inArray(planningCycles.status, ["active", "completed"]),
        lte(planningCycles.startDate, date),
        gt(planningCycles.endDateExclusive, date),
      ),
    )
    .get();
}

export function getPlan(db: Db, cycleId: string): Plan | undefined {
  const cycle = db
    .select()
    .from(planningCycles)
    .where(and(eq(planningCycles.id, cycleId), liveCycle))
    .get();
  if (!cycle) return undefined;
  const revisions = db
    .select()
    .from(planRevisions)
    .where(and(eq(planRevisions.cycleId, cycleId), isNull(planRevisions.deletedAt)))
    .all();
  const revision = currentRevision(
    revisions.map((r) => ({ ...r, approved: r.approvedAt !== null })),
  );
  if (!revision) return undefined;
  const rows = db
    .select({ categoryId: allocations.categoryId, amountSen: allocations.amountSen })
    .from(allocations)
    .where(and(eq(allocations.revisionId, revision.id), isNull(allocations.deletedAt)))
    .orderBy(sql`rowid`)
    .all();
  const withKinds = rows.map((a) => ({
    categoryId: a.categoryId,
    kind: liveCategory(db, a.categoryId, "REFERENCE_MISSING").kind,
    amountSen: sen(a.amountSen),
  }));
  return {
    cycle,
    revision,
    allocations: withKinds,
    totals: planTotals(sen(revision.budgetSen), withKinds),
  };
}

function cycleData(row: CycleRow): EntityData<"planning_cycle"> {
  return {
    startDate: row.startDate,
    endDateExclusive: row.endDateExclusive,
    trackingStartDate: row.trackingStartDate,
    status: row.status,
  };
}

const syncedNew = (scope: WriteScope) => ({
  id: scope.newId(),
  userId: null,
  version: 1,
  createdAt: scope.at,
  updatedAt: scope.at,
  deletedAt: null,
  syncStatus: "pending" as const,
});

export interface QuickStartInput {
  readonly budgetSen: Sen;
  /** Dates as the student sees them; both included (FR-PLN-02). */
  readonly startDate: string;
  readonly endDateInclusive: string;
  /** First tracked day; defaults to the start date (R-12). */
  readonly trackingStartDate?: string;
  /** Catch me up: what was spent before tracking starts, as one entry (FR-PLN-21, AC-59). */
  readonly openingSpend?: { readonly amountSen: Sen; readonly categoryId: string };
}

/** The note on the catch-up entry (FR-PLN-21). */
export const OPENING_SPEND_NOTE = "Spent before Brokely";

/** Quick start: budget and dates only, approved on the same screen (FR-PLN-19, AC-53). */
export function quickStartIn(scope: WriteScope, input: QuickStartInput) {
  const start = asLocalDate(input.startDate);
  const end = asLocalDate(input.endDateInclusive);
  if (end < start) throw new RepoError("VALIDATION_FAILED", "A cycle can't end before it starts");
  const range = cycleFromInclusive(start, end);

  const cycle: CycleRow = {
    ...syncedNew(scope),
    startDate: range.start,
    endDateExclusive: range.endExclusive,
    trackingStartDate: asLocalDate(input.trackingStartDate ?? start),
    status: "active",
  };
  const others = scope.tx.select().from(planningCycles).where(liveCycle).all();
  ensure(checkNoOverlap(cycleLike(cycle), others.map(cycleLike)));

  enqueueUpsert(scope, "planning_cycle", cycle.id, null, cycleData(cycle));
  scope.tx.insert(planningCycles).values(cycle).run();
  const revisionId = insertApprovedRevision(scope, cycle.id, 1, input.budgetSen, [], false);

  if (input.openingSpend) {
    if (cycle.trackingStartDate <= cycle.startDate) {
      throw new RepoError("VALIDATION_FAILED", "Nothing to catch up: tracking starts on day one");
    }
    // Dated the day before tracking starts: counts in N, outside the tracked days (R-12).
    recordTransactionIn(
      scope,
      purchaseInput({
        ...input.openingSpend,
        localDate: addDays(localDate(cycle.trackingStartDate), -1),
        occurredAt: scope.at,
        note: OPENING_SPEND_NOTE,
      }),
    );
  }
  return { cycleId: cycle.id, revisionId };
}

export function quickStart(ctx: RepoContext, input: QuickStartInput) {
  return write(ctx, (scope) => quickStartIn(scope, input));
}

function insertApprovedRevision(
  scope: WriteScope,
  cycleId: string,
  revisionNo: number,
  budgetSen: Sen,
  parts: readonly { categoryId: string; amountSen: Sen }[],
  shortfallAcknowledged: boolean,
): string {
  const revision: RevisionRow = {
    ...syncedNew(scope),
    cycleId,
    revisionNo,
    budgetSen,
    approvedAt: scope.at,
    shortfallAcknowledged,
  };
  const rows = parts.map((p) => ({
    ...syncedNew(scope),
    revisionId: revision.id,
    categoryId: p.categoryId,
    amountSen: p.amountSen,
  }));
  // One operation for the revision with its allocations (S-01).
  enqueueUpsert(scope, "plan_revision", revision.id, null, {
    cycleId,
    revisionNo,
    budgetSen,
    approvedAt: revision.approvedAt,
    shortfallAcknowledged,
    allocations: rows.map((a) => ({ id: a.id, categoryId: a.categoryId, amountSen: a.amountSen })),
  });
  scope.tx.insert(planRevisions).values(revision).run();
  if (rows.length > 0) scope.tx.insert(allocations).values(rows).run();
  return revision.id;
}

export interface RevisePlanInput {
  readonly cycleId: string;
  readonly budgetSen: Sen;
  /** The whole new plan: every category that has an amount. */
  readonly allocations: readonly { categoryId: string; amountSen: Sen }[];
  /** The student's "Approve anyway?" tap when the plan is over budget (FR-PLN-10, D-28). */
  readonly shortfallAcknowledged: boolean;
}

/**
 * A change to a cycle's plan becomes a new approved revision; earlier revisions are never
 * touched (FR-PLN-11, BR-08, AC-06). Works for completed cycles too (FR-PLN-18).
 */
export function revisePlanIn(scope: WriteScope, input: RevisePlanInput) {
  const cycle = scope.tx
    .select({ id: planningCycles.id })
    .from(planningCycles)
    .where(and(eq(planningCycles.id, input.cycleId), liveCycle))
    .get();
  if (!cycle) throw new RepoError("NOT_FOUND", "That plan doesn't exist");

  const withKinds = input.allocations.map((a) => ({
    ...a,
    kind: liveCategory(scope.tx, a.categoryId, "REFERENCE_MISSING").kind,
  }));
  ensure(checkCanApprove(input.budgetSen, withKinds, input.shortfallAcknowledged));

  const revisions = scope.tx
    .select({ id: planRevisions.id, revisionNo: planRevisions.revisionNo })
    .from(planRevisions)
    .where(eq(planRevisions.cycleId, input.cycleId))
    .all();
  const revisionNo = nextRevisionNo(revisions.map((r) => ({ ...r, approved: true })));
  const revisionId = insertApprovedRevision(
    scope,
    input.cycleId,
    revisionNo,
    input.budgetSen,
    input.allocations,
    input.shortfallAcknowledged,
  );
  return { revisionId, revisionNo };
}

export function revisePlan(ctx: RepoContext, input: RevisePlanInput) {
  return write(ctx, (scope) => revisePlanIn(scope, input));
}

export interface SetAllocationInput {
  readonly cycleId: string;
  readonly categoryId: string;
  readonly amountSen: Sen;
  readonly shortfallAcknowledged?: boolean;
}

/** Copies the current plan with one category's amount set: e.g. accepting an essential card (FR-PLN-20). */
export function setAllocationIn(scope: WriteScope, input: SetAllocationInput) {
  const plan = getPlan(scope.tx, input.cycleId);
  if (!plan) throw new RepoError("NOT_FOUND", "That plan doesn't exist");
  const exists = plan.allocations.some((a) => a.categoryId === input.categoryId);
  const next = exists
    ? plan.allocations.map((a) =>
        a.categoryId === input.categoryId ? { ...a, amountSen: input.amountSen } : a,
      )
    : [...plan.allocations, { categoryId: input.categoryId, amountSen: input.amountSen }];
  return revisePlanIn(scope, {
    cycleId: input.cycleId,
    budgetSen: sen(plan.revision.budgetSen),
    allocations: next,
    shortfallAcknowledged: input.shortfallAcknowledged ?? false,
  });
}

export function setAllocation(ctx: RepoContext, input: SetAllocationInput) {
  return write(ctx, (scope) => setAllocationIn(scope, input));
}
