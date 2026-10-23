import { addDays, type GuessHistory, type LocalDate } from "@brokely/domain";
import {
  listCategories,
  listTransactions,
  OPENING_SPEND_NOTE,
  type CategoryRow,
  type Db,
} from "@brokely/local-db";

/**
 * Categories for quick add, most used in the last 30 days first, then the usual order
 * (D-38). A new student simply sees the defaults: Meals, Groceries, Laundry…
 */
export function categoriesByUse(db: Db, today: LocalDate): CategoryRow[] {
  const uses = new Map<string, number>();
  const recent = listTransactions(db, {
    start: addDays(today, -30),
    endExclusive: addDays(today, 1),
  });
  for (const t of recent) {
    if (t.type !== "purchase") continue;
    for (const line of t.lines) {
      if (line.kind === "spending") uses.set(line.categoryId, (uses.get(line.categoryId) ?? 0) + 1);
    }
  }
  return listCategories(db).sort(
    (a, b) => (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0) || a.sortOrder - b.sortOrder,
  );
}

/**
 * What smart categorization learns from (D-84): the student's purchases with a note from the
 * last year, newest first, at most `max`. Split purchases count for their spending line.
 */
export function guessHistory(db: Db, today: LocalDate, max = 500): GuessHistory {
  const history: { note: string; categoryId: string }[] = [];
  const recent = listTransactions(db, {
    start: addDays(today, -365),
    endExclusive: addDays(today, 1),
  }).sort((a, b) => b.localDate.localeCompare(a.localDate));
  for (const t of recent) {
    const note = t.note.trim();
    if (t.type !== "purchase" || !note || note === OPENING_SPEND_NOTE) continue;
    const line = t.lines.find((l) => l.kind === "spending");
    if (line?.kind === "spending") history.push({ note, categoryId: line.categoryId });
    if (history.length >= max) break;
  }
  return history;
}
