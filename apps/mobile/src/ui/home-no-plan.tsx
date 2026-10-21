import { formatRM, type Sen } from "@brokely/domain";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { Button, Sticker } from "./components";
import { Appear, TypeText } from "./motion";
import { fonts, space, type } from "./theme";
import { useTheme } from "./theme-context";

/**
 * Home without a plan (FR-PLN-04, D-78). Encouraging, never "no plan yet": what a plan adds is
 * shown as a reward, with ticks (no emojis on Home).
 */

const BENEFITS = ["What's left, every day", "A daily guide", "Bill dates"] as const;

function Tick({ size = 22 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.primary,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontFamily: fonts.heavy, fontSize: size * 0.6, color: colors.onPrimary }}>
        ✓
      </Text>
    </View>
  );
}

/** First visit, nothing added yet: Brokely says hello and points to one first step. */
export function FirstVisit() {
  const { colors } = useTheme();
  return (
    <>
      <Appear>
        <Sticker style={{ padding: space.md, gap: space.xs, alignItems: "center" }}>
          <View accessibilityRole="header">
            <TypeText
              text="Nice to meet you!"
              delay={250}
              style={[
                type.heading,
                { fontSize: 24, lineHeight: 28, color: colors.text, textAlign: "center" },
              ]}
            />
          </View>
          <Text style={[type.body, { color: colors.muted, textAlign: "center" }]}>
            Add what you spend today and I'll start showing you where your money goes.
          </Text>
        </Sticker>
      </Appear>
      <Button label="+ Add my first spending" onPress={() => router.push("/quick-add")} />
      <Appear delay={300}>
        <View style={{ gap: space.sm }}>
          <Text
            style={{
              fontFamily: fonts.heavy,
              fontSize: 13,
              letterSpacing: 0.5,
              color: colors.muted,
            }}
          >
            WANT MORE? A PLAN ADDS
          </Text>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            {BENEFITS.map((b) => (
              <View
                key={b}
                style={{
                  flex: 1,
                  backgroundColor: colors.cardTint,
                  borderRadius: 12,
                  padding: 10,
                  gap: 6,
                  alignItems: "center",
                }}
              >
                <Tick />
                <Text
                  style={{
                    fontFamily: fonts.heavy,
                    fontSize: 12,
                    lineHeight: 16,
                    color: colors.text,
                    textAlign: "center",
                  }}
                >
                  {b}
                </Text>
              </View>
            ))}
          </View>
          <Button
            label="Make a plan · about 1 minute"
            variant="secondary"
            onPress={() => router.push("/quick-start")}
          />
        </View>
      </Appear>
    </>
  );
}

/** Tracking without a plan, with records: the month so far leads, then a friendly plan card. */
export function MonthSoFar({
  month,
}: {
  month: { spentSen: Sen; records: number; top: string | null };
}) {
  const { colors, scheme } = useTheme();
  const line =
    month.records === 0
      ? "Nothing added yet this month"
      : `${month.records} ${month.records === 1 ? "record" : "records"}${month.top ? ` · mostly ${month.top}` : ""}`;
  return (
    <>
      <View
        accessible
        accessibilityLabel={`This month so far: ${formatRM(month.spentSen)}. ${line}`}
        style={{
          backgroundColor: colors.hero,
          borderRadius: 24,
          borderWidth: scheme === "dark" ? 1 : 2,
          borderColor: colors.heroOutline,
          padding: 20,
          gap: space.xs,
        }}
      >
        <Text style={[type.strong, { color: colors.onHero, fontSize: 15, opacity: 0.9 }]}>
          This month so far
        </Text>
        <Text style={[type.amount, { color: colors.onHero, fontSize: 40, lineHeight: 44 }]}>
          {formatRM(month.spentSen)}
        </Text>
        <Text style={[type.body, { color: colors.onHero, fontSize: 14, opacity: 0.9 }]}>
          {line}
        </Text>
      </View>
      <Sticker style={{ padding: space.md, gap: space.sm }}>
        <Text style={[type.heading, { color: colors.text }]}>Ready for a plan?</Text>
        <View style={{ gap: 6 }}>
          {[...BENEFITS.slice(0, 2), "Bill dates and reminders"].map((b) => (
            <View key={b} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <Tick size={20} />
              <Text style={[type.strong, { color: colors.text }]}>{b}</Text>
            </View>
          ))}
        </View>
        <Button
          label="Make a plan · 1 min"
          variant="secondary"
          onPress={() => router.push("/quick-start")}
        />
      </Sticker>
    </>
  );
}
