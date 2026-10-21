import {
  addDays,
  checkGuidedBudget,
  cycleFromInclusive,
  divideSen,
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
  roundHalfEven,
  sen,
  type CategoryKind,
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
import { Pressable, Text, TextInput, View } from "react-native";
import { db, repo } from "../src/db/client";
import { useRead } from "../src/db/use-read";
import { essentialMeta } from "../src/lib/essentials-meta";
import { refusalText } from "../src/lib/messages";
import { dayMonth, today } from "../src/lib/today";
import {
  AmountFieldGroups,
  asTyped,
  GroupLabel,
  PLAN_GROUPS,
  readAllocations,
} from "../src/ui/allocation-fields";
import { BrokelyAvatar } from "../src/ui/chat";
import { Button, PageScreen, Sticker } from "../src/ui/components";
import { pickDate } from "../src/ui/date-picker";
import { TypeText } from "../src/ui/motion";
import { PlanSplit } from "../src/ui/plan-split";
import { Chip, Field } from "../src/ui/sheet-parts";
import { fonts, MIN_TOUCH, radius, space, type } from "../src/ui/theme";
import { useTheme } from "../src/ui/theme-context";

type Category = ReturnType<typeof listCategories>[number];

/** How often an essential happens, as a guess (D-63); `short` is the chip and the done line. */
const OFTEN: { id: string; short: string; frequency: Frequency }[] = [
  { id: "day", short: "Every day", frequency: { times: 1, per: "day" } },
  { id: "most", short: "Most days", frequency: { times: 5, per: "week" } },
  { id: "few", short: "3× a week", frequency: { times: 3, per: "week" } },
  { id: "week", short: "Weekly", frequency: { times: 1, per: "week" } },
  { id: "twice", short: "2× a month", frequency: { times: 2, per: "month" } },
  { id: "month", short: "Monthly", frequency: { times: 1, per: "month" } },
];

/** The likeliest choice per essential; laundry is washes, about twice a month (D-36). */
function defaultOften(name: string): string {
  if (name === "Laundry") return "twice";
  const likely = essentialMeta(name).likely;
  return likely === "day" ? "day" : likely === "week" ? "week" : "month";
}

type Step = 1 | 2 | 3 | 4;
const STEPS = ["Dates", "Essentials", "Amounts", "Review"] as const;

/**
 * S2a–S2d Guided setup (FR-PLN-01…12, FR-PLN-16, AC-04, AC-47, D-20, D-63, D-82): dates and
 * budget, essentials (how often, how much) one at a time, the amounts with a live total, then
 * review and approve. A step bar on top, Back / Next fixed at the bottom above the keyboard.
 * Every step saves a draft, so leaving and coming back continues it. The amounts are guides,
 * never limits: sudden costs are normal and nothing is ever blocked. Bills with a set date are
 * added in Bills & subscriptions, so none is created twice.
 */
export default function GuidedSetup() {
  const { colors, scheme } = useTheme();
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
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(essentials[0]?.id ?? null);
  const [showAll, setShowAll] = useState(false);
  const [askOver, setAskOver] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  /** Over the plan's budget: refuse, offer to keep it or to change the plan first (D-66). */
  const [overPlan, setOverPlan] = useState(false);
  // The current plan's budget, read live so a change made in Your plan applies on return.
  const planBudget = useRead(
    (db) =>
      start.mode === "edit" ? sen(getPlan(db, start.cycleId)?.revision.budgetSen ?? 0) : null,
    [start.mode, start.cycleId],
  );

  /** False (and shows the refusal) when the budget is above the plan's (D-66). */
  const withinPlan = (value: Sen | null): boolean => {
    if (planBudget === null || value === null) return true;
    const ok = checkGuidedBudget(value, planBudget).ok;
    setOverPlan(!ok);
    return ok;
  };

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

  /** What a closed essential row says: its working, an amount from a draft, or Skipped. */
  const essentialLine = (c: Category): string | null => {
    if (skipped.has(c.id)) return "Skipped";
    const w = working(c.id);
    if (w) {
      const label = OFTEN.find((o) => o.id === often[c.id])?.short.toLowerCase();
      return `${formatRM(w.totalSen)} · ${label}`;
    }
    const typed = parseAmount(amounts[c.id] ?? "");
    return typed ? formatRM(typed) : null;
  };
  const doneCount = essentials.filter((c) => essentialLine(c) !== null).length;

  /** Opens the next essential without an answer, or closes the list when all are done. */
  const openNext = (after: string) => {
    const from = essentials.findIndex((c) => c.id === after);
    const rest = [...essentials.slice(from + 1), ...essentials.slice(0, from)];
    setOpenId(rest.find((c) => essentialLine(c) === null && c.id !== after)?.id ?? null);
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

  const goTo = (to: Step) => {
    setProblem(null);
    setAskOver(false);
    setStep(to);
  };

  const next = () => {
    if (step === 1) {
      if (endDate < startDate) return setProblem("The end date is before the start date.");
      if (!withinPlan(budget)) return;
      if (start.mode === "new" && datesClash(db, startDate, endDate)) {
        return setProblem("You already have a plan for some of these dates. Pick later dates.");
      }
      if (saveDraft()) goTo(2);
    } else if (step === 2) {
      // Copy each essential's working into its amount; skipped ones are cleared, untouched
      // ones keep what they had.
      setAmounts((now) => {
        const copy = { ...now };
        for (const c of essentials) {
          const w = working(c.id);
          if (skipped.has(c.id)) copy[c.id] = "";
          else if (w) copy[c.id] = asTyped(w.totalSen);
        }
        return copy;
      });
      goTo(3);
    } else if (step === 3) {
      if (bad) return setProblem(`Check the amount for ${bad.name}.`);
      if (saveDraft()) goTo(4);
    }
  };

  const approve = (acknowledged: boolean) => {
    if (budget === null || budget <= 0) return setProblem("Type a budget above zero.");
    if (!withinPlan(budget)) return goTo(1);
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

  const noneTyped = allocations.length === 0;
  const unplanned = totals ? totals.unallocatedSen : sen(0);
  const over = totals !== null && totals.shortfallSen > 0;
  const roomTip = budget ? sen(Math.round(budget / 10)) : sen(0);
  const perDay = budget && planDays > 0 ? roundHalfEven(divideSen(budget, planDays)) : null;

  const words: Record<Step, string> = {
    1:
      start.mode === "edit"
        ? "Let's go through your plan together. Your dates stay; check the budget."
        : "Let's plan it together. First, the dates and how much you have.",
    2: "Now your essentials. A rough guess is fine: these are guides, not limits.",
    3: start.resumed
      ? "Welcome back! Here's your draft. Change any amount; nothing is fixed."
      : "Here are the amounts. Change any of them; they're guides you can always change.",
    4: "Last look. Spending more on something than planned is fine; your plan just adjusts.",
  };

  const live =
    step === 3 ? (
      <Sticker
        background={over ? colors.warningCard : colors.cardTint}
        style={{ paddingVertical: 12, paddingHorizontal: space.md, gap: 2 }}
      >
        <Text accessibilityLiveRegion="polite" style={[type.heading, { color: colors.text }]}>
          {totals === null
            ? "Type your budget"
            : over
              ? `${formatRM(totals.shortfallSen)} over budget`
              : unplanned === 0
                ? "Every ringgit has a plan"
                : `${formatRM(unplanned)} left for surprises`}
        </Text>
        {totals !== null && budget !== null ? (
          <Text style={[type.small, { color: colors.muted }]}>
            {over || unplanned < roomTip
              ? `Tip: keep about ${formatRM(roomTip)} unplanned for sudden costs. `
              : "Good cushion. "}
            Planned {formatRM(sen(totals.plannedSpendingSen + totals.setAsideSen))} of{" "}
            {formatRM(budget)}
          </Text>
        ) : null}
      </Sticker>
    ) : null;

  const footer =
    step === 4 && askOver && totals ? (
      <Sticker background={colors.warningCard} style={{ padding: space.md, gap: space.sm }}>
        <Text style={[type.strong, { color: colors.text }]}>
          Your plan is {formatRM(totals.shortfallSen)} over budget. Approve anyway?
        </Text>
        <Button label="Approve anyway" onPress={() => approve(true)} />
        <Button label="Change amounts" variant="secondary" onPress={() => goTo(3)} />
      </Sticker>
    ) : (
      <View style={{ gap: space.xs }}>
        {problem ? (
          <Text accessibilityRole="alert" style={[type.strong, { color: colors.warning }]}>
            {problem}
          </Text>
        ) : null}
        <View style={{ flexDirection: "row", gap: space.sm }}>
          {step > 1 ? (
            <View style={{ flex: 1 }}>
              <Button label="Back" variant="secondary" onPress={() => goTo((step - 1) as Step)} />
            </View>
          ) : null}
          <View style={{ flex: 2 }}>
            {step === 4 ? (
              <Button label="Approve my plan" onPress={() => approve(false)} />
            ) : (
              <Button label={`Next: ${STEPS[step].toLowerCase()}`} onPress={next} />
            )}
          </View>
        </View>
        {step > 1 || start.resumed ? (
          <Text style={[type.small, { color: colors.muted, textAlign: "center" }]}>
            Saved · continue any time
          </Text>
        ) : null}
      </View>
    );

  return (
    <PageScreen
      title="Plan step by step"
      keyboardSafe
      action={<Button label="Discard" variant="link" onPress={discard} />}
      pinned={
        <View style={{ gap: space.sm }}>
          <StepBar step={step} onPick={goTo} />
          {live}
        </View>
      }
      footer={footer}
    >
      <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-start" }}>
        <BrokelyAvatar size={40} />
        <View style={{ flex: 1 }}>
          <Sticker
            background={colors.cardTint}
            style={{ paddingHorizontal: space.md, paddingVertical: space.sm }}
          >
            <TypeText
              key={step}
              text={words[step]}
              perCharMs={18}
              style={[type.body, { color: colors.text }]}
            />
          </Sticker>
        </View>
      </View>

      {step === 1 ? (
        <>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <DateTile
              label="From"
              date={startDate}
              onPick={start.mode === "new" ? setStartDate : undefined}
            />
            <DateTile
              label="To (included)"
              date={endDate}
              onPick={start.mode === "new" ? setEndDate : undefined}
            />
          </View>
          <Sticker style={{ padding: space.md, gap: space.sm, alignItems: "center" }}>
            <Text style={[type.small, { color: colors.muted }]}>
              Budget for these {planDays} {planDays === 1 ? "day" : "days"}
            </Text>
            <View
              style={{
                alignSelf: "stretch",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: space.sm,
                minHeight: 64,
                paddingHorizontal: space.md,
                borderWidth: 2,
                borderColor: colors.outline,
                borderRadius: radius.button,
                backgroundColor: colors.background,
              }}
            >
              <Text style={{ fontFamily: fonts.heading, fontSize: 22, color: colors.muted }}>
                RM
              </Text>
              <TextInput
                value={budgetText}
                onChangeText={(text) => {
                  setBudgetText(text);
                  setOverPlan(false);
                }}
                placeholder="0.00"
                placeholderTextColor={colors.muted}
                accessibilityLabel={`Budget for these ${planDays} days, in ringgit`}
                keyboardType="decimal-pad"
                maxLength={12}
                style={{
                  minWidth: 120,
                  paddingVertical: 4,
                  fontFamily: fonts.heading,
                  fontSize: 34,
                  color: colors.text,
                  fontVariant: ["tabular-nums"],
                }}
              />
            </View>
            {perDay ? (
              <Text
                accessibilityLiveRegion="polite"
                style={[type.strong, { color: colors.primary }]}
              >
                About {formatRM(perDay)} a day
              </Text>
            ) : null}
            {planBudget !== null ? (
              <Text style={[type.small, { color: colors.muted, textAlign: "center" }]}>
                Your plan has {formatRM(planBudget)}. You can plan up to that here.
              </Text>
            ) : null}
          </Sticker>
          {overPlan && planBudget !== null && budget !== null ? (
            <Sticker background={colors.warningCard} style={{ padding: space.md, gap: space.sm }}>
              <Text style={[type.strong, { color: colors.text }]}>
                {formatRM(budget)} is more than the {formatRM(planBudget)} in your plan.
              </Text>
              <Text style={[type.small, { color: colors.muted }]}>
                Planning more than you have isn't possible here. Got more money? Change your plan's
                budget first, then come back.
              </Text>
              <Button
                label={`Use ${formatRM(planBudget)}`}
                onPress={() => {
                  setBudgetText(asTyped(planBudget));
                  setOverPlan(false);
                }}
              />
              <Button
                label="Change my plan first"
                variant="secondary"
                onPress={() => router.push("/plan")}
              />
            </Sticker>
          ) : null}
        </>
      ) : null}

      {step === 2 ? (
        <>
          <GroupLabel>{`${doneCount} of ${essentials.length} done`}</GroupLabel>
          <Sticker style={{ padding: 0 }}>
            {essentials.map((c, i) => {
              const line = essentialLine(c);
              if (openId !== c.id) {
                return (
                  <Pressable
                    key={c.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${c.name}${line ? `, ${line}` : ", not answered yet"}. Open`}
                    onPress={() => setOpenId(c.id)}
                    style={({ pressed }) => ({
                      minHeight: MIN_TOUCH,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: space.sm,
                      paddingVertical: 12,
                      paddingHorizontal: space.md,
                      borderTopWidth: i === 0 ? 0 : 2,
                      borderTopColor: colors.background,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Mark done={line !== null && line !== "Skipped"} />
                    <Text
                      style={{
                        flex: 1,
                        fontFamily: fonts.heavy,
                        fontSize: 15,
                        color: line === "Skipped" ? colors.muted : colors.text,
                      }}
                    >
                      {c.name}
                    </Text>
                    {line ? (
                      <Text style={[type.small, { color: colors.muted }]}>{line}</Text>
                    ) : (
                      <Text
                        style={{ fontFamily: fonts.heading, fontSize: 20, color: colors.muted }}
                      >
                        ›
                      </Text>
                    )}
                  </Pressable>
                );
              }
              const tip = budget ? healthySuggestion(c.name, budget, planDays) : null;
              const w = working(c.id);
              return (
                <View
                  key={c.id}
                  style={{
                    padding: space.md,
                    gap: space.sm,
                    borderTopWidth: i === 0 ? 0 : 2,
                    borderTopColor: colors.background,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text
                      accessibilityRole="header"
                      style={[type.heading, { flex: 1, color: colors.text }]}
                    >
                      {c.name}
                    </Text>
                    <Button
                      label="Skip"
                      variant="link"
                      onPress={() => {
                        setSkipped((now) => new Set(now).add(c.id));
                        setEach((now) => ({ ...now, [c.id]: "" }));
                        openNext(c.id);
                      }}
                    />
                  </View>
                  {tip ? (
                    <Text style={[type.small, { color: colors.muted }]}>
                      A healthy plan: about {formatRM(tip.totalSen)} ({tip.percent}%)
                    </Text>
                  ) : null}
                  <View
                    accessibilityLabel="How often"
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}
                  >
                    {OFTEN.map((o) => (
                      <Chip
                        key={o.id}
                        label={o.short}
                        selected={often[c.id] === o.id}
                        onPress={() => setOften((now) => ({ ...now, [c.id]: o.id }))}
                      />
                    ))}
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                    <Text style={[type.strong, { flex: 1, color: colors.text }]}>
                      About how much each time
                    </Text>
                    <View style={{ width: 110 }}>
                      <Field
                        value={each[c.id] ?? ""}
                        onChange={(text) => {
                          setEach((now) => ({ ...now, [c.id]: text }));
                          if (skipped.has(c.id)) {
                            setSkipped((now) => {
                              const copy = new Set(now);
                              copy.delete(c.id);
                              return copy;
                            });
                          }
                        }}
                        placeholder="0.00"
                        label={`${c.name}, about how much each time`}
                        numeric
                      />
                    </View>
                  </View>
                  {w ? (
                    <Text
                      accessibilityLiveRegion="polite"
                      style={[type.strong, { color: colors.primary, fontSize: 14 }]}
                    >
                      {w.times} × {formatRM(w.amount)} = {formatRM(w.totalSen)} for this plan
                    </Text>
                  ) : null}
                  {w ? (
                    <Button label="Done" variant="secondary" onPress={() => openNext(c.id)} />
                  ) : null}
                </View>
              );
            })}
          </Sticker>
          <Text style={[type.small, { color: colors.muted }]}>
            Bills on a set date, like rent or a phone plan, go in Bills & subscriptions so they show
            in Still to come.
          </Text>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <AmountFieldGroups
            categories={categories.filter(
              (c) => showAll || noneTyped || (amounts[c.id] ?? "").trim() !== "",
            )}
            amounts={amounts}
            onChange={(id, text) => {
              setAmounts((now) => ({ ...now, [id]: text }));
              setAskOver(false);
            }}
          />
          <View style={{ alignItems: "flex-start" }}>
            <Button
              label={showAll ? "Show fewer" : "Show all categories"}
              variant="link"
              onPress={() => setShowAll((s) => !s)}
            />
          </View>
        </>
      ) : null}

      {step === 4 && totals && budget ? (
        <>
          <ReviewHero
            allocations={allocations}
            budget={budget}
            startDate={startDate}
            endDate={endDate}
            planDays={planDays}
            heroBorder={scheme === "dark" ? 1 : 2}
          />
          {allocations.length === 0 ? (
            <Text style={[type.small, { color: colors.muted }]}>
              No amounts yet. That's okay: you can add them any time in Your plan.
            </Text>
          ) : (
            PLAN_GROUPS.map((g) => {
              const rows = allocations.filter((a) =>
                (g.kinds as readonly CategoryKind[]).includes(a.kind),
              );
              if (rows.length === 0) return null;
              return (
                <View key={g.title} style={{ gap: space.xs }}>
                  <GroupLabel>{g.title}</GroupLabel>
                  <Sticker style={{ padding: 0 }}>
                    {rows.map((a, i) => {
                      const c = categories.find((x) => x.id === a.categoryId);
                      return (
                        <View
                          key={a.categoryId}
                          style={{
                            minHeight: MIN_TOUCH,
                            flexDirection: "row",
                            alignItems: "center",
                            paddingVertical: 11,
                            paddingHorizontal: space.md,
                            borderTopWidth: i === 0 ? 0 : 2,
                            borderTopColor: colors.background,
                          }}
                        >
                          <Text style={[type.strong, { flex: 1, color: colors.text }]}>
                            {c?.kind === "set_aside" ? `${c.name} · set aside` : (c?.name ?? "")}
                          </Text>
                          <Text
                            style={{
                              fontFamily: fonts.heavy,
                              fontSize: 16,
                              color: colors.text,
                              fontVariant: ["tabular-nums"],
                            }}
                          >
                            {formatRM(a.amountSen as Sen)}
                          </Text>
                        </View>
                      );
                    })}
                  </Sticker>
                </View>
              );
            })
          )}
          <Text style={[type.small, { color: colors.muted }]}>
            These are guides, not limits. Nothing stops you spending on something else, and you can
            change any amount in Your plan.
          </Text>
        </>
      ) : null}
    </PageScreen>
  );
}

/** The four steps as segments; a finished step gets a ✓ and can be tapped to go back. */
function StepBar({ step, onPick }: { step: Step; onPick: (to: Step) => void }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityLabel={`Step ${step} of 4, ${STEPS[step - 1]}`}
      style={{ flexDirection: "row", gap: 6 }}
    >
      {STEPS.map((label, i) => {
        const n = (i + 1) as Step;
        const done = n < step;
        return (
          <Pressable
            key={label}
            disabled={!done}
            accessibilityRole="button"
            accessibilityLabel={done ? `Back to ${label}` : label}
            accessibilityState={{ disabled: !done, selected: n === step }}
            onPress={() => onPick(n)}
            style={{ flex: 1, gap: 4, paddingVertical: 4 }}
          >
            <View
              style={{
                height: 8,
                borderRadius: 4,
                borderWidth: 1.5,
                borderColor: colors.outline,
                backgroundColor: n <= step ? colors.primary : colors.card,
              }}
            />
            <Text
              numberOfLines={1}
              style={{
                fontFamily: n === step ? fonts.heavy : fonts.bold,
                fontSize: 12,
                color: n <= step ? colors.text : colors.muted,
              }}
            >
              {done ? `✓ ${label}` : label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function DateTile({
  label,
  date,
  onPick,
}: {
  label: string;
  date: LocalDate;
  /** Missing while editing a plan: its dates stay. */
  onPick?: (date: LocalDate) => void;
}) {
  const { colors } = useTheme();
  const tile = (
    <Sticker rounded={14} offset={2} style={{ padding: 12, gap: 2 }}>
      <Text style={[type.small, { color: colors.muted }]}>{label}</Text>
      <Text style={{ fontFamily: fonts.heading, fontSize: 22, color: colors.text }}>
        {dayMonth(date)}
      </Text>
    </Sticker>
  );
  return (
    <View style={{ flex: 1 }}>
      {onPick ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} ${dayMonth(date)}. Change`}
          onPress={async () => {
            const chosen = await pickDate(date);
            if (chosen) onPick(chosen);
          }}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          {tile}
        </Pressable>
      ) : (
        <View accessible accessibilityLabel={`${label} ${dayMonth(date)}`}>
          {tile}
        </View>
      )}
    </View>
  );
}

/** A filled tick for an answered essential, an empty circle otherwise. */
function Mark({ done }: { done: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: done ? 0 : 2,
        borderColor: colors.outline,
        backgroundColor: done ? colors.primary : colors.card,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {done ? (
        <Text style={{ fontFamily: fonts.heavy, fontSize: 13, color: colors.onPrimary }}>✓</Text>
      ) : null}
    </View>
  );
}

/** Step 4's summary: the same green card and split bar as Your plan (D-81). */
function ReviewHero({
  allocations,
  budget,
  startDate,
  endDate,
  planDays,
  heroBorder,
}: {
  allocations: readonly { categoryId: string; kind: CategoryKind; amountSen: number }[];
  budget: Sen;
  startDate: LocalDate;
  endDate: LocalDate;
  planDays: number;
  heroBorder: number;
}) {
  const { colors } = useTheme();
  const byKind = (kind: CategoryKind) =>
    allocations.filter((a) => a.kind === kind).reduce((sum, a) => sum + a.amountSen, 0);
  const planned = allocations.reduce((sum, a) => sum + a.amountSen, 0);
  const left = budget - planned;
  const parts = [
    { label: "Essentials", value: byKind("essential"), color: colors.card },
    { label: "Optional", value: byKind("optional"), color: colors.heroRing },
    { label: "Set aside", value: byKind("set_aside"), color: colors.destructive },
    { label: "Room for surprises", value: Math.max(0, left), color: colors.heroTile },
  ];
  return (
    <View
      accessible
      accessibilityLabel={`Budget ${formatRM(budget)} for ${dayMonth(startDate)} to ${dayMonth(endDate)}. ${parts
        .filter((p) => p.value > 0)
        .map((p) => `${p.label} ${formatRM(sen(p.value))}`)
        .join(", ")}${left < 0 ? `. ${formatRM(sen(-left))} over budget` : ""}`}
      style={{
        backgroundColor: colors.hero,
        borderRadius: 24,
        borderWidth: heroBorder,
        borderColor: colors.heroOutline,
        padding: 18,
        gap: space.xs,
      }}
    >
      <Text style={{ fontFamily: fonts.heavy, fontSize: 14, color: colors.onHero }}>
        {dayMonth(startDate)} – {dayMonth(endDate)} · {planDays} {planDays === 1 ? "day" : "days"}
      </Text>
      <Text style={[type.amount, { color: colors.onHero, fontSize: 40, lineHeight: 44 }]}>
        {formatRM(budget)}
      </Text>
      <PlanSplit parts={parts} budgetSen={budget} overSen={Math.max(0, -left)} />
    </View>
  );
}
