import { sen } from "@brokely/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestContext } from "../test-db";
import { listCategories, seedDefaultCategories } from "./categories";
import type { RepoContext } from "./context";
import { getMoneyInRoutes, removeMoneyInRoute, setMoneyInRoute } from "./local-prefs";
import { recordMoneyInTo, undoMoneyInTo } from "./money-in";
import { outboxOperations } from "../schema";
import { getPlan, listPlanHistory, listRevisions, quickStart } from "./plan";
import { listTransactions } from "./transactions";

describe("money in with Goes to (D-130, D-134)", () => {
  let ctx: RepoContext;
  let cycleId: string;
  const category = (name: string) => listCategories(ctx.db).find((c) => c.name === name)!.id;
  const when = { occurredAt: "2026-11-17T04:00:00.000Z", localDate: "2026-11-17" };

  beforeEach(async () => {
    ({ ctx } = await createTestContext());
    seedDefaultCategories(ctx);
    const started = quickStart(ctx, {
      budgetSen: sen(50000),
      startDate: "2026-11-01",
      endDateInclusive: "2026-11-30",
    });
    if (!started.ok) throw new Error(started.message);
    cycleId = started.value.cycleId;
  });

  it("adds RM2 to a RM500 plan in one step, the RM502 student (AC-61)", () => {
    const saved = recordMoneyInTo(ctx, {
      amountSen: sen(200),
      ...when,
      note: "From a friend",
      cycleId,
      goesTo: { kind: "plan" },
    });
    expect(saved.ok).toBe(true);
    expect(getPlan(ctx.db, cycleId)?.revision.budgetSen).toBe(50200);
    expect(listTransactions(ctx.db).filter((t) => t.type === "income")).toHaveLength(1);
  });

  it("raises Savings with the budget, so nothing becomes free to spend", () => {
    recordMoneyInTo(ctx, {
      amountSen: sen(30000),
      ...when,
      cycleId,
      goesTo: { kind: "set_aside", categoryId: category("Savings") },
    });
    const plan = getPlan(ctx.db, cycleId)!;
    expect(plan.revision.budgetSen).toBe(80000);
    expect(plan.allocations.find((a) => a.categoryId === category("Savings"))?.amountSen).toBe(
      30000,
    );
  });

  it("only records it when the student says so, and the plan stays", () => {
    const before = listRevisions(ctx.db, cycleId).length;
    recordMoneyInTo(ctx, { amountSen: sen(1000), ...when, cycleId, goesTo: { kind: "record" } });
    expect(listRevisions(ctx.db, cycleId)).toHaveLength(before);
  });

  it("Undo removes the record and puts the old budget back as one more revision (D-03)", () => {
    const saved = recordMoneyInTo(ctx, {
      amountSen: sen(500),
      ...when,
      cycleId,
      goesTo: { kind: "today" },
    });
    if (!saved.ok) throw new Error(saved.message);
    const revisions = listRevisions(ctx.db, cycleId).length;
    expect(undoMoneyInTo(ctx, saved.value).ok).toBe(true);
    expect(getPlan(ctx.db, cycleId)?.revision.budgetSen).toBe(50000);
    expect(listRevisions(ctx.db, cycleId)).toHaveLength(revisions + 1);
    expect(listTransactions(ctx.db).filter((t) => t.type === "income")).toHaveLength(0);
  });

  it("remembers where each money in went, on this phone only", () => {
    setMoneyInRoute(ctx, cycleId, "t1", {
      to: "today",
      amountSen: sen(500),
      localDate: "2026-11-17",
    });
    setMoneyInRoute(ctx, cycleId, "t2", {
      to: "plan",
      amountSen: sen(900),
      localDate: "2026-11-17",
    });
    expect(Object.keys(getMoneyInRoutes(ctx.db, cycleId))).toEqual(["t1", "t2"]);
    removeMoneyInRoute(ctx, cycleId, "t1");
    expect(getMoneyInRoutes(ctx.db, cycleId)).toEqual({
      t2: { to: "plan", amountSen: 900, localDate: "2026-11-17" },
    });
  });

  it("saves why the plan changed, sends it with the revision and lists it (D-139)", () => {
    const saved = recordMoneyInTo(ctx, {
      amountSen: sen(200),
      ...when,
      cycleId,
      goesTo: { kind: "plan" },
      reason: "Money in · From a friend · Ali",
    });
    if (!saved.ok) throw new Error(saved.message);
    undoMoneyInTo(ctx, saved.value);
    const history = listPlanHistory(ctx.db, cycleId);
    expect(history.map((r) => r.reason)).toEqual([
      null,
      "Money in · From a friend · Ali",
      "Undid: Money in · From a friend · Ali",
    ]);
    const sent = ctx.db
      .select()
      .from(outboxOperations)
      .all()
      .filter((o) => o.entity === "plan_revision")
      .map((o) => (o.payload as { reason?: string | null }).reason);
    expect(sent).toContain("Money in · From a friend · Ali");
  });
});
