import { formatRM, localDate, parseAmount, sen, type Sen } from "@brokely/domain";
import {
  compareWithLastCheck,
  deleteTransaction,
  listCategories,
  logWalletDifference,
  recordWalletCheck,
  type WalletComparison,
} from "@brokely/local-db";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { db, repo } from "../src/db/client";
import { categoryEmoji } from "../src/lib/essentials-meta";
import { refusalText } from "../src/lib/messages";
import { dayMonth, today, weekdayName } from "../src/lib/today";
import { Button } from "../src/ui/components";
import { Keypad } from "../src/ui/keypad";
import { SheetAmount, SheetNote, SheetShell } from "../src/ui/sheet";
import { Chip } from "../src/ui/sheet-parts";
import { space, type } from "../src/ui/theme";
import { useTheme } from "../src/ui/theme-context";
import { useUndo } from "../src/ui/undo";

/** "Monday, 16 Nov" for the check a comparison is based on (FR-WAL-04). */
const checkDay = (c: WalletComparison) => {
  const d = localDate(c.lastCheck.localDate);
  return `${weekdayName(d)}, ${dayMonth(d)}`;
};

/**
 * S11 Wallet check (FR-WAL-01…04, BR-30, BR-31, D-27, AC-62, AC-63). Optional: the student
 * types all the money they have; the app compares it with their records since their last
 * check, worded from that check, never as a balance. A difference is logged only on a tap.
 */
export default function WalletCheckSheet() {
  const { colors } = useTheme();
  const showUndo = useUndo();
  const day = useMemo(() => today(), []);
  const categories = useMemo(() => listCategories(db).filter((c) => c.kind !== "set_aside"), []);
  const [amountText, setAmountText] = useState("");
  const [saved, setSaved] = useState<{ id: string; comparison: WalletComparison | null } | null>(
    null,
  );
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const amount = parseAmount(amountText);

  // Live while typing; the saved result below is what was actually compared.
  const preview = useMemo(
    () => (amount === null ? null : compareWithLastCheck(db, amount, new Date().toISOString())),
    [amount],
  );
  const firstCheck = useMemo(
    () => compareWithLastCheck(db, sen(0), new Date().toISOString()) === null,
    [],
  );

  const save = () => {
    if (amount === null) return setProblem("Type how much money you have, even RM0.");
    const result = recordWalletCheck(repo, { amountSen: amount, localDate: day });
    if (!result.ok) return setProblem(refusalText(result.code, result.message));
    setSaved(result.value);
    setProblem(null);
  };

  const logIt = () => {
    if (!saved) return;
    const logged = logWalletDifference(repo, {
      checkId: saved.id,
      categoryId: categoryId ?? undefined,
    });
    if (!logged.ok) return setProblem(refusalText(logged.code, logged.message));
    router.back();
    showUndo("Logged the difference", () => deleteTransaction(repo, logged.value.id));
  };

  if (saved) {
    const c = saved.comparison;
    const diff = c?.difference;
    return (
      <SheetShell
        title="Wallet check"
        subtitle={`Saved · ${dayMonth(day)}`}
        footer={
          <>
            {problem ? (
              <Text accessibilityRole="alert" style={[type.strong, { color: colors.warning }]}>
                {problem}
              </Text>
            ) : null}
            {diff && diff.kind !== "match" ? (
              <>
                <Button
                  label={`Log it · ${formatRM(diff.amountSen)}`}
                  onPress={logIt}
                  disabled={diff.kind === "missing" && !categoryId}
                />
                <Button label="Leave it" variant="secondary" onPress={() => router.back()} />
              </>
            ) : (
              <Button label="Done" onPress={() => router.back()} />
            )}
          </>
        }
      >
        {!c || !diff ? (
          <SheetNote
            title="Your starting point is set 👍"
            detail="Next time, Brokely compares your check with what you log in between."
          />
        ) : diff.kind === "match" ? (
          <SheetNote
            title="It matches your records 🎉"
            detail={`Based on your check on ${checkDay(c)} and what you've logged since.`}
          />
        ) : diff.kind === "missing" ? (
          <>
            <SheetNote
              title={`${formatRM(diff.amountSen)} isn't in your records`}
              detail={`Based on your check on ${checkDay(c)}, your records say about ${formatRM(c.expectedSen)}. Happens to everyone! Want to log it as spending?`}
            />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
              {categories.map((cat) => (
                <Chip
                  key={cat.id}
                  label={`${cat.name} ${categoryEmoji(cat.name)}`.trim()}
                  selected={cat.id === categoryId}
                  onPress={() => {
                    setCategoryId(cat.id);
                    setProblem(null);
                  }}
                />
              ))}
            </View>
          </>
        ) : (
          <SheetNote
            title={`${formatRM(diff.amountSen)} more than your records`}
            detail={`Based on your check on ${checkDay(c)}, your records say about ${formatRM(c.expectedSen)}. Log the extra as money in?`}
          />
        )}
      </SheetShell>
    );
  }

  return (
    <SheetShell
      title="Wallet check"
      subtitle="Optional"
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
          <Button label="Save my check" onPress={save} disabled={amount === null} />
        </>
      }
    >
      <SheetAmount text={formatRM(amount ?? (0 as Sen))} />
      <SheetNote
        title="How much money do you have right now?"
        detail={
          firstCheck
            ? "Cash, TNG and bank together. Your first check is just a starting point."
            : preview
              ? `Cash, TNG and bank together. Based on your check on ${checkDay(preview)}, your records say about ${formatRM(preview.expectedSen)}.`
              : "Cash, TNG and bank together."
        }
      />
    </SheetShell>
  );
}
