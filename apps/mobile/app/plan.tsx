import {
  formatRM,
  inclusiveEnd,
  lengthInDays,
  localDate,
  parseAmount,
  planTotals,
  sen,
  type CategoryKind,
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
import { Pressable, Text, View } from "react-native";
import { repo } from "../src/db/client";
import { useRead } from "../src/db/use-read";
import { refusalText } from "../src/lib/messages";
import { dayMonth, today } from "../src/lib/today";
import {
  AmountFieldGroups,
  asTyped,
  GroupLabel,
  PLAN_GROUPS,
  readAllocations,
} from "../src/ui/allocation-fields";
import { Button, Empty, PageScreen, Sticker } from "../src/ui/components";
import { PlanSplit } from "../src/ui/plan-split";
import { Chip, Field } from "../src/ui/sheet-parts";
import { fonts, space, type } from "../src/ui/theme";
import { useTheme } from "../src/ui/theme-context";
import { useUndo } from "../src/ui/undo";

type Plan = NonNullable<ReturnType<typeof getPlan>>;
type Category = ReturnType<typeof listCategories>[number];

const NEW_KINDS: { kind: CategoryKind; label: string; detail: string }[] = [
  { kind: "essential", label: "Essential", detail: "Something you need, like rent or a bus pass." },
  { kind: "optional", label: "Optional", detail: "Nice to have, like the gym or hobbies." },
  {
    kind: "set_aside",
    label: "Set aside",
    detail: "Money you keep for later, like a trip home. Planned, but not spending.",
  },
];

/**
 * S9 Your plan (FR-PLN-08…12, D-03, D-28, D-81). Opening it shows the plan: a summary with the
 * budget's split as a bar, the categories as rows, the unused ones folded. "Change amounts" is a
 * deliberate step with a live total pinned at the top; saving makes a new version and keeps the
 * original; a plan over budget asks once "Approve anyway?". Set-asides (Emergency, Savings, or
 * your own label) are planned but not spending (FR-PLN-12).
 */
export default function PlanScreen() {
  const day = useMemo(() => today(), []);
  const [editing, setEditing] = useState(false);
  const data = useRead(
    (db) => {
      const cycle = findCycleOn(db, day);
      const plan = cycle ? getPlan(db, cycle.id) : undefined;
      if (!cycle || !plan) return null;
      return { plan, revisions: listRevisions(db, cycle.id), categories: listCategories(db) };
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
  return editing ? (
    // Re-mount on a new revision, so the fields start from it.
    <ChangeAmounts key={data.plan.revision.id} {...data} onDone={() => setEditing(false)} />
  ) : (
    <PlanView {...data} day={day} onChange={() => setEditing(true)} />
  );
}

function amountsOf(plan: Plan) {
  return new Map(plan.allocations.map((a) => [a.categoryId, a.amountSen]));
}

/** View: what the plan is, at a glance. */
function PlanView({
  plan,
  revisions,
  categories,
  day,
  onChange,
}: {
  plan: Plan;
  revisions: ReturnType<typeof listRevisions>;
  categories: readonly Category[];
  day: string;
  onChange: () => void;
}) {
  const { colors, scheme } = useTheme();
  const [showUnused, setShowUnused] = useState(false);
  const amounts = amountsOf(plan);
  const range = {
    start: localDate(plan.cycle.startDate),
    endExclusive: localDate(plan.cycle.endDateExclusive),
  };
  const daysLeft = Math.max(
    0,
    lengthInDays({ start: localDate(day), endExclusive: range.endExclusive }),
  );
  const budget = sen(plan.revision.budgetSen);
  const original = revisions[0];
  const byKind = (kind: CategoryKind) =>
    categories.filter((c) => c.kind === kind).reduce((sum, c) => sum + (amounts.get(c.id) ?? 0), 0);
  const essentials = byKind("essential");
  const optional = byKind("optional");
  const setAside = byKind("set_aside");
  const planned = essentials + optional + setAside;
  const left = budget - planned;
  const parts = [
    { label: "Essentials", value: essentials, color: colors.card },
    { label: "Optional", value: optional, color: colors.heroRing },
    { label: "Set aside", value: setAside, color: colors.destructive },
    { label: "Not planned", value: Math.max(0, left), color: colors.heroTile },
  ];
  const used = categories.filter((c) => (amounts.get(c.id) ?? 0) > 0);
  const unused = categories.filter((c) => (amounts.get(c.id) ?? 0) === 0);

  return (
    <PageScreen title="Your plan">
      <View
        accessible
        accessibilityLabel={`Budget ${formatRM(budget)} for ${dayMonth(range.start)} to ${dayMonth(inclusiveEnd(range))}, ${daysLeft} days left. ${parts
          .filter((p) => p.value > 0)
          .map((p) => `${p.label} ${formatRM(sen(p.value))}`)
          .join(", ")}${left < 0 ? `. ${formatRM(sen(-left))} over budget` : ""}`}
        style={{
          backgroundColor: colors.hero,
          borderRadius: 24,
          borderWidth: scheme === "dark" ? 1 : 2,
          borderColor: colors.heroOutline,
          padding: 18,
          gap: space.xs,
        }}
      >
        <Text style={{ fontFamily: fonts.heavy, fontSize: 14, color: colors.onHero }}>
          {dayMonth(range.start)} – {dayMonth(inclusiveEnd(range))} · {daysLeft}{" "}
          {daysLeft === 1 ? "day" : "days"} left
        </Text>
        <Text style={[type.amount, { color: colors.onHero, fontSize: 40, lineHeight: 44 }]}>
          {formatRM(budget)}
        </Text>
        <Text style={[type.small, { color: colors.onHero }]}>
          Budget · version {plan.revision.revisionNo}
          {original && original.revisionNo !== plan.revision.revisionNo
            ? `, started at ${formatRM(sen(original.budgetSen))}`
            : ""}
        </Text>
        <PlanSplit parts={parts} budgetSen={budget} overSen={Math.max(0, -left)} />
      </View>

      {used.length === 0 ? (
        <Empty>No amounts yet. Tap Change amounts to plan your categories.</Empty>
      ) : (
        PLAN_GROUPS.map((g) => {
          const rows = used.filter((c) => (g.kinds as readonly CategoryKind[]).includes(c.kind));
          if (rows.length === 0) return null;
          return (
            <View key={g.title} style={{ gap: space.xs }}>
              <GroupLabel>{g.title}</GroupLabel>
              <Sticker style={{ padding: 0 }}>
                {rows.map((c, i) => (
                  <AmountRow
                    key={c.id}
                    name={c.kind === "set_aside" ? `${c.name} · set aside` : c.name}
                    amount={formatRM(amounts.get(c.id) ?? sen(0))}
                    first={i === 0}
                  />
                ))}
              </Sticker>
            </View>
          );
        })
      )}

      {unused.length > 0 ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showUnused }}
            onPress={() => setShowUnused((s) => !s)}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Sticker
              rounded={14}
              offset={2}
              style={{
                minHeight: 52,
                paddingHorizontal: space.md,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <Text style={{ flex: 1, fontFamily: fonts.heavy, fontSize: 15, color: colors.text }}>
                Not in this plan · {unused.length} {unused.length === 1 ? "category" : "categories"}
              </Text>
              <Text style={{ fontFamily: fonts.heavy, fontSize: 14, color: colors.text }}>
                {showUnused ? "Hide" : "Show"}
              </Text>
            </Sticker>
          </Pressable>
          {showUnused ? (
            <Sticker style={{ padding: 0, opacity: 0.8 }}>
              {unused.map((c, i) => (
                <AmountRow key={c.id} name={c.name} amount={formatRM(sen(0))} first={i === 0} />
              ))}
            </Sticker>
          ) : null}
        </>
      ) : null}

      <Button label="Change amounts" onPress={onChange} />
      <View style={{ marginBottom: space.lg }}>
        <Button
          label="Plan step by step"
          variant="secondary"
          onPress={() => router.push("/guided")}
        />
      </View>
    </PageScreen>
  );
}

/** Change amounts: a live total on top, only the plan's categories, Save at the bottom. */
function ChangeAmounts({
  plan,
  categories,
  onDone,
}: {
  plan: Plan;
  revisions: ReturnType<typeof listRevisions>;
  categories: readonly Category[];
  onDone: () => void;
}) {
  const { colors } = useTheme();
  const showUndo = useUndo();
  const current = amountsOf(plan);
  const [budgetText, setBudgetText] = useState(asTyped(plan.revision.budgetSen));
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(categories.map((c) => [c.id, asTyped(current.get(c.id) ?? 0)])),
  );
  const [showAll, setShowAll] = useState(false);
  // Categories added here, shown even before they get an amount.
  const [added, setAdded] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [askOver, setAskOver] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<CategoryKind>("optional");
  const [problem, setProblem] = useState<string | null>(null);

  const budget = parseAmount(budgetText);
  const { allocations, bad } = readAllocations(categories, amounts);
  const totals = budget !== null ? planTotals(budget, allocations) : null;
  const plannedSen = totals ? sen(totals.plannedSpendingSen + totals.setAsideSen) : null;
  const shown = categories.filter(
    (c) =>
      showAll ||
      (current.get(c.id) ?? 0) > 0 ||
      added.includes(c.id) ||
      (amounts[c.id] ?? "").trim() !== "",
  );

  const save = (acknowledged: boolean) => {
    if (budget === null || budget <= 0) return setProblem("Type a budget above zero.");
    if (bad) return setProblem(`Check the amount for ${bad.name}.`);
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
    onDone();
    // Undo is one more revision with the old numbers; history is never rewritten (D-03).
    showUndo(`Plan saved · ${formatRM(budget)}`, () =>
      revisePlan(repo, { cycleId: plan.cycle.id, ...before }),
    );
  };

  /** A new category (or labelled set-aside, FR-PLN-12) to give an amount in this plan. */
  const addOne = () => {
    const name = newName.trim();
    if (!name) return setProblem("Type a name for the new category.");
    const result = addCategory(repo, { name, kind: newKind });
    if (!result.ok) return setProblem(refusalText(result.code, result.message));
    setAdded((now) => [...now, result.value.id]);
    setNewName("");
    setAdding(false);
    setProblem(null);
  };

  const over = totals !== null && totals.shortfallSen > 0;
  const live = (
    <Sticker
      background={over ? colors.warningCard : colors.cardTint}
      style={{ paddingVertical: 12, paddingHorizontal: space.md, gap: 2 }}
    >
      <Text accessibilityLiveRegion="polite" style={[type.heading, { color: colors.text }]}>
        {totals === null
          ? "Type your budget"
          : over
            ? `${formatRM(totals.shortfallSen)} over budget`
            : totals.unallocatedSen === 0
              ? "Every ringgit has a plan"
              : `${formatRM(totals.unallocatedSen)} left to plan`}
      </Text>
      {plannedSen !== null && budget !== null ? (
        <Text style={[type.small, { color: colors.muted }]}>
          Planned {formatRM(plannedSen)} of {formatRM(budget)}
        </Text>
      ) : null}
    </Sticker>
  );

  const footer =
    askOver && totals ? (
      <Sticker background={colors.warningCard} style={{ padding: space.md, gap: space.sm }}>
        <Text style={[type.strong, { color: colors.text }]}>
          Your plan is {formatRM(totals.shortfallSen)} over budget. Approve anyway?
        </Text>
        <Button label="Approve anyway" onPress={() => save(true)} />
        <Button label="Change it" variant="secondary" onPress={() => setAskOver(false)} />
      </Sticker>
    ) : (
      <View style={{ gap: space.xs }}>
        <Button label="Save as new version" onPress={() => save(false)} />
        <Button label="Cancel" variant="link" onPress={onDone} />
      </View>
    );

  return (
    <PageScreen title="Change amounts" keyboardSafe pinned={live} footer={footer}>
      <Sticker
        style={{
          minHeight: 60,
          paddingVertical: 8,
          paddingHorizontal: space.md,
          flexDirection: "row",
          alignItems: "center",
          gap: space.sm,
        }}
      >
        <Text style={[type.heading, { flex: 1, color: colors.text }]}>Budget</Text>
        <View style={{ width: 130 }}>
          <Field
            value={budgetText}
            onChange={(t) => {
              setBudgetText(t);
              setAskOver(false);
            }}
            placeholder="0.00"
            label="Budget"
            numeric
          />
        </View>
      </Sticker>

      <AmountFieldGroups
        categories={shown}
        amounts={amounts}
        onChange={(id, text) => {
          setAmounts((now) => ({ ...now, [id]: text }));
          setAskOver(false);
        }}
      />

      <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: space.md }}>
        <Button
          label={showAll ? "Show fewer" : "Show all categories"}
          variant="link"
          onPress={() => setShowAll((s) => !s)}
        />
        {adding ? null : (
          <Button label="+ Add a category" variant="link" onPress={() => setAdding(true)} />
        )}
      </View>

      {adding ? (
        <Sticker style={{ padding: space.md, gap: space.sm }}>
          <Field
            value={newName}
            onChange={setNewName}
            placeholder="e.g. Gym, Trip home, Course books"
            label="New category name"
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {NEW_KINDS.map((k) => (
              <Chip
                key={k.kind}
                label={k.label}
                selected={newKind === k.kind}
                onPress={() => setNewKind(k.kind)}
              />
            ))}
          </View>
          <Text style={[type.small, { color: colors.muted }]}>
            {NEW_KINDS.find((k) => k.kind === newKind)?.detail}
          </Text>
          <Button label="Add category" variant="secondary" onPress={addOne} />
          <Button label="Cancel" variant="link" onPress={() => setAdding(false)} />
        </Sticker>
      ) : null}

      {problem ? (
        <Text accessibilityRole="alert" style={[type.strong, { color: colors.warning }]}>
          {problem}
        </Text>
      ) : null}
      <Text style={[type.small, { color: colors.muted }]}>
        Saving keeps your earlier versions, so the end-of-plan summary can show where you started.
      </Text>
    </PageScreen>
  );
}

function AmountRow({ name, amount, first }: { name: string; amount: string; first: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        minHeight: 48,
        flexDirection: "row",
        alignItems: "center",
        gap: space.sm,
        paddingVertical: 11,
        paddingHorizontal: space.md,
        borderTopWidth: first ? 0 : 2,
        borderTopColor: colors.background,
      }}
    >
      <Text style={[type.strong, { flex: 1, color: colors.text }]}>{name}</Text>
      <Text
        style={{
          fontFamily: fonts.heavy,
          fontSize: 16,
          color: colors.text,
          fontVariant: ["tabular-nums"],
        }}
      >
        {amount}
      </Text>
    </View>
  );
}
