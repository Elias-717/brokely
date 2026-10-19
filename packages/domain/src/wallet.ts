import { sen, type Sen } from "./money";
import type { Transaction, TransactionType } from "./transactions";

/**
 * Wallet check (FR-WAL-01…04, D-27, R-13). The student types how much money they have in total
 * (cash, TNG and bank together). Brokely compares it with what their own records say since the
 * previous check. It never claims to know a balance by itself (BR-12): every expected amount
 * starts from a number the student typed.
 */

export type MoneyEffect = "in" | "out" | "none";

/** Which way each transaction type moves the student's money (BR-31). */
export function moneyEffect(type: TransactionType): MoneyEffect {
  switch (type) {
    case "income":
    case "borrow":
    case "repayment_received":
    case "refund":
      return "in";
    case "purchase": // full amount, even if a friend owes part of it
    case "lend":
    case "repayment_made":
      return "out";
    case "transfer": // between the student's own wallets
    case "write_off": // no money moves
      return "none";
  }
}

export interface WalletCheckLike {
  /** ISO instant with offset. */
  readonly checkedAt: string;
  readonly amountSen: Sen;
}

export type TimedTransaction = Transaction & { readonly occurredAt: string };

/**
 * Expected now = last check + money in − money out recorded after it, up to `now` (BR-30).
 * `now` is passed in (NFR-02).
 */
export function expectedSinceLastCheck(
  last: WalletCheckLike,
  transactions: readonly TimedTransaction[],
  now: string,
): Sen {
  const from = Date.parse(last.checkedAt);
  const to = Date.parse(now);
  let expected: number = last.amountSen;
  for (const t of transactions) {
    const when = Date.parse(t.occurredAt);
    if (when <= from || when > to) continue;
    const effect = moneyEffect(t.type);
    if (effect === "in") expected += t.amountSen;
    else if (effect === "out") expected -= t.amountSen;
  }
  return sen(expected);
}

export type WalletDifference =
  | { readonly kind: "match"; readonly amountSen: Sen }
  /** Less than expected: offer to log it as spending. */
  | { readonly kind: "missing"; readonly amountSen: Sen }
  /** More than expected: offer to log it as money in. */
  | { readonly kind: "extra"; readonly amountSen: Sen };

export function walletDifference(actualSen: Sen, expectedSen: Sen): WalletDifference {
  if (actualSen === expectedSen) return { kind: "match", amountSen: sen(0) };
  return actualSen < expectedSen
    ? { kind: "missing", amountSen: sen(expectedSen - actualSen) }
    : { kind: "extra", amountSen: sen(actualSen - expectedSen) };
}
