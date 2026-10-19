import { localDate } from "./dates";
import { sen } from "./money";
import type { Line, Transaction, TransactionType } from "./transactions";

/** Small builders so each test reads like the SRS example it checks. */

export const cat = {
  meals: "meals",
  laundry: "laundry",
  transport: "transport",
  phone: "phone",
  fun: "fun",
  gifts: "gifts",
  emergency: "emergency", // set-aside
} as const;

let counter = 0;
const nextId = () => `t${++counter}`;

export function spend(categoryId: string, amountSen: number): Line {
  return { kind: "spending", categoryId, amountSen: sen(amountSen) };
}

export function debtLine(debtId: string, amountSen: number): Line {
  return { kind: "debt", debtId, amountSen: sen(amountSen) };
}

export function txn(
  type: TransactionType,
  amountSen: number,
  lines: Line[],
  extra: Partial<Transaction> & { date?: string } = {},
): Transaction {
  const { date, ...rest } = extra;
  return {
    id: nextId(),
    type,
    amountSen: sen(amountSen),
    localDate: localDate(date ?? "2026-11-02"),
    lines,
    ...rest,
  };
}

/** A purchase entirely in one category. */
export function purchase(categoryId: string, amountSen: number, date?: string): Transaction {
  return txn("purchase", amountSen, [spend(categoryId, amountSen)], date ? { date } : {});
}
