import { sen, sumSen, type DebtDirection, type LocalDate, type Sen } from "@brokely/domain";
import {
  getDebt,
  listCategories,
  listDebts,
  OPENING_DEBT_NOTE,
  transactionsForDebts,
  type DebtView,
  type Db,
} from "@brokely/local-db";

export interface DebtRow {
  readonly id: string;
  readonly direction: DebtDirection;
  readonly name: string;
  readonly outstandingSen: Sen;
  readonly principalSen: Sen;
  readonly status: DebtView["summary"]["status"];
  readonly dueDate: LocalDate | null;
  readonly fromBefore: boolean;
}

const row = (d: DebtView): DebtRow => ({
  id: d.id,
  direction: d.direction,
  name: d.counterparty,
  outstandingSen: d.summary.outstandingSen,
  principalSen: d.summary.principalSen,
  status: d.summary.status,
  dueDate: (d.dueDate as LocalDate | null) ?? null,
  fromBefore: d.notes === OPENING_DEBT_NOTE,
});

/** S7 Debts: open debts each way with totals, then settled ones (FR-DEBT-03). */
export function readDebts(db: Db) {
  const all = listDebts(db).map(row);
  const open = all.filter((d) => d.status === "open");
  const owedToMe = open.filter((d) => d.direction === "owed_to_me");
  const iOwe = open.filter((d) => d.direction === "owed_by_me");
  return {
    owedToMe,
    iOwe,
    owedToMeSen: sumSen(owedToMe.map((d) => d.outstandingSen)),
    iOweSen: sumSen(iOwe.map((d) => d.outstandingSen)),
    closed: all.filter((d) => d.status !== "open"),
  };
}

/** What happened on a debt, newest first, in plain words. */
export interface DebtEvent {
  readonly transactionId: string;
  readonly date: LocalDate;
  readonly label: string;
  readonly amountSen: Sen;
}

const LABELS: Record<string, (d: DebtDirection) => string> = {
  lend: () => "You lent",
  borrow: () => "You borrowed",
  purchase: () => "Their share of a split",
  repayment_received: () => "Paid you back",
  repayment_made: () => "You paid back",
  write_off: (d) => (d === "owed_to_me" ? "Written off (counted as spending)" : "Written off"),
};

/** One debt with its history (FR-DEBT-02, FR-DEBT-06). */
export function readDebt(db: Db, id: string) {
  const debt = getDebt(db, id);
  if (!debt) return null;
  const events = transactionsForDebts(db, [id])
    .map((t): DebtEvent => {
      const line = t.lines.find((l) => l.kind === "debt" && l.debtId === id);
      return {
        transactionId: t.id,
        date: t.localDate,
        label: LABELS[t.type]?.(debt.direction) ?? t.type,
        amountSen: line ? line.amountSen : sen(0),
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return {
    ...row(debt),
    repaidSen: debt.summary.repaidSen,
    events,
    // Write-offs of money owed to the student count as spending in a category (R-07).
    categories: listCategories(db).filter((c) => c.kind !== "set_aside"),
  };
}
