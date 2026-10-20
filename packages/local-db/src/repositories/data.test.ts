import { sen } from "@brokely/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { categories, outboxOperations, transactions } from "../schema";
import { createTestContext, NOW } from "../test-db";
import { listCategories, seedDefaultCategories } from "./categories";
import type { RepoContext } from "./context";
import { deleteAllData, exportJson, exportTransactionsCsv } from "./data";
import { recordSplitPurchase } from "./debts";
import { setNickname } from "./local-prefs";
import { quickStart } from "./plan";
import { deleteTransaction, recordMoneyIn, recordPurchase } from "./transactions";

describe("your data (FR-ACC-06, FR-ACC-07)", () => {
  let ctx: RepoContext;
  const category = (name: string) => listCategories(ctx.db).find((c) => c.name === name)!.id;

  beforeEach(async () => {
    ({ ctx } = await createTestContext());
    seedDefaultCategories(ctx);
    quickStart(ctx, {
      budgetSen: sen(40000),
      startDate: "2026-11-01",
      endDateInclusive: "2026-11-30",
    });
  });

  const when = { occurredAt: NOW, localDate: "2026-11-02" };

  it("CSV: one row per line, exact amounts without separators, quoted notes", () => {
    recordPurchase(ctx, {
      ...when,
      amountSen: sen(123450),
      categoryId: category("Shopping"),
      note: 'Laptop, "used"',
    });
    recordSplitPurchase(ctx, {
      ...when,
      amountSen: sen(3000),
      categoryId: category("Meals"),
      friends: [{ counterparty: "[FRIEND A]", amountSen: sen(1500) }],
    });
    recordMoneyIn(ctx, { ...when, amountSen: sen(50000), note: "From family" });

    const lines = exportTransactionsCsv(ctx.db).trimEnd().split("\r\n");
    expect(lines[0]).toBe("date,type,amount_rm,category,person,note,transaction_id");
    const rows = lines.slice(1).map((l) => l.split(",").slice(0, 5));
    expect(rows).toEqual(
      expect.arrayContaining([
        ["2026-11-02", "purchase", "1234.50", "Shopping", ""],
        ["2026-11-02", "purchase", "15.00", "Meals", ""],
        ["2026-11-02", "purchase", "15.00", "", "[FRIEND A]"],
        ["2026-11-02", "income", "500.00", "", ""],
      ]),
    );
    expect(lines.some((l) => l.includes('"Laptop, ""used"""'))).toBe(true);
  });

  it("JSON: everything live, deleted records left out, phone-only nickname included", () => {
    setNickname(ctx, "Ali");
    const kept = recordPurchase(ctx, {
      ...when,
      amountSen: sen(700),
      categoryId: category("Meals"),
    });
    const gone = recordPurchase(ctx, {
      ...when,
      amountSen: sen(900),
      categoryId: category("Meals"),
    });
    if (!kept.ok || !gone.ok) throw new Error("setup");
    deleteTransaction(ctx, gone.value.id);

    const data = JSON.parse(exportJson(ctx.db, NOW));
    expect(data).toMatchObject({ app: "Brokely", format: 1, currency: "MYR" });
    expect(data.transactions.map((t: { id: string }) => t.id)).toEqual([kept.value.id]);
    expect(data.categories).toHaveLength(13);
    expect(data.planningCycles).toHaveLength(1);
    expect(JSON.stringify(data.phoneOnly)).toContain("Ali");
    expect(data).not.toHaveProperty("outbox");
  });

  it("delete all leaves nothing on the phone, including changes waiting to sync", () => {
    recordPurchase(ctx, { ...when, amountSen: sen(700), categoryId: category("Meals") });
    deleteAllData(ctx.db);
    expect(ctx.db.select().from(transactions).all()).toEqual([]);
    expect(ctx.db.select().from(categories).all()).toEqual([]);
    expect(ctx.db.select().from(outboxOperations).all()).toEqual([]);
    expect(JSON.parse(exportJson(ctx.db, NOW)).transactions).toEqual([]);
  });
});
