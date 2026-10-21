import { formatRM } from "@brokely/domain";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useRead } from "../../src/db/use-read";
import { readDebt, type DebtEvent } from "../../src/lib/debts-model";
import { dayMonth } from "../../src/lib/today";
import { Avatar } from "../../src/ui/avatar";
import { Button, Empty, Heading, PageScreen, Sticker } from "../../src/ui/components";
import { ProgressBar } from "../../src/ui/progress-bar";
import { fonts, space, type } from "../../src/ui/theme";
import { useTheme } from "../../src/ui/theme-context";

/**
 * One debt (FR-DEBT-02…06, D-78): the person first, what is still owed with a paid-back bar,
 * the two actions (a repayment, or Write off, S7b), and the history as a timeline; every entry
 * opens its record, where it can be undone.
 */
export default function DebtScreen() {
  const { colors, scheme } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const debt = useRead((db) => readDebt(db, id), [id]);
  if (!debt) {
    return (
      <PageScreen title="Debt">
        <Empty>This debt was removed.</Empty>
      </PageScreen>
    );
  }
  const toMe = debt.direction === "owed_to_me";
  const open = debt.status === "open";
  const paidShare = debt.principalSen > 0 ? debt.repaidSen / debt.principalSen : 0;

  return (
    <PageScreen title={debt.name}>
      <View
        accessible
        accessibilityLabel={`${toMe ? `${debt.name} still owes you` : `You still owe ${debt.name}`} ${formatRM(debt.outstandingSen)} of ${formatRM(debt.principalSen)}`}
        style={{
          backgroundColor: colors.hero,
          borderRadius: 24,
          borderWidth: scheme === "dark" ? 1 : 2,
          borderColor: colors.heroOutline,
          padding: 18,
          gap: space.xs,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Avatar size={40} name={debt.name} signedIn={false} />
          <Text style={{ flex: 1, fontFamily: fonts.heavy, fontSize: 15, color: colors.onHero }}>
            {toMe ? `${debt.name} still owes you` : `You still owe ${debt.name}`}
          </Text>
        </View>
        <Text style={[type.amount, { color: colors.onHero }]}>{formatRM(debt.outstandingSen)}</Text>
        {debt.repaidSen > 0 ? <ProgressBar fraction={paidShare} onHero /> : null}
        <Text style={[type.body, { color: colors.onHero, fontSize: 14 }]}>
          {debt.repaidSen > 0
            ? `${formatRM(debt.repaidSen)} of ${formatRM(debt.principalSen)} paid back`
            : `of ${formatRM(debt.principalSen)}`}
          {debt.dueDate ? ` · due ${dayMonth(debt.dueDate)}` : ""}
        </Text>
      </View>

      {open ? (
        <View style={{ gap: space.sm }}>
          <Button
            label={toMe ? `${debt.name} paid me back` : "I paid back"}
            onPress={() => router.push(`/debts/repay/${debt.id}`)}
          />
          <Button
            label="Write off"
            variant="secondary"
            onPress={() => router.push(`/debts/write-off/${debt.id}`)}
          />
        </View>
      ) : (
        <Empty>
          {debt.status === "written_off" ? "This debt was written off." : "All paid back. 🎉"}
        </Empty>
      )}

      <Heading>History</Heading>
      <Sticker style={{ padding: 0, marginBottom: space.lg }}>
        {debt.events.map((e, i) => (
          <HistoryRow
            key={e.transactionId}
            event={e}
            first={i === 0}
            fromBefore={debt.fromBefore && e === debt.events.at(-1)}
          />
        ))}
      </Sticker>
    </PageScreen>
  );
}

function HistoryRow({
  event,
  first,
  fromBefore,
}: {
  event: DebtEvent;
  first: boolean;
  fromBefore: boolean;
}) {
  const { colors } = useTheme();
  const symbol = event.flow === "in" ? "↓" : event.flow === "out" ? "↑" : "×";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${event.label}, ${formatRM(event.amountSen)}, ${dayMonth(event.date)}. Open the record`}
      onPress={() => router.push(`/record/${event.transactionId}`)}
      style={({ pressed }) => ({
        minHeight: 60,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 10,
        paddingLeft: 12,
        paddingRight: space.md,
        borderTopWidth: first ? 0 : 2,
        borderTopColor: colors.background,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View
        accessibilityElementsHidden
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          borderWidth: 2,
          borderColor: colors.outline,
          backgroundColor: event.flow === "in" ? colors.cardTint : colors.background,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontFamily: fonts.heavy, fontSize: 16, color: colors.text }}>{symbol}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.heavy, fontSize: 15, color: colors.text }}>
          {event.label}
        </Text>
        <Text style={[type.small, { color: colors.muted }]}>
          {dayMonth(event.date)}
          {fromBefore ? " · from before Brokely" : ""}
        </Text>
      </View>
      <Text
        style={{
          fontFamily: fonts.heavy,
          fontSize: 15,
          color: colors.text,
          fontVariant: ["tabular-nums"],
        }}
      >
        {formatRM(event.amountSen)}
      </Text>
      <Text style={[type.heading, { color: colors.muted }]}>›</Text>
    </Pressable>
  );
}
