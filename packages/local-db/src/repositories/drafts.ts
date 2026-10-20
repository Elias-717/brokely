import {
  checkCanApprove,
  checkNoOverlap,
  cycleFromInclusive,
  nextRevisionNo,
  sen,
  type Sen,
} from "@brokely/domain";
import { and, eq, inArray, isNull } from "drizzle-orm";
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
import { getDraftCycle } from "./cycles";
import { enqueueDelete, enqueueUpsert, freshRow, touched } from "./outbox";
import { cycleData, cycleLike, insertApprovedRevision } from "./plan";

/**
 * Guided setup drafts (D-20, FR-PLN-16, AC-47, D-63). Changes are saved as one unapproved
 * revision per cycle: leaving and coming back continues it, discarding leaves the current plan
 * untouched, and only approving makes it the plan. Without an active plan the draft belongs to a
 * draft cycle (BR-27), approved with `approveDraftCycle`.
 */

type RevisionRow = typeof planRevisions.$inferSelect;
type CycleRow = typeof planningCycles.$inferSelect;
type Part = { readonly categoryId: string; readonly amountSen: Sen };

export interface DraftView {
  readonly revision: RevisionRow;
  readonly allocations: readonly Part[];
}

function draftOf(db: Db, cycleId: string): RevisionRow | undefined {
  return db
    .select()
    .from(planRevisions)
    .where(
      and(
        eq(planRevisions.cycleId, cycleId),
        isNull(planRevisions.approvedAt),
        isNull(planRevisions.deletedAt),
      ),
    )
    .get();
}

function partsOf(db: Db, revisionId: string): Part[] {
  return db
    .select({ categoryId: allocations.categoryId, amountSen: allocations.amountSen })
    .from(allocations)
    .where(and(eq(allocations.revisionId, revisionId), isNull(allocations.deletedAt)))
    .all()
    .map((a) => ({ categoryId: a.categoryId, amountSen: sen(a.amountSen) }));
}

/** The unapproved changes to a cycle's plan, if any (AC-47). */
export function getRevisionDraft(db: Db, cycleId: string): DraftView | undefined {
  const revision = draftOf(db, cycleId);
  return revision ? { revision, allocations: partsOf(db, revision.id) } : undefined;
}

/** Rewrites a draft revision: new budget and allocations, one outbox operation (S-01). */
function rewriteDraft(
  scope: WriteScope,
  before: RevisionRow,
  budgetSen: Sen,
  parts: readonly Part[],
  changes: Partial<RevisionRow> = {},
) {
  for (const p of parts) liveCategory(scope.tx, p.categoryId, "REFERENCE_MISSING");
  const after: RevisionRow = { ...before, ...touched(scope.at), budgetSen, ...changes };
  scope.tx.delete(allocations).where(eq(allocations.revisionId, before.id)).run();
  const rows = parts
    .filter((p) => p.amountSen > 0)
    .map((p) => ({ ...freshRow(scope), revisionId: before.id, ...p }));
  enqueueUpsert(scope, "plan_revision", before.id, before.version, {
    cycleId: after.cycleId,
    revisionNo: after.revisionNo,
    budgetSen: after.budgetSen,
    approvedAt: after.approvedAt,
    shortfallAcknowledged: after.shortfallAcknowledged,
    allocations: rows.map((a) => ({ id: a.id, categoryId: a.categoryId, amountSen: a.amountSen })),
  });
  scope.tx.update(planRevisions).set(after).where(eq(planRevisions.id, before.id)).run();
  if (rows.length > 0) scope.tx.insert(allocations).values(rows).run();
}

/** Saves the draft for an active cycle: the first save starts it, later saves continue it. */
export function saveRevisionDraft(
  ctx: RepoContext,
  input: { cycleId: string; budgetSen: Sen; allocations: readonly Part[] },
) {
  return write(ctx, (scope) => {
    const existing = draftOf(scope.tx, input.cycleId);
    if (existing) return rewriteDraft(scope, existing, input.budgetSen, input.allocations);
    const revisions = scope.tx
      .select({ id: planRevisions.id, revisionNo: planRevisions.revisionNo })
      .from(planRevisions)
      .where(eq(planRevisions.cycleId, input.cycleId))
      .all();
    if (revisions.length === 0) throw new RepoError("NOT_FOUND", "That plan doesn't exist");
    insertApprovedRevision(
      scope,
      input.cycleId,
      nextRevisionNo(revisions.map((r) => ({ ...r, approved: true }))),
      input.budgetSen,
      input.allocations.filter((a) => a.amountSen > 0),
      false,
      false,
    );
  });
}

/**
 * Approving makes the draft the plan (FR-PLN-09/10, D-28). It becomes the newest revision even
 * if another change (an essential card) was approved meanwhile, so it really is current (BR-08).
 */
export function approveRevisionDraft(
  ctx: RepoContext,
  input: { cycleId: string; shortfallAcknowledged: boolean },
) {
  return write(ctx, (scope) => {
    const draft = draftOf(scope.tx, input.cycleId);
    if (!draft) throw new RepoError("NOT_FOUND", "There are no changes to approve");
    const parts = partsOf(scope.tx, draft.id);
    const withKinds = parts.map((p) => ({
      ...p,
      kind: liveCategory(scope.tx, p.categoryId, "REFERENCE_MISSING").kind,
    }));
    ensure(checkCanApprove(sen(draft.budgetSen), withKinds, input.shortfallAcknowledged));
    const others = scope.tx
      .select({ id: planRevisions.id, revisionNo: planRevisions.revisionNo })
      .from(planRevisions)
      .where(eq(planRevisions.cycleId, input.cycleId))
      .all()
      .filter((r) => r.id !== draft.id);
    const newest = others.reduce((max, r) => Math.max(max, r.revisionNo), 0);
    rewriteDraft(scope, draft, sen(draft.budgetSen), parts, {
      approvedAt: scope.at,
      shortfallAcknowledged: input.shortfallAcknowledged,
      revisionNo: Math.max(draft.revisionNo, newest + 1),
    });
    return { revisionId: draft.id };
  });
}

/** Throws the changes away; the current plan stays exactly as it was (AC-47). */
export function discardRevisionDraft(ctx: RepoContext, cycleId: string) {
  return write(ctx, (scope) => {
    const draft = draftOf(scope.tx, cycleId);
    if (!draft) return;
    enqueueDeleteRevision(scope, draft);
  });
}

function enqueueDeleteRevision(scope: WriteScope, draft: RevisionRow) {
  // A draft has no history worth keeping; removing the row frees its number (unique per cycle).
  enqueueDelete(scope, "plan_revision", draft.id, draft.version);
  scope.tx.delete(allocations).where(eq(allocations.revisionId, draft.id)).run();
  scope.tx.delete(planRevisions).where(eq(planRevisions.id, draft.id)).run();
}

/**
 * Guided setup without an active plan: saves the draft cycle (dates, budget, amounts). The
 * first save creates it; it owns no dates until approved (BR-05).
 */
export function saveDraftCycle(
  ctx: RepoContext,
  input: {
    startDate: string;
    endDateInclusive: string;
    budgetSen: Sen;
    allocations: readonly Part[];
  },
) {
  return write(ctx, (scope) => {
    const start = asLocalDate(input.startDate);
    const end = asLocalDate(input.endDateInclusive);
    if (end < start) throw new RepoError("VALIDATION_FAILED", "A cycle can't end before it starts");
    const range = cycleFromInclusive(start, end);
    const existing = getDraftCycle(scope.tx);
    if (existing) {
      const after: CycleRow = {
        ...existing.cycle,
        ...touched(scope.at),
        startDate: range.start,
        endDateExclusive: range.endExclusive,
        trackingStartDate: range.start,
      };
      enqueueUpsert(scope, "planning_cycle", after.id, existing.cycle.version, cycleData(after));
      scope.tx.update(planningCycles).set(after).where(eq(planningCycles.id, after.id)).run();
      rewriteDraft(scope, existing.revision, input.budgetSen, input.allocations);
      return { cycleId: after.id };
    }
    const cycle: CycleRow = {
      ...freshRow(scope),
      startDate: range.start,
      endDateExclusive: range.endExclusive,
      trackingStartDate: range.start,
      status: "draft",
    };
    enqueueUpsert(scope, "planning_cycle", cycle.id, null, cycleData(cycle));
    scope.tx.insert(planningCycles).values(cycle).run();
    insertApprovedRevision(
      scope,
      cycle.id,
      1,
      input.budgetSen,
      input.allocations.filter((a) => a.amountSen > 0),
      false,
      false,
    );
    return { cycleId: cycle.id };
  });
}

/** Whether these dates clash with an active or completed plan (BR-05), to warn before approving. */
export function datesClash(db: Db, startDate: string, endDateInclusive: string): boolean {
  const range = cycleFromInclusive(asLocalDate(startDate), asLocalDate(endDateInclusive));
  const others = db
    .select()
    .from(planningCycles)
    .where(
      and(
        isNull(planningCycles.deletedAt),
        inArray(planningCycles.status, ["active", "completed"]),
      ),
    )
    .all();
  return !checkNoOverlap({ id: "candidate", range, status: "active" }, others.map(cycleLike)).ok;
}
