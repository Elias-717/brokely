import { sen, sumSen, type Sen } from "./money";
import { fail, OK, type RuleResult } from "./result";
import type { Transaction } from "./transactions";

/**
 * Plans and revisions: BR-06, BR-07, BR-08, BR-28, FR-PLN-09/10/11/16, D-03, D-04, D-20, D-21.
 */

export type CategoryKind = "essential" | "optional" | "set_aside";

export interface AllocationInput {
  readonly categoryId: string;
  readonly kind: CategoryKind;
  readonly amountSen: Sen;
}

export interface PlanTotals {
  /** P = ΣCᵢ, allocations to essential and optional categories (BR-06). */
  readonly plannedSpendingSen: Sen;
  /** ΣSⱼ, allocations to set-asides (D-04). */
  readonly setAsideSen: Sen;
  /** U = B − (ΣCᵢ + ΣSⱼ); negative when over budget (BR-07). */
  readonly unallocatedSen: Sen;
  /** −U when U < 0, otherwise 0 (BR-07). */
  readonly shortfallSen: Sen;
}

export function planTotals(budgetSen: Sen, allocations: readonly AllocationInput[]): PlanTotals {
  const plannedSpendingSen = sumSen(
    allocations.filter((a) => a.kind !== "set_aside").map((a) => a.amountSen),
  );
  const setAsideSen = sumSen(
    allocations.filter((a) => a.kind === "set_aside").map((a) => a.amountSen),
  );
  const unallocatedSen = sen(budgetSen - plannedSpendingSen - setAsideSen);
  return {
    plannedSpendingSen,
    setAsideSen,
    unallocatedSen,
    shortfallSen: sen(Math.max(0, -unallocatedSen)),
  };
}

export interface RevisionLike {
  readonly id: string;
  readonly revisionNo: number;
  readonly approved: boolean;
}

/**
 * Approval: a plan with a shortfall needs the student's explicit acknowledgement
 * (FR-PLN-09, FR-PLN-10, AC-03).
 */
export function checkCanApprove(
  budgetSen: Sen,
  allocations: readonly AllocationInput[],
  shortfallAcknowledged: boolean,
): RuleResult {
  const { shortfallSen } = planTotals(budgetSen, allocations);
  if (shortfallSen > 0 && !shortfallAcknowledged) {
    return fail(
      "SHORTFALL_NOT_ACKNOWLEDGED",
      "This plan is over budget. Confirm the shortfall before activating it.",
    );
  }
  return OK;
}

/** The current revision is the highest approved revision number (BR-08). */
export function currentRevision<R extends RevisionLike>(revisions: readonly R[]): R | undefined {
  let best: R | undefined;
  for (const r of revisions) {
    if (r.approved && (!best || r.revisionNo > best.revisionNo)) best = r;
  }
  return best;
}

/** The original revision is number 1, kept for the end-of-cycle summary (D-03). */
export function originalRevision<R extends RevisionLike>(revisions: readonly R[]): R | undefined {
  return revisions.find((r) => r.revisionNo === 1 && r.approved);
}

/** Approved revisions are never edited; a change makes a new revision (FR-PLN-11, BR-08). */
export function checkCanEditRevision(revision: RevisionLike): RuleResult {
  return revision.approved
    ? fail(
        "REVISION_IMMUTABLE",
        "An approved plan can't be changed; save the change as a new revision",
      )
    : OK;
}

/** At most one unapproved draft revision per cycle (D-20, FR-PLN-16, AC-47). */
export function checkCanCreateDraft(revisions: readonly RevisionLike[]): RuleResult {
  return revisions.some((r) => !r.approved)
    ? fail(
        "DRAFT_REVISION_EXISTS",
        "This plan already has unsaved changes; continue or discard them",
      )
    : OK;
}

/** The next revision number for a cycle. */
export function nextRevisionNo(revisions: readonly RevisionLike[]): number {
  return revisions.reduce((max, r) => Math.max(max, r.revisionNo), 0) + 1;
}

/** A category with any allocation or transaction can only be archived (BR-28, D-21, AC-27). */
export function checkCanDeleteCategory(usage: {
  allocations: number;
  transactionLines: number;
}): RuleResult {
  return usage.allocations > 0 || usage.transactionLines > 0
    ? fail("CATEGORY_IN_USE", "This category has history. Archive it instead of deleting it.")
    : OK;
}

/**
 * Money in never changes the budget by itself. When money received in the cycle is more than
 * the budget, suggest adding the difference as a new revision (FR-TXN-11, D-26).
 * Pass the cycle's transactions; only income counts.
 */
export function moneyInSuggestion(
  cycleTransactions: readonly Pick<Transaction, "type" | "amountSen">[],
  budgetSen: Sen,
): Sen | null {
  const received = sumSen(
    cycleTransactions.filter((t) => t.type === "income").map((t) => t.amountSen),
  );
  return received > budgetSen ? sen(received - budgetSen) : null;
}
