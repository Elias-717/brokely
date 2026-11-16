import {
  addDays,
  budgetForLeftInPlan,
  evaluateAmount,
  formatRM,
  localDate,
  sen,
  type Sen,
} from "@brokely/domain";
import { getPlan, setPlanBudget } from "@brokely/local-db";
import { Redirect, router } from "expo-router";
import { useMemo, useState } from "react";
import { Text } from "react-native";
import { db, repo } from "../src/db/client";
import { useRead } from "../src/db/use-read";
import { readHome } from "../src/lib/home-model";
import { refusalText } from "../src/lib/messages";
import { dayMonth, today } from "../src/lib/today";
import { Button } from "../src/ui/components";
import { savedBuzz } from "../src/ui/haptics";
import { Keypad, SumLine } from "../src/ui/keypad";
import { SheetAmount, SheetNote, SheetShell } from "../src/ui/sheet";
import { type } from "../src/ui/theme";
import { useTheme } from "../src/ui/theme-context";
import { useUndo } from "../src/ui/undo";

/**
 * "How much do you really have left?" (D-138), opened by tapping Left in plan on Home. The
 * student types what they really have; the budget moves so left in plan (B − N, BR-12) matches.
 * A new revision with every category amount kept; Undo is one more revision (D-03). Spending
 * is never changed. A budget below the category amounts asks "anyway" first (FR-PLN-10, D-28).
 */
export default function FixLeftInPlan() {
  const { colors } = useTheme();
  const showUndo = useUndo();
  const day = useMemo(() => today(), []);
  const home = useRead((d) => readHome(d, day), [day]);
  const plan = useRead(
    (d) => (home.kind === "plan" ? (getPlan(d, home.cycleId) ?? null) : null),
    [home.kind === "plan" ? home.cycleId : null],
  );
  const [amountText, setAmountText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  // Below the category amounts, a second tap says "set it anyway" (D-28).
  const [anyway, setAnyway] = useState(false);
  if (home.kind !== "plan" || !plan) return <Redirect href="/" />;

  const wanted = evaluateAmount(amountText);
  const newBudget = wanted !== null ? budgetForLeftInPlan(home.spentSen, wanted) : null;
  const allocated = sen(plan.totals.plannedSpendingSen + plan.totals.setAsideSen);
  const short = newBudget !== null && newBudget < allocated;
  const diff = wanted !== null ? sen(wanted - home.leftInPlanSen) : null;
  const end = addDays(localDate(plan.cycle.endDateExclusive), -1);

  const save = () => {
    if (wanted === null || newBudget === null) return setProblem("Type what you have left.");
    if (short && !anyway) {
      setAnyway(true);
      return setProblem(
        `Your categories add up to ${formatRM(allocated)}, more than ${formatRM(newBudget)}. Tap again to set it anyway.`,
      );
    }
    const before = {
      cycleId: home.cycleId,
      budgetSen: home.budgetSen,
      shortfallAcknowledged: plan.revision.shortfallAcknowledged,
    };
    const saved = setPlanBudget(repo, {
      cycleId: home.cycleId,
      budgetSen: newBudget,
      shortfallAcknowledged: short || plan.revision.shortfallAcknowledged,
    });
    if (!saved.ok) return setProblem(refusalText(saved.code, saved.message));
    savedBuzz();
    router.back();
    showUndo(`Left in plan is now ${formatRM(wanted)}`, () => setPlanBudget(repo, before));
  };

  return (
    <SheetShell
      title="How much do you really have left?"
      subtitle={`${dayMonth(localDate(plan.cycle.startDate))}–${dayMonth(end)}`}
      footer={
        <>
          <Keypad
            value={amountText}
            onChange={(next) => {
              setAmountText(next);
              setProblem(null);
              setAnyway(false);
            }}
          />
          {problem ? (
            <Text accessibilityRole="alert" style={[type.strong, { color: colors.warning }]}>
              {problem}
            </Text>
          ) : null}
          <Button
            label={
              wanted === null
                ? "Save"
                : anyway
                  ? `Set it anyway · ${formatRM(wanted)}`
                  : `Set left in plan to ${formatRM(wanted)}`
            }
            onPress={save}
            disabled={wanted === null}
          />
        </>
      }
    >
      <Text style={[type.small, { color: colors.muted }]}>
        Brokely says {formatRM(home.leftInPlanSen)}.
      </Text>
      <SumLine text={amountText} />
      <SheetAmount text={formatRM(wanted ?? (0 as Sen))} />
      {newBudget !== null && diff !== null ? (
        <SheetNote
          title={`Budget ${formatRM(home.budgetSen)} → ${formatRM(newBudget)}`}
          detail={`${
            diff === 0
              ? "Same as Brokely thought."
              : diff < 0
                ? `${formatRM(sen(-diff))} less than Brokely thought.`
                : `${formatRM(diff)} more than Brokely thought.`
          } Spent so far stays ${formatRM(home.spentSen)}.`}
        />
      ) : (
        <SheetNote
          title="Type what you really have for this plan"
          detail="Cash, TNG and bank together. Your spending records stay as they are."
        />
      )}
    </SheetShell>
  );
}
