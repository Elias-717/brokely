import {
  addDays,
  cycleFromInclusive,
  essentialSuggestion,
  formatRM,
  healthySuggestion,
  inclusiveEnd,
  lastDayOfMonth,
  lengthInDays,
  localDate,
  midMonthStart,
  parseAmount,
  planTotals,
  sen,
  type Frequency,
  type LocalDate,
  type Sen,
} from "@brokely/domain";
import {
  approveDraftCycle,
  approveRevisionDraft,
  datesClash,
  discardDraftCycle,
  discardRevisionDraft,
  findCycleOn,
  getDraftCycle,
  getPlan,
  getRevisionDraft,
  listCategories,
  saveDraftCycle,
  saveRevisionDraft,
} from "@brokely/local-db";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { db, repo } from "../src/db/client";
import { categoryEmoji, essentialMeta } from "../src/lib/essentials-meta";
import { refusalText } from "../src/lib/messages";
import { dayMonth, today } from "../src/lib/today";
import { AllocationFields, asTyped, readAllocations } from "../src/ui/allocation-fields";
import { CategoryPicker } from "../src/ui/category-picker";
import { BrokelyAvatar } from "../src/ui/chat";
import { Button, PageScreen, Sticker } from "../src/ui/components";
import { pickDate } from "../src/ui/date-picker";
import { DateButton, SheetNote } from "../src/ui/sheet";
import { Field, Labelled } from "../src/ui/sheet-parts";
import { space, type } from "../src/ui/theme";
import { useTheme } from "../src/ui/theme-context";

/** How often an essential happens, as a guess (D-63). */
const OFTEN: { id: string; label: string; frequency: Frequency }[] = [
  { id: "day", label: "Every day", frequency: { times: 1, per: "day" } },
  { id: "most", label: "Most days (5 a week)", frequency: { times: 5, per: "week" } },
  { id: "few", label: "A few times a week", frequency: { times: 3, per: "week" } },
  { id: "week", label: "Every week", frequency: { times: 1, per: "week" } },
  { id: "twice", label: "Twice a month", frequency: { times: 2, per: "month" } },
  { id: "month", label: "Every month", frequency: { times: 1, per: "month" } },
];

/** The likeliest choice per essential; laundry is washes, about twice a month (D-36). */
function defaultOften(name: string): string {
  if (name === "Laundry") return "twice";
  const likely = essentialMeta(name).likely;
  return likely === "day" ? "day" : likely === "week" ? "week" : "month";
}

type Step = 1 | 2 | 3 | 4;

/**
 * S2a–S2d Guided setup (FR-PLN-01…12, FR-PLN-16, AC-04, AC-47, D-20, D-63): dates and budget,
 * essentials (how often, how much), every amount, then review and approve. Every step saves a
 * draft, so leaving and coming back continues it. The amounts are guides, never limits: sudden
 * costs are normal and nothing is ever blocked. Bills with a set date are added in Bills &
 * subscriptions, so none is created twice.
 */
export default function GuidedSetup() {
  const { colors } = useTheme();
  const day = useMemo(() => today(), []);
  const start = useMemo(() => {
    const cycle = findCycleOn(db, day);
    const plan = cycle ? getPlan(db, cycle.id) : undefined;
    const categories = listCategories(db);
    if (cycle && plan) {
      const draft = getRevisionDraft(db, cycle.id);
      return {
        mode: "edit" as const,
        cycleId: cycle.id,
        startDate: localDate(cycle.startDate),
        endDate: addDays(localDate(cycle.endDateExclusive), -1),
        budget: sen(draft?.revision.budgetSen ?? plan.revision.budgetSen),
        parts: draft?.allocations ?? plan.allocations,
        resumed: !!draft,
        categories,
      };
    }
    const draft = getDraftCycle(db);
    const fresh = midMonthStart(day, "fresh").range;
    return {
      mode: "new" as const,
      cycleId: draft?.cycle.id ?? null,
      startDate: draft ? localDate(draft.cycle.startDate) : fresh.start,
      endDate: draft ? addDays(localDate(draft.cycle.endDateExclusive), -1) : inclusiveEnd(fresh),
      budget: draft ? sen(draft.revision.budgetSen) : sen(0),
      parts: draft?.allocations ?? [],
      resumed: !!draft,
      categories,
    };
  }, [day]);

  const categories = start.categories;
  const essentials = categories.filter((c) => c.kind === "essential");
  const [step, setStep] = useState<Step>(start.resumed ? 3 : 1);
  const [startDate, setStartDate] = useState<LocalDate>(start.startDate);
  const [endDate, setEndDate] = useState<LocalDate>(start.endDate);
  const [budgetText, setBudgetText] = useState(asTyped(start.budget));
  const [amounts, setAmounts] = useState<Record<string, string>>(() => {
    const saved = new Map(start.parts.map((p) => [p.categoryId, p.amountSen]));
    return Object.fromEntries(categories.map((c) => [c.id, asTyped(saved.get(c.id) ?? 0)]));
  });
  const [often, setOften] = useState<Record<string, string>>(() =>
    Object.fromEntries(essentials.map((c) => [c.id, defaultOften(c.name)])),
  );
  const [each, setEach] = useState<Record<string, string>>({});
  const [askOver, setAskOver] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const budget = parseAmount(budgetText);
  const planDays = endDate >= startDate ? lengthInDays(cycleFromInclusive(startDate, endDate)) : 0;
  const monthDays = lastDayOfMonth(startDate);
  const { allocations, bad } = readAllocations(categories, amounts);
  const totals = budget !== null && budget > 0 ? planTotals(budget, allocations) : null;
  const parts = allocations.map((a) => ({ categoryId: a.categoryId, amountSen: a.amountSen }));

  /** An essential's working from step 2: "30 × RM9.00 = RM270.00". */
  const working = (categoryId: string) => {
    const amount = parseAmount(each[categoryId] ?? "");
    const choice = OFTEN.find((o) => o.id === often[categoryId]);
    if (!amount || !choice || planDays <= 0) return null;
    return { amount, ...essentialSuggestion(amount, choice.frequency, planDays, monthDays) };
  };

  /** Saves the draft so the student can leave and continue later (AC-47). */
  const saveDraft = (): boolean => {
    if (budget === null || budget <= 0) {
      setProblem("Type a budget above zero.");
      return false;
    }
    const saved =
      start.mode === "edit"
        ? saveRevisionDraft(repo, { cycleId: start.cycleId, budgetSen: budget, allocations: parts })
        : saveDraftCycle(repo, {
            startDate,
            endDateInclusive: endDate,
            budgetSen: budget,
            allocations: parts,
          });
    if (!saved.ok) {
      setProblem(refusalText(saved.code, saved.message));
      return false;
    }
    setProblem(null);
    return true;
  };

  const next = () => {
    if (step === 1) {
      if (endDate < startDate) return setProblem("The end date is before the start date.");
      if (start.mode === "new" && datesClash(db, startDate, endDate)) {
        return setProblem("You already have a plan for some of these dates. Pick later dates.");
      }
      if (saveDraft()) setStep(2);
    } else if (step === 2) {
      // Copy each essential's working into its amount; untouched ones keep what they had.
      setAmounts((now) => {
        const copy = { ...now };
        for (const c of essentials) {
          const w = working(c.id);
          if (w) copy[c.id] = asTyped(w.totalSen);
        }
        return copy;
      });
      setStep(3);
    } else if (step === 3) {
      if (bad) return setProblem(`Check the amount for ${bad.name}.`);
      if (saveDraft()) setStep(4);
    }
  };

  const approve = (acknowledged: boolean) => {
    if (budget === null || budget <= 0) return setProblem("Type a budget above zero.");
    if (totals && totals.shortfallSen > 0 && !acknowledged) return setAskOver(true);
    if (!saveDraft()) return;
    const approved =
      start.mode === "edit"
        ? approveRevisionDraft(repo, {
            cycleId: start.cycleId,
            shortfallAcknowledged: acknowledged,
          })
        : approveDraftCycle(repo, {
            cycleId: getDraftCycle(db)!.cycle.id,
            startDate,
            endDateInclusive: endDate,
            budgetSen: budget,
            allocations: parts,
            shortfallAcknowledged: acknowledged,
          });
    if (!approved.ok) return setProblem(refusalText(approved.code, approved.message));
    router.replace("/");
  };

  const discard = () => {
    if (start.mode === "edit") discardRevisionDraft(repo, start.cycleId);
    else {
      const draft = getDraftCycle(db);
      if (draft) discardDraftCycle(repo, draft.cycle.id);
    }
    router.back();
  };

  const bubble = (text: string) => (
    <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-start" }}>
      <BrokelyAvatar size={40} />
      <Sticker
        background={colors.cardTint}
        style={{ paddingHorizontal: space.md, paddingVertical: space.sm }}
      >
        <Text style={[type.body, { color: colors.text, maxWidth: 260 }]}>{text}</Text>
      </Sticker>
    </View>
  );

  const unplanned = totals ? totals.unallocatedSen : sen(0);
  const roomTip = budget ? sen(Math.round(budget / 10)) : sen(0);

  return (
    <PageScreen title={`Plan step by step · ${step} of 4`}>
      {step === 1 ? (
        <>
          {bubble(
            start.mode === "edit"
              ? "Let's go through your plan together. Your dates stay; check the budget."
              : "Let's plan it together. First, the dates and how much you have.",
          )}
          {start.mode === "new" ? (
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <View style={{ flex: 1 }}>
                <Labelled label="From">
                  <DateButton
                    label={dayMonth(startDate)}
                    accessibilityLabel={`From ${dayMonth(startDate)}. Change`}
                    onPress={async () => {
                      const chosen = await pickDate(startDate);
                      if (chosen) setStartDate(chosen);
                    }}
                  />
                </Labelled>
              </View>
              <View style={{ flex: 1 }}>
                <Labelled label="To (included)">
                  <DateButton
                    label={dayMonth(endDate)}
                    accessibilityLabel={`To ${dayMonth(endDate)}. Change`}
                    onPress={async () => {
                      const chosen = await pickDate(endDate);
                      if (chosen) setEndDate(chosen);
                    }}
                  />
                </Labelled>
              </View>
            </View>
          ) : (
            <Text style={[type.strong, { color: colors.text }]}>
              {dayMonth(startDate)} – {dayMonth(endDate)}, both days included
            </Text>
          )}
          <Labelled label={`Budget for these ${planDays} days (RM)`}>
            <Field
              value={budgetText}
              onChange={setBudgetText}
              placeholder="0.00"
              label="Budget"
              numeric
            />
          </Labelled>
        </>
      ) : null}

      {step === 2 ? (
        <>
          {bubble(
            "Now your essentials. A rough guess is fine: these are guides, not limits. Skip any that don't apply.",
          )}
          {essentials.map((c) => {
            const tip = budget ? healthySuggestion(c.name, budget, planDays) : null;
            const w = working(c.id);
            return (
              <Sticker key={c.id} style={{ padding: space.md, gap: space.sm }}>
                <Text style={[type.strong, { color: colors.text }]}>
                  {c.name} {categoryEmoji(c.name)}
                </Text>
                {tip ? (
                  <Text style={[type.small, { color: colors.muted }]}>
                    A healthy plan: about {formatRM(tip.totalSen)} ({tip.percent}%)
                  </Text>
                ) : null}
                <CategoryPicker
                  title="How often"
                  categories={OFTEN.map((o) => ({ id: o.id, name: o.label }))}
                  selectedId={often[c.id] ?? null}
                  onSelect={(id) => setOften((now) => ({ ...now, [c.id]: id }))}
                  emojiOf={() => "🔁"}
                />
                <Field
                  value={each[c.id] ?? ""}
                  onChange={(text) => setEach((now) => ({ ...now, [c.id]: text }))}
                  placeholder="About how much each time (RM)"
                  label={`${c.name}, about how much each time`}
                  numeric
                />
                {w ? (
                  <Text style={[type.small, { color: colors.text }]}>
                    {w.times} × {formatRM(w.amount)} = {formatRM(w.totalSen)} for this plan
                  </Text>
                ) : null}
              </Sticker>
            );
          })}
          <Text style={[type.small, { color: colors.muted }]}>
            Bills on a set date, like rent or a phone plan, go in Bills & subscriptions so they show
            in Still to come.
          </Text>
        </>
      ) : null}

      {step === 3 ? (
        <>
          {bubble(
            start.resumed && step === 3
              ? "Welcome back! Here's your draft. Change any amount; nothing is fixed."
              : "Here are the amounts. Change any of them; they're guides you can always change.",
          )}
          <AllocationFields
            categories={categories}
            amounts={amounts}
            onChange={(id, text) => {
              setAmounts((now) => ({ ...now, [id]: text }));
              setAskOver(false);
            }}
          />
          {totals ? (
            <SheetNote
              title={
                totals.shortfallSen > 0
                  ? `${formatRM(totals.shortfallSen)} over your budget`
                  : `${formatRM(unplanned)} left as room for surprises`
              }
              detail={
                unplanned < roomTip
                  ? `Tip: keep about ${formatRM(roomTip)} unplanned for sudden costs, like a Grab ride when it rains.`
                  : "Unplanned money is your cushion for sudden costs. Good to have!"
              }
            />
          ) : null}
        </>
      ) : null}

      {step === 4 && totals && budget ? (
        <>
          {bubble(
            "Last look. Spending more on something than planned is fine; your plan just adjusts.",
          )}
          <Sticker style={{ padding: space.md, gap: space.xs }}>
            <Row label="Budget" value={formatRM(budget)} strong />
            <Row label="Planned spending" value={formatRM(totals.plannedSpendingSen)} />
            <Row label="Set aside" value={formatRM(totals.setAsideSen)} />
            <Row
              label={totals.shortfallSen > 0 ? "Over budget" : "Room for surprises"}
              value={formatRM(totals.shortfallSen > 0 ? totals.shortfallSen : unplanned)}
              strong
            />
          </Sticker>
          <Sticker style={{ padding: space.md, gap: space.xs }}>
            {allocations.length === 0 ? (
              <Text style={[type.small, { color: colors.muted }]}>
                No amounts yet. That's okay: you can add them any time in Your plan.
              </Text>
            ) : (
              allocations.map((a) => {
                const c = categories.find((x) => x.id === a.categoryId);
                return (
                  <Row
                    key={a.categoryId}
                    label={`${c?.name ?? ""} ${c ? categoryEmoji(c.name) : ""}`.trim()}
                    value={formatRM(a.amountSen as Sen)}
                  />
                );
              })
            )}
          </Sticker>
          <Text style={[type.small, { color: colors.muted }]}>
            These are guides, not limits. Nothing stops you spending on something else, and you can
            change any amount in Your plan.
          </Text>
        </>
      ) : null}

      {problem ? (
        <Text accessibilityRole="alert" style={[type.strong, { color: colors.warning }]}>
          {problem}
        </Text>
      ) : null}

      {step === 4 && askOver && totals ? (
        <Sticker background={colors.cardTint} style={{ padding: space.md, gap: space.sm }}>
          <Text style={[type.strong, { color: colors.text }]}>
            Your plan is {formatRM(totals.shortfallSen)} over budget. Approve anyway?
          </Text>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Button label="Approve anyway" onPress={() => approve(true)} />
            <Button label="Change it" variant="secondary" onPress={() => setStep(3)} />
          </View>
        </Sticker>
      ) : step === 4 ? (
        <Button label="Approve my plan" onPress={() => approve(false)} />
      ) : (
        <Button label="Next" onPress={next} />
      )}
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        {step > 1 ? (
          <Button label="Back" variant="link" onPress={() => setStep((s) => (s - 1) as Step)} />
        ) : (
          <View />
        )}
        <Button label="Discard draft" variant="link" onPress={discard} />
      </View>
      <Text style={[type.small, { color: colors.muted, paddingBottom: space.lg }]}>
        Your progress is saved. Leave any time and continue later.
      </Text>
    </PageScreen>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", minHeight: 28 }}>
      <Text style={[strong ? type.strong : type.body, { color: colors.text, flex: 1 }]}>
        {label}
      </Text>
      <Text
        style={[
          strong ? type.strong : type.body,
          { color: colors.text, fontVariant: ["tabular-nums"] },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}
