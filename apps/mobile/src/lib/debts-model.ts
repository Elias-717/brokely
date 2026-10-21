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
  readonly repaidSen: Sen;
  /** How it started, e.g. "Their share of a split, 12 Nov" (S7, D-78). */
  readonly origin: { readonly label: string; readonly date: LocalDate } | null;
}

const row = (d: DebtView, origin: DebtRow["origin"] = null): DebtRow => ({
  id: d.id,
  direction: d.direction,
  name: d.counterparty,
  outstandingSen: d.summary.outstandingSen,
  principalSen: d.summary.principalSen,
  status: d.summary.status,
  dueDate: (d.dueDate as LocalDate | null) ?? null,
  fromBefore: d.notes === OPENING_DEBT_NOTE,
  repaidSen: d.summary.repaidSen,
  origin,
});

const OPENS = new Set(["lend", "borrow", "purchase"]);

/** S7 Debts: open debts each way with totals, then settled ones (FR-DEBT-03). */
export function readDebts(db: Db) {
  const debts = listDebts(db);
  // The oldest opening entry of each debt: where it started.
  const origins = new Map<string, DebtRow["origin"]>();
  const opening = transactionsForDebts(
    db,
    debts.map((d) => d.id),
  )
    .filter((t) => OPENS.has(t.type))
    .sort((a, b) => (a.localDate < b.localDate ? -1 : a.localDate > b.localDate ? 1 : 0));
  for (const t of opening) {
    for (const line of t.lines) {
      if (line.kind !== "debt" || origins.has(line.debtId)) continue;
      const debt = debts.find((d) => d.id === line.debtId);
      const label =
        t.type === "purchase"
          ? t.note
            ? `Their share of ${t.note}`
            : "Their share of a split"
          : t.note || LABELS[t.type]!(debt?.direction ?? "owed_to_me");
      origins.set(line.debtId, { label, date: t.localDate });
    }
  }
  const all = debts.map((d) => row(d, origins.get(d.id) ?? null));
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
  /** Money towards the student (↓) or away from them (↑), or a write-off (S7c timeline). */
  readonly flow: "in" | "out" | "written_off";
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
        flow:
          t.type === "write_off"
            ? "written_off"
            : t.type === "repayment_received" || t.type === "borrow"
              ? "in"
              : "out",
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
