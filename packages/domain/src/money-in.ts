import { sen, type Sen } from "./money";

/**
 * Where money in goes (D-130, D-134). The Money in sheet has a "Goes to" row, filled in from the
 * source, so money in does something for the student in one step: it raises this month's plan,
 * fills a set-aside, pays back a debt, or is just recorded. Under RM50 Brokely also offers to
 * put it all on today, because a small amount spread over the month is a few sen a day.
 * Pure: the caller saves the record and the plan revision.
 */
export type MoneyInGoesTo =
  | { readonly kind: "plan" }
  | { readonly kind: "set_aside"; readonly categoryId: string }
  | { readonly kind: "today" }
  | { readonly kind: "debt"; readonly debtId: string }
  | { readonly kind: "record" };

export type MoneyInRoute = MoneyInGoesTo["kind"];

/** Below this, Brokely offers "Add it to today instead?" (D-134). */
export const SMALL_MONEY_IN_SEN: Sen = sen(5_000);

/** Sources whose money goes to Savings by default (D-130); the rest go to the plan. */
const TO_SAVINGS = new Set(["Part-time", "Gift"]);

/** The Goes to row's starting choice for a source (D-130). */
export function defaultGoesTo(source: string, savingsCategoryId: string | null): MoneyInGoesTo {
  if (TO_SAVINGS.has(source) && savingsCategoryId !== null) {
    return { kind: "set_aside", categoryId: savingsCategoryId };
  }
  return { kind: "plan" };
}

/** Whether to offer putting the money on today (D-134). */
export function offersToday(amountSen: Sen): boolean {
  return amountSen > 0 && amountSen < SMALL_MONEY_IN_SEN;
}

export interface PlanAmounts {
  readonly budgetSen: Sen;
  readonly allocations: readonly { readonly categoryId: string; readonly amountSen: Sen }[];
}

/**
 * The plan after money in, or null when the plan stays as it is (a debt payback or just
 * recording it). The plan and today raise the budget and keep every category amount; a
 * set-aside raises the budget and that set-aside together, so no money becomes free to spend.
 * Raising the budget never makes a shortfall.
 */
export function planAfterMoneyIn(
  plan: PlanAmounts,
  amountSen: Sen,
  goesTo: MoneyInGoesTo,
): PlanAmounts | null {
  if (goesTo.kind === "debt" || goesTo.kind === "record") return null;
  const budgetSen = sen(plan.budgetSen + amountSen);
  if (goesTo.kind !== "set_aside") return { budgetSen, allocations: plan.allocations };
  const has = plan.allocations.some((a) => a.categoryId === goesTo.categoryId);
  return {
    budgetSen,
    allocations: has
      ? plan.allocations.map((a) =>
          a.categoryId === goesTo.categoryId
            ? { ...a, amountSen: sen(a.amountSen + amountSen) }
            : a,
        )
      : [...plan.allocations, { categoryId: goesTo.categoryId, amountSen }],
  };
}

/** Where one money in record went, as the phone remembers it (phone-only, by record id). */
export interface MoneyInRouteRecord {
  readonly to: MoneyInRoute;
  readonly amountSen: Sen;
  readonly localDate: string;
  /** The plan revision it made, so deleting the record can undo it too (D-139). */
  readonly revisionId?: string;
}

/**
 * Money in put on today, dated today: added on top of today's share (D-134). From tomorrow it
 * is part of the plan like any other money, so whatever is left of it is spread over the days.
 */
export function todayBoostSen(
  routes: Readonly<Record<string, MoneyInRouteRecord>>,
  today: string,
): Sen {
  return sen(
    Object.values(routes)
      .filter((r) => r.to === "today" && r.localDate === today)
      .reduce((sum, r) => sum + r.amountSen, 0),
  );
}

/**
 * Home's "Add RMx to your plan?" card (D-125) after D-130: money the student chose just to
 * record, plus, for money in saved before Goes to existed (no route), the old rule: only the
 * part above the budget. Debt paybacks are never suggested. Null when there is nothing to add.
 */
export function moneyInLeftOut(
  incomes: readonly { readonly amountSen: Sen; readonly route: MoneyInRoute | null }[],
  budgetSen: Sen,
): Sen | null {
  const sum = (route: MoneyInRoute | null) =>
    incomes.filter((i) => i.route === route).reduce((s, i) => s + i.amountSen, 0);
  const total = sum("record") + Math.max(0, sum(null) - budgetSen);
  return total > 0 ? sen(total) : null;
}
