import { formatRM } from "@brokely/domain";
import {
  deleteDebt,
  deleteTransaction,
  getDebt,
  restoreDebt,
  restoreTransaction,
} from "@brokely/local-db";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { repo } from "../../src/db/client";
import { useRead } from "../../src/db/use-read";
import { takeBackLend, takeBackMoneyIn } from "../../src/lib/money-in-delete";
import { refusalText } from "../../src/lib/messages";
import { readRecord } from "../../src/lib/record-model";
import { useSync } from "../../src/sync/sync-provider";
import { Button, PageScreen, Sticker } from "../../src/ui/components";
import { Icon } from "../../src/ui/icon";
import { fonts, MIN_TOUCH, space, type } from "../../src/ui/theme";
import { useTheme } from "../../src/ui/theme-context";
import { useUndo } from "../../src/ui/undo";

/** "24 Nov, 2:10 PM". */
const changedAt = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-MY", { day: "numeric", month: "short" })}, ${d.toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" })}`;
};

/**
 * One record, bank style (D-144): the category's icon, the note as the title, the amount and a
 * status pill, then plain rows with only what applies, and the edit history. Edit, Refund and
 * Delete stay fixed at the bottom. Tapping a record anywhere opens this page first.
 */
export default function RecordDetailsScreen() {
  const { colors } = useTheme();
  const showUndo = useUndo();
  const { session } = useSync();
  const { id } = useLocalSearchParams<{ id: string }>();
  const record = useRead((db) => readRecord(db, id), [id]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  if (!record) return <Redirect href="/records" />;
  const { t } = record;

  /** Delete with Undo, taking back a debt it opened and any plan change it made (D-38, D-139, D-141). */
  const remove = () => {
    const debtLine = t.lines.find((l) => l.kind === "debt");
    const openedDebt =
      (t.type === "lend" || t.type === "borrow") && debtLine?.kind === "debt"
        ? debtLine.debtId
        : null;
    const putBack =
      t.type === "income"
        ? takeBackMoneyIn(t.id, t.localDate)
        : t.type === "lend" || t.type === "transfer"
          ? takeBackLend(t.id, t.localDate)
          : null;
    const deleted = deleteTransaction(repo, t.id);
    if (!deleted.ok) {
      putBack?.();
      return setProblem(refusalText(deleted.code, deleted.message));
    }
    const debtGone =
      openedDebt !== null &&
      getDebt(repo.db, openedDebt)?.summary.principalSen === 0 &&
      deleteDebt(repo, openedDebt).ok;
    router.back();
    showUndo(`Deleted ${formatRM(t.amountSen)}`, () => {
      if (debtGone && openedDebt) restoreDebt(repo, openedDebt);
      restoreTransaction(repo, t.id);
      putBack?.();
    });
  };

  const amountColor =
    record.flow === "out" ? colors.expense : record.flow === "in" ? colors.income : colors.text;
  const backedUp = !session
    ? "Only on this phone"
    : record.syncStatus === "synced"
      ? "Yes"
      : record.syncStatus === "conflict"
        ? "Needs a look"
        : "Waiting to back up";
  const rows = [
    ...record.rows,
    { icon: "shield-check" as const, label: "Backed up", value: backedUp },
  ];

  return (
    <PageScreen
      title="Record"
      footer={
        <View style={{ gap: space.xs }}>
          {problem ? (
            <Text accessibilityRole="alert" style={[type.small, { color: colors.warning }]}>
              {problem}
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Button label="Edit" onPress={() => router.push(`/record/edit/${t.id}`)} />
            </View>
            {record.refundableSen > 0 ? (
              <View style={{ flex: 1 }}>
                <Button
                  label="Refund"
                  variant="secondary"
                  onPress={() =>
                    router.push({
                      pathname: "/record/edit/[id]",
                      params: { id: t.id, mode: "refund" },
                    })
                  }
                />
              </View>
            ) : null}
            <View style={{ flex: 1 }}>
              <Button label="Delete" variant="destructive" onPress={remove} />
            </View>
          </View>
        </View>
      }
    >
      {/* Header: icon, what it was, how much, what kind (D-144). */}
      <View style={{ alignItems: "center", gap: space.xs, paddingVertical: space.sm }}>
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            borderWidth: 2,
            borderColor: colors.outline,
            backgroundColor: colors.cardTint,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={record.icon} size={26} />
        </View>
        <Text
          accessibilityRole="header"
          style={{ fontFamily: fonts.heavy, fontSize: 20, color: colors.text, textAlign: "center" }}
        >
          {record.title}
        </Text>
        <Text
          style={{
            fontFamily: fonts.heading,
            fontSize: 40,
            lineHeight: 46,
            color: amountColor,
            fontVariant: ["tabular-nums"],
          }}
        >
          {record.amount}
        </Text>
        <View
          style={{
            borderRadius: 20,
            borderWidth: 2,
            borderColor: colors.outline,
            backgroundColor: colors.card,
            paddingHorizontal: space.sm,
            paddingVertical: 2,
          }}
        >
          <Text style={{ fontFamily: fonts.heavy, fontSize: 13, color: colors.text }}>
            {record.pill}
          </Text>
        </View>
      </View>

      {/* The details, one row each, only what applies. */}
      <Sticker style={{ paddingHorizontal: space.md, paddingVertical: 2 }}>
        {rows.map((r, i) => (
          <View
            key={r.label}
            accessible
            accessibilityLabel={`${r.label}: ${r.value}`}
            style={{
              minHeight: MIN_TOUCH,
              flexDirection: "row",
              alignItems: "center",
              gap: space.sm,
              paddingVertical: space.xs,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: colors.background,
            }}
          >
            <Icon name={r.icon} size={20} />
            <Text style={[type.small, { color: colors.muted, width: 84 }]}>{r.label}</Text>
            <Text
              style={{
                flex: 1,
                textAlign: "right",
                fontFamily: fonts.heavy,
                fontSize: 14,
                color: colors.text,
              }}
            >
              {r.value}
            </Text>
          </View>
        ))}
        {record.edits.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: historyOpen }}
            onPress={() => setHistoryOpen((o) => !o)}
            style={({ pressed }) => ({
              minHeight: MIN_TOUCH,
              flexDirection: "row",
              alignItems: "center",
              gap: space.sm,
              borderTopWidth: 1,
              borderTopColor: colors.background,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Icon name="timer" size={20} />
            <Text style={[type.small, { flex: 1, color: colors.muted }]}>History</Text>
            <Text style={{ fontFamily: fonts.heavy, fontSize: 14, color: colors.text }}>
              {record.edits.length} {record.edits.length === 1 ? "change" : "changes"}{" "}
              {historyOpen ? "⌃" : "›"}
            </Text>
          </Pressable>
        ) : null}
        {historyOpen
          ? record.edits.map((e) => (
              <Text
                key={e.changedAt}
                style={[type.small, { color: colors.text, paddingBottom: space.xs }]}
              >
                {changedAt(e.changedAt)} ·{" "}
                {e.beforeSen === e.afterSen
                  ? "details changed"
                  : `${formatRM(e.beforeSen)} → ${formatRM(e.afterSen)}`}
              </Text>
            ))
          : null}
      </Sticker>
    </PageScreen>
  );
}
