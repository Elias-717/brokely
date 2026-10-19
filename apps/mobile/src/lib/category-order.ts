import { addDays, type LocalDate } from "@brokely/domain";
import { listCategories, listTransactions, type CategoryRow, type Db } from "@brokely/local-db";

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
