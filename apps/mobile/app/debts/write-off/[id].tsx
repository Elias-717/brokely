import { formatRM } from "@brokely/domain";
import { deleteTransaction, writeOffDebt } from "@brokely/local-db";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { db, repo } from "../../../src/db/client";
import { readDebt } from "../../../src/lib/debts-model";
import { refusalText } from "../../../src/lib/messages";
import { occurredAtFor, today } from "../../../src/lib/today";
import { Button } from "../../../src/ui/components";
import { SheetAmount, SheetNote, SheetShell } from "../../../src/ui/sheet";
import { Chip } from "../../../src/ui/sheet-parts";
import { space, type } from "../../../src/ui/theme";
import { useTheme } from "../../../src/ui/theme-context";
import { useUndo } from "../../../src/ui/undo";

/**
 * S7b Write off (FR-DEBT-04, R-07, BR-23, AC-11). Money a friend owed the student is gone, so
 * it becomes spending in the category they pick; a debt the student owed just closes.
 * "Keep it open" closes the sheet without changing anything. Undo deletes the write-off.
 */
export default function WriteOffSheet() {
  const { colors } = useTheme();
  const showUndo = useUndo();
  const { id } = useLocalSearchParams<{ id: string }>();
  const day = useMemo(() => today(), []);
  const debt = useMemo(() => readDebt(db, id), [id]);
  const [categoryId, setCategoryId] = useState<string | null>(
    debt?.categories.find((c) => c.name === "Other")?.id ?? null,
  );
  const [problem, setProblem] = useState<string | null>(null);
  if (!debt || debt.status !== "open") return <Redirect href="/debts" />;

  const toMe = debt.direction === "owed_to_me";
  const category = debt.categories.find((c) => c.id === categoryId);

  const save = () => {
    if (toMe && !categoryId) return setProblem("Pick the category it counts in.");
    const saved = writeOffDebt(repo, {
      debtId: debt.id,
      categoryId: toMe ? (categoryId ?? undefined) : undefined,
      localDate: day,
      occurredAt: occurredAtFor(day, day),
    });
    if (!saved.ok) return setProblem(refusalText(saved.code, saved.message));
    router.back();
    showUndo(`Wrote off ${formatRM(debt.outstandingSen)} · ${debt.name}`, () =>
      deleteTransaction(repo, saved.value.id),
    );
  };

  return (
    <SheetShell
      title="Write off"
      subtitle={toMe ? `${debt.name} owes you` : `You owe ${debt.name}`}
      footer={
        <>
          {problem ? (
            <Text accessibilityRole="alert" style={[type.strong, { color: colors.warning }]}>
              {problem}
            </Text>
          ) : null}
          <Button label={`Write off ${formatRM(debt.outstandingSen)}`} onPress={save} />
          <Button label="Keep it open" variant="secondary" onPress={() => router.back()} />
        </>
      }
    >
      <SheetAmount text={formatRM(debt.outstandingSen)} />
      {toMe ? (
        <>
          <SheetNote
            title={`Counts as spending in ${category?.name ?? "…"}`}
            detail={`The money isn't coming back, so it comes off your plan today. ${debt.name}'s debt closes.`}
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {debt.categories.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                selected={c.id === categoryId}
                onPress={() => {
                  setCategoryId(c.id);
                  setProblem(null);
                }}
              />
            ))}
          </View>
        </>
      ) : (
        <SheetNote
          title={`${debt.name} doesn't need it back`}
          detail="The debt closes. It isn't spending, so your plan doesn't change."
        />
      )}
    </SheetShell>
  );
}
