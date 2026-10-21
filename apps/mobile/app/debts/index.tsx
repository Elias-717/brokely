import { formatRM } from "@brokely/domain";
import { router } from "expo-router";
import { useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { useRead } from "../../src/db/use-read";
import { readDebts, type DebtRow } from "../../src/lib/debts-model";
import { dayMonth, today } from "../../src/lib/today";
import { Avatar } from "../../src/ui/avatar";
import { Button, Empty, PageScreen, Sticker } from "../../src/ui/components";
import { ProgressBar } from "../../src/ui/progress-bar";
import { fonts, space, type } from "../../src/ui/theme";
import { useTheme } from "../../src/ui/theme-context";

type Side = "to_me" | "by_me";

/**
 * S7 Debts (FR-DEBT-01…06, D-78): the two totals are the two tabs; each person with their
 * initial, how much is left, a paid-back bar and the due date; settled debts fold into one row.
 * Debts are never spending.
 */
export default function DebtsScreen() {
  const { colors } = useTheme();
  const model = useRead(readDebts);
  const [side, setSide] = useState<Side>(
    model.owedToMe.length === 0 && model.iOwe.length > 0 ? "by_me" : "to_me",
  );
  const [showSettled, setShowSettled] = useState(false);
  const list = side === "to_me" ? model.owedToMe : model.iOwe;
  const day = today();
  const add = (which: Side) =>
    router.push(`/quick-add?more=${which === "to_me" ? "lent" : "borrowed"}`);

  if (model.owedToMe.length + model.iOwe.length + model.closed.length === 0) {
    return <AllSquare onAdd={add} />;
  }

  return (
    <PageScreen title="Debts" action={<Button label="+ Add" onPress={() => add(side)} />}>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <SideTile
          label="Owed to you"
          amount={formatRM(model.owedToMeSen)}
          people={model.owedToMe.length}
          selected={side === "to_me"}
          onPress={() => setSide("to_me")}
        />
        <SideTile
          label="You owe"
          amount={formatRM(model.iOweSen)}
          people={model.iOwe.length}
          selected={side === "by_me"}
          onPress={() => setSide("by_me")}
        />
      </View>

      {list.length === 0 ? (
        <Empty>
          {side === "to_me"
            ? "Nobody owes you anything right now."
            : "You don't owe anyone right now. Nice!"}
        </Empty>
      ) : (
        <Sticker style={{ padding: 0 }}>
          {list.map((d, i) => (
            <DebtRowView key={d.id} debt={d} day={day} first={i === 0} />
          ))}
        </Sticker>
      )}

      {model.closed.length > 0 ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showSettled }}
            onPress={() => setShowSettled((s) => !s)}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Sticker
              rounded={14}
              offset={2}
              style={{
                minHeight: 52,
                paddingHorizontal: space.md,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <Text style={{ flex: 1, fontFamily: fonts.heavy, fontSize: 15, color: colors.text }}>
                ✓ Settled · {model.closed.length}
              </Text>
              <Text style={{ fontFamily: fonts.heavy, fontSize: 14, color: colors.text }}>
                {showSettled ? "Hide" : "Show"}
              </Text>
            </Sticker>
          </Pressable>
          {showSettled ? (
            <Sticker style={{ padding: 0, opacity: 0.8 }}>
              {model.closed.map((d, i) => (
                <DebtRowView key={d.id} debt={d} day={day} first={i === 0} />
              ))}
            </Sticker>
          ) : null}
        </>
      ) : null}

      <View
        style={{
          backgroundColor: colors.cardTint,
          borderRadius: 12,
          padding: 12,
          marginBottom: space.lg,
        }}
      >
        <Text style={[type.small, { color: colors.text }]}>
          Good to know: lending, borrowing and paying back are never spending. Only writing off
          money someone owed you counts as spending.
        </Text>
      </View>
    </PageScreen>
  );
}

/** A total that is also a tab: green when chosen. */
function SideTile({
  label,
  amount,
  people,
  selected,
  onPress,
}: {
  label: string;
  amount: string;
  people: number;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const fg = selected ? colors.onHero : colors.text;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}: ${amount}, ${people} ${people === 1 ? "person" : "people"}`}
      onPress={onPress}
      style={{ flex: 1 }}
    >
      <Sticker
        background={selected ? colors.hero : colors.card}
        offset={selected ? 3 : 2}
        style={{ padding: 14, gap: 2 }}
      >
        <Text
          style={{
            fontFamily: fonts.heavy,
            fontSize: 13,
            color: selected ? colors.onHero : colors.muted,
          }}
        >
          {label}
        </Text>
        <Text
          style={[type.amount, { fontSize: 24, lineHeight: 28, color: fg }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {amount}
        </Text>
        <Text style={[type.small, { color: selected ? colors.onHero : colors.muted }]}>
          {people} {people === 1 ? "person" : "people"}
        </Text>
      </Sticker>
    </Pressable>
  );
}

function DebtRowView({ debt, day, first }: { debt: DebtRow; day: string; first: boolean }) {
  const { colors } = useTheme();
  const open = debt.status === "open";
  const partly = open && debt.repaidSen > 0 && debt.principalSen > 0;
  const late = open && debt.dueDate !== null && debt.dueDate < day;
  const line = !open
    ? debt.status === "written_off"
      ? "Written off"
      : "Paid back in full"
    : partly
      ? `${formatRM(debt.repaidSen)} of ${formatRM(debt.principalSen)} paid back`
      : debt.fromBefore
        ? "From before Brokely"
        : debt.origin
          ? `${debt.origin.label}, ${dayMonth(debt.origin.date)}`
          : null;
  const due = open && debt.dueDate ? `${late ? "Was due" : "Due"} ${dayMonth(debt.dueDate)}` : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${debt.name}, ${formatRM(open ? debt.outstandingSen : debt.principalSen)}${line ? `, ${line}` : ""}${due ? `, ${due}` : ""}. Open`}
      onPress={() => router.push(`/debts/${debt.id}`)}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 12,
        paddingVertical: 12,
        paddingLeft: 12,
        paddingRight: space.md,
        borderTopWidth: first ? 0 : 2,
        borderTopColor: colors.background,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Avatar size={44} name={debt.name} signedIn={false} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Text
            style={{
              flex: 1,
              fontFamily: fonts.heavy,
              fontSize: 16,
              lineHeight: 22,
              color: colors.text,
            }}
            numberOfLines={1}
          >
            {debt.name}
          </Text>
          <Text
            style={{
              fontFamily: fonts.heavy,
              fontSize: 16,
              color: colors.text,
              fontVariant: ["tabular-nums"],
            }}
          >
            {formatRM(open ? debt.outstandingSen : debt.principalSen)}
          </Text>
        </View>
        {partly ? <ProgressBar fraction={debt.repaidSen / debt.principalSen} /> : null}
        {line ? <Text style={[type.small, { color: colors.muted }]}>{line}</Text> : null}
        {due ? (
          <Text
            style={{
              fontFamily: fonts.heavy,
              fontSize: 13,
              color: late ? colors.warning : colors.muted,
            }}
          >
            {due}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** No debts either way: say it warmly, and put the two common starts one tap away. */
function AllSquare({ onAdd }: { onAdd: (side: Side) => void }) {
  const { colors } = useTheme();
  return (
    <PageScreen title="Debts">
      <Image
        source={require("../../assets/mascot/main_design.webp")}
        style={{ width: "100%", height: 160 }}
        resizeMode="contain"
        accessibilityLabel="Brokely"
      />
      <Sticker style={{ padding: space.md, gap: space.xs, alignItems: "center" }}>
        <Text
          style={[
            type.heading,
            { fontSize: 24, lineHeight: 28, color: colors.text, textAlign: "center" },
          ]}
          accessibilityRole="header"
        >
          All square! 🤝
        </Text>
        <Text style={[type.body, { color: colors.muted, textAlign: "center" }]}>
          Nobody owes you and you owe nobody. If you split a bill or lend money, I'll keep track.
        </Text>
      </Sticker>
      <Button label="Someone owes me" onPress={() => onAdd("to_me")} />
      <Button label="I owe someone" variant="secondary" onPress={() => onAdd("by_me")} />
      <Text style={[type.small, { color: colors.muted, textAlign: "center" }]}>
        Splitting a bill? Use + and switch on "Split with a friend".
      </Text>
    </PageScreen>
  );
}
