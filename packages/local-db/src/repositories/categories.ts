import type { EntityData } from "@brokely/contracts";
import { checkCanDeleteCategory, DEFAULT_CATEGORIES, type CategoryKind } from "@brokely/domain";
import { and, asc, count, eq, isNull, max } from "drizzle-orm";
import { allocations, categories, transactionLines } from "../schema";
import { ensure, RepoError, write, type Db, type RepoContext, type WriteScope } from "./context";
import { enqueueDelete, enqueueUpsert, touched } from "./outbox";

/** Categories: FR-CAT-01, FR-CAT-02, FR-CAT-08, BR-28, D-21, D-22. */

type CategoryRow = typeof categories.$inferSelect;

const live = isNull(categories.deletedAt);

/** Categories the student can pick, in their order. Archived ones only on request (FR-CAT-02). */
export function listCategories(db: Db, options: { includeArchived?: boolean } = {}): CategoryRow[] {
  return db
    .select()
    .from(categories)
    .where(options.includeArchived ? live : and(live, isNull(categories.archivedAt)))
    .orderBy(asc(categories.sortOrder), asc(categories.createdAt))
    .all();
}

/** Loads a live category or stops the write. */
export function liveCategory(tx: Db, id: string, missing: "NOT_FOUND" | "REFERENCE_MISSING") {
  const row = tx
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), live))
    .get();
  if (!row) throw new RepoError(missing, "That category doesn't exist");
  return row;
}

function data(row: CategoryRow): EntityData<"category"> {
  return { name: row.name, kind: row.kind, sortOrder: row.sortOrder, archivedAt: row.archivedAt };
}

function assertNameFree(tx: Db, name: string, exceptId?: string) {
  const clash = tx
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.name, name), live))
    .get();
  if (clash && clash.id !== exceptId) {
    throw new RepoError("VALIDATION_FAILED", `You already have a category called ${name}`);
  }
}

function insertCategory(scope: WriteScope, name: string, kind: CategoryKind, sortOrder: number) {
  const row: CategoryRow = {
    id: scope.newId(),
    userId: null,
    version: 1,
    createdAt: scope.at,
    updatedAt: scope.at,
    deletedAt: null,
    syncStatus: "pending",
    name: name.trim(),
    kind,
    sortOrder,
    archivedAt: null,
  };
  // Outbox first: it validates the name, so a bad name never reaches the table.
  enqueueUpsert(scope, "category", row.id, null, data(row));
  assertNameFree(scope.tx, row.name);
  scope.tx.insert(categories).values(row).run();
  return row;
}

/** First run: the 13 default categories, only if the student has none yet (AC-52, D-22). */
export function seedDefaultCategories(ctx: RepoContext) {
  return write(ctx, (scope) => {
    const existing = scope.tx.select({ n: count() }).from(categories).where(live).get()?.n ?? 0;
    if (existing > 0) return { added: 0 };
    DEFAULT_CATEGORIES.forEach((c, i) => insertCategory(scope, c.name, c.kind, i));
    return { added: DEFAULT_CATEGORIES.length };
  });
}

export function addCategory(ctx: RepoContext, input: { name: string; kind: CategoryKind }) {
  return write(ctx, (scope) => {
    const last = scope.tx
      .select({ n: max(categories.sortOrder) })
      .from(categories)
      .get()?.n;
    const row = insertCategory(scope, input.name, input.kind, (last ?? -1) + 1);
    return { id: row.id };
  });
}

function updateCategory(
  scope: WriteScope,
  id: string,
  change: Partial<Pick<CategoryRow, "name" | "archivedAt">>,
) {
  const before = liveCategory(scope.tx, id, "NOT_FOUND");
  const after = { ...before, ...change, ...touched(scope.at) };
  enqueueUpsert(scope, "category", id, before.version, data(after));
  if (change.name !== undefined) assertNameFree(scope.tx, after.name, id);
  scope.tx
    .update(categories)
    .set({ ...change, ...touched(scope.at) })
    .where(eq(categories.id, id))
    .run();
}

export function renameCategory(ctx: RepoContext, id: string, name: string) {
  return write(ctx, (scope) => updateCategory(scope, id, { name: name.trim() }));
}

/** Default names that were changed later, old → new (D-43). */
const RENAMED_DEFAULTS: readonly [string, string][] = [
  ["Groceries & toiletries", "Home necessities"],
];

/**
 * Gives phones set up before a rename the new default name, once (D-43). Skipped when the
 * student already has a category with the new name, so nothing clashes.
 */
export function renameRetiredDefaults(ctx: RepoContext) {
  return write(ctx, (scope) => {
    const live = listCategories(scope.tx, { includeArchived: true });
    let renamed = 0;
    for (const [from, to] of RENAMED_DEFAULTS) {
      const old = live.find((c) => c.name === from);
      if (!old || live.some((c) => c.name === to)) continue;
      updateCategory(scope, old.id, { name: to });
      renamed += 1;
    }
    return { renamed };
  });
}

/** Archived categories keep their history but are no longer offered (FR-CAT-02, AC-27). */
export function archiveCategory(ctx: RepoContext, id: string) {
  return write(ctx, (scope) => updateCategory(scope, id, { archivedAt: scope.at }));
}

/** Only a category without allocations or transactions can be deleted (FR-CAT-08, BR-28). */
export function deleteCategory(ctx: RepoContext, id: string) {
  return write(ctx, (scope) => {
    const row = liveCategory(scope.tx, id, "NOT_FOUND");
    const usage = (table: typeof allocations | typeof transactionLines) =>
      scope.tx
        .select({ n: count() })
        .from(table)
        .where(and(eq(table.categoryId, id), isNull(table.deletedAt)))
        .get()?.n ?? 0;
    ensure(
      checkCanDeleteCategory({
        allocations: usage(allocations),
        transactionLines: usage(transactionLines),
      }),
    );
    enqueueDelete(scope, "category", id, row.version);
    scope.tx
      .update(categories)
      .set({ deletedAt: scope.at, ...touched(scope.at) })
      .where(eq(categories.id, id))
      .run();
  });
}
