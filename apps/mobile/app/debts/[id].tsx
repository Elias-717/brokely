import { formatRM } from "@brokely/domain";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useRead } from "../../src/db/use-read";
import { readDebt } from "../../src/lib/debts-model";
import { dayMonth } from "../../src/lib/today";
import { Button, Empty, Heading, PageScreen, Sticker } from "../../src/ui/components";
import { space, type } from "../../src/ui/theme";
import { useTheme } from "../../src/ui/theme-context";

/**
 * One debt (FR-DEBT-02…06): what is still owed, its history, and the two actions: a repayment
 * (part or all) or Write off (S7b). Every entry opens its record, where it can be undone.
 */
export default function DebtScreen() {
  const { colors } = useTheme();
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

  return (
    <PageScreen title={debt.name}>
      <Sticker
        offset={4}
        background={colors.hero}
        outline={colors.heroOutline}
        style={{ padding: space.md, gap: space.xs }}
      >
        <Text style={[type.strong, { color: colors.onHero, fontSize: 14 }]}>
          {toMe ? `${debt.name} still owes you` : `You still owe ${debt.name}`}
        </Text>
        <Text style={[type.amount, { color: colors.onHero }]}>{formatRM(debt.outstandingSen)}</Text>
        <Text style={[type.body, { color: colors.onHero, fontSize: 14 }]}>
          of {formatRM(debt.principalSen)}
          {debt.repaidSen > 0 ? ` · ${formatRM(debt.repaidSen)} paid back` : ""}
          {debt.dueDate ? ` · due ${dayMonth(debt.dueDate)}` : ""}
        </Text>
      </Sticker>

      {open ? (
        <View style={{ gap: space.sm }}>
          <Button
            label={toMe ? "They paid me back" : "I paid back"}
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
      {debt.events.map((e) => (
        <Pressable
          key={e.transactionId}
          accessibilityRole="button"
          accessibilityLabel={`${e.label}, ${formatRM(e.amountSen)}, ${dayMonth(e.date)}. Open the record`}
          onPress={() => router.push(`/record/${e.transactionId}`)}
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            minHeight: 48,
            alignItems: "center",
            borderBottomWidth: 2,
            borderBottomColor: colors.card,
          }}
        >
          <View>
            <Text style={[type.strong, { color: colors.text }]}>{e.label}</Text>
            <Text style={[type.small, { color: colors.muted }]}>
              {dayMonth(e.date)}
              {debt.fromBefore && e === debt.events.at(-1) ? " · from before Brokely" : ""}
            </Text>
          </View>
          <Text style={[type.strong, { color: colors.text, fontVariant: ["tabular-nums"] }]}>
            {formatRM(e.amountSen)}
          </Text>
        </Pressable>
      ))}
    </PageScreen>
  );
}
