import {
  formatRM,
  parseAmount,
  refundableSen,
  sen,
  type LocalDate,
  type Sen,
} from "@brokely/domain";
import {
  deleteDebt,
  deleteTransaction,
  editTransaction,
  getDebt,
  getTransaction,
  listCategories,
  listTransactionEdits,
  listTransactions,
  recordTransaction,
  restoreDebt,
  restoreTransaction,
  type LineInput,
  type TransactionInput,
  type TransactionView,
} from "@brokely/local-db";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { repo } from "../../src/db/client";
import { useRead } from "../../src/db/use-read";
import { categoryEmoji } from "../../src/lib/essentials-meta";
import { refusalText } from "../../src/lib/messages";
import { dayMonth, occurredAtFor, today } from "../../src/lib/today";
import { Button } from "../../src/ui/components";
import { pickDate } from "../../src/ui/date-picker";
import { Keypad } from "../../src/ui/keypad";
import { Chip, Field } from "../../src/ui/sheet-parts";
import { fonts, MIN_TOUCH, radius, space, type } from "../../src/ui/theme";
import { useTheme } from "../../src/ui/theme-context";
import { useUndo } from "../../src/ui/undo";

/** Sen as text the keypad can keep editing: 700 → "7.00". */
const asTyped = (amount: Sen) =>
  `${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, "0")}`;

/** "19 Oct, 12:40" in the phone's time. */
function when(instant: string): string {
  const d = new Date(instant);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Edit, delete or refund one record from Records (FR-TXN-01, FR-TXN-06, FR-TXN-07, FR-TXN-10,
 * AC-05, AC-09, D-38). Same sheet as quick add; changes keep an edit history; Delete and every
 * save offer Undo instead of asking first.
 */
export default function RecordSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const record = useRead((db) => {
    const t = getTransaction(db, id);
    if (!t) return null;
    const refunds = listTransactions(db).filter((r) => r.refundsTransactionId === t.id);
    return {
      t,
      edits: listTransactionEdits(db, t.id),
      refundable: t.type === "purchase" ? refundableSen(t, refunds) : sen(0),
      categories: listCategories(db),
    };
  });
  if (!record) return <Redirect href="/records" />;
  return <Sheet {...record} />;
}

function Sheet({
  t,
  edits,
  refundable,
  categories,
}: {
  t: TransactionView;
  edits: ReturnType<typeof listTransactionEdits>;
  refundable: Sen;
  categories: ReturnType<typeof listCategories>;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const showUndo = useUndo();
  const day = useMemo(() => today(), []);

  const spending = t.lines.filter((l) => l.kind === "spending");
  const debtLines = t.lines.filter((l) => l.kind === "debt");
  const split = t.type === "purchase" && debtLines.length > 0;
  // A plain purchase or refund (one spending line) may move to another category.
  const canPickCategory =
    (t.type === "purchase" || t.type === "refund") && spending.length === 1 && !split;
  const firstSpending = spending[0]?.kind === "spending" ? spending[0] : undefined;

  const [mode, setMode] = useState<"edit" | "refund">("edit");
  const [amountText, setAmountText] = useState(asTyped(t.amountSen));
  const [refundText, setRefundText] = useState("");
  const [categoryId, setCategoryId] = useState(firstSpending?.categoryId ?? null);
  const [date, setDate] = useState<LocalDate>(t.localDate);
  const [note, setNote] = useState(t.note);
  const [problem, setProblem] = useState<string | null>(null);

  const amount = parseAmount(mode === "edit" ? amountText : refundText);
  const categoryName = categories.find(
    (c) => c.id === (categoryId ?? firstSpending?.categoryId),
  )?.name;

  const input = (newAmount: Sen): TransactionInput => {
    const lines: readonly LineInput[] = split
      ? t.lines // amounts locked for a split (the friend's share would change)
      : t.lines.map((l) =>
          l.kind === "spending"
            ? {
                id: l.id,
                kind: "spending",
                categoryId: categoryId ?? l.categoryId,
                amountSen: newAmount,
              }
            : { id: l.id, kind: "debt", debtId: l.debtId, amountSen: newAmount },
        );
    return {
      type: t.type,
      amountSen: split ? t.amountSen : newAmount,
      occurredAt: date === t.localDate ? t.occurredAt : occurredAtFor(date, day),
      localDate: date,
      note: note.trim(),
      source: t.source,
      refundsTransactionId: t.refundsTransactionId ?? null,
      writeOffCategoryId: t.writeOffCategoryId ?? null,
      isEstimate: t.isEstimate ?? false,
      lines,
    };
  };

  /** The record as it is now, to put back if the student taps Undo after an edit. */
  const asBefore = (): TransactionInput => ({
    type: t.type,
    amountSen: t.amountSen,
    occurredAt: t.occurredAt,
    localDate: t.localDate,
    note: t.note,
    source: t.source,
    refundsTransactionId: t.refundsTransactionId ?? null,
    writeOffCategoryId: t.writeOffCategoryId ?? null,
    isEstimate: t.isEstimate ?? false,
    lines: t.lines,
  });

  const saveChanges = () => {
    if (amount === null || amount <= 0) return setProblem("Type an amount above zero.");
    const saved = editTransaction(repo, t.id, input(amount));
    if (!saved.ok) return setProblem(refusalText(saved.code, saved.message));
    router.back();
    showUndo(`Saved changes · ${formatRM(split ? t.amountSen : amount)}`, () =>
      editTransaction(repo, t.id, asBefore()),
    );
  };

  const remove = () => {
    // A lend or borrow opened its debt; with it gone, the empty debt goes too (D-38).
    const openedDebt =
      (t.type === "lend" || t.type === "borrow") && debtLines[0]?.kind === "debt"
        ? debtLines[0].debtId
        : null;
    const deleted = deleteTransaction(repo, t.id);
    if (!deleted.ok) return setProblem(refusalText(deleted.code, deleted.message));
    const debtGone =
      openedDebt !== null &&
      getDebt(repo.db, openedDebt)?.summary.principalSen === 0 &&
      deleteDebt(repo, openedDebt).ok;
    router.back();
    showUndo(`Deleted ${formatRM(t.amountSen)}`, () => {
      if (debtGone && openedDebt) restoreDebt(repo, openedDebt);
      restoreTransaction(repo, t.id);
    });
  };

  const saveRefund = () => {
    if (amount === null || amount <= 0 || !firstSpending)
      return setProblem("Type the refund amount.");
    if (amount > refundable)
      return setProblem(`Only ${formatRM(refundable)} can still be refunded.`);
    const saved = recordTransaction(repo, {
      type: "refund",
      amountSen: amount,
      occurredAt: occurredAtFor(date, day),
      localDate: date,
      note: note.trim(),
      refundsTransactionId: t.id,
      lines: [{ kind: "spending", categoryId: firstSpending.categoryId, amountSen: amount }],
    });
    if (!saved.ok) return setProblem(refusalText(saved.code, saved.message));
    router.back();
    showUndo(`Saved refund ${formatRM(amount)}`, () => deleteTransaction(repo, saved.value.id));
  };

  const title = mode === "refund" ? "Refund" : "Edit record";
  const subtitle =
    mode === "refund"
      ? `from ${t.note || categoryName || "this purchase"} · ${formatRM(t.amountSen)}`
      : `${t.type === "income" ? "Money in" : t.type === "purchase" ? "Spent" : "Record"} · ${dayMonth(t.localDate)}`;

  return (
    <View style={{ flex: 1, justifyContent: "flex-end" }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={() => router.back()}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(5,6,5,0.55)",
        }}
      />
      <KeyboardAvoidingView behavior="padding">
        <View
          style={{
            maxHeight: "94%",
            backgroundColor: colors.background,
            borderTopWidth: 2,
            borderColor: colors.outline,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: space.md,
            paddingTop: space.sm,
            paddingBottom: insets.bottom + space.md,
            gap: space.sm,
          }}
        >
          <View
            style={{
              alignSelf: "center",
              width: 44,
              height: 5,
              borderRadius: 99,
              backgroundColor: colors.muted,
              opacity: 0.5,
            }}
          />
          <View
            style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
          >
            <Text style={[type.heading, { color: colors.text }]} accessibilityRole="header">
              {title}
            </Text>
            <Text style={[type.small, { color: colors.muted, flexShrink: 1, textAlign: "right" }]}>
              {subtitle}
            </Text>
          </View>

          <Text
            style={{
              textAlign: "center",
              fontFamily: fonts.heading,
              fontSize: 48,
              lineHeight: 54,
              color: colors.text,
              fontVariant: ["tabular-nums"],
            }}
          >
            {formatRM(mode === "edit" && split ? t.amountSen : (amount ?? sen(0)))}
          </Text>

          <ScrollView
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ gap: space.sm }}
            keyboardShouldPersistTaps="handled"
          >
            {mode === "refund" ? (
              <View
                style={{
                  borderRadius: radius.button,
                  borderWidth: 2,
                  borderColor: colors.outline,
                  backgroundColor: colors.cardTint,
                  padding: space.sm,
                  gap: 2,
                }}
              >
                <Text style={[type.strong, { color: colors.text }]}>
                  Up to {formatRM(refundable)} can be refunded
                </Text>
                <Text style={[type.small, { color: colors.muted }]}>
                  It goes back to {categoryName ?? "its category"}{" "}
                  {categoryName ? categoryEmoji(categoryName) : ""}, so that spending drops by the
                  refund.
                </Text>
              </View>
            ) : canPickCategory ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                {categories.map((c) => (
                  <Chip
                    key={c.id}
                    label={`${c.name} ${categoryEmoji(c.name)}`.trim()}
                    selected={c.id === categoryId}
                    onPress={() => setCategoryId(c.id)}
                  />
                ))}
              </View>
            ) : split ? (
              <Text style={[type.small, { color: colors.muted }]}>
                This was split with a friend, so its amounts are locked. To change them, delete it
                and add it again.
              </Text>
            ) : null}

            <View style={{ flexDirection: "row", gap: space.sm }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Date: ${dayMonth(date)}. Change`}
                onPress={async () => {
                  const chosen = await pickDate(date);
                  if (chosen) setDate(chosen);
                }}
                style={{
                  flex: 1,
                  minHeight: MIN_TOUCH,
                  justifyContent: "center",
                  paddingHorizontal: space.sm,
                  borderRadius: radius.button,
                  borderWidth: 2,
                  borderColor: colors.outline,
                  backgroundColor: colors.card,
                }}
              >
                <Text style={[type.strong, { color: colors.text, fontSize: 15 }]}>
                  📅 {date === day ? `Today, ${dayMonth(day)}` : dayMonth(date)}
                </Text>
              </Pressable>
              <View style={{ flex: 1 }}>
                <Field value={note} onChange={setNote} placeholder="Note (optional)" />
              </View>
            </View>

            {mode === "edit" && edits.length > 0 ? (
              <View
                style={{
                  borderRadius: radius.button,
                  borderWidth: 2,
                  borderStyle: "dashed",
                  borderColor: colors.outline,
                  padding: space.sm,
                  gap: 2,
                }}
              >
                <Text style={[type.small, { color: colors.muted, textTransform: "uppercase" }]}>
                  Edit history
                </Text>
                {edits.map((e) => (
                  <Text
                    key={e.changedAt}
                    style={[type.strong, { color: colors.text, fontSize: 14 }]}
                  >
                    {when(e.changedAt)} ·{" "}
                    {e.beforeSen === e.afterSen
                      ? "details changed"
                      : `${formatRM(e.beforeSen)} → ${formatRM(e.afterSen)}`}
                  </Text>
                ))}
              </View>
            ) : null}
          </ScrollView>

          {mode === "edit" && split ? null : (
            <Keypad
              value={mode === "edit" ? amountText : refundText}
              onChange={(next) => {
                if (mode === "edit") setAmountText(next);
                else setRefundText(next);
                setProblem(null);
              }}
            />
          )}
          {problem ? (
            <Text accessibilityRole="alert" style={[type.strong, { color: colors.warning }]}>
              {problem}
            </Text>
          ) : null}

          {mode === "edit" ? (
            <>
              <View style={{ flexDirection: "row", gap: space.sm }}>
                {t.type === "purchase" && refundable > 0 ? (
                  <View style={{ flex: 1 }}>
                    <Button
                      label="Refund"
                      variant="secondary"
                      onPress={() => {
                        setMode("refund");
                        setProblem(null);
                      }}
                    />
                  </View>
                ) : null}
                <View style={{ flex: 1 }}>
                  <Button label="Delete" variant="secondary" onPress={remove} />
                </View>
              </View>
              <Button label="Save changes" onPress={saveChanges} />
            </>
          ) : (
            <Button
              label={amount ? `Save refund · ${formatRM(amount)}` : "Save refund"}
              onPress={saveRefund}
              disabled={!amount}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
