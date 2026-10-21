import type { EntityData, PullChange, PushOperation } from "@brokely/contracts";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getPlan } from "../repositories/plan";
import { RepoError, write, type Db, type RepoContext } from "../repositories/context";
import { outboxOperations, planningCycles } from "../schema";
import { linkedAccount, type SyncTransport } from "./engine";

/**
 * Two plans for the same dates at sign-in (D-83, S13l). After "Add this phone's records"
 * (D-73 b), a phone plan and an account plan may cover the same dates; two plans can't own one
 * date (BR-05), so the student picks which one stays. The other is archived, never deleted
 * (BR-27): its records, bills and debts all stay, since a record belongs to whichever plan
 * covers its date.
 */

/** One plan as the S13l cards show it. */
export interface PlanCard {
  readonly id: string;
  /** The version the side last saw: an account plan is archived from this version (S-04). */
  readonly version: number;
  readonly start: string;
  readonly endExclusive: string;
  /** The current approved budget, in sen; null when no revision was approved. */
  readonly budgetSen: number | null;
  /** Categories with an amount in that revision. */
  readonly categories: number;
  readonly approvedAt: string | null;
  /** The account's copy as sync sends it, needed to archive it. Phone plans leave it out. */
  readonly data?: EntityData<"planning_cycle">;
}

const OWNS_DATES = ["active", "completed"] as const;
const byStart = (a: PlanCard, b: PlanCard) => a.start.localeCompare(b.start);

/** This phone's plans that own dates. */
export function phonePlans(db: Db): PlanCard[] {
  return db
    .select()
    .from(planningCycles)
    .where(and(inArray(planningCycles.status, [...OWNS_DATES]), isNull(planningCycles.deletedAt)))
    .all()
    .map((cycle) => {
      const plan = getPlan(db, cycle.id);
      return {
        id: cycle.id,
        version: cycle.version,
        start: cycle.startDate,
        endExclusive: cycle.endDateExclusive,
        budgetSen: plan?.revision.budgetSen ?? null,
        categories: plan?.allocations.length ?? 0,
        approvedAt: plan?.revision.approvedAt ?? null,
      };
    })
    .sort(byStart);
}

/** The account's plans that own dates, from a full pull (every row's latest state). */
export function accountPlans(changes: readonly PullChange[]): PlanCard[] {
  const latest = new Map<string, PullChange>();
  for (const c of changes) latest.set(`${c.entity}:${c.entityId}`, c); // pages are oldest first
  const live = [...latest.values()].filter((c) => !c.deletedAt && c.data);
  // The newest approved revision of each plan.
  const revisions = new Map<string, EntityData<"plan_revision">>();
  for (const c of live) {
    if (c.entity !== "plan_revision") continue;
    const r = c.data as EntityData<"plan_revision">;
    if (!r.approvedAt) continue;
    const known = revisions.get(r.cycleId);
    if (!known || r.revisionNo > known.revisionNo) revisions.set(r.cycleId, r);
  }
  return live
    .filter((c) => c.entity === "planning_cycle")
    .map((c) => ({ c, data: c.data as EntityData<"planning_cycle"> }))
    .filter(({ data }) => (OWNS_DATES as readonly string[]).includes(data.status))
    .map(({ c, data }) => {
      const r = revisions.get(c.entityId);
      return {
        id: c.entityId,
        version: c.version,
        start: data.startDate,
        endExclusive: data.endDateExclusive,
        budgetSen: r?.budgetSen ?? null,
        categories: r?.allocations.length ?? 0,
        approvedAt: r?.approvedAt ?? null,
        data,
      };
    })
    .sort(byStart);
}

export interface PlanClash {
  readonly phone: PlanCard;
  /** Usually one; a long phone plan can meet two shorter account plans. */
  readonly account: readonly PlanCard[];
}

const overlaps = (a: PlanCard, b: PlanCard) => a.start < b.endExclusive && b.start < a.endExclusive;

/**
 * The next question to ask, oldest phone plan first, leaving out plans already archived by an
 * earlier answer (`archived`); null when nothing clashes any more.
 */
export function nextClash(
  phone: readonly PlanCard[],
  account: readonly PlanCard[],
  archived: ReadonlySet<string>,
): PlanClash | null {
  for (const p of phone) {
    if (archived.has(p.id)) continue;
    const meets = account.filter((a) => !archived.has(a.id) && overlaps(p, a));
    if (meets.length > 0) return { phone: p, account: meets };
  }
  return null;
}

/**
 * "Keep my account's plan": archives a plan of this phone before its first sync. It was never
 * sent, so its waiting changes are rewritten to say archived: the server first hears of it as
 * archived and never refuses it for the dates (CYCLE_OVERLAP).
 */
export function archiveUnsentPlan(ctx: RepoContext, cycleId: string) {
  return write(ctx, ({ tx, at }) => {
    if (linkedAccount(tx) !== undefined) {
      throw new RepoError("VALIDATION_FAILED", "This plan was already backed up");
    }
    const changed = tx
      .update(planningCycles)
      .set({ status: "archived", updatedAt: at })
      .where(and(eq(planningCycles.id, cycleId), isNull(planningCycles.deletedAt)))
      .run();
    if (changed.changes === 0) throw new RepoError("NOT_FOUND", "This plan is not on the phone");
    const waiting = tx
      .select()
      .from(outboxOperations)
      .where(
        and(
          eq(outboxOperations.entity, "planning_cycle"),
          eq(outboxOperations.entityId, cycleId),
          eq(outboxOperations.op, "upsert"),
        ),
      )
      .all();
    for (const op of waiting) {
      tx.update(outboxOperations)
        .set({ payload: { ...(op.payload as object), status: "archived" } })
        .where(eq(outboxOperations.operationId, op.operationId))
        .run();
    }
  });
}

/** The change that archives an account plan, from the version the pull showed. */
export function archivePlanOperation(plan: PlanCard, operationId: string): PushOperation {
  if (!plan.data) throw new Error("Only an account plan can be archived on the server");
  return {
    operationId,
    entity: "planning_cycle",
    entityId: plan.id,
    op: "upsert",
    baseVersion: plan.version,
    data: { ...plan.data, status: "archived" },
  };
}

/**
 * "Keep this phone's plan": archives the account's plans on the server before the phone's are
 * sent. Throws when any is refused (e.g. changed on another phone meanwhile); nothing on this
 * phone has changed then, so the student can simply try again.
 */
export async function archiveAccountPlans(
  ctx: RepoContext,
  transport: SyncTransport,
  deviceId: string,
  plans: readonly PlanCard[],
): Promise<void> {
  if (plans.length === 0) return;
  const operations = plans.map((p) => archivePlanOperation(p, ctx.newId()));
  const { results } = await transport.push({ deviceId, operations });
  const refused = results.find((r) => r.status !== "applied" && r.status !== "duplicate");
  if (refused) throw new Error(`The account's plan couldn't be archived (${refused.status})`);
}
