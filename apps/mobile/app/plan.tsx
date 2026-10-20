import {
  formatRM,
  inclusiveEnd,
  localDate,
  parseAmount,
  planTotals,
  sen,
  type AllocationInput,
  type Sen,
} from "@brokely/domain";
import {
  addCategory,
  findCycleOn,
  getPlan,
  listCategories,
  listRevisions,
  revisePlan,
} from "@brokely/local-db";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { repo } from "../src/db/client";
import { useRead } from "../src/db/use-read";
import { categoryEmoji } from "../src/lib/essentials-meta";
import { refusalText } from "../src/lib/messages";
import { dayMonth, today } from "../src/lib/today";
import { Button, Empty, Heading, PageScreen, Sticker } from "../src/ui/components";
import { SheetNote } from "../src/ui/sheet";
import { Field, Labelled } from "../src/ui/sheet-parts";
import { space, type } from "../src/ui/theme";
import { useTheme } from "../src/ui/theme-context";
import { useUndo } from "../src/ui/undo";

/** Sen as editable text; empty for zero so the field shows its placeholder. */
const asTyped = (amount: number) =>
  amount === 0 ? "" : `${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, "0")}`;

const GROUPS = [
  { kind: "essential", title: "Essentials" },
  { kind: "optional", title: "Optional" },
  { kind: "set_aside", title: "Set aside" },
] as const;

/**
 * S9 Current plan (FR-PLN-08…12, D-03, D-28): budget and every category's amount. Saving makes a
 * new revision and keeps the original; a plan over budget asks once "Approve anyway?".
 * Set-asides (Emergency, Savings, or your own label) are planned but not spending (FR-PLN-12).
 */
export default function PlanScreen() {
  const day = useMemo(() => today(), []);
  const data = useRead(
    (db) => {
      const cycle = findCycleOn(db, day);
      const plan = cycle ? getPlan(db, cycle.id) : undefined;
      if (!cycle || !plan) return null;
      return {
        plan,
        revisions: listRevisions(db, cycle.id),
        categories: listCategories(db),
      };
    },
    [day],
  );

  if (!data) {
    return (
      <PageScreen title="Your plan">
        <Empty>No plan for today yet.</Empty>
        <Button label="Make a plan" onPress={() => router.replace("/quick-start")} />
      </PageScreen>
    );
  }
  // Re-mount the form when a new revision arrives, so the fields start from it.
  return <PlanForm key={data.plan.revision.id} {...data} />;
}

function PlanForm({
  plan,
  revisions,
  categories,
}: {
  plan: NonNullable<ReturnType<typeof getPlan>>;
  revisions: ReturnType<typeof listRevisions>;
  categories: ReturnType<typeof listCategories>;
}) {
  const { colors } = useTheme();
  const showUndo = useUndo();
  const current = new Map(plan.allocations.map((a) => [a.categoryId, a.amountSen]));
  const [budgetText, setBudgetText] = useState(asTyped(plan.revision.budgetSen));
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(categories.map((c) => [c.id, asTyped(current.get(c.id) ?? 0)])),
  );
  const [askOver, setAskOver] = useState(false);
  const [newSetAside, setNewSetAside] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const budget = parseAmount(budgetText);
  const parsed = categories.map((c) => ({
    c,
    amount: amounts[c.id]?.trim() ? parseAmount(amounts[c.id]!) : sen(0),
  }));
  const bad = parsed.find((p) => p.amount === null);
  const allocations: (AllocationInput & { categoryId: string })[] = parsed
    .filter((p) => (p.amount ?? 0) > 0)
    .map((p) => ({ categoryId: p.c.id, kind: p.c.kind, amountSen: p.amount as Sen }));
  const totals = budget !== null ? planTotals(budget, allocations) : null;

  const original = revisions[0];
  const range = {
    start: localDate(plan.cycle.startDate),
    endExclusive: localDate(plan.cycle.endDateExclusive),
  };

  const save = (acknowledged: boolean) => {
    if (budget === null || budget <= 0) return setProblem("Type a budget above zero.");
    if (bad) return setProblem(`Check the amount for ${bad.c.name}.`);
    if (totals && totals.shortfallSen > 0 && !acknowledged) return setAskOver(true);
    const before = {
      budgetSen: sen(plan.revision.budgetSen),
      allocations: plan.allocations.map((a) => ({
        categoryId: a.categoryId,
        amountSen: a.amountSen,
      })),
      shortfallAcknowledged: plan.revision.shortfallAcknowledged,
    };
    const saved = revisePlan(repo, {
      cycleId: plan.cycle.id,
      budgetSen: budget,
      allocations: allocations.map((a) => ({ categoryId: a.categoryId, amountSen: a.amountSen })),
      shortfallAcknowledged: acknowledged,
    });
    if (!saved.ok) return setProblem(refusalText(saved.code, saved.message));
    setAskOver(false);
    // Undo is one more revision with the old numbers; history is never rewritten (D-03).
    showUndo(`Plan saved · ${formatRM(budget)}`, () =>
      revisePlan(repo, { cycleId: plan.cycle.id, ...before }),
    );
  };

  const addSetAside = () => {
    const name = newSetAside.trim();
    if (!name) return;
    const added = addCategory(repo, { name, kind: "set_aside" });
    if (!added.ok) return setProblem(refusalText(added.code, added.message));
    setNewSetAside("");
  };

  return (
    <PageScreen title="Your plan">
      <Text style={[type.small, { color: colors.muted, marginTop: -space.sm }]}>
        {dayMonth(range.start)} – {dayMonth(inclusiveEnd(range))} · version{" "}
        {plan.revision.revisionNo}
        {original && original.revisionNo !== plan.revision.revisionNo
          ? ` · first approved with ${formatRM(original.budgetSen)}`
          : ""}
      </Text>

      <Labelled label="Budget for this plan (RM)">
        <Field
          value={budgetText}
          onChange={setBudgetText}
          placeholder="0.00"
          label="Budget"
          numeric
        />
      </Labelled>

      {GROUPS.map((g) => {
        const inGroup = categories.filter((c) => c.kind === g.kind);
        if (inGroup.length === 0) return null;
        return (
          <Sticker key={g.kind} style={{ padding: space.md, gap: space.sm }}>
            <Heading>{g.title}</Heading>
            {inGroup.map((c) => (
              <View
                key={c.id}
                style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}
              >
                <Text style={[type.strong, { flex: 1, color: colors.text }]}>
                  {c.name} {categoryEmoji(c.name)}
                </Text>
                <View style={{ width: 120 }}>
                  <Field
                    value={amounts[c.id] ?? ""}
                    onChange={(text) => {
                      setAmounts((now) => ({ ...now, [c.id]: text }));
                      setAskOver(false);
                    }}
                    placeholder="0.00"
                    label={`${c.name} amount`}
                    numeric
                  />
                </View>
              </View>
            ))}
            {g.kind === "set_aside" ? (
              <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  <Field
                    value={newSetAside}
                    onChange={setNewSetAside}
                    placeholder="New set-aside, e.g. Trip home"
                  />
                </View>
                <Button label="Add" variant="secondary" onPress={addSetAside} />
              </View>
            ) : null}
          </Sticker>
        );
      })}

      {totals ? (
        <SheetNote
          title={
            totals.shortfallSen > 0
              ? `${formatRM(totals.shortfallSen)} over your budget`
              : `${formatRM(totals.unallocatedSen)} not planned yet`
          }
          detail={`Spending ${formatRM(totals.plannedSpendingSen)} · set aside ${formatRM(totals.setAsideSen)} · budget ${formatRM(budget!)}`}
        />
      ) : null}

      {problem ? (
        <Text accessibilityRole="alert" style={[type.strong, { color: colors.warning }]}>
          {problem}
        </Text>
      ) : null}
      {askOver && totals ? (
        <Sticker background={colors.cardTint} style={{ padding: space.md, gap: space.sm }}>
          <Text style={[type.strong, { color: colors.text }]}>
            Your plan is {formatRM(totals.shortfallSen)} over budget. Approve anyway?
          </Text>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Button label="Approve anyway" onPress={() => save(true)} />
            <Button label="Change it" variant="secondary" onPress={() => setAskOver(false)} />
          </View>
        </Sticker>
      ) : (
        <Button label="Save as new version" onPress={() => save(false)} />
      )}
      <Text style={[type.small, { color: colors.muted, paddingBottom: space.lg }]}>
        Saving keeps your earlier versions, so the end-of-plan summary can show where you started.
      </Text>
    </PageScreen>
  );
}
