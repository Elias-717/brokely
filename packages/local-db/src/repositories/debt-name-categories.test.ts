import { sen } from "@brokely/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestContext } from "../test-db";
import {
  addCategory,
  archiveDebtNameCategories,
  listCategories,
  seedDefaultCategories,
} from "./categories";
import type { RepoContext } from "./context";
import { createDebt } from "./debts";
import { recordPurchase } from "./transactions";

describe("a person's name is never a category (24 Nov)", () => {
  let ctx: RepoContext;
  const names = () => listCategories(ctx.db).map((c) => c.name);
  const when = { occurredAt: "2026-11-19T04:00:00.000Z", localDate: "2026-11-19" };

  beforeEach(async () => {
    ({ ctx } = await createTestContext());
    seedDefaultCategories(ctx);
    createDebt(ctx, {
      direction: "owed_to_me",
      counterparty: "[FRIEND A]",
      amountSen: sen(300),
      ...when,
    });
  });

  it("archives an unused category named after someone in Debts", () => {
    addCategory(ctx, { name: "[friend a]", kind: "optional" });
    expect(archiveDebtNameCategories(ctx)).toEqual({ ok: true, value: { archived: 1 } });
    expect(names()).not.toContain("[friend a]");
  });

  it("keeps it while a record still uses it, so no history is lost", () => {
    const added = addCategory(ctx, { name: "[FRIEND A]", kind: "optional" });
    if (!added.ok) throw new Error(added.message);
    recordPurchase(ctx, { amountSen: sen(300), categoryId: added.value.id, ...when });
    expect(archiveDebtNameCategories(ctx)).toEqual({ ok: true, value: { archived: 0 } });
    expect(names()).toContain("[FRIEND A]");
  });

  it("never touches other categories", () => {
    addCategory(ctx, { name: "Haircut", kind: "optional" });
    archiveDebtNameCategories(ctx);
    expect(names()).toContain("Haircut");
    expect(names()).toContain("Meals");
  });
});
