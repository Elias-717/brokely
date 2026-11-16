import { sen, type Sen } from "./money";
import type { PlanAmounts } from "./money-in";

/**
 * Plan changes (D-139): every approved revision of a plan as a change the student can read and
 * undo. Nothing is rewritten (D-03): undoing a change saves one more revision that reverses only
 * what that change moved, on top of today's plan. Pure: the caller reads and saves revisions.
 */
export interface RevisionSnapshot {
  readonly id: string;
  readonly revisionNo: number;
  /** When it was approved; drafts are never listed. */
  readonly approvedAt: string;
  readonly budgetSen: Sen;
  readonly allocations: readonly { readonly categoryId: string; readonly amountSen: Sen }[];
  readonly reason: string | null;
}

export interface PlanChange {
  readonly revisionId: string;
  readonly at: string;
  /** Why, in words; "Plan started" for the first, "Plan changed" when it wasn't saved. */
  readonly reason: string;
  /** Null when the budget didn't move; `from` is null for the first plan. */
  readonly budget: { readonly from: Sen | null; readonly to: Sen } | null;
  /** Categories whose amount moved, in the order they appear. */
  readonly categories: readonly {
    readonly categoryId: string;
    readonly from: Sen;
    readonly to: Sen;
  }[];
  /** The first plan has nothing to undo. */
  readonly canUndo: boolean;
}

const amountsOf = (r: RevisionSnapshot) =>
  new Map(r.allocations.map((a) => [a.categoryId, a.amountSen]));

/** The plan's changes, newest first (D-139). */
export function planChanges(revisions: readonly RevisionSnapshot[]): PlanChange[] {
  const ordered = [...revisions].sort((a, b) => a.revisionNo - b.revisionNo);
  return ordered
    .map((r, i): PlanChange => {
      const prev = i > 0 ? ordered[i - 1]! : null;
      if (!prev) {
        return {
          revisionId: r.id,
          at: r.approvedAt,
          reason: r.reason ?? "Plan started",
          budget: { from: null, to: r.budgetSen },
          categories: [],
          canUndo: false,
        };
      }
      const before = amountsOf(prev);
      const after = amountsOf(r);
      const ids = [...new Set([...prev.allocations, ...r.allocations].map((a) => a.categoryId))];
      return {
        revisionId: r.id,
        at: r.approvedAt,
        reason: r.reason ?? "Plan changed",
        budget: prev.budgetSen === r.budgetSen ? null : { from: prev.budgetSen, to: r.budgetSen },
        categories: ids
          .map((id) => ({
            categoryId: id,
            from: before.get(id) ?? sen(0),
            to: after.get(id) ?? sen(0),
          }))
          .filter((c) => c.from !== c.to),
        canUndo: true,
      };
    })
    .reverse();
}

/**
 * Today's plan with one change reversed (D-139): the budget and each category move back by what
 * that change moved them, whatever happened since. Null when it would leave no budget (a budget
 * must stay above zero, BR-01). A category can't go below zero; it is then left at zero.
 */
export function undoPlanChange(current: PlanAmounts, change: PlanChange): PlanAmounts | null {
  if (!change.canUndo) return null;
  const budgetMove =
    change.budget && change.budget.from !== null ? change.budget.to - change.budget.from : 0;
  const budgetSen = current.budgetSen - budgetMove;
  if (budgetSen <= 0) return null;
  const moves = new Map(change.categories.map((c) => [c.categoryId, c.to - c.from]));
  const allocations = current.allocations.map((a) => ({
    categoryId: a.categoryId,
    amountSen: sen(Math.max(0, a.amountSen - (moves.get(a.categoryId) ?? 0))),
  }));
  // A category the change took away entirely comes back with its old amount.
  for (const c of change.categories) {
    if (!current.allocations.some((a) => a.categoryId === c.categoryId) && c.from > c.to) {
      allocations.push({ categoryId: c.categoryId, amountSen: sen(c.from - c.to) });
    }
  }
  return { budgetSen: sen(budgetSen), allocations };
}
