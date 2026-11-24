import { planChanges, sen, undoPlanChange } from "@brokely/domain";
import {
  findCycleOn,
  getMoneyInRoutes,
  getPlanLinks,
  removePlanLink,
  setPlanLink,
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

  const restorePlan = route.revisionId ? undoRevision(cycle.id, route.revisionId) : null;
  return () => {
    restorePlan?.();
    setMoneyInRoute(repo, cycle.id, transactionId, route);
  };
}

/**
 * Deleting a loan counted in the plan (D-141) or a transfer added to it (D-145): its plan
 * revision is undone too.
 * Returns how to put it back, for the delete's Undo; null when the loan never touched the plan.
 */
export function takeBackLend(transactionId: string, localDate: string): (() => void) | null {
  const cycle = findCycleOn(repo.db, localDate);
  if (!cycle) return null;
  const revisionId = getPlanLinks(repo.db, cycle.id)[transactionId];
  if (!revisionId) return null;
  removePlanLink(repo, cycle.id, transactionId);
  const restorePlan = undoRevision(cycle.id, revisionId);
  return () => {
    restorePlan?.();
    setPlanLink(repo, cycle.id, transactionId, revisionId);
  };
}

/** Undoes one plan revision on today's plan as a new one (D-139); returns how to redo it. */
function undoRevision(cycleId: string, revisionId: string): (() => void) | null {
  const cycle = { id: cycleId };
  let restorePlan: (() => void) | null = null;
  const plan = getPlan(repo.db, cycle.id);
  const change = planChanges(listPlanHistory(repo.db, cycle.id)).find(
    (c) => c.revisionId === revisionId,
  );
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
  return restorePlan;
}
