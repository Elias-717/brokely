import { inclusiveEnd, midMonthStart, offersCatchUp } from "@brokely/domain";
import { Redirect, router } from "expo-router";
import { Text, View } from "react-native";
import { dayMonth, today } from "../../src/lib/today";
import { Screen } from "../../src/ui/components";
import { ChoiceCard, Header } from "../../src/ui/form";
import { space, type } from "../../src/ui/theme";
import { useTheme } from "../../src/ui/theme-context";

/**
 * S1c "Already spent some this month?" (FR-PLN-21, D-25). Shown after "Let's go" on any day
 * except the 1st; both choices are honest because progress counts from today (R-12).
 */
export default function QuickStartChoice() {
  const { colors } = useTheme();
  const day = today();
  if (!offersCatchUp(day)) return <Redirect href="/quick-start/fresh" />;
  const monthEnd = inclusiveEnd(midMonthStart(day, "fresh").range);

  return (
    <Screen>
      <Header title="Quick start" onBack={() => router.replace("/")} />
      <Text style={[type.title, { color: colors.text }]}>
        It's {dayMonth(day)}. Already spent some of this month's money?
      </Text>
      <View style={{ gap: space.md }}>
        <ChoiceCard
          title="Start fresh from today"
          detail={`Tell me what's left until ${dayMonth(monthEnd)}. Easiest.`}
          onPress={() => router.push("/quick-start/fresh")}
        />
        <ChoiceCard
          title="Catch me up"
          detail="Plan the whole month and add roughly what's already gone, in one go."
          onPress={() => router.push("/quick-start/catch-up")}
        />
      </View>
      <Text style={[type.body, { color: colors.muted }]}>
        Either way, your days count from today. Missing the first part of the month is fine.
      </Text>
    </Screen>
  );
}
