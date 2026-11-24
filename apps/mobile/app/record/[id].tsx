import { budgetAfterLending, formatRM, sen } from "@brokely/domain";
import {
  deleteDebt,
  deleteTransaction,
  getDebt,
  getPlan,
  restoreDebt,
  setPlanBudget,
  setPlanLink,
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
import { Chip } from "../../src/ui/sheet-parts";
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
  const [planOpen, setPlanOpen] = useState(false);
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

  /**
   * Count a loan or transfer in this month's plan, or not (D-147): a loan lowers the budget, a
   * transfer raises it; taking it out undoes that plan change. Each with Undo.
   */
  const choosePlan = (counted: boolean) => {
    const choice = record.planChoice;
    setPlanOpen(false);
    if (!choice || choice.counted === counted) return;
    if (!counted) {
      const putBack = takeBackLend(t.id, t.localDate);
      if (putBack) showUndo("Taken out of the plan's numbers", putBack);
      return;
    }
    const plan = getPlan(repo.db, choice.cycleId);
    if (!plan) return;
    const budget = sen(plan.revision.budgetSen);
    const next =
      choice.kind === "lend" ? budgetAfterLending(budget, t.amountSen) : sen(budget + t.amountSen);
    if (next === null) return setProblem("That's more than your whole plan.");
    const reason =
      choice.kind === "lend"
        ? `Lent ${formatRM(t.amountSen)} counted in the plan`
        : `Transfer ${formatRM(t.amountSen)} added to the plan`;
    const saved = setPlanBudget(repo, {
      cycleId: choice.cycleId,
      budgetSen: next,
      shortfallAcknowledged: true,
      reason,
    });
    if (!saved.ok) return setProblem(refusalText(saved.code, saved.message));
    setPlanLink(repo, choice.cycleId, t.id, saved.value.revisionId);
    showUndo(`Plan is now ${formatRM(next)}`, () => takeBackLend(t.id, t.localDate));
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
        {rows.map((r, i) =>
          r.label === "Plan" && record.planChoice ? (
            <View key={r.label}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: planOpen }}
                accessibilityLabel={`Plan: ${r.value}. Change`}
                onPress={() => setPlanOpen((o) => !o)}
                style={({ pressed }) => ({
                  minHeight: MIN_TOUCH,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: space.sm,
                  paddingVertical: space.xs,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: colors.background,
                  opacity: pressed ? 0.7 : 1,
                })}
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
                  {r.value} {planOpen ? "⌃" : "›"}
                </Text>
              </Pressable>
              {planOpen ? (
                <View style={{ gap: space.xs, paddingBottom: space.sm }}>
                  <Chip
                    label={
                      record.planChoice.kind === "lend"
                        ? "Taken out of this month's plan"
                        : "Added to this month's plan"
                    }
                    selected={record.planChoice.counted}
                    onPress={() => choosePlan(true)}
                  />
                  <Chip
                    label="Not in the plan"
                    selected={!record.planChoice.counted}
                    onPress={() => choosePlan(false)}
                  />
                  <Text style={[type.small, { color: colors.muted }]}>
                    {record.planChoice.kind === "lend"
                      ? "Counted, the budget goes down by what you lent. It's still not spending; if they never pay you back, Write off in Debts makes it spending."
                      : "Counted, the budget goes up by the transfer. A transfer is never spending."}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : (
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
          ),
        )}
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
