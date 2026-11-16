import { planChanges, sen, undoPlanChange } from "@brokely/domain";
import {
  findCycleOn,
  getMoneyInRoutes,
  getPlan,
  listPlanHistory,
  removeMoneyInRoute,
  revisePlan,
  setMoneyInRoute,
} from "@brokely/local-db";
import { repo } from "../db/client";

/**
 * Deleting a money-in record (D-139): where it went is forgotten, so it no longer adds to
 * today, and the plan change it made is undone as one more revision ("Undid: …", D-03).
 * Returns how to put it all back, for the delete's Undo; null when there was nothing to take
 * back. Money in saved before its plan change was remembered (17 Nov) keeps the plan as it is;
 * the student can undo that change in Plan changes.
 */
export function takeBackMoneyIn(transactionId: string, localDate: string): (() => void) | null {
  const cycle = findCycleOn(repo.db, localDate);
  if (!cycle) return null;
  const route = getMoneyInRoutes(repo.db, cycle.id)[transactionId];
  if (!route) return null;
  removeMoneyInRoute(repo, cycle.id, transactionId);

  let restorePlan: (() => void) | null = null;
  const plan = getPlan(repo.db, cycle.id);
  const change = route.revisionId
    ? planChanges(listPlanHistory(repo.db, cycle.id)).find((c) => c.revisionId === route.revisionId)
    : undefined;
  if (plan && change) {
    const current = {
      budgetSen: sen(plan.revision.budgetSen),
      allocations: plan.allocations.map((a) => ({
        categoryId: a.categoryId,
        amountSen: sen(a.amountSen),
      })),
    };
    const next = undoPlanChange(current, change);
    if (next) {
      const saved = revisePlan(repo, {
        cycleId: cycle.id,
        ...next,
        // Taking money out never needs a new "anyway": the student is deleting the record.
        shortfallAcknowledged: true,
        reason: `Undid: ${change.reason}`.slice(0, 120),
      });
      if (saved.ok) {
        restorePlan = () =>
          revisePlan(repo, {
            cycleId: cycle.id,
            ...current,
            shortfallAcknowledged: plan.revision.shortfallAcknowledged,
            reason: `Redid: ${change.reason}`.slice(0, 120),
          });
      }
    }
  }
  return () => {
    restorePlan?.();
    setMoneyInRoute(repo, cycle.id, transactionId, route);
  };
}
