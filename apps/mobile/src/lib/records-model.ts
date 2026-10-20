import { formatRM, localDate, type LocalDate } from "@brokely/domain";
import {
  listCategories,
  listCheckInDates,
  listDebts,
  listTransactions,
  OPENING_SPEND_NOTE,
  paidBillTransactionIds,
  type Db,
  type TransactionView,
} from "@brokely/local-db";
import { categoryEmoji } from "./essentials-meta";

export type RecordFilter = "all" | "spending" | "money-in" | "debts" | "bills";

/** How a row's amount reads: spending, money in (+, green) or not spending (grey). */
export type AmountStyle = "spending" | "money-in" | "not-spending";

export type RecordRow =
  | {
      readonly kind: "transaction";
      readonly id: string;
      readonly date: LocalDate;
      readonly emoji: string;
      readonly title: string;
      readonly detail: string;
      readonly amount: string;
      readonly style: AmountStyle;
      readonly groups: readonly RecordFilter[];
    }
  | { readonly kind: "check-in"; readonly id: string; readonly date: LocalDate };

export interface RecordDay {
  readonly date: LocalDate;
  readonly rows: readonly RecordRow[];
}

const TYPE_LABEL: Record<TransactionView["type"], string> = {
  purchase: "Spent",
  refund: "Refund",
  transfer: "Between my wallets",
  borrow: "Borrowed",
  lend: "Lent",
  repayment_received: "Paid back to me",
  repayment_made: "I paid back",
  write_off: "Written off",
  income: "Money in",
};

/**
 * Every record by day, newest first (S5, FR-TXN-01, FR-TXN-08, FR-DEBT-06). Debt and transfer
 * rows say "not spending" so nobody mistakes them for spending.
 */
export function readRecords(db: Db, filter: RecordFilter): RecordDay[] {
  const categories = new Map(
    listCategories(db, { includeArchived: true }).map((c) => [c.id, c.name]),
  );
  const debts = new Map(listDebts(db).map((d) => [d.id, d]));
  const billPaid = paidBillTransactionIds(db);

  const rows: RecordRow[] = listTransactions(db).map((t) => {
    const spendingLine = t.lines.find((l) => l.kind === "spending");
    const debtLine = t.lines.find((l) => l.kind === "debt");
    const categoryName =
      spendingLine?.kind === "spending" ? categories.get(spendingLine.categoryId) : undefined;
    const debt = debtLine?.kind === "debt" ? debts.get(debtLine.debtId) : undefined;
    const isBill = billPaid.has(t.id);
    const friendShare = t.type === "purchase" && debt ? ` · split with ${debt.counterparty}` : "";

    let title = t.note || categoryName || TYPE_LABEL[t.type];
    let detail: string;
    let style: AmountStyle = "spending";
    const groups: RecordFilter[] = ["all"];

    switch (t.type) {
      case "purchase":
        detail = `${categoryName ?? "Spent"}${isBill ? " · bill paid" : ""}${friendShare}${t.note === OPENING_SPEND_NOTE ? " · catch-up" : ""}`;
        groups.push("spending");
        if (isBill) groups.push("bills");
        if (debt) groups.push("debts");
        break;
      case "refund":
        detail = `Refund · ${categoryName ?? ""}`.trim();
        groups.push("spending");
        break;
      case "income":
        title = t.note || "Money in";
        detail = "Money in · not spending";
        style = "money-in";
        groups.push("money-in");
        break;
      case "transfer":
        detail = "Between my wallets · not spending";
        style = "not-spending";
        break;
      case "write_off":
        title = t.note || `Written off · ${debt?.counterparty ?? ""}`;
        detail = t.writeOffCategoryId
          ? `Counts as ${categories.get(t.writeOffCategoryId) ?? "spending"}`
          : "Debt · not spending";
        style = t.writeOffCategoryId ? "spending" : "not-spending";
        groups.push("debts");
        break;
      default: {
        const who = debt?.counterparty ?? "";
        title =
          t.note ||
          `${TYPE_LABEL[t.type]} ${t.type === "lend" ? "to" : t.type === "borrow" ? "from" : "·"} ${who}`.trim();
        detail = "Debt · not spending";
        style = "not-spending";
        groups.push("debts");
      }
    }
    // + for money in and refunds, − for spending (D-54); debts and transfers aren't spending,
    // so they get no sign. U+2212 is a real minus, which screen readers say as "minus".
    const sign =
      style === "money-in" || t.type === "refund" ? "+" : style === "spending" ? "−" : "";
    return {
      kind: "transaction",
      id: t.id,
      date: t.localDate,
      emoji: categoryName
        ? categoryEmoji(categoryName) || "🧾"
        : style === "money-in"
          ? "💸"
          : debt
            ? "🤝"
            : "🔁",
      title,
      detail,
      amount: `${sign}${formatRM(t.amountSen)}`,
      style,
      groups,
    };
  });

  const checkIns: RecordRow[] = listCheckInDates(db).map((d) => ({
    kind: "check-in",
    id: `check-in:${d}`,
    date: localDate(d),
  }));

  const shown = [
    ...rows.filter((r) => r.kind === "transaction" && r.groups.includes(filter)),
    ...(filter === "all" ? checkIns : []),
  ];

  const byDay = new Map<LocalDate, RecordRow[]>();
  for (const row of shown) byDay.set(row.date, [...(byDay.get(row.date) ?? []), row]);
  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, dayRows]) => ({ date, rows: dayRows }));
}
