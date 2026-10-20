import { addDays, type LocalDate } from "@brokely/domain";
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
 * Notes typed in the last 30 days, per category, newest first, each once (case-insensitive):
 * offered as one-tap chips under the note box so describing a repeat meal takes one tap.
 */
export function recentNotesByCategory(db: Db, today: LocalDate, max = 4): Map<string, string[]> {
  const recent = listTransactions(db, {
    start: addDays(today, -30),
    endExclusive: addDays(today, 1),
  }).sort((a, b) =>
    a.localDate === b.localDate
      ? b.occurredAt.localeCompare(a.occurredAt)
      : b.localDate.localeCompare(a.localDate),
  );
  const notes = new Map<string, string[]>();
  for (const t of recent) {
    const note = t.note.trim();
    if (t.type !== "purchase" || !note || note === OPENING_SPEND_NOTE) continue;
    for (const line of t.lines) {
      if (line.kind !== "spending") continue;
      const list = notes.get(line.categoryId) ?? [];
      if (list.length < max && !list.some((n) => n.toLowerCase() === note.toLowerCase())) {
        list.push(note);
      }
      notes.set(line.categoryId, list);
    }
  }
  return notes;
}
