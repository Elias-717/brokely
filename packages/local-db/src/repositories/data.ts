import type { Sen } from "@brokely/domain";
import { isNull } from "drizzle-orm";
import {
  allocations,
  bills,
  categories,
  dayCheckIns,
  debtAdjustments,
  debts,
  localPrefs,
  outboxOperations,
  planningCycles,
  planRevisions,
  scheduledItems,
  syncState,
  transactionEdits,
  transactionLines,
  transactions,
  userSettings,
  walletChecks,
} from "../schema";
import type { Db } from "./context";
import { listTransactions } from "./transactions";

/**
 * Your data (FR-ACC-06, FR-ACC-07, PDPA): export everything the student recorded as JSON and
 * CSV, or delete all of it from this phone. Exports never include sync bookkeeping.
 */

/** Bump when the JSON layout changes, so an import can tell versions apart. */
export const EXPORT_FORMAT = 1;

/** Every record the student made, deleted ones left out, as one JSON document. */
export function exportJson(db: Db, exportedAt: string): string {
  const live = <T extends { deletedAt: unknown }>(rows: T[]) => rows.filter((r) => !r.deletedAt);
  const data = {
    app: "Brokely",
    format: EXPORT_FORMAT,
    exportedAt,
    currency: "MYR",
    note: "Amounts are whole sen (RM1.00 = 100).",
    settings: db.select().from(userSettings).where(isNull(userSettings.deletedAt)).all(),
    phoneOnly: db.select().from(localPrefs).all(),
    categories: live(db.select().from(categories).all()),
    planningCycles: live(db.select().from(planningCycles).all()),
    planRevisions: db.select().from(planRevisions).all(),
    allocations: db.select().from(allocations).all(),
    bills: live(db.select().from(bills).all()),
    scheduledItems: live(db.select().from(scheduledItems).all()),
    transactions: live(db.select().from(transactions).all()),
    transactionLines: db.select().from(transactionLines).all(),
    transactionEdits: db.select().from(transactionEdits).all(),
    debts: live(db.select().from(debts).all()),
    debtAdjustments: live(db.select().from(debtAdjustments).all()),
    checkIns: live(db.select().from(dayCheckIns).all()),
    walletChecks: live(db.select().from(walletChecks).all()),
  };
  return JSON.stringify(data, null, 2);
}

/** A CSV field: quoted when it holds a comma, quote or line break (RFC 4180). */
function field(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** "1234.50": exact, from sen, no RM or thousands separator, so spreadsheets read a number. */
function plainRM(amount: Sen): string {
  const abs = Math.abs(amount);
  return `${amount < 0 ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/**
 * One row per transaction line, oldest first: a split purchase shows the student's share and
 * each friend's share on separate rows with the same transaction ID.
 */
export function exportTransactionsCsv(db: Db): string {
  const names = new Map(
    db
      .select()
      .from(categories)
      .all()
      .map((c) => [c.id, c.name]),
  );
  const people = new Map(
    db
      .select()
      .from(debts)
      .all()
      .map((d) => [d.id, d.counterparty]),
  );
  const header = ["date", "type", "amount_rm", "category", "person", "note", "transaction_id"];
  const rows = [...listTransactions(db)].reverse().flatMap((t) => {
    const base = (amount: Sen, category: string, person: string) =>
      [t.localDate, t.type, plainRM(amount), category, person, t.note, t.id].map(field).join(",");
    if (t.lines.length === 0) {
      const category = t.writeOffCategoryId ? (names.get(t.writeOffCategoryId) ?? "") : "";
      return [base(t.amountSen, category, "")];
    }
    return t.lines.map((l) =>
      l.kind === "spending"
        ? base(l.amountSen, names.get(l.categoryId) ?? "", "")
        : base(
            l.amountSen,
            t.writeOffCategoryId ? (names.get(t.writeOffCategoryId) ?? "") : "",
            people.get(l.debtId) ?? "",
          ),
    );
  });
  return [header.join(","), ...rows].join("\r\n") + "\r\n";
}

/**
 * Deletes every record on this phone, including phone-only preferences and changes waiting to
 * sync (FR-ACC-07). There is no account yet, so nothing exists elsewhere. Children go first so
 * foreign keys never block it.
 */
export function deleteAllData(db: Db) {
  db.transaction((tx) => {
    for (const table of [
      outboxOperations,
      syncState,
      transactionEdits,
      transactionLines,
      scheduledItems,
      debtAdjustments,
      transactions,
      debts,
      bills,
      allocations,
      planRevisions,
      planningCycles,
      dayCheckIns,
      walletChecks,
      categories,
      userSettings,
      localPrefs,
    ]) {
      tx.delete(table).run();
    }
  });
}
