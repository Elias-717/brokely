import { sen, spendingByCategory, totalSpending } from "@brokely/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { outboxOperations } from "../schema";
import { createTestContext, NOW } from "../test-db";
import { listCategories, seedDefaultCategories } from "./categories";
import type { RepoContext } from "./context";
import {
  adjustDebt,
  createDebt,
  deleteDebt,
  getDebt,
  listDebts,
  recordRepayment,
  recordSplitPurchase,
  setDebtDueDate,
  writeOffDebt,
} from "./debts";
import { deleteTransaction, listTransactions, recordTransaction } from "./transactions";

describe("debt repository", () => {
  let ctx: RepoContext;
  const category = (name: string) => listCategories(ctx.db).find((c) => c.name === name)!.id;
  const outbox = () => ctx.db.select().from(outboxOperations).all();
  const day = { localDate: "2026-11-02", occurredAt: NOW };
  const spending = () => {
    const directions = new Map(listDebts(ctx.db).map((d) => [d.id, d.direction]));
    return spendingByCategory(listTransactions(ctx.db), (id) => directions.get(id));
  };

  beforeEach(async () => {
    ({ ctx } = await createTestContext());
    seedDefaultCategories(ctx);
    ctx.db.delete(outboxOperations).run();
  });

  const debt = (direction: "owed_by_me" | "owed_to_me", amount: number) => {
    const result = createDebt(ctx, {
      direction,
      counterparty: "[FRIEND A]",
      amountSen: sen(amount),
      ...day,
    });
    if (!result.ok) throw new Error(result.message);
    return result.value;
  };

  it("borrow RM50, repay RM20: outstanding RM30, open, spending unchanged (AC-08, FR-DEBT-01/02/06)", () => {
    const { debtId, transactionId } = debt("owed_by_me", 5000);

    expect(listTransactions(ctx.db)[0]).toMatchObject({ id: transactionId, type: "borrow" });
    expect(recordRepayment(ctx, { debtId, amountSen: sen(2000), ...day }).ok).toBe(true);

    expect(getDebt(ctx.db, debtId)).toMatchObject({
      counterparty: "[FRIEND A]",
      summary: { outstandingSen: 3000, status: "open" },
    });
    expect(
      listTransactions(ctx.db)
        .map((t) => t.type)
        .sort(),
    ).toEqual(["borrow", "repayment_made"]);
    expect(totalSpending(spending())).toBe(0);
    // One operation for the debt, one per transaction.
    expect(outbox().map((o) => o.entity)).toEqual(["debt", "transaction", "transaction"]);
  });

  it("lending makes a debt owed to me, repaid with repayment_received (FR-DEBT-01)", () => {
    const { debtId } = debt("owed_to_me", 2000);
    recordRepayment(ctx, { debtId, amountSen: sen(2000), ...day });
    expect(
      listTransactions(ctx.db)
        .map((t) => t.type)
        .sort(),
    ).toEqual(["lend", "repayment_received"]);
    expect(getDebt(ctx.db, debtId)?.summary.status).toBe("settled");
  });

  it("refuses a repayment larger than what is outstanding (BR-22)", () => {
    const { debtId } = debt("owed_by_me", 5000);
    expect(recordRepayment(ctx, { debtId, amountSen: sen(5001), ...day })).toMatchObject({
      ok: false,
      code: "DEBT_EXCEEDS_OUTSTANDING",
    });
  });

  it("an audited adjustment can raise what is owed (BR-22)", () => {
    const { debtId } = debt("owed_by_me", 5000);
    expect(adjustDebt(ctx, { debtId, deltaSen: sen(500), reason: "Forgot the drink" }).ok).toBe(
      true,
    );
    expect(recordRepayment(ctx, { debtId, amountSen: sen(5500), ...day }).ok).toBe(true);
    expect(getDebt(ctx.db, debtId)?.summary).toMatchObject({
      outstandingSen: 0,
      status: "settled",
    });
    expect(outbox().map((o) => o.entity)).toContain("debt_adjustment");
  });

  it("refuses deleting the borrow once repayments exist, so outstanding never goes negative (BR-22)", () => {
    const { debtId, transactionId } = debt("owed_by_me", 5000);
    recordRepayment(ctx, { debtId, amountSen: sen(2000), ...day });
    expect(deleteTransaction(ctx, transactionId)).toMatchObject({
      ok: false,
      code: "DEBT_EXCEEDS_OUTSTANDING",
    });
  });

  it("refuses a movement that doesn't fit the debt's direction (FR-DEBT-01)", () => {
    const { debtId } = debt("owed_by_me", 5000);
    const result = recordTransaction(ctx, {
      type: "lend",
      amountSen: sen(1000),
      ...day,
      lines: [{ kind: "debt", debtId, amountSen: sen(1000) }],
    });
    expect(result).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });
  });

  it("RM20 group meal split: RM10 food + RM10 owed to me, linked to the purchase (AC-10, FR-TXN-03, FR-DEBT-05)", () => {
    const result = recordSplitPurchase(ctx, {
      amountSen: sen(2000),
      categoryId: category("Meals"),
      friends: [{ counterparty: "[FRIEND B]", amountSen: sen(1000) }],
      ...day,
    });
    if (!result.ok) throw new Error(result.message);

    const [debtId] = result.value.debtIds;
    expect(getDebt(ctx.db, debtId!)).toMatchObject({
      direction: "owed_to_me",
      counterparty: "[FRIEND B]",
      summary: { outstandingSen: 1000, status: "open" },
    });
    const purchase = listTransactions(ctx.db)[0]!;
    expect(purchase).toMatchObject({ id: result.value.transactionId, type: "purchase" });
    expect(purchase.lines.map((l) => [l.kind, l.amountSen])).toEqual([
      ["spending", 1000],
      ["debt", 1000],
    ]);
    expect(spending().get(category("Meals"))).toBe(1000);
  });

  it("refuses a split where friends owe the whole amount (that is a lend, not a purchase)", () => {
    const result = recordSplitPurchase(ctx, {
      amountSen: sen(2000),
      categoryId: category("Meals"),
      friends: [{ counterparty: "[FRIEND B]", amountSen: sen(2000) }],
      ...day,
    });
    expect(result).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });
    expect(listDebts(ctx.db)).toHaveLength(0);
  });

  it("writing off RM15 a friend owes becomes Gifts & charity spending (AC-11, FR-DEBT-04, R-07)", () => {
    const { debtId } = debt("owed_to_me", 1500);

    const result = writeOffDebt(ctx, { debtId, categoryId: category("Gifts & charity"), ...day });

    expect(result.ok).toBe(true);
    expect(getDebt(ctx.db, debtId)?.summary).toMatchObject({
      outstandingSen: 0,
      status: "written_off",
    });
    expect(spending().get(category("Gifts & charity"))).toBe(1500);
  });

  it("a write-off of money owed to me needs a category (R-07)", () => {
    const { debtId } = debt("owed_to_me", 1500);
    expect(writeOffDebt(ctx, { debtId, ...day })).toMatchObject({
      ok: false,
      code: "VALIDATION_FAILED",
    });
  });

  it("a write-off of money I owe is not spending (R-07)", () => {
    const { debtId } = debt("owed_by_me", 1500);
    expect(writeOffDebt(ctx, { debtId, ...day }).ok).toBe(true);
    expect(totalSpending(spending())).toBe(0);
    expect(getDebt(ctx.db, debtId)?.summary.status).toBe("written_off");
  });

  it("refuses to write off a settled debt", () => {
    const { debtId } = debt("owed_by_me", 1500);
    recordRepayment(ctx, { debtId, amountSen: sen(1500), ...day });
    expect(writeOffDebt(ctx, { debtId, ...day })).toMatchObject({
      ok: false,
      code: "DEBT_EXCEEDS_OUTSTANDING",
    });
  });

  it("Undo of a lend removes the transaction, then the empty debt, with delete markers (D-38)", () => {
    const { debtId, transactionId } = debt("owed_to_me", 2000);

    expect(deleteDebt(ctx, debtId)).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });
    expect(deleteTransaction(ctx, transactionId).ok).toBe(true);
    expect(deleteDebt(ctx, debtId).ok).toBe(true);

    expect(listDebts(ctx.db)).toHaveLength(0);
    expect(outbox().slice(-1)[0]).toMatchObject({ entity: "debt", op: "delete", baseVersion: 1 });
  });

  it("sets, changes and removes the pay-back date, each one synced (D-103)", () => {
    const { debtId: id } = debt("owed_to_me", 5000);
    const before = outbox().length;
    setDebtDueDate(ctx, id, "2026-11-30");
    expect(getDebt(ctx.db, id)?.dueDate).toBe("2026-11-30");
    setDebtDueDate(ctx, id, null);
    expect(getDebt(ctx.db, id)?.dueDate).toBeNull();
    const ops = outbox().slice(before);
    expect(ops.map((o) => o.entity)).toEqual(["debt", "debt"]);
  });
});
