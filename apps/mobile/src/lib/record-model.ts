import { formatRM, refundableSen, sen, withoutRecipient, type Sen } from "@brokely/domain";
import {
  bills,
  findCycleOn,
  getDebt,
  getMoneyInRoutes,
  getPlanLinks,
  getTransaction,
  listCategories,
  listTransactionEdits,
  listTransactions,
  scheduledItems,
  transactions,
  type TransactionView,
} from "@brokely/local-db";
import { and, eq, isNull } from "drizzle-orm";
import type { db as Db } from "../db/client";
import type { IconName } from "../ui/icon";
import { categoryIcon } from "./essentials-meta";

type Db = typeof Db;

/** The status pill under the amount (D-144). */
const PILL: Record<TransactionView["type"], string> = {
  purchase: "Spent",
  refund: "Refund",
  income: "Money in",
  transfer: "Transfer",
  lend: "Lent",
  borrow: "Borrowed",
  repayment_received: "Paid back to you",
  repayment_made: "You paid back",
  write_off: "Written off",
};

/** Money leaving the student (−, red) or coming in (+, green); transfers and write-offs neither. */
const FLOW: Record<TransactionView["type"], "out" | "in" | "none"> = {
  purchase: "out",
  lend: "out",
  repayment_made: "out",
  income: "in",
  refund: "in",
  borrow: "in",
  repayment_received: "in",
  transfer: "none",
  write_off: "none",
};

export interface RecordRow {
  readonly icon: IconName;
  readonly label: string;
  readonly value: string;
}

export interface RecordDetails {
  readonly t: TransactionView;
  readonly title: string;
  readonly icon: IconName;
  readonly amount: string;
  readonly flow: "out" | "in" | "none";
  readonly pill: string;
  readonly rows: readonly RecordRow[];
  readonly edits: ReturnType<typeof listTransactionEdits>;
  /** Spending that can still be refunded (FR-TXN-06); 0 for anything else. */
  readonly refundableSen: Sen;
  readonly syncStatus: string | null;
  /**
   * A loan or transfer the student can count in this month's plan or not (D-147): the plan it
   * falls in and whether it is counted now. Null for other records, or with no plan that day.
   */
  readonly planChoice: {
    readonly kind: "lend" | "transfer";
    readonly cycleId: string;
    readonly counted: boolean;
  } | null;
}

/** "Mon 24 Nov · 1:26 AM" in the phone's time. */
function whenText(instant: string): string {
  const d = new Date(instant);
  const day = d.toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
}

/**
 * Everything the record's details page shows (D-144), in plain rows, only the ones that apply:
 * what it was, when, who, how it counts, the bill or debt it belongs to, refunds and edits.
 */
export function readRecord(db: Db, id: string): RecordDetails | null {
  const t = getTransaction(db, id);
  if (!t) return null;
  const names = new Map(listCategories(db, { includeArchived: true }).map((c) => [c.id, c.name]));
  const spendingLines = t.lines.filter((l) => l.kind === "spending");
  const debtLines = t.lines.filter((l) => l.kind === "debt");
  const categoryId =
    spendingLines[0]?.kind === "spending"
      ? spendingLines[0].categoryId
      : (t.writeOffCategoryId ?? null);
  const category = categoryId ? (names.get(categoryId) ?? "A category") : null;

  // "Zappel drink · to Ali": the note as written, and who it went to on TNG.
  const own = withoutRecipient(t.note);
  // The name once, even from a note where it was added twice before the fix.
  const note = t.note.trim();
  const to =
    note.startsWith("To ") && !note.includes(" · ")
      ? note.slice(3)
      : (note.split(" · to ")[1] ?? "");
  const rows: RecordRow[] = [];
  if (category) rows.push({ icon: categoryIcon(category), label: "Category", value: category });
  rows.push({ icon: "calendar-blank", label: "When", value: whenText(t.occurredAt) });
  if (to) rows.push({ icon: "user", label: "Sent to", value: to.trim() });

  // A split: the student's share and who owes the rest (D-61).
  if (t.type === "purchase" && debtLines.length > 0) {
    const share = spendingLines.reduce((s, l) => s + l.amountSen, 0);
    rows.push({ icon: "users-three", label: "Your share", value: formatRM(sen(share)) });
  }
  for (const line of debtLines) {
    if (line.kind !== "debt") continue;
    const debt = getDebt(db, line.debtId);
    if (!debt) continue;
    const left = formatRM(debt.summary.outstandingSen);
    rows.push({
      icon: "hand-coins",
      label: "Debt",
      value:
        debt.direction === "owed_to_me"
          ? `${debt.counterparty} owes you ${left}`
          : `You owe ${debt.counterparty} ${left}`,
    });
  }

  // How it counts in the plan.
  const cycle = findCycleOn(db, t.localDate);
  const route = cycle ? getMoneyInRoutes(db, cycle.id)[t.id] : undefined;
  if (route) {
    const where =
      route.to === "plan"
        ? "Added to this month's plan"
        : route.to === "today"
          ? "Added to today"
          : route.to === "set_aside"
            ? "Put in a set-aside"
            : route.to === "debt"
              ? "Used to pay back a debt"
              : "Recorded only";
    rows.push({ icon: "piggy-bank", label: "Plan", value: where });
  } else if ((t.type === "lend" || t.type === "transfer") && cycle) {
    // Editable on the page (D-147).
    const counted = Boolean(getPlanLinks(db, cycle.id)[t.id]);
    rows.push({
      icon: "piggy-bank",
      label: "Plan",
      value: !counted
        ? "Not in the plan"
        : t.type === "lend"
          ? "Taken out of this month's plan"
          : "Added to this month's plan",
    });
  } else if (t.type !== "purchase" && t.type !== "refund" && t.type !== "write_off") {
    rows.push({ icon: "piggy-bank", label: "Counts as", value: "Not spending" });
  }

  // The bill it paid (Mark paid, D-17).
  const bill = db
    .select({ name: bills.name })
    .from(scheduledItems)
    .innerJoin(bills, eq(bills.id, scheduledItems.billId))
    .where(and(eq(scheduledItems.transactionId, t.id), isNull(scheduledItems.deletedAt)))
    .get();
  if (bill) rows.push({ icon: "receipt", label: "Bill", value: bill.name });

  // Refunds: of what, or how much came back so far (FR-TXN-06).
  let refundable = sen(0);
  if (t.type === "purchase") {
    const refunds = listTransactions(db).filter((r) => r.refundsTransactionId === t.id);
    refundable = refundableSen(t, refunds);
    const back = t.amountSen - refundable;
    if (back > 0)
      rows.push({ icon: "arrows-clockwise", label: "Refunded", value: formatRM(sen(back)) });
  }
  if (t.type === "refund" && t.refundsTransactionId) {
    const of = getTransaction(db, t.refundsTransactionId);
    if (of)
      rows.push({
        icon: "arrows-clockwise",
        label: "Refund of",
        value: withoutRecipient(of.note) || formatRM(of.amountSen),
      });
  }

  const sync = db
    .select({ s: transactions.syncStatus })
    .from(transactions)
    .where(eq(transactions.id, t.id))
    .get();
  const flow = FLOW[t.type];
  return {
    t,
    title: own || category || PILL[t.type],
    icon: category ? categoryIcon(category) : t.type === "income" ? "coins" : "hand-coins",
    amount: `${flow === "out" ? "−" : flow === "in" ? "+" : ""}${formatRM(t.amountSen)}`,
    flow,
    pill: t.source === "import" ? `${PILL[t.type]} · TNG` : PILL[t.type],
    rows,
    edits: listTransactionEdits(db, t.id),
    refundableSen: refundable,
    syncStatus: sync?.s ?? null,
    planChoice:
      (t.type === "lend" || t.type === "transfer") && cycle
        ? { kind: t.type, cycleId: cycle.id, counted: Boolean(getPlanLinks(db, cycle.id)[t.id]) }
        : null,
  };
}
