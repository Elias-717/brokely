import {
  checkCanApprove,
  checkNoOverlap,
  cycleFromInclusive,
  localDate,
  nextCycleRange,
  sen,
  spendingByCategory,
  statusOn,
  type Sen,
} from "@brokely/domain";
import { and, desc, eq, inArray, isNull, lte } from "drizzle-orm";
import { allocations, planningCycles, planRevisions } from "../schema";
import { syncAllBillItems } from "./bills";
import { liveCategory, listCategories } from "./categories";
import { asLocalDate, ensure, RepoError, write, type Db, type RepoContext } from "./context";
import { listDebts } from "./debts";
import { enqueueDelete, enqueueUpsert, touched } from "./outbox";
import { cycleData, cycleLike, getPlan, insertApprovedRevision, listRevisions } from "./plan";
import { listTransactions } from "./transactions";

/**
 * Cycle lifecycle (BR-27, D-18, D-19, FR-PLN-14, FR-PLN-17, AC-48): an active cycle completes by
 * itself after its end date, shows original → final → actual, stays editable, and "Start next
 * cycle" makes a draft copy that the student approves (or discards).
 */

type CycleRow = typeof planningCycles.$inferSelect;

const live = isNull(planningCycles.deletedAt);

/** Marks every active cycle whose end date has passed as completed (FR-PLN-17). */
export function completeEndedCycles(ctx: RepoContext, today: string) {
  return write(ctx, (scope) => {
    const ended = scope.tx
      .select()
      .from(planningCycles)
      .where(
        and(live, eq(planningCycles.status, "active"), lte(planningCycles.endDateExclusive, today)),
      )
      .all()
      .filter((c) => statusOn(cycleLike(c), asLocalDate(today)) === "completed");
    for (const before of ended) {
      const after: CycleRow = { ...before, ...touched(scope.at), status: "completed" };
      enqueueUpsert(scope, "planning_cycle", before.id, before.version, cycleData(after));
      scope.tx.update(planningCycles).set(after).where(eq(planningCycles.id, before.id)).run();
    }
    return { completed: ended.length };
  });
}

/** The most recent cycle that has ended by `today` (completed), newest first. */
export function lastEndedCycle(db: Db, today: string): CycleRow | undefined {
  return db
    .select()
    .from(planningCycles)
    .where(
      and(
        live,
        inArray(planningCycles.status, ["active", "completed"]),
        lte(planningCycles.endDateExclusive, today),
      ),
    )
    .orderBy(desc(planningCycles.endDateExclusive))
    .get();
}

export interface SummaryLine {
  readonly categoryId: string;
  readonly name: string;
  readonly kind: "essential" | "optional" | "set_aside";
  readonly originalSen: Sen;
  readonly finalSen: Sen;
  readonly actualSen: Sen;
}

/**
 * End-of-cycle summary: original plan, final plan and actual spending per category
 * (FR-PLN-14, D-03). Recomputed every time, so edits after the end show up (D-19).
 */
export function cycleSummary(db: Db, cycleId: string) {
  const plan = getPlan(db, cycleId);
  if (!plan) return undefined;
  const revisions = listRevisions(db, cycleId);
  const first = revisions[0];
  const originalRows = first
    ? db
        .select({ categoryId: allocations.categoryId, amountSen: allocations.amountSen })
        .from(allocations)
        .where(and(eq(allocations.revisionId, first.id), isNull(allocations.deletedAt)))
        .all()
    : [];
  const original = new Map(originalRows.map((a) => [a.categoryId, sen(a.amountSen)]));
  const final = new Map(plan.allocations.map((a) => [a.categoryId, a.amountSen]));
  const range = {
    start: localDate(plan.cycle.startDate),
    endExclusive: localDate(plan.cycle.endDateExclusive),
  };
  const directions = new Map(listDebts(db).map((d) => [d.id, d.direction]));
  const actual = spendingByCategory(listTransactions(db, range), (id) => directions.get(id));

  const lines: SummaryLine[] = listCategories(db, { includeArchived: true })
    .map((c) => ({
      categoryId: c.id,
      name: c.name,
      kind: c.kind,
      originalSen: original.get(c.id) ?? sen(0),
      finalSen: final.get(c.id) ?? sen(0),
      actualSen: actual.get(c.id) ?? sen(0),
    }))
    .filter((l) => l.originalSen !== 0 || l.finalSen !== 0 || l.actualSen !== 0);

  return {
    cycle: plan.cycle,
    range,
    originalBudgetSen: first ? first.budgetSen : sen(plan.revision.budgetSen),
    finalBudgetSen: sen(plan.revision.budgetSen),
    spentSen: sen(lines.reduce((sum, l) => sum + l.actualSen, 0)),
    revisions: revisions.length,
    lines,
  };
}

/** The draft next cycle, if the student started one and hasn't approved it yet. */
export function getDraftCycle(db: Db) {
  const cycle = db
    .select()
    .from(planningCycles)
    .where(and(live, eq(planningCycles.status, "draft")))
    .orderBy(desc(planningCycles.startDate))
    .get();
  if (!cycle) return undefined;
  const revision = db
    .select()
    .from(planRevisions)
    .where(and(eq(planRevisions.cycleId, cycle.id), isNull(planRevisions.deletedAt)))
    .get();
  if (!revision) return undefined;
  const rows = db
    .select({ categoryId: allocations.categoryId, amountSen: allocations.amountSen })
    .from(allocations)
    .where(and(eq(allocations.revisionId, revision.id), isNull(allocations.deletedAt)))
    .all();
  return {
    cycle,
    revision,
    allocations: rows.map((a) => ({ categoryId: a.categoryId, amountSen: sen(a.amountSen) })),
  };
}

/**
 * "Start next cycle" (FR-PLN-17, AC-48): a draft starting the day after, as long as the last
 * one, with the same budget and amounts. Only one draft at a time: a second tap returns it.
 */
export function startNextCycle(ctx: RepoContext, fromCycleId: string) {
  return write(ctx, (scope) => {
    const existing = getDraftCycle(scope.tx);
    if (existing) return { cycleId: existing.cycle.id };
    const plan = getPlan(scope.tx, fromCycleId);
    if (!plan) throw new RepoError("NOT_FOUND", "That plan doesn't exist");
    const range = nextCycleRange({
      start: localDate(plan.cycle.startDate),
      endExclusive: localDate(plan.cycle.endDateExclusive),
    });
    const cycle: CycleRow = {
      id: scope.newId(),
      userId: null,
      version: 1,
      createdAt: scope.at,
      updatedAt: scope.at,
      deletedAt: null,
      syncStatus: "pending",
      startDate: range.start,
      endDateExclusive: range.endExclusive,
      trackingStartDate: range.start,
      status: "draft", // drafts may overlap anything (BR-05)
    };
    enqueueUpsert(scope, "planning_cycle", cycle.id, null, cycleData(cycle));
    scope.tx.insert(planningCycles).values(cycle).run();
    insertApprovedRevision(
      scope,
      cycle.id,
      1,
      sen(plan.revision.budgetSen),
      plan.allocations.map((a) => ({ categoryId: a.categoryId, amountSen: a.amountSen })),
      plan.revision.shortfallAcknowledged,
      false,
    );
    return { cycleId: cycle.id };
  });
}

export interface ApproveDraftInput {
  readonly cycleId: string;
  readonly startDate: string;
  readonly endDateInclusive: string;
  readonly budgetSen: Sen;
  readonly allocations: readonly { categoryId: string; amountSen: Sen }[];
  readonly shortfallAcknowledged: boolean;
}

/**
 * Approving the draft makes it the active cycle (BR-27). Its dates may not overlap an active or
 * completed cycle (BR-05). The draft revision is replaced by the approved original (D-03, D-20).
 */
export function approveDraftCycle(ctx: RepoContext, input: ApproveDraftInput) {
  return write(ctx, (scope) => {
    const draft = getDraftCycle(scope.tx);
    if (!draft || draft.cycle.id !== input.cycleId) {
      throw new RepoError("NOT_FOUND", "There is no draft plan to approve");
    }
    const start = asLocalDate(input.startDate);
    const end = asLocalDate(input.endDateInclusive);
    if (end < start) throw new RepoError("VALIDATION_FAILED", "A cycle can't end before it starts");
    const range = cycleFromInclusive(start, end);
    const withKinds = input.allocations.map((a) => ({
      ...a,
      kind: liveCategory(scope.tx, a.categoryId, "REFERENCE_MISSING").kind,
    }));
    ensure(checkCanApprove(input.budgetSen, withKinds, input.shortfallAcknowledged));

    const after: CycleRow = {
      ...draft.cycle,
      ...touched(scope.at),
      startDate: range.start,
      endDateExclusive: range.endExclusive,
      trackingStartDate: range.start,
      status: "active",
    };
    const others = scope.tx
      .select()
      .from(planningCycles)
      .where(and(live, inArray(planningCycles.status, ["active", "completed"])))
      .all();
    ensure(checkNoOverlap(cycleLike(after), others.map(cycleLike)));

    // The draft revision goes; the approved original takes number 1 (D-20).
    discardRevision(scope, draft.revision);
    enqueueUpsert(scope, "planning_cycle", after.id, draft.cycle.version, cycleData(after));
    scope.tx.update(planningCycles).set(after).where(eq(planningCycles.id, after.id)).run();
    const revisionId = insertApprovedRevision(
      scope,
      after.id,
      1,
      input.budgetSen,
      input.allocations.filter((a) => a.amountSen > 0),
      input.shortfallAcknowledged,
    );
    syncAllBillItems(scope); // bills get their dates in the new cycle (FR-CAT-04)
    return { cycleId: after.id, revisionId };
  });
}

type RevisionRow = typeof planRevisions.$inferSelect;

function discardRevision(scope: Parameters<typeof enqueueDelete>[0], revision: RevisionRow) {
  enqueueDelete(scope, "plan_revision", revision.id, revision.version);
  scope.tx.delete(allocations).where(eq(allocations.revisionId, revision.id)).run();
  scope.tx.delete(planRevisions).where(eq(planRevisions.id, revision.id)).run();
}

/** Throws the draft away (only drafts can be deleted, BR-27). */
export function discardDraftCycle(ctx: RepoContext, cycleId: string) {
  return write(ctx, (scope) => {
    const draft = getDraftCycle(scope.tx);
    if (!draft || draft.cycle.id !== cycleId) {
      throw new RepoError("NOT_FOUND", "There is no draft plan to discard");
    }
    discardRevision(scope, draft.revision);
    enqueueDelete(scope, "planning_cycle", cycleId, draft.cycle.version);
    scope.tx
      .update(planningCycles)
      .set({ deletedAt: scope.at, ...touched(scope.at) })
      .where(eq(planningCycles.id, cycleId))
      .run();
  });
}
