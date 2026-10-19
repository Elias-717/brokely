import type { Sen } from "@brokely/domain";
import { createBillIn, type BillInput } from "./bills";
import { write, type RepoContext } from "./context";
import { setAllocationIn } from "./plan";

/** Essential cards on Home after a quick start (FR-PLN-20, D-23, D-24, D-35, D-36). */

export interface EssentialCardInput {
  readonly cycleId: string;
  readonly categoryId: string;
  /** The suggested, editable amount for the cycle, e.g. 3 × RM16 = RM48 (FR-PLN-06/07). */
  readonly allocationSen: Sen;
  /** Only when the student says it is a monthly bill on a set day, e.g. a phone plan (D-36). */
  readonly bill?: Omit<BillInput, "categoryId">;
  /** The "Approve anyway?" tap when this takes the plan over budget (FR-PLN-10, D-28). */
  readonly shortfallAcknowledged?: boolean;
}

/** Accepting a card: a new plan revision and, for fixed essentials, the bill, in one write. */
export function acceptEssentialCard(ctx: RepoContext, input: EssentialCardInput) {
  return write(ctx, (scope) => {
    const revision = setAllocationIn(scope, {
      cycleId: input.cycleId,
      categoryId: input.categoryId,
      amountSen: input.allocationSen,
      shortfallAcknowledged: input.shortfallAcknowledged,
    });
    const bill = input.bill
      ? createBillIn(scope, { ...input.bill, categoryId: input.categoryId })
      : null;
    return { ...revision, billId: bill?.billId ?? null };
  });
}
