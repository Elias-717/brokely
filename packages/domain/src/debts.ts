import { sen, sumSen, type Sen } from "./money";
import { fail, OK, type RuleResult } from "./result";
import type { DebtDirection, Transaction, TransactionType } from "./transactions";

/**
 * Debts: BR-22, BR-23, FR-DEBT-01 to 06, R-07, D-01.
 * Principal, outstanding and status are derived from transactions, never stored (ERD v0.2).
 */

export type DebtStatus = "open" | "settled" | "written_off";

export interface DebtSummary {
  readonly principalSen: Sen;
  readonly repaidSen: Sen;
  readonly writtenOffSen: Sen;
  readonly adjustmentsSen: Sen;
  /** principal − repayments − write-offs + adjustments (BR-22). */
  readonly outstandingSen: Sen;
  readonly status: DebtStatus;
}

const OPENS: ReadonlySet<TransactionType> = new Set(["purchase", "lend", "borrow"]);
const REPAYS: ReadonlySet<TransactionType> = new Set(["repayment_received", "repayment_made"]);

/** Which transaction types may touch a debt in each direction (FR-DEBT-01, D-01). */
const ALLOWED: Record<DebtDirection, ReadonlySet<TransactionType>> = {
  owed_to_me: new Set(["purchase", "lend", "repayment_received", "write_off"]),
  owed_by_me: new Set(["borrow", "repayment_made", "write_off"]),
};

export function summarizeDebt(
  debtId: string,
  transactions: readonly Transaction[],
  adjustmentsSen: readonly Sen[] = [],
): DebtSummary {
  let principal = 0;
  let repaid = 0;
  let writtenOff = 0;
  for (const t of transactions) {
    for (const line of t.lines) {
      if (line.kind !== "debt" || line.debtId !== debtId) continue;
      if (OPENS.has(t.type)) principal += line.amountSen;
      else if (REPAYS.has(t.type)) repaid += line.amountSen;
      else if (t.type === "write_off") writtenOff += line.amountSen;
    }
  }
  const adjustments = sumSen(adjustmentsSen);
  const outstanding = principal - repaid - writtenOff + adjustments;
  return {
    principalSen: sen(principal),
    repaidSen: sen(repaid),
    writtenOffSen: sen(writtenOff),
    adjustmentsSen: adjustments,
    outstandingSen: sen(outstanding),
    status: outstanding > 0 ? "open" : writtenOff > 0 ? "written_off" : "settled",
  };
}

/** A lend can't touch a debt I owe, a repayment I received can't reduce a debt I owe, etc. */
export function checkDebtMovement(direction: DebtDirection, type: TransactionType): RuleResult {
  return ALLOWED[direction].has(type)
    ? OK
    : fail("VALIDATION_FAILED", `A ${type} can't be recorded on a debt that is ${direction}`);
}

/**
 * Repayments and write-offs can't take the outstanding amount below zero without an
 * explicit adjustment (BR-22).
 */
export function checkWithinOutstanding(summary: DebtSummary, amountSen: Sen): RuleResult {
  return amountSen <= summary.outstandingSen
    ? OK
    : fail(
        "DEBT_EXCEEDS_OUTSTANDING",
        `Only ${summary.outstandingSen} sen is outstanding on this debt`,
      );
}
