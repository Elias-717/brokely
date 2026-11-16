import { planAfterMoneyIn, sen, type MoneyInGoesTo, type Sen } from "@brokely/domain";
import { write, type RepoContext } from "./context";
import { getPlan, revisePlanIn } from "./plan";
import { deleteTransactionIn, recordTransactionIn } from "./transactions";

/** The plan as it was before money in changed it, so Undo can put it back (D-03). */
export interface PlanBefore {
  readonly cycleId: string;
  readonly budgetSen: Sen;
  readonly allocations: readonly { categoryId: string; amountSen: Sen }[];
  readonly shortfallAcknowledged: boolean;
}

export interface MoneyInToInput {
  readonly amountSen: Sen;
  readonly occurredAt: string;
  readonly localDate: string;
  readonly note?: string;
  /** The plan the money in falls in; null when there is none (then it is only recorded). */
  readonly cycleId: string | null;
  readonly goesTo: MoneyInGoesTo;
}

/**
 * Money in with where it goes (D-130, D-134), in one database transaction: the record, and the
 * plan revision when it goes to the plan, today or a set-aside. Money in is still never
 * spending (FR-TXN-11); the student chose the plan change on the same screen.
 */
export function recordMoneyInTo(ctx: RepoContext, input: MoneyInToInput) {
  return write(ctx, (scope) => {
    const { id } = recordTransactionIn(scope, {
      type: "income",
      amountSen: input.amountSen,
      occurredAt: input.occurredAt,
      localDate: input.localDate,
      note: input.note,
      lines: [],
    });
    const plan = input.cycleId ? getPlan(scope.tx, input.cycleId) : undefined;
    if (!plan || !input.cycleId) return { id, before: null };
    const before: PlanBefore = {
      cycleId: input.cycleId,
      budgetSen: sen(plan.revision.budgetSen),
      allocations: plan.allocations.map((a) => ({
        categoryId: a.categoryId,
        amountSen: sen(a.amountSen),
      })),
      shortfallAcknowledged: plan.revision.shortfallAcknowledged,
    };
    const next = planAfterMoneyIn(before, input.amountSen, input.goesTo);
    if (!next) return { id, before: null };
    revisePlanIn(scope, {
      cycleId: input.cycleId,
      budgetSen: next.budgetSen,
      allocations: next.allocations,
      shortfallAcknowledged: before.shortfallAcknowledged,
    });
    return { id, before };
  });
}

/**
 * Undo of {@link recordMoneyInTo}: the record goes, and when the plan changed, one more
 * revision puts the old amounts back; history is never rewritten (D-03).
 */
export function undoMoneyInTo(ctx: RepoContext, saved: { id: string; before: PlanBefore | null }) {
  return write(ctx, (scope) => {
    deleteTransactionIn(scope, saved.id);
    if (saved.before) revisePlanIn(scope, saved.before);
  });
}
