import { formatRM } from "@brokely/domain";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRead } from "../../src/db/use-read";
import { readDebts, type DebtRow } from "../../src/lib/debts-model";
import { dayMonth } from "../../src/lib/today";
import { Button, Empty, Heading, PageScreen, Sticker } from "../../src/ui/components";
import { Chip } from "../../src/ui/sheet-parts";
import { space, type } from "../../src/ui/theme";
import { useTheme } from "../../src/ui/theme-context";

/**
 * S7 Debts (FR-DEBT-01…06): money owed to me and money I owe, each with what is still
 * outstanding; tap one to record a repayment or write it off. Debts are never spending.
 */
export default function DebtsScreen() {
  const { colors } = useTheme();
  const model = useRead(readDebts);
  const [side, setSide] = useState<"to_me" | "by_me">(
    model.owedToMe.length === 0 && model.iOwe.length > 0 ? "by_me" : "to_me",
  );
  const list = side === "to_me" ? model.owedToMe : model.iOwe;

  return (
    <PageScreen
      title="Debts"
      action={
        <Button
          label="+ Add"
          onPress={() => router.push(`/quick-add?more=${side === "to_me" ? "lent" : "borrowed"}`)}
        />
      }
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        <Chip
          label={`Owed to me · ${formatRM(model.owedToMeSen)}`}
          selected={side === "to_me"}
          onPress={() => setSide("to_me")}
        />
        <Chip
          label={`I owe · ${formatRM(model.iOweSen)}`}
          selected={side === "by_me"}
          onPress={() => setSide("by_me")}
        />
      </View>

      {list.length === 0 ? (
        <Empty>
          {side === "to_me"
            ? "Nobody owes you anything right now. Split a bill or lend money from +."
            : "You don't owe anyone right now. Nice!"}
        </Empty>
      ) : (
        list.map((d) => <DebtCard key={d.id} debt={d} />)
      )}

      {model.closed.length > 0 ? (
        <>
          <Heading>Settled</Heading>
          {model.closed.map((d) => (
            <DebtCard key={d.id} debt={d} />
          ))}
        </>
      ) : null}
      <Text style={[type.small, { color: colors.muted }]}>
        Lending, borrowing and paying back are never spending. Only writing off money someone owed
        you counts as spending.
      </Text>
    </PageScreen>
  );
}

function DebtCard({ debt }: { debt: DebtRow }) {
  const { colors } = useTheme();
  const open = debt.status === "open";
  const detail = !open
    ? debt.status === "written_off"
      ? "Written off"
      : "Paid back in full"
    : [
        debt.outstandingSen !== debt.principalSen
          ? `${formatRM(debt.outstandingSen)} of ${formatRM(debt.principalSen)} left`
          : null,
        debt.dueDate ? `due ${dayMonth(debt.dueDate)}` : null,
        debt.fromBefore ? "from before Brokely" : null,
      ]
        .filter(Boolean)
        .join(" · ");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${debt.name}, ${formatRM(open ? debt.outstandingSen : debt.principalSen)}. Open`}
      onPress={() => router.push(`/debts/${debt.id}`)}
    >
      <Sticker style={{ padding: space.md, gap: 2, opacity: open ? 1 : 0.7 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
          <Text style={[type.strong, { color: colors.text, flex: 1 }]}>
            {debt.direction === "owed_to_me" ? `${debt.name} owes you` : `You owe ${debt.name}`}
          </Text>
          <Text style={[type.strong, { color: colors.text, fontVariant: ["tabular-nums"] }]}>
            {formatRM(open ? debt.outstandingSen : debt.principalSen)}
          </Text>
        </View>
        {detail ? <Text style={[type.small, { color: colors.muted }]}>{detail}</Text> : null}
      </Sticker>
    </Pressable>
  );
}
