import { scheduledItemId } from "@brokely/contracts";
import { essentialSuggestion, sen } from "@brokely/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { bills, outboxOperations, scheduledItems } from "../schema";
import { createTestContext, NOW } from "../test-db";
import {
  archiveBill,
  createBill,
  editBill,
  listScheduledItems,
  markBillPaid,
  paidBillTransactionIds,
  skipScheduledItem,
  unskipScheduledItem,
  type BillInput,
} from "./bills";
import { listCategories, seedDefaultCategories } from "./categories";
import type { RepoContext } from "./context";
import { acceptEssentialCard } from "./essential-cards";
import { getPlan, quickStart } from "./plan";
import { deleteTransaction, getTransaction, listTransactions } from "./transactions";

describe("bill repository", () => {
  let ctx: RepoContext;
  let cycleId: string;
  const category = (name: string) => listCategories(ctx.db).find((c) => c.name === name)!.id;
  const outbox = () => ctx.db.select().from(outboxOperations).all();
  const november = { start: "2026-11-01", endExclusive: "2026-12-01" };
  const items = () => listScheduledItems(ctx.db, november);
  const stillToComeSen = () =>
    items()
      .filter((i) => i.status === "upcoming")
      .reduce((sum, i) => sum + i.amountSen, 0);

  beforeEach(async () => {
    ({ ctx } = await createTestContext());
    seedDefaultCategories(ctx);
    const plan = quickStart(ctx, {
      budgetSen: sen(40000),
      startDate: "2026-11-01",
      endDateInclusive: "2026-11-30",
    });
    if (!plan.ok) throw new Error(plan.message);
    cycleId = plan.value.cycleId;
    ctx.db.delete(outboxOperations).run();
  });

  const bill = (input: Partial<BillInput> = {}) => {
    const result = createBill(ctx, {
      categoryId: category("Laundry"),
      name: "Laundry",
      amountSen: sen(500),
      repeat: { kind: "weekdays", days: [1, 4] }, // Mon and Thu
      anchorDate: "2026-11-02",
      ...input,
    });
    if (!result.ok) throw new Error(result.message);
    return result.value.billId;
  };

  it("an upcoming bill shows under still to come and is not spending (AC-19, FR-INS-07)", () => {
    const billId = bill({
      categoryId: category("Phone & internet"),
      name: "Phone",
      amountSen: sen(2000),
      repeat: { kind: "monthly", day: 5 },
      anchorDate: "2026-11-01",
    });

    expect(items()).toEqual([
      expect.objectContaining({
        id: scheduledItemId(billId, "2026-11-05"), // deterministic (S-05)
        billName: "Phone",
        dueDate: "2026-11-05",
        amountSen: 2000,
        status: "upcoming",
      }),
    ]);
    expect(listTransactions(ctx.db)).toHaveLength(0);
    expect(outbox().map((o) => o.entity)).toEqual(["bill", "scheduled_item"]);
    expect(outbox()[0]?.payload).toMatchObject({ repeat: { kind: "monthly", day: 5 } });
  });

  it("creates items only for real dates inside the cycle: Mon and Thu in November = 9 (FR-CAT-04)", () => {
    bill();
    // From Mon 2 Nov: 2, 5, 9, 12, 16, 19, 23, 26, 30 Nov.
    expect(items().map((i) => i.dueDate)).toEqual([
      "2026-11-02",
      "2026-11-05",
      "2026-11-09",
      "2026-11-12",
      "2026-11-16",
      "2026-11-19",
      "2026-11-23",
      "2026-11-26",
      "2026-11-30",
    ]);
  });

  it("Mark paid with RM22 for a RM20 item: one linked transaction, still to come drops by RM20 (AC-12, FR-CAT-05, R-05)", () => {
    bill({ amountSen: sen(2000), repeat: { kind: "every_n_weeks", n: 2 } }); // 2, 16, 30 Nov
    const [first, second] = items();
    expect(stillToComeSen()).toBe(6000);

    const paid = markBillPaid(ctx, {
      scheduledItemId: first!.id,
      amountSen: sen(2200),
      localDate: "2026-11-02",
      occurredAt: NOW,
    });
    if (!paid.ok) throw new Error(paid.message);

    expect(getTransaction(ctx.db, paid.value.transactionId)).toMatchObject({
      type: "purchase",
      amountSen: 2200,
      note: "Laundry",
      lines: [expect.objectContaining({ categoryId: category("Laundry"), amountSen: 2200 })],
    });
    expect(items()[0]).toMatchObject({ status: "paid", transactionId: paid.value.transactionId });
    expect(paidBillTransactionIds(ctx.db)).toEqual(new Set([paid.value.transactionId]));
    expect(stillToComeSen()).toBe(4000);

    // Skip the next one: it leaves still to come (FR-CAT-06).
    expect(skipScheduledItem(ctx, second!.id).ok).toBe(true);
    expect(stillToComeSen()).toBe(2000);
    expect(unskipScheduledItem(ctx, second!.id).ok).toBe(true);
    expect(stillToComeSen()).toBe(4000);
  });

  it("an item is never paid twice (R-05)", () => {
    bill();
    const [first] = items();
    const pay = () =>
      markBillPaid(ctx, {
        scheduledItemId: first!.id,
        amountSen: sen(500),
        localDate: "2026-11-02",
        occurredAt: NOW,
      });
    expect(pay().ok).toBe(true);
    expect(pay()).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });
    expect(listTransactions(ctx.db)).toHaveLength(1);
  });

  it("undoing Mark paid puts the item back in still to come (FR-TXN-10)", () => {
    bill();
    const [first] = items();
    const paid = markBillPaid(ctx, {
      scheduledItemId: first!.id,
      amountSen: sen(500),
      localDate: "2026-11-02",
      occurredAt: NOW,
    });
    if (!paid.ok) throw new Error(paid.message);

    expect(deleteTransaction(ctx, paid.value.transactionId).ok).toBe(true);

    expect(items()[0]).toMatchObject({ status: "upcoming", transactionId: null });
    expect(
      outbox()
        .slice(-2)
        .map((o) => [o.entity, o.op]),
    ).toEqual([
      ["scheduled_item", "upsert"],
      ["transaction", "delete"],
    ]);
  });

  it("RM5 → RM6 after two paid washes: upcoming items become RM6, paid ones stay RM5 (AC-26, FR-CAT-07)", () => {
    const billId = bill();
    const [a, b] = items();
    for (const item of [a!, b!]) {
      markBillPaid(ctx, {
        scheduledItemId: item.id,
        amountSen: sen(500),
        localDate: item.dueDate,
        occurredAt: NOW,
      });
    }

    const edited = editBill(ctx, billId, {
      categoryId: category("Laundry"),
      name: "Laundry",
      amountSen: sen(600),
      repeat: { kind: "weekdays", days: [1, 4] },
      anchorDate: "2026-11-02",
    });

    expect(edited.ok).toBe(true);
    const after = items();
    expect(after.filter((i) => i.status === "paid").map((i) => i.amountSen)).toEqual([500, 500]);
    expect(after.filter((i) => i.status === "upcoming").every((i) => i.amountSen === 600)).toBe(
      true,
    );
    expect(listTransactions(ctx.db).map((t) => t.amountSen)).toEqual([500, 500]);
  });

  it("changing the repeat removes upcoming items that no longer fall on a bill date (FR-CAT-07)", () => {
    const billId = bill();
    editBill(ctx, billId, {
      categoryId: category("Laundry"),
      name: "Laundry",
      amountSen: sen(500),
      repeat: { kind: "weekdays", days: [1] }, // Mondays only
      anchorDate: "2026-11-02",
    });
    expect(items().map((i) => i.dueDate)).toEqual([
      "2026-11-02",
      "2026-11-09",
      "2026-11-16",
      "2026-11-23",
      "2026-11-30",
    ]);
    const deletes = outbox().filter((o) => o.entity === "scheduled_item" && o.op === "delete");
    expect(deletes).toHaveLength(4);
  });

  it("archiving a bill removes its upcoming items and keeps paid ones (FR-CAT-02)", () => {
    const billId = bill();
    const [first] = items();
    markBillPaid(ctx, {
      scheduledItemId: first!.id,
      amountSen: sen(500),
      localDate: "2026-11-02",
      occurredAt: NOW,
    });

    expect(archiveBill(ctx, billId).ok).toBe(true);
    expect(items().map((i) => i.status)).toEqual(["paid"]);
    expect(ctx.db.select().from(bills).get()?.archivedAt).toBe(NOW);
  });

  it("a bill made before any plan gets its items when the next cycle starts (FR-CAT-04)", async () => {
    ({ ctx } = await createTestContext());
    seedDefaultCategories(ctx);
    bill();
    expect(ctx.db.select().from(scheduledItems).all()).toHaveLength(0);

    quickStart(ctx, {
      budgetSen: sen(40000),
      startDate: "2026-11-01",
      endDateInclusive: "2026-11-30",
    });
    expect(items()).toHaveLength(9);
  });

  describe("essential cards (FR-PLN-20, D-35, D-36)", () => {
    it("Laundry, 2 washes a month at RM16, adds RM32 and no bill: washes have no dates (D-36)", () => {
      const { totalSen } = essentialSuggestion(sen(1600), { times: 2, per: "month" }, 30, 30);
      const result = acceptEssentialCard(ctx, {
        cycleId,
        categoryId: category("Laundry"),
        allocationSen: totalSen,
      });

      expect(result.ok).toBe(true);
      const plan = getPlan(ctx.db, cycleId)!;
      expect(plan.revision.revisionNo).toBe(2); // new revision, original kept (FR-PLN-11)
      expect(plan.totals.unallocatedSen).toBe(40000 - 3200);
      expect(ctx.db.select().from(bills).all()).toHaveLength(0);
      expect(items()).toEqual([]);
    });

    it("Phone as a monthly bill on the 5th at RM30 adds RM30 and one item on 5 Nov (D-36, AC-54)", () => {
      const result = acceptEssentialCard(ctx, {
        cycleId,
        categoryId: category("Phone & internet"),
        allocationSen: sen(3000),
        bill: {
          name: "Phone & internet",
          amountSen: sen(3000),
          repeat: { kind: "monthly", day: 5 },
          anchorDate: "2026-11-01",
        },
      });

      expect(result.ok).toBe(true);
      expect(getPlan(ctx.db, cycleId)!.totals.unallocatedSen).toBe(37000);
      expect(items().map((i) => [i.billName, i.dueDate, i.amountSen])).toEqual([
        ["Phone & internet", "2026-11-05", 3000],
      ]);
    });

    it("Meals only sets the allocation, no bill (D-35)", () => {
      const result = acceptEssentialCard(ctx, {
        cycleId,
        categoryId: category("Meals"),
        allocationSen: sen(30000),
      });
      expect(result.ok).toBe(true);
      expect(ctx.db.select().from(bills).all()).toHaveLength(0);
      expect(getPlan(ctx.db, cycleId)!.allocations).toEqual([
        { categoryId: category("Meals"), kind: "essential", amountSen: 30000 },
      ]);
    });

    it("a card over budget needs the 'Add it anyway?' tap and then saves nothing half-way (FR-PLN-10, D-28)", () => {
      const result = acceptEssentialCard(ctx, {
        cycleId,
        categoryId: category("Phone & internet"),
        allocationSen: sen(50000),
        bill: {
          name: "Phone & internet",
          amountSen: sen(50000),
          repeat: { kind: "monthly", day: 5 },
          anchorDate: "2026-11-01",
        },
      });
      expect(result).toMatchObject({ ok: false, code: "SHORTFALL_NOT_ACKNOWLEDGED" });
      expect(ctx.db.select().from(bills).all()).toHaveLength(0); // rolled back together
    });
  });
});
