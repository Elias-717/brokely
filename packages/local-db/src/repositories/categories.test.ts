import { DEFAULT_CATEGORIES, sen } from "@brokely/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { allocations, categories, outboxOperations } from "../schema";
import { createTestContext, stamp, testId } from "../test-db";
import {
  addCategory,
  archiveCategory,
  deleteCategory,
  listCategories,
  renameCategory,
  seedDefaultCategories,
} from "./categories";
import type { RepoContext } from "./context";
import { quickStart } from "./plan";

describe("category repository", () => {
  let ctx: RepoContext;

  beforeEach(async () => {
    ({ ctx } = await createTestContext());
  });

  const outbox = () => ctx.db.select().from(outboxOperations).all();

  it("offers the 13 default categories with their kinds, each with one outbox entry (AC-52, FR-CAT-01)", () => {
    const result = seedDefaultCategories(ctx);

    expect(result).toEqual({ ok: true, value: { added: 13 } });
    const rows = listCategories(ctx.db);
    expect(rows.map((c) => c.name)).toEqual(DEFAULT_CATEGORIES.map((c) => c.name));
    expect(rows.filter((c) => c.kind === "essential")).toHaveLength(6);
    expect(rows.filter((c) => c.kind === "optional")).toHaveLength(5);
    expect(rows.filter((c) => c.kind === "set_aside")).toHaveLength(2);
    const ops = outbox();
    expect(ops).toHaveLength(13);
    expect(ops[0]).toMatchObject({ entity: "category", op: "upsert", baseVersion: null });
    expect(ops[0]?.payload).toEqual({
      name: "Meals",
      kind: "essential",
      sortOrder: 0,
      archivedAt: null,
    });
  });

  it("seeds the defaults only once (AC-52)", () => {
    seedDefaultCategories(ctx);
    expect(seedDefaultCategories(ctx)).toEqual({ ok: true, value: { added: 0 } });
    expect(listCategories(ctx.db)).toHaveLength(13);
  });

  it("adds and renames the student's own category (FR-CAT-01)", () => {
    const added = addCategory(ctx, { name: "Printing", kind: "essential" });
    if (!added.ok) throw new Error(added.message);

    expect(renameCategory(ctx, added.value.id, "Printing & books").ok).toBe(true);
    expect(listCategories(ctx.db).map((c) => c.name)).toEqual(["Printing & books"]);
    const ops = outbox();
    expect(ops).toHaveLength(2);
    expect(ops[1]).toMatchObject({ entityId: added.value.id, baseVersion: 1 });
    expect(ops[1]?.payload).toMatchObject({ name: "Printing & books" });
  });

  it("refuses a second live category with the same name (FR-CAT-01)", () => {
    seedDefaultCategories(ctx);
    const result = addCategory(ctx, { name: "Meals", kind: "optional" });
    expect(result).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });
  });

  it("refuses an empty name and saves nothing, not even an outbox entry (FR-SYNC-04)", () => {
    const result = addCategory(ctx, { name: "   ", kind: "optional" });

    expect(result).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });
    expect(ctx.db.select().from(categories).all()).toHaveLength(0);
    expect(outbox()).toHaveLength(0);
  });

  it("refuses to delete a category that has an allocation and offers archive instead (AC-27, FR-CAT-08, BR-28)", () => {
    seedDefaultCategories(ctx);
    const transport = listCategories(ctx.db).find((c) => c.name === "Transport")!;
    const plan = quickStart(ctx, {
      budgetSen: sen(40000),
      startDate: "2026-11-01",
      endDateInclusive: "2026-11-30",
    });
    if (!plan.ok) throw new Error(plan.message);
    ctx.db
      .insert(allocations)
      .values({
        id: testId(1),
        revisionId: plan.value.revisionId,
        categoryId: transport.id,
        amountSen: 2000,
        ...stamp,
      })
      .run();

    expect(deleteCategory(ctx, transport.id)).toMatchObject({
      ok: false,
      code: "CATEGORY_IN_USE",
    });
    expect(archiveCategory(ctx, transport.id).ok).toBe(true);
    // Archived: kept for past reports, no longer offered for new entries (FR-CAT-02).
    expect(listCategories(ctx.db).some((c) => c.id === transport.id)).toBe(false);
    expect(
      listCategories(ctx.db, { includeArchived: true }).some((c) => c.id === transport.id),
    ).toBe(true);
  });

  it("deletes an unused category with a delete marker for sync (FR-CAT-08, FR-SYNC-09)", () => {
    const added = addCategory(ctx, { name: "Printing", kind: "essential" });
    if (!added.ok) throw new Error(added.message);

    expect(deleteCategory(ctx, added.value.id).ok).toBe(true);
    expect(listCategories(ctx.db, { includeArchived: true })).toHaveLength(0);
    expect(outbox()[1]).toMatchObject({
      entity: "category",
      entityId: added.value.id,
      op: "delete",
      baseVersion: 1,
      payload: null,
    });
  });

  it("answers NOT_FOUND for an unknown category", () => {
    expect(renameCategory(ctx, testId(999), "Nope")).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
  });
});
