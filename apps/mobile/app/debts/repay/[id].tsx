import { formatRM, parseAmount, type LocalDate, type Sen } from "@brokely/domain";
import { deleteTransaction, recordRepayment } from "@brokely/local-db";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Text } from "react-native";
import { db, repo } from "../../../src/db/client";
import { readDebt } from "../../../src/lib/debts-model";
import { refusalText } from "../../../src/lib/messages";
import { dayMonth, occurredAtFor, today } from "../../../src/lib/today";
import { Button } from "../../../src/ui/components";
import { pickDate } from "../../../src/ui/date-picker";
import { Keypad } from "../../../src/ui/keypad";
import { DateButton, SheetAmount, SheetNote, SheetShell } from "../../../src/ui/sheet";
import { type } from "../../../src/ui/theme";
import { useTheme } from "../../../src/ui/theme-context";
import { useUndo } from "../../../src/ui/undo";

const asTyped = (amount: Sen) =>
  `${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, "0")}`;

/**
 * A repayment, part or all (FR-DEBT-02, AC-08). Never spending and never money in for the
 * plan (FR-DEBT-06); it only lowers what is outstanding. Undo deletes it.
 */
export default function RepaySheet() {
  const { colors } = useTheme();
  const showUndo = useUndo();
  // `amount` comes from quick add's "Paying someone back?" (D-104), as typed there.
  const { id, amount: typed } = useLocalSearchParams<{ id: string; amount?: string }>();
  const day = useMemo(() => today(), []);
  // Read once: a full repayment closes the debt while this sheet is closing.
  const debt = useMemo(() => readDebt(db, id), [id]);
  const [amountText, setAmountText] = useState(
    typed ? typed : debt ? asTyped(debt.outstandingSen) : "",
  );
  const [date, setDate] = useState<LocalDate>(day);
  const [problem, setProblem] = useState<string | null>(null);
  if (!debt || debt.status !== "open") return <Redirect href="/debts" />;

  const toMe = debt.direction === "owed_to_me";
  const amount = parseAmount(amountText);

  const save = () => {
    if (amount === null || amount <= 0) return setProblem("Type an amount above zero.");
    if (amount > debt.outstandingSen) {
      return setProblem(`Only ${formatRM(debt.outstandingSen)} is still owed.`);
    }
    const saved = recordRepayment(repo, {
      debtId: debt.id,
      amountSen: amount,
      localDate: date,
      occurredAt: occurredAtFor(date, day),
    });
    if (!saved.ok) return setProblem(refusalText(saved.code, saved.message));
    router.back();
    showUndo(
      toMe ? `${debt.name} paid back ${formatRM(amount)}` : `Paid ${debt.name} ${formatRM(amount)}`,
      () => deleteTransaction(repo, saved.value.id),
    );
  };

  const left =
    amount !== null && amount <= debt.outstandingSen ? debt.outstandingSen - amount : null;

  return (
    <SheetShell
      title={toMe ? "Paid back to you" : "You paid back"}
      subtitle={`${debt.name} · ${formatRM(debt.outstandingSen)} owed`}
      footer={
        <>
          <Keypad
            value={amountText}
            onChange={(next) => {
              setAmountText(next);
              setProblem(null);
            }}
          />
          {problem ? (
            <Text accessibilityRole="alert" style={[type.strong, { color: colors.warning }]}>
              {problem}
            </Text>
          ) : null}
          <Button
            label={amount ? `Save · ${formatRM(amount)}` : "Save"}
            onPress={save}
            disabled={!amount}
          />
        </>
      }
    >
      <SheetAmount text={formatRM(amount ?? (0 as Sen))} />
      <SheetNote
        title={
          left === 0
            ? "That settles it 🎉"
            : left !== null
              ? `${formatRM(left as Sen)} still owed after this`
              : "Part or all of it"
        }
        detail="Paying back isn't spending, so your plan doesn't change."
      />
      <DateButton
        label={date === day ? `Today, ${dayMonth(day)}` : dayMonth(date)}
        accessibilityLabel={`Date: ${dayMonth(date)}. Change`}
        onPress={async () => {
          const chosen = await pickDate(date);
          if (chosen) setDate(chosen);
        }}
      />
    </SheetShell>
  );
}
