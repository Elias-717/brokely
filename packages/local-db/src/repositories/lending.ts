import { budgetAfterLending, type Sen } from "@brokely/domain";
import { RepoError, write, type RepoContext } from "./context";
import { createDebtIn, deleteDebtIn } from "./debts";
import type { PlanBefore } from "./money-in";
import { getPlan, revisePlanIn } from "./plan";
import { deleteTransactionIn } from "./transactions";

/**
 * "I lent" with "Count it in this month's plan? Yes" (D-141), in one database transaction: the
 * loan (a debt and its lend record, FR-DEBT-01) and a plan revision with the budget lowered by
 * the amount, every category amount kept. Lending is still never spending (FR-DEBT-06).
 */
export function lendFromPlan(
  ctx: RepoContext,
  input: Parameters<typeof createDebtIn>[1] & { cycleId: string; reason: string },
) {
  return write(ctx, (scope) => {
    const plan = getPlan(scope.tx, input.cycleId);
    if (!plan) throw new RepoError("NOT_FOUND", "That plan doesn't exist");
    const budgetSen = budgetAfterLending(plan.revision.budgetSen as Sen, input.amountSen);
    if (budgetSen === null) {
      throw new RepoError("VALIDATION_FAILED", "That's more than your whole plan.");
    }
    const { cycleId, reason, ...debt } = input;
    const { transactionId, debtId } = createDebtIn(scope, debt);
    const before: PlanBefore = {
      cycleId,
      budgetSen: plan.revision.budgetSen as Sen,
      allocations: plan.allocations.map((a) => ({
        categoryId: a.categoryId,
        amountSen: a.amountSen,
      })),
      shortfallAcknowledged: plan.revision.shortfallAcknowledged,
    };
    const { revisionId } = revisePlanIn(scope, {
      cycleId,
      budgetSen,
      allocations: before.allocations,
      // The student chose to take it from the plan; a smaller budget never needs a second "anyway".
      shortfallAcknowledged: true,
      reason: reason.slice(0, 120),
    });
    return { transactionId, debtId, revisionId, before, reason };
  });
}

/** Undo of {@link lendFromPlan}: the loan goes, and one more revision puts the budget back (D-03). */
export function undoLendFromPlan(
  ctx: RepoContext,
  saved: { transactionId: string; debtId: string; before: PlanBefore; reason: string },
) {
  return write(ctx, (scope) => {
    deleteTransactionIn(scope, saved.transactionId);
    deleteDebtIn(scope, saved.debtId);
    revisePlanIn(scope, { ...saved.before, reason: `Undid: ${saved.reason}`.slice(0, 120) });
  });
}
