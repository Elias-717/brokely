import {
  formatRM,
  planChanges,
  planTotals,
  sen,
  undoPlanChange,
  type PlanChange,
} from "@brokely/domain";
import {
  findCycleOn,
  getPlan,
  listCategories,
  listPlanHistory,
  revisePlan,
} from "@brokely/local-db";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { repo } from "../src/db/client";
import { useRead } from "../src/db/use-read";
import { refusalText } from "../src/lib/messages";
import { dayMonth, today, toLocalDate } from "../src/lib/today";
import { Button, Empty, PageScreen, Sticker } from "../src/ui/components";
import { savedBuzz } from "../src/ui/haptics";
import { fonts, space, type } from "../src/ui/theme";
import { useTheme } from "../src/ui/theme-context";
import { useUndo } from "../src/ui/undo";

/** "TODAY · 4:10 PM", "12 NOV · 9:15 PM". */
function whenLabel(iso: string, day: string): string {
  const at = new Date(iso);
  const date = toLocalDate(at);
  const time = at.toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" });
  return `${date === day ? "Today" : dayMonth(date)} · ${time}`.toUpperCase();
}

/**
 * Plan changes (D-139): every change to this plan, newest first, with when, why and what moved.
 * "Undo this change" reverses only that change on today's plan as one more change (D-03); the
 * first plan has nothing to undo. Opened from Your plan.
 */
export default function PlanChangesScreen() {
  const { colors } = useTheme();
  const showUndo = useUndo();
  const day = useMemo(() => today(), []);
  const data = useRead(
    (db) => {
      const cycle = findCycleOn(db, day);
      const plan = cycle ? getPlan(db, cycle.id) : undefined;
      if (!cycle || !plan) return null;
      const names = new Map(
        listCategories(db, { includeArchived: true }).map((c) => [c.id, c.name]),
      );
      return { plan, changes: planChanges(listPlanHistory(db, cycle.id)), names };
    },
    [day],
  );
  // A change whose undo goes below the category amounts asks once more (D-28).
  const [askAnyway, setAskAnyway] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ id: string; text: string } | null>(null);

  if (!data) {
    return (
      <PageScreen title="Plan changes">
        <Empty>No plan for today yet.</Empty>
      </PageScreen>
    );
  }
  const { plan, changes, names } = data;
  const current = {
    budgetSen: sen(plan.revision.budgetSen),
    allocations: plan.allocations.map((a) => ({
      categoryId: a.categoryId,
      amountSen: sen(a.amountSen),
    })),
  };
  const kinds = new Map(plan.allocations.map((a) => [a.categoryId, a.kind]));

  const undo = (change: PlanChange) => {
    const next = undoPlanChange(current, change);
    if (!next) {
      return setProblem({
        id: change.revisionId,
        text: "That would leave no budget, so it can't be undone.",
      });
    }
    const totals = planTotals(
      next.budgetSen,
      next.allocations.map((a) => ({ ...a, kind: kinds.get(a.categoryId) ?? "optional" })),
    );
    const short = totals.shortfallSen > 0;
    if (short && askAnyway !== change.revisionId) {
      setAskAnyway(change.revisionId);
      return setProblem({
        id: change.revisionId,
        text: `Your categories would be ${formatRM(totals.shortfallSen)} over the budget. Tap again to undo anyway.`,
      });
    }
    const before = {
      budgetSen: current.budgetSen,
      allocations: current.allocations,
      shortfallAcknowledged: plan.revision.shortfallAcknowledged,
    };
    const saved = revisePlan(repo, {
      cycleId: plan.cycle.id,
      budgetSen: next.budgetSen,
      allocations: next.allocations,
      shortfallAcknowledged: short || plan.revision.shortfallAcknowledged,
      reason: `Undid: ${change.reason}`.slice(0, 120),
    });
    if (!saved.ok)
      return setProblem({ id: change.revisionId, text: refusalText(saved.code, saved.message) });
    setAskAnyway(null);
    setProblem(null);
    savedBuzz();
    showUndo(`Undid: ${change.reason}`, () =>
      revisePlan(repo, {
        cycleId: plan.cycle.id,
        ...before,
        reason: `Redid: ${change.reason}`.slice(0, 120),
      }),
    );
  };

  return (
    <PageScreen title="Plan changes">
      <Text style={[type.small, { color: colors.muted }]}>
        {changes.length} {changes.length === 1 ? "change" : "changes"} · now{" "}
        {formatRM(current.budgetSen)}
      </Text>
      {changes.map((c) => (
        <Sticker key={c.revisionId} style={{ padding: space.md, gap: 4 }}>
          <Text style={{ fontFamily: fonts.heavy, fontSize: 12, color: colors.muted }}>
            {whenLabel(c.at, day)}
          </Text>
          <Text style={{ fontFamily: fonts.heavy, fontSize: 16, color: colors.text }}>
            {c.reason}
          </Text>
          {c.budget ? (
            <Text style={[type.strong, { color: colors.income, fontSize: 14 }]}>
              {c.budget.from === null
                ? `Budget ${formatRM(c.budget.to)}`
                : `Budget ${formatRM(c.budget.from)} → ${formatRM(c.budget.to)}`}
            </Text>
          ) : null}
          {c.categories.map((m) => (
            <Text key={m.categoryId} style={[type.strong, { color: colors.income, fontSize: 14 }]}>
              {names.get(m.categoryId) ?? "A category"} {formatRM(m.from)} → {formatRM(m.to)}
            </Text>
          ))}
          {problem?.id === c.revisionId ? (
            <Text accessibilityRole="alert" style={[type.small, { color: colors.warning }]}>
              {problem.text}
            </Text>
          ) : null}
          {c.canUndo ? (
            <View style={{ flexDirection: "row", marginTop: space.xs }}>
              <Button
                label={askAnyway === c.revisionId ? "Undo anyway" : "Undo this change"}
                variant="secondary"
                onPress={() => undo(c)}
              />
            </View>
          ) : null}
        </Sticker>
      ))}
      <View style={{ marginBottom: space.lg }}>
        <Button label="Back to your plan" variant="link" onPress={() => router.back()} />
      </View>
    </PageScreen>
  );
}
