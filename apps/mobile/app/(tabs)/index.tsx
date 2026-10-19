import { formatRM, type Sen } from "@brokely/domain";
import { dismissCard, getNickname, postponeCard } from "@brokely/local-db";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { repo } from "../../src/db/client";
import { useRead } from "../../src/db/use-read";
import { essentialMeta } from "../../src/lib/essentials-meta";
import { readHome } from "../../src/lib/home-model";
import { dayMonth, today, weekdayName } from "../../src/lib/today";
import { BrokelyAvatar } from "../../src/ui/chat";
import { Button, Screen, Sticker } from "../../src/ui/components";
import { fonts, space, type } from "../../src/ui/theme";
import { useTheme } from "../../src/ui/theme-context";

/** A forecast bound is a whole RM10 step (R-10), so it reads best without sen. */
const wholeRM = (amount: Sen) => `RM${Math.round(amount / 100)}`;

/**
 * S3a Home (FR-INS-01, FR-INS-06, FR-INS-07, FR-PLN-20, D-24, D-28, D-30, D-35, D-37):
 * left in plan first, then the next essential card, still to come and spending so far.
 */
export default function HomeScreen() {
  const { colors } = useTheme();
  const day = today();
  const home = useRead((db) => readHome(db, day), [day]);
  const nickname = useRead(getNickname);

  const header = (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <View style={{ gap: 2, flex: 1 }}>
        <Text
          style={[
            type.small,
            { color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 },
          ]}
        >
          {weekdayName(day)}, {dayMonth(day)}
          {home.kind === "plan" ? ` · day ${home.dayOfPlan} of ${home.planDays}` : ""}
        </Text>
        <Text style={[type.title, { color: colors.text }]}>
          {nickname ? `Hi, ${nickname}` : "Hi there"}
        </Text>
      </View>
      <BrokelyAvatar size={56} />
    </View>
  );

  if (home.kind === "no-plan") {
    // Track-first is fine (FR-PLN-04); offer a plan without pushing.
    return (
      <Screen>
        {header}
        <Sticker style={{ padding: space.md, gap: space.sm }}>
          <Text style={[type.heading, { color: colors.text }]}>No plan yet</Text>
          <Text style={[type.body, { color: colors.muted }]}>
            You can log spending without one. When you're ready, Brokely will set one up with you in
            a minute.
          </Text>
          <Button label="Make a plan" onPress={() => router.push("/quick-start")} />
        </Sticker>
      </Screen>
    );
  }

  const meta = home.card ? essentialMeta(home.card.name) : null;
  const spentShare =
    home.budgetSen > 0 ? Math.min(1, Math.max(0, home.spentSen / home.budgetSen)) : 0;

  return (
    <Screen>
      {header}

      {/* Left in plan (FR-INS-01) */}
      <Sticker
        offset={4}
        background={colors.hero}
        outline={colors.heroOutline}
        style={{ padding: space.md, gap: space.sm }}
      >
        <Text style={[type.strong, { color: colors.onHero, fontSize: 14 }]}>Left in plan</Text>
        <Text
          style={[type.amount, { color: colors.onHero }]}
          accessibilityLabel={`Left in plan: ${formatRM(home.leftInPlanSen)}`}
        >
          {formatRM(home.leftInPlanSen)}
        </Text>
        <Text style={[type.body, { color: colors.onHero, fontSize: 14 }]}>
          of {formatRM(home.budgetSen)} · {formatRM(home.spentSen)} spent · {home.daysLeft}{" "}
          {home.daysLeft === 1 ? "day" : "days"} left
        </Text>
        <View
          style={{
            height: 12,
            borderRadius: 99,
            borderWidth: 2,
            borderColor: colors.shadow,
            backgroundColor: colors.heroTrack,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              width: `${spentShare * 100}%`,
              height: "100%",
              backgroundColor: colors.heroFill,
            }}
          />
        </View>
        {home.forecast.kind === "waiting" ? (
          <Text style={[type.small, { color: colors.onHero, opacity: 0.9 }]}>
            Forecast shows from day 14
          </Text>
        ) : home.forecast.kind === "shown" ? (
          <Text style={[type.small, { color: colors.onHero }]}>
            {home.forecast.value.pace === "on_track" ? "On pace" : "Over pace"} · forecast{" "}
            {wholeRM(home.forecast.value.lowSen)} – {wholeRM(home.forecast.value.highSen)}
          </Text>
        ) : null}
      </Sticker>

      {/* The next essential card, one at a time (FR-PLN-20, D-30, D-35) */}
      {home.card && meta ? (
        <Sticker background={colors.cardTint} style={{ padding: space.md, gap: space.md }}>
          <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-start" }}>
            <BrokelyAvatar size={40} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[type.small, { color: colors.muted, textTransform: "uppercase" }]}>
                Essentials · {home.card.position} of {home.card.total}
              </Text>
              <Text style={[type.body, { color: colors.text }]}>
                {home.card.position === 1 ? "Let's cover your essentials. Up next: " : "Up next: "}
                <Text style={{ fontFamily: fonts.heavy }}>{home.card.name}</Text> {meta.emoji}
              </Text>
            </View>
          </View>
          <View
            style={{ flexDirection: "row", gap: space.sm, alignItems: "center", flexWrap: "wrap" }}
          >
            <Button
              label="Add"
              onPress={() => router.push(`/essential/${home.card!.categoryId}`)}
            />
            <Button
              label="Not for me"
              variant="secondary"
              onPress={() => dismissCard(repo, home.cycleId, home.card!.categoryId)}
            />
            <Button
              label="Later"
              variant="link"
              onPress={() => postponeCard(repo, home.cycleId, home.card!.categoryId)}
            />
          </View>
        </Sticker>
      ) : null}

      {/* Still to come, separate from spending (FR-INS-07) */}
      <Sticker style={{ padding: space.md, gap: space.sm }}>
        <View
          style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}
        >
          <Text style={[type.heading, { color: colors.text }]}>Still to come</Text>
          {home.stillToCome.length > 0 ? (
            <Text style={[type.strong, { color: colors.text }]}>
              {formatRM(home.stillToComeSen)}
            </Text>
          ) : null}
        </View>
        {home.stillToCome.length === 0 ? (
          <Text style={[type.body, { color: colors.muted, fontSize: 14 }]}>
            Nothing yet. Bills with a set date, like a phone plan, show up here.
          </Text>
        ) : (
          home.stillToCome.slice(0, 3).map((item) => (
            <View key={item.id} style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={[type.body, { color: colors.text }]}>
                {item.name} · {item.dueDate === day ? "today" : dayMonth(item.dueDate)}
              </Text>
              <Text style={[type.strong, { color: colors.text, fontVariant: ["tabular-nums"] }]}>
                {formatRM(item.amountSen)}
              </Text>
            </View>
          ))
        )}
      </Sticker>

      {/* Spending so far (FR-INS-02) */}
      <View style={{ gap: space.xs, paddingHorizontal: space.xs, paddingBottom: space.lg }}>
        <Text style={[type.heading, { color: colors.text }]}>Spent so far</Text>
        {home.spentByCategory.length === 0 ? (
          <Pressable onPress={() => router.push("/quick-add")} accessibilityRole="button">
            <Text style={[type.body, { color: colors.muted, fontSize: 14 }]}>
              Nothing logged yet. Tap + when you spend.
            </Text>
          </Pressable>
        ) : (
          home.spentByCategory.slice(0, 5).map((c) => (
            <View key={c.name} style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={[type.strong, { color: colors.text }]}>{c.name}</Text>
              <Text style={[type.strong, { color: colors.text, fontVariant: ["tabular-nums"] }]}>
                {formatRM(c.amountSen)}
              </Text>
            </View>
          ))
        )}
      </View>
    </Screen>
  );
}
