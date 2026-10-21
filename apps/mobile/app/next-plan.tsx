import {
  addDays,
  cycleFromInclusive,
  formatRM,
  lengthInDays,
  localDate,
  parseAmount,
  planTotals,
  type LocalDate,
} from "@brokely/domain";
import {
  approveDraftCycle,
  discardDraftCycle,
  getDraftCycle,
  listCategories,
} from "@brokely/local-db";
import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { repo } from "../src/db/client";
import { useRead } from "../src/db/use-read";
import { refusalText } from "../src/lib/messages";
import { planHistory } from "../src/lib/plan-history";
import { dayMonth, today } from "../src/lib/today";
import { AllocationFields, asTyped, readAllocations } from "../src/ui/allocation-fields";
import { Button, Empty, PageScreen, Sticker } from "../src/ui/components";
import { pickDate } from "../src/ui/date-picker";
import { DateButton, SheetNote } from "../src/ui/sheet";
import { Field, Labelled } from "../src/ui/sheet-parts";
import { space, type } from "../src/ui/theme";
import { useTheme } from "../src/ui/theme-context";

/**
 * The next plan, drafted from the last one (FR-PLN-17, AC-48, D-18, D-20): same length starting
 * the day after, same budget and amounts. Check the dates and numbers, then approve; or
 * discard it. Nothing counts until it is approved.
 */
export default function NextPlanScreen() {
  const draft = useRead(getDraftCycle);
  const categories = useRead((db) => listCategories(db));
  if (!draft) {
    return (
      <PageScreen title="Next plan">
        <Empty>There's no next plan waiting. Start one from the last plan's summary.</Empty>
      </PageScreen>
    );
  }
  return <DraftForm key={draft.cycle.id} draft={draft} categories={categories} />;
}

function DraftForm({
  draft,
  categories,
}: {
  draft: NonNullable<ReturnType<typeof getDraftCycle>>;
  categories: ReturnType<typeof listCategories>;
}) {
  const { colors } = useTheme();
  const drafted = new Map(draft.allocations.map((a) => [a.categoryId, a.amountSen]));
  const [start, setStart] = useState<LocalDate>(localDate(draft.cycle.startDate));
  const [end, setEnd] = useState<LocalDate>(addDays(localDate(draft.cycle.endDateExclusive), -1));
  const [budgetText, setBudgetText] = useState(asTyped(draft.revision.budgetSen));
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(categories.map((c) => [c.id, asTyped(drafted.get(c.id) ?? 0)])),
  );
  const [askOver, setAskOver] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const budget = parseAmount(budgetText);
  const { allocations, bad } = readAllocations(categories, amounts);
  const totals = budget !== null ? planTotals(budget, allocations) : null;
  const days = end >= start ? lengthInDays(cycleFromInclusive(start, end)) : 0;
  // The student's own spending last plan, as hints under each amount (FR-PLN-13, D-46 part 2).
  const history = useRead((db) => planHistory(db, today(), days), [days]);

  const approve = (acknowledged: boolean) => {
    if (budget === null || budget <= 0) return setProblem("Type a budget above zero.");
    if (bad) return setProblem(`Check the amount for ${bad.name}.`);
    if (end < start) return setProblem("The end date is before the start date.");
    if (totals && totals.shortfallSen > 0 && !acknowledged) return setAskOver(true);
    const approved = approveDraftCycle(repo, {
      cycleId: draft.cycle.id,
      startDate: start,
      endDateInclusive: end,
      budgetSen: budget,
      allocations: allocations.map((a) => ({ categoryId: a.categoryId, amountSen: a.amountSen })),
      shortfallAcknowledged: acknowledged,
    });
    if (!approved.ok) return setProblem(refusalText(approved.code, approved.message));
    router.replace("/");
  };

  const discard = () => {
    discardDraftCycle(repo, draft.cycle.id);
    router.back();
  };

  return (
    <PageScreen title="Next plan" keyboardSafe>
      <Text style={[type.body, { color: colors.muted, marginTop: -space.sm }]}>
        Copied from your last plan. Change anything, then approve.
      </Text>

      <View style={{ flexDirection: "row", gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <Labelled label="From">
            <DateButton
              label={dayMonth(start)}
              accessibilityLabel={`From ${dayMonth(start)}. Change`}
              onPress={async () => {
                const chosen = await pickDate(start);
                if (chosen) setStart(chosen);
              }}
            />
          </Labelled>
        </View>
        <View style={{ flex: 1 }}>
          <Labelled label="To (included)">
            <DateButton
              label={dayMonth(end)}
              accessibilityLabel={`To ${dayMonth(end)}. Change`}
              onPress={async () => {
                const chosen = await pickDate(end);
                if (chosen) setEnd(chosen);
              }}
            />
          </Labelled>
        </View>
      </View>

      <Labelled label={`Budget for these ${days} days (RM)`}>
        <Field
          value={budgetText}
          onChange={setBudgetText}
          placeholder="0.00"
          label="Budget"
          numeric
        />
      </Labelled>

      {history ? (
        <SheetNote
          title={`${history.title}: ${history.basis}`}
          detail={`Under each amount: what you spent, and that pace over these ${days} days. Days you didn't log count as nothing spent. Suggestions only; the amounts are yours.`}
        />
      ) : null}
      <AllocationFields
        categories={categories}
        amounts={amounts}
        hints={history?.hints}
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
              : `${formatRM(totals.unallocatedSen)} not planned yet`
          }
          detail={`Spending ${formatRM(totals.plannedSpendingSen)} · set aside ${formatRM(totals.setAsideSen)}`}
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
            <Button label="Approve anyway" onPress={() => approve(true)} />
            <Button label="Change it" variant="secondary" onPress={() => setAskOver(false)} />
          </View>
        </Sticker>
      ) : (
        <Button label="Approve and start" onPress={() => approve(false)} />
      )}
      <Button label="Discard this draft" variant="link" onPress={discard} />
    </PageScreen>
  );
}
