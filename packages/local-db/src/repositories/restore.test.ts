import { sen } from "@brokely/domain";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { outboxOperations, transactions } from "../schema";
import { createTestContext, NOW } from "../test-db";
import { listCategories, seedDefaultCategories } from "./categories";
import type { RepoContext } from "./context";
import { createDebt, deleteDebt, getDebt, restoreDebt } from "./debts";
import {
  deleteTransaction,
  editTransaction,
  getTransaction,
  listTransactionEdits,
  recordPurchase,
  recordTransaction,
  restoreTransaction,
} from "./transactions";

describe("Undo of a delete restores the same record (FR-TXN-10, D-38)", () => {
  let ctx: RepoContext;
  const day = { localDate: "2026-10-19", occurredAt: NOW };
  const category = (name: string) => listCategories(ctx.db).find((c) => c.name === name)!.id;
  const ops = (entityId: string) =>
    ctx.db.select().from(outboxOperations).where(eq(outboxOperations.entityId, entityId)).all();

  beforeEach(async () => {
    ({ ctx } = await createTestContext());
    seedDefaultCategories(ctx);
  });

  const purchase = (amount: number) => {
    const r = recordPurchase(ctx, {
      amountSen: sen(amount),
      categoryId: category("Meals"),
      ...day,
    });
    if (!r.ok) throw new Error(r.message);
    return r.value.id;
  };

  it("before sync: brings back the transaction and its lines and drops the pending delete", () => {
    const id = purchase(700);
    deleteTransaction(ctx, id);
    expect(ops(id).map((o) => o.op)).toEqual(["upsert", "delete"]);

    expect(restoreTransaction(ctx, id).ok).toBe(true);

    expect(getTransaction(ctx.db, id)).toMatchObject({
      amountSen: 700,
      lines: [expect.objectContaining({ amountSen: 700 })],
    });
    expect(ops(id).map((o) => o.op)).toEqual(["upsert"]); // the server never hears of the delete
  });

  it("after the delete was sent: restores with an update based on the server's version (S-04)", () => {
    const id = purchase(700);
    deleteTransaction(ctx, id);
    // Simulate a push: the server applied create and delete (version 2) and the outbox is empty.
    ctx.db.delete(outboxOperations).run();
    ctx.db
      .update(transactions)
      .set({ version: 2, syncStatus: "synced" })
      .where(eq(transactions.id, id))
      .run();

    expect(restoreTransaction(ctx, id).ok).toBe(true);
    expect(ops(id)).toEqual([expect.objectContaining({ op: "upsert", baseVersion: 2 })]);
  });

  it("refuses to restore something that would break a rule now, e.g. a refund over the purchase (FR-TXN-06)", () => {
    const food = purchase(2500);
    const refund = (amount: number) =>
      recordTransaction(ctx, {
        type: "refund",
        amountSen: sen(amount),
        ...day,
        refundsTransactionId: food,
        lines: [{ kind: "spending", categoryId: category("Meals"), amountSen: sen(amount) }],
      });
    const first = refund(1500);
    if (!first.ok) throw new Error(first.message);
    deleteTransaction(ctx, first.value.id);
    refund(2000); // meanwhile the student refunded RM20 more

    expect(restoreTransaction(ctx, first.value.id)).toMatchObject({
      ok: false,
      code: "REFUND_EXCEEDS_PURCHASE",
    });
  });

  it("Undo of deleting a lend restores the debt first, then the lend (D-38)", () => {
    const lent = createDebt(ctx, {
      direction: "owed_to_me",
      counterparty: "[FRIEND A]",
      amountSen: sen(2000),
      ...day,
    });
    if (!lent.ok) throw new Error(lent.message);
    deleteTransaction(ctx, lent.value.transactionId);
    deleteDebt(ctx, lent.value.debtId);

    expect(restoreDebt(ctx, lent.value.debtId).ok).toBe(true);
    expect(restoreTransaction(ctx, lent.value.transactionId).ok).toBe(true);
    expect(getDebt(ctx.db, lent.value.debtId)?.summary).toMatchObject({
      outstandingSen: 2000,
      status: "open",
    });
    expect(ops(lent.value.debtId).map((o) => o.op)).toEqual(["upsert"]);
  });

  it("restoring a record that is not deleted is NOT_FOUND", () => {
    expect(restoreTransaction(ctx, purchase(100))).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});

describe("edit history (FR-TXN-07, AC-05)", () => {
  it("lists each edit, oldest first, with the amounts before and after", async () => {
    const { ctx, setNow } = await createTestContext();
    seedDefaultCategories(ctx);
    const meals = listCategories(ctx.db).find((c) => c.name === "Meals")!.id;
    const saved = recordPurchase(ctx, {
      amountSen: sen(500),
      categoryId: meals,
      localDate: "2026-10-19",
      occurredAt: NOW,
    });
    if (!saved.ok) throw new Error(saved.message);
    const lineId = getTransaction(ctx.db, saved.value.id)!.lines[0]!.id;
    const edit = (amount: number, at: string) => {
      setNow(at);
      editTransaction(ctx, saved.value.id, {
        type: "purchase",
        amountSen: sen(amount),
        localDate: "2026-10-19",
        occurredAt: NOW,
        lines: [{ id: lineId, kind: "spending", categoryId: meals, amountSen: sen(amount) }],
      });
    };
    edit(700, "2026-10-19T04:40:00.000Z");
    edit(650, "2026-10-19T05:00:00.000Z");

    expect(
      listTransactionEdits(ctx.db, saved.value.id).map((e) => [
        e.changedAt,
        e.beforeSen,
        e.afterSen,
      ]),
    ).toEqual([
      ["2026-10-19T04:40:00.000Z", 500, 700],
      ["2026-10-19T05:00:00.000Z", 700, 650],
    ]);
  });
});
