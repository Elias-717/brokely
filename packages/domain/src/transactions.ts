import type { LocalDate } from "./dates";
import type { Sen } from "./money";

/**
 * The domain's view of a transaction (one aggregate with its lines, sync-api S-01).
 * Kept independent of the database and the contracts so rules can be tested on plain data.
 */

export type TransactionType =
  | "purchase"
  | "refund"
  | "transfer"
  | "borrow"
  | "lend"
  | "repayment_received"
  | "repayment_made"
  | "write_off";

export type Line =
  | { readonly kind: "spending"; readonly categoryId: string; readonly amountSen: Sen }
  | { readonly kind: "debt"; readonly debtId: string; readonly amountSen: Sen };

export interface Transaction {
  readonly id: string;
  readonly type: TransactionType;
  readonly amountSen: Sen;
  readonly localDate: LocalDate;
  readonly lines: readonly Line[];
  readonly refundsTransactionId?: string | null;
  readonly writeOffCategoryId?: string | null;
  /** Gap-fill estimate (D-15, 0.2). */
  readonly isEstimate?: boolean;
}

export type DebtDirection = "owed_by_me" | "owed_to_me";

/** Looks up a debt's direction; needed to know whether a write-off is spending (R-07). */
export type DebtDirectionOf = (debtId: string) => DebtDirection | undefined;
