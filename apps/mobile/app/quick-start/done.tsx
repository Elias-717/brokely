import { daysBetween, localDate, sen, spendingByCategory, totalSpending } from "@brokely/domain";
import { findCycleOn, getNickname, getPlan, listDebts, listTransactions } from "@brokely/local-db";
import { Redirect, router } from "expo-router";
import { useMemo } from "react";
import { Image, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useRead } from "../../src/db/use-read";
import { brokely, plain } from "../../src/lib/brokely-lines";
import { today } from "../../src/lib/today";
import { Button, Screen, Sticker } from "../../src/ui/components";
import { Appear, Bounce } from "../../src/ui/motion";
import { fonts, space, type } from "../../src/ui/theme";
import { useTheme } from "../../src/ui/theme-context";

/**
 * "Your plan is set" (D-33): a short celebration between quick start and Home. The numbers are
 * read back from the saved plan: left in plan = budget − spending so far (BR-12), over the days
 * from today to the end of the cycle.
 */
export default function PlanIsSet() {
  const { colors } = useTheme();
  const day = useMemo(() => today(), []);
  const nickname = useRead(getNickname);
  const summary = useRead((db) => {
    const cycle = findCycleOn(db, day);
    const plan = cycle ? getPlan(db, cycle.id) : undefined;
    if (!cycle || !plan) return null;
    const directions = new Map(listDebts(db).map((d) => [d.id, d.direction]));
    const spent = totalSpending(
      spendingByCategory(
        listTransactions(db, { start: cycle.startDate, endExclusive: cycle.endDateExclusive }),
        (id) => directions.get(id),
      ),
    );
    return {
      left: sen(plan.revision.budgetSen - spent),
      days: daysBetween(day, localDate(cycle.endDateExclusive)),
    };
  });
  if (!summary) return <Redirect href="/" />;

  const title = brokely.planIsSet(nickname);
  const line = brokely.planSummary(summary.left, summary.days);

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: space.lg }}>
        <Appear>
          <Sticker style={{ padding: space.md, gap: space.xs, alignItems: "center" }}>
            <Text style={[type.title, { color: colors.text, textAlign: "center" }]}>
              {plain(title)}
            </Text>
            <Text
              accessibilityLabel={plain(line)}
              style={[
                type.body,
                { color: colors.text, textAlign: "center", fontSize: 17, lineHeight: 24 },
              ]}
            >
              {line.map((part, i) =>
                typeof part === "string" ? (
                  part
                ) : (
                  <Text key={i} style={{ fontFamily: fonts.heavy }}>
                    {part.b}
                  </Text>
                ),
              )}
            </Text>
          </Sticker>
        </Appear>
        <Bounce>
          <View>
            <Svg width={280} height={280} viewBox="0 0 300 300" style={{ position: "absolute" }}>
              <Path
                d="M40 70l14 14M54 70l-14 14M250 50v22M239 61h22M262 210l12 12M274 210l-12 12M30 200v18M21 209h18"
                stroke={colors.primary}
                strokeWidth={5}
                strokeLinecap="round"
                fill="none"
              />
            </Svg>
            <Image
              source={require("../../assets/mascot/main_design.webp")}
              style={{ width: 280, height: 280 }}
              resizeMode="contain"
              accessibilityLabel="Brokely, pleased"
            />
          </View>
        </Bounce>
      </View>
      <View style={{ paddingBottom: space.md, gap: space.xs }}>
        <Button label="Show me my plan" onPress={() => router.replace("/")} />
        {/* The detailed way to plan, offered once the student has a plan (D-75). */}
        <Button
          label="Want to fine-tune it? Plan it step by step"
          variant="link"
          onPress={() => router.replace("/guided")}
        />
      </View>
    </Screen>
  );
}
