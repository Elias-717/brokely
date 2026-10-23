import { evaluateAmount, formatRM, type LocalDate, type Sen } from "@brokely/domain";
import {
  deleteTransaction,
  markBillPaid,
  skipScheduledItem,
  unskipScheduledItem,
} from "@brokely/local-db";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Text } from "react-native";
import { db, repo } from "../../../src/db/client";
import { readBills, type BillItem } from "../../../src/lib/bills-model";
import { refusalText } from "../../../src/lib/messages";
import { dayMonth, occurredAtFor, today } from "../../../src/lib/today";
import { Button } from "../../../src/ui/components";
import { pickDate } from "../../../src/ui/date-picker";
import { Keypad, SumLine } from "../../../src/ui/keypad";
import { DateButton, SheetAmount, SheetNote, SheetShell, WhenFull } from "../../../src/ui/sheet";
import { BillExtras } from "../../../src/ui/sheet-extras";
import { type } from "../../../src/ui/theme";
import { useTheme } from "../../../src/ui/theme-context";
import { useUndo } from "../../../src/ui/undo";
import { savedBuzz } from "../../../src/ui/haptics";

/** Sen as text the keypad can keep editing: 1600 → "16.00". */
const asTyped = (amount: Sen) =>
  `${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, "0")}`;

export default function MarkPaidRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const day = useMemo(() => today(), []);
  // Read once: after Mark paid the item is no longer upcoming, and the sheet is already closing.
  const item = useMemo(() => readBills(db, day).items?.find((i) => i.id === id), [day, id]);
  if (!item || item.status !== "upcoming") return <Redirect href="/bills" />;
  return <MarkPaidSheet item={item} day={day} />;
}

/**
 * S6b Mark paid (FR-CAT-05, R-05, AC-12): one linked purchase with an amount the student can
 * change; the item leaves Still to come and is never counted twice. Undo deletes the payment,
 * which puts the item back.
 */
function MarkPaidSheet({ item, day }: { item: BillItem; day: LocalDate }) {
  const { colors } = useTheme();
  const showUndo = useUndo();
  const [amountText, setAmountText] = useState(asTyped(item.amountSen));
  const [date, setDate] = useState<LocalDate>(day);
  const [problem, setProblem] = useState<string | null>(null);
  const amount = evaluateAmount(amountText);

  const save = () => {
    if (amount === null || amount <= 0) return setProblem("Type an amount above zero.");
    const paid = markBillPaid(repo, {
      scheduledItemId: item.id,
      amountSen: amount,
      localDate: date,
      occurredAt: occurredAtFor(date, day),
    });
    if (!paid.ok) return setProblem(refusalText(paid.code, paid.message));
    savedBuzz();
    router.back();
    showUndo(`Paid ${item.name} · ${formatRM(amount)}`, () =>
      deleteTransaction(repo, paid.value.transactionId),
    );
  };

  // Skip lives here now, so the Bills list stays calm (D-77). Undo brings the date back.
  const skip = () => {
    const skipped = skipScheduledItem(repo, item.id);
    if (!skipped.ok) return setProblem(refusalText(skipped.code, skipped.message));
    router.back();
    showUndo(`Skipped ${item.name} · ${dayMonth(item.dueDate)}`, () =>
      unskipScheduledItem(repo, item.id),
    );
  };

  const changed = amount !== null && amount !== item.amountSen;

  return (
    <SheetShell
      title="Mark paid"
      subtitle={`${item.name} · due ${dayMonth(item.dueDate)}`}
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
            label={amount ? `Mark paid · ${formatRM(amount)}` : "Mark paid"}
            onPress={save}
            disabled={!amount}
          />
          <Button label="Skip this one" variant="link" onPress={skip} />
        </>
      }
    >
      <SumLine text={amountText} />
      <SheetAmount text={formatRM(amount ?? (0 as Sen))} />
      <SheetNote
        title={`Counts as spending in ${item.categoryName}`}
        detail={
          changed
            ? `The bill said ${formatRM(item.amountSen)}; your record keeps what you really paid. It leaves Still to come.`
            : "It leaves Still to come, so it's never counted twice."
        }
      />
      <DateButton
        label={date === day ? `Paid today, ${dayMonth(day)}` : `Paid ${dayMonth(date)}`}
        accessibilityLabel={`Paid on ${dayMonth(date)}. Change`}
        onPress={async () => {
          const chosen = await pickDate(date);
          if (chosen) setDate(chosen);
        }}
      />
      <WhenFull>
        <BillExtras billId={item.billId} dueDate={item.dueDate} />
      </WhenFull>
    </SheetShell>
  );
}
