import { sen } from "@brokely/domain";
import { describe, expect, it } from "vitest";
import { quickStart, seedDefaultCategories } from "../repositories";
import { outboxOperations } from "../schema";
import { createTestContext } from "../test-db";
import { linkAccount } from "./engine";
import {
  archivePlanOperation,
  archiveUnsentPlan,
  nextClash,
  phonePlans,
  type PlanCard,
} from "./plan-clash";

const card = (id: string, start: string, endExclusive: string): PlanCard => ({
  id,
  version: 1,
  start,
  endExclusive,
  budgetSen: 40000,
  categories: 0,
  approvedAt: null,
});

describe("two plans for the same dates (D-83)", () => {
  it("asks about each phone plan that meets an account plan, oldest first", () => {
    const phone = [
      card("p-oct", "2026-10-01", "2026-11-01"),
      card("p-nov", "2026-11-01", "2026-12-01"),
    ];
    const account = [
      card("a-sep", "2026-09-01", "2026-10-01"), // touches, doesn't overlap (end is exclusive)
      card("a-nov", "2026-11-15", "2026-12-15"),
    ];
    expect(nextClash(phone, account, new Set())).toEqual({
      phone: phone[1],
      account: [account[1]],
    });
    // Once one side is archived, that clash is settled.
    expect(nextClash(phone, account, new Set(["a-nov"]))).toBeNull();
    expect(nextClash(phone, account, new Set(["p-nov"]))).toBeNull();
  });

  it("puts every account plan a long phone plan meets in one question", () => {
    const phone = [card("p", "2026-10-01", "2026-12-01")];
    const account = [
      card("a1", "2026-10-01", "2026-11-01"),
      card("a2", "2026-11-01", "2026-12-01"),
    ];
    expect(nextClash(phone, account, new Set())?.account.map((a) => a.id)).toEqual(["a1", "a2"]);
  });

  it("shows a phone plan's budget and categories, then archives it before its first sync", async () => {
    const { ctx } = await createTestContext();
    seedDefaultCategories(ctx);
    quickStart(ctx, {
      budgetSen: sen(40000),
      startDate: "2026-11-01",
      endDateInclusive: "2026-11-30",
    });
    const [plan] = phonePlans(ctx.db);
    expect(plan).toMatchObject({
      start: "2026-11-01",
      endExclusive: "2026-12-01",
      budgetSen: 40000,
    });

    expect(archiveUnsentPlan(ctx, plan!.id).ok).toBe(true);
    expect(phonePlans(ctx.db)).toEqual([]);
    // The server will first hear of it as archived, so its dates never clash (BR-05).
    const sent = ctx.db.select().from(outboxOperations).all();
    const cycleOps = sent.filter((op) => op.entity === "planning_cycle");
    expect(cycleOps.length).toBeGreaterThan(0);
    expect(cycleOps.every((op) => (op.payload as { status: string }).status === "archived")).toBe(
      true,
    );
  });

  it("never rewrites a plan that may already be on the server", async () => {
    const { ctx } = await createTestContext();
    seedDefaultCategories(ctx);
    quickStart(ctx, {
      budgetSen: sen(40000),
      startDate: "2026-11-01",
      endDateInclusive: "2026-11-30",
    });
    linkAccount(ctx.db, "11111111-1111-4111-8111-111111111111");
    expect(archiveUnsentPlan(ctx, phonePlans(ctx.db)[0]!.id).ok).toBe(false);
  });

  it("archives an account plan from the version the pull showed (S-04)", () => {
    const plan: PlanCard = {
      ...card("a", "2026-11-01", "2026-12-01"),
      version: 3,
      data: {
        startDate: "2026-11-01",
        endDateExclusive: "2026-12-01",
        trackingStartDate: "2026-11-01",
        status: "active",
      },
    };
    expect(archivePlanOperation(plan, "op-1")).toMatchObject({
      entity: "planning_cycle",
      entityId: "a",
      op: "upsert",
      baseVersion: 3,
      data: { status: "archived", startDate: "2026-11-01" },
    });
    expect(() => archivePlanOperation(card("p", "2026-11-01", "2026-12-01"), "op-2")).toThrow();
  });
});
