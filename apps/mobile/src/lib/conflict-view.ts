import { formatRM, localDate, sen } from "@brokely/domain";
import { dayMonth } from "./today";

/**
 * The two versions of a conflict as rows a student can read (S13m, FR-SYNC-08): "Amount ·
 * RM 12.00 | RM 9.50", the ones that differ marked. Technical fields (IDs, versions, sort
 * order, exact times) are left out.
 */

type Data = Record<string, unknown> | null;

export interface FieldRow {
  readonly label: string;
  /** Null when that version doesn't have it, e.g. a deleted record. */
  readonly latest: string | null;
  readonly mine: string | null;
  readonly differs: boolean;
}

const money = (v: unknown) => (typeof v === "number" ? formatRM(sen(v)) : null);
const text = (v: unknown) => (typeof v === "string" ? v.trim() || "—" : null);
const date = (v: unknown) => (typeof v === "string" ? dayMonth(localDate(v.slice(0, 10))) : null);

const TYPES: Record<string, string> = {
  purchase: "Spent",
  income: "Money in",
  refund: "Refund",
  transfer: "Transfer",
  lend: "Lent",
  borrow: "Borrowed",
  repayment_received: "Paid back to you",
  repayment_made: "You paid back",
  write_off: "Written off",
};

/** Field → its label and how to show it. Order is the order on screen. */
function fieldsFor(categoryName: (id: string) => string) {
  const spendingCategory = (v: unknown) => {
    const line = Array.isArray(v)
      ? (v as { kind?: string; categoryId?: string }[]).find((l) => l.kind === "spending")
      : undefined;
    return line?.categoryId ? categoryName(line.categoryId) : null;
  };
  const planned = (v: unknown) =>
    Array.isArray(v)
      ? formatRM(sen((v as { amountSen: number }[]).reduce((sum, a) => sum + a.amountSen, 0)))
      : null;
  return [
    { key: "name", label: "Name", show: text },
    { key: "counterparty", label: "Name", show: text },
    {
      key: "type",
      label: "Type",
      show: (v: unknown) => (typeof v === "string" ? (TYPES[v] ?? v) : null),
    },
    { key: "amountSen", label: "Amount", show: money },
    { key: "budgetSen", label: "Budget", show: money },
    { key: "allocations", label: "Planned", show: planned },
    { key: "lines", label: "Category", show: spendingCategory },
    {
      key: "categoryId",
      label: "Category",
      show: (v: unknown) => (typeof v === "string" ? categoryName(v) : null),
    },
    { key: "note", label: "Note", show: text },
    { key: "notes", label: "Note", show: text },
    { key: "localDate", label: "Date", show: date },
    { key: "dueDate", label: "Due", show: date },
    { key: "startDate", label: "Starts", show: date },
    { key: "archivedAt", label: "Archived", show: (v: unknown) => (v ? "Yes" : "No") },
  ] as const;
}

export function conflictRows(
  mine: Data,
  latest: Data,
  categoryName: (id: string) => string,
): FieldRow[] {
  const rows: FieldRow[] = [];
  for (const f of fieldsFor(categoryName)) {
    if (!(mine && f.key in mine) && !(latest && f.key in latest)) continue;
    const m = mine ? f.show(mine[f.key]) : null;
    const l = latest ? f.show(latest[f.key]) : null;
    if (m === null && l === null) continue;
    rows.push({ label: f.label, mine: m, latest: l, differs: m !== l });
  }
  return rows;
}
