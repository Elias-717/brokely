import { sen, totalSpending, spendingByCategory } from "@brokely/domain";
import { and, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { outboxOperations, transactionEdits, transactionLines, transactions } from "../schema";
import { createTestContext, NOW } from "../test-db";
import { listCategories, seedDefaultCategories } from "./categories";
import type { RepoContext } from "./context";
import { getPlan, quickStart } from "./plan";
import {
  deleteTransaction,
  editTransaction,
  getTransaction,
  listTransactions,
  recordMoneyIn,
  recordPurchase,
  recordTransaction,
} from "./transactions";

describe("transaction repository", () => {
  let ctx: RepoContext;
  let setNow: (instant: string) => void;
  const category = (name: string) => listCategories(ctx.db).find((c) => c.name === name)!.id;
  const outbox = () => ctx.db.select().from(outboxOperations).all();
  const spentSen = () =>
    totalSpending(spendingByCategory(listTransactions(ctx.db), () => undefined));
  const day = { localDate: "2026-11-02", occurredAt: NOW };

  beforeEach(async () => {
    ({ ctx, setNow } = await createTestContext());
    seedDefaultCategories(ctx);
    ctx.db.delete(outboxOperations).run();
  });

  const purchase = (amount: number, name = "Laundry") => {
    const result = recordPurchase(ctx, {
      amountSen: sen(amount),
      categoryId: category(name),
      ...day,
    });
    if (!result.ok) throw new Error(result.message);
    return result.value.id;
  };

  it("records the golden-path RM5 laundry purchase with one outbox entry for the whole aggregate (AC-04, FR-SYNC-04, S-01)", () => {
    const id = purchase(500);

    const saved = getTransaction(ctx.db, id)!;
    expect(saved).toMatchObject({ type: "purchase", amountSen: 500, localDate: "2026-11-02" });
    expect(saved.lines).toEqual([
      expect.objectContaining({
        kind: "spending",
        categoryId: category("Laundry"),
        amountSen: 500,
      }),
    ]);
    const ops = outbox();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ entity: "transaction", entityId: id, baseVersion: null });
    expect(ops[0]?.payload).toMatchObject({
      type: "purchase",
      amountSen: 500,
      source: "manual",
      lines: [{ kind: "spending", categoryId: category("Laundry"), amountSen: 500 }],
    });
    expect(spentSen()).toBe(500);
  });

  it("refuses lines that don't add up to the amount and saves nothing (AC-10, FR-TXN-04)", () => {
    const result = recordTransaction(ctx, {
      type: "purchase",
      amountSen: sen(2000),
      ...day,
      lines: [{ kind: "spending", categoryId: category("Meals"), amountSen: sen(1900) }],
    });

    expect(result).toMatchObject({ ok: false, code: "LINES_DO_NOT_SUM" });
    expect(ctx.db.select().from(transactions).all()).toHaveLength(0);
    expect(ctx.db.select().from(transactionLines).all()).toHaveLength(0);
    expect(outbox()).toHaveLength(0);
  });

  it("refuses a spending line for an unknown category (REFERENCE_MISSING)", () => {
    const result = recordTransaction(ctx, {
      type: "purchase",
      amountSen: sen(100),
      ...day,
      lines: [
        {
          kind: "spending",
          categoryId: "0192f3a5-0000-7000-8000-000000000999",
          amountSen: sen(100),
        },
      ],
    });
    expect(result).toMatchObject({ ok: false, code: "REFERENCE_MISSING" });
  });

  it("records a RM50 top-up as a transfer that is never spending (AC-07)", () => {
    const result = recordTransaction(ctx, {
      type: "transfer",
      amountSen: sen(5000),
      ...day,
      lines: [],
    });
    expect(result.ok).toBe(true);
    expect(spentSen()).toBe(0);
  });

  it("records money in without changing spending (AC-61, FR-TXN-11, D-26)", () => {
    const result = recordMoneyIn(ctx, { amountSen: sen(30000), note: "From family", ...day });
    expect(result.ok).toBe(true);
    expect(getTransaction(ctx.db, result.ok ? result.value.id : "")).toMatchObject({
      type: "income",
      note: "From family",
      lines: [],
    });
    expect(spentSen()).toBe(0);
  });

  it("records a RM12 purchase from the Emergency set-aside as spending (AC-28)", () => {
    purchase(1200, "Emergency");
    expect(spentSen()).toBe(1200);
  });

  it("allows a linked refund up to what is unrefunded, then refuses more (AC-09, FR-TXN-06)", () => {
    const food = purchase(2500, "Meals");
    const refund = (amount: number) =>
      recordTransaction(ctx, {
        type: "refund",
        amountSen: sen(amount),
        ...day,
        refundsTransactionId: food,
        lines: [{ kind: "spending", categoryId: category("Meals"), amountSen: sen(amount) }],
      });

    expect(refund(1000).ok).toBe(true);
    expect(spentSen()).toBe(1500);
    expect(refund(2000)).toMatchObject({ ok: false, code: "REFUND_EXCEEDS_PURCHASE" });
  });

  it("edits RM5 to RM7: still one transaction, same line, edit history RM5 → RM7 (AC-05, FR-TXN-07)", () => {
    const id = purchase(500);
    const lineId = getTransaction(ctx.db, id)!.lines[0]!.id;
    setNow("2026-11-02T05:00:00.000Z");

    const result = editTransaction(ctx, id, {
      type: "purchase",
      amountSen: sen(700),
      ...day,
      lines: [
        { id: lineId, kind: "spending", categoryId: category("Laundry"), amountSen: sen(700) },
      ],
    });

    expect(result.ok).toBe(true);
    expect(ctx.db.select().from(transactions).all()).toHaveLength(1);
    const edited = getTransaction(ctx.db, id)!;
    expect(edited.amountSen).toBe(700);
    expect(edited.lines.map((l) => [l.id, l.amountSen])).toEqual([[lineId, 700]]);
    expect(spentSen()).toBe(700);

    const history = ctx.db.select().from(transactionEdits).all();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ transactionId: id, changedAt: "2026-11-02T05:00:00.000Z" });
    expect(history[0]?.before).toMatchObject({ amountSen: 500 });
    expect(history[0]?.after).toMatchObject({ amountSen: 700 });

    // Outbox: the create, then the update (base version 1) and its history entry.
    expect(outbox().map((o) => [o.entity, o.op, o.baseVersion])).toEqual([
      ["transaction", "upsert", null],
      ["transaction", "upsert", 1],
      ["transaction_edit", "upsert", null],
    ]);
  });

  it("an edit that moves the line to another category replaces the line (FR-TXN-01)", () => {
    const id = purchase(500);
    editTransaction(ctx, id, {
      type: "purchase",
      amountSen: sen(500),
      ...day,
      lines: [{ kind: "spending", categoryId: category("Meals"), amountSen: sen(500) }],
    });

    const liveLines = ctx.db
      .select()
      .from(transactionLines)
      .where(and(eq(transactionLines.transactionId, id), isNull(transactionLines.deletedAt)))
      .all();
    expect(liveLines.map((l) => l.categoryId)).toEqual([category("Meals")]);
  });

  it("deletes with a delete marker, so totals drop and sync is told (AC-23, AC-57 Undo, FR-SYNC-09)", () => {
    const id = purchase(1200, "Meals");

    expect(deleteTransaction(ctx, id).ok).toBe(true);

    expect(getTransaction(ctx.db, id)).toBeUndefined();
    expect(listTransactions(ctx.db)).toHaveLength(0);
    expect(spentSen()).toBe(0);
    expect(ctx.db.select().from(transactions).get()?.deletedAt).toBe(NOW);
    expect(outbox()[1]).toMatchObject({ entity: "transaction", op: "delete", baseVersion: 1 });
    expect(deleteTransaction(ctx, id)).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("refuses to delete a purchase that still has refunds (FR-TXN-06)", () => {
    const food = purchase(2500, "Meals");
    recordTransaction(ctx, {
      type: "refund",
      amountSen: sen(1000),
      ...day,
      refundsTransactionId: food,
      lines: [{ kind: "spending", categoryId: category("Meals"), amountSen: sen(1000) }],
    });
    expect(deleteTransaction(ctx, food)).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });
  });

  it("refuses to lower a purchase below what was already refunded (FR-TXN-06)", () => {
    const food = purchase(2500, "Meals");
    recordTransaction(ctx, {
      type: "refund",
      amountSen: sen(1000),
      ...day,
      refundsTransactionId: food,
      lines: [{ kind: "spending", categoryId: category("Meals"), amountSen: sen(1000) }],
    });
    const result = editTransaction(ctx, food, {
      type: "purchase",
      amountSen: sen(800),
      ...day,
      lines: [{ kind: "spending", categoryId: category("Meals"), amountSen: sen(800) }],
    });
    expect(result).toMatchObject({ ok: false, code: "REFUND_EXCEEDS_PURCHASE" });
  });

  it("lists transactions for a date range, newest day first (FR-INS-04)", () => {
    purchase(500);
    recordPurchase(ctx, {
      amountSen: sen(900),
      categoryId: category("Meals"),
      localDate: "2026-11-05",
      occurredAt: "2026-11-05T04:00:00.000Z",
    });
    expect(listTransactions(ctx.db).map((t) => t.amountSen)).toEqual([900, 500]);
    expect(
      listTransactions(ctx.db, { start: "2026-11-03", endExclusive: "2026-12-01" }).map(
        (t) => t.amountSen,
      ),
    ).toEqual([900]);
  });

  describe("catch-up start (FR-PLN-21, AC-59)", () => {
    it("adds one 'Spent before Brokely' entry dated the day before tracking starts", () => {
      const result = quickStart(ctx, {
        budgetSen: sen(60000),
        startDate: "2026-11-01",
        endDateInclusive: "2026-11-30",
        trackingStartDate: "2026-11-15",
        openingSpend: { amountSen: sen(35000), categoryId: category("Meals") },
      });

      expect(result.ok).toBe(true);
      const [entry] = listTransactions(ctx.db);
      expect(entry).toMatchObject({
        type: "purchase",
        amountSen: 35000,
        localDate: "2026-11-14",
        note: "Spent before Brokely",
      });
      expect(getPlan(ctx.db, result.ok ? result.value.cycleId : "")?.revision.budgetSen).toBe(
        60000,
      );
      expect(60000 - spentSen()).toBe(25000); // left in plan RM250
    });

    it("refuses an opening entry when tracking starts on the first day (nothing came before)", () => {
      const result = quickStart(ctx, {
        budgetSen: sen(60000),
        startDate: "2026-11-01",
        endDateInclusive: "2026-11-30",
        openingSpend: { amountSen: sen(35000), categoryId: category("Meals") },
      });
      expect(result).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });
      expect(listTransactions(ctx.db)).toHaveLength(0);
    });
  });
});
