import { divideSen, roundHalfEven, sen, type Sen } from "./money";
import type { CategoryKind } from "./plan";

/**
 * Category heads-up on Insights (D-96): when a "nice to have" category takes more than food, or
 * more than was planned for it, Brokely says so with the numbers and one thing to try. Only
 * optional categories are ever flagged: essentials and set-asides never are (rule 9, no shaming
 * for essentials). Fact and action first; it is a suggestion, nothing is blocked (D-63).
 */
export interface CategorySpend {
  readonly id: string;
  readonly name: string;
  readonly kind: CategoryKind;
  /** Amount planned for it in the latest revision; 0 when it has none. */
  readonly plannedSen: Sen;
  /** Spending N for it in this plan (BR-13). */
  readonly spentSen: Sen;
}

/** Below this an optional category is never flagged, so a RM5 snack on day one stays quiet. */
export const HEADS_UP_MIN_SEN = sen(2000);

export type CategoryHeadsUp = {
  readonly categoryId: string;
  readonly name: string;
  readonly spentSen: Sen;
  /** About a day that keeps it inside its plan amount; null when nothing planned is left. */
  readonly perDaySen: Sen | null;
} & (
  | {
      readonly reason: "ahead_of_essential";
      readonly essential: { readonly id: string; readonly name: string; readonly spentSen: Sen };
    }
  | { readonly reason: "over_plan"; readonly plannedSen: Sen }
);

/**
 * The essential to compare with: Meals (food comes first) when there is one, otherwise the
 * essential with the most spending.
 */
function anchorOf(categories: readonly CategorySpend[]): CategorySpend | null {
  const essentials = categories.filter((c) => c.kind === "essential");
  const meals = essentials.find((c) => c.name.trim().toLowerCase() === "meals");
  if (meals) return meals;
  let top: CategorySpend | null = null;
  for (const c of essentials) if (!top || c.spentSen > top.spentSen) top = c;
  return top;
}

/** Flagged optional categories, the biggest gap first. */
export function categoryHeadsUps(
  categories: readonly CategorySpend[],
  daysLeft: number,
): CategoryHeadsUp[] {
  const anchor = anchorOf(categories);
  const flagged: { headsUp: CategoryHeadsUp; gap: number }[] = [];
  for (const c of categories) {
    if (c.kind !== "optional" || c.spentSen < HEADS_UP_MIN_SEN) continue;
    const plannedLeft = c.plannedSen - c.spentSen;
    const perDaySen =
      plannedLeft > 0 && daysLeft > 0 ? roundHalfEven(divideSen(sen(plannedLeft), daysLeft)) : null;
    const base = { categoryId: c.id, name: c.name, spentSen: c.spentSen, perDaySen };
    if (anchor && c.spentSen > anchor.spentSen) {
      flagged.push({
        headsUp: {
          ...base,
          reason: "ahead_of_essential",
          essential: { id: anchor.id, name: anchor.name, spentSen: anchor.spentSen },
        },
        gap: c.spentSen - anchor.spentSen,
      });
    } else if (c.plannedSen > 0 && c.spentSen > c.plannedSen) {
      flagged.push({
        headsUp: { ...base, reason: "over_plan", plannedSen: c.plannedSen },
        gap: c.spentSen - c.plannedSen,
      });
    }
  }
  return flagged.sort((a, b) => b.gap - a.gap).map((f) => f.headsUp);
}
