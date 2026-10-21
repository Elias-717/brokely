import { formatRM, sen } from "@brokely/domain";
import { Text, View } from "react-native";
import { space, type } from "./theme";
import { useTheme } from "./theme-context";

/** One part of the budget: essentials, optional, set aside, or not planned. */
export type SplitPart = { label: string; value: number; color: string };

/**
 * The budget split as one bar with a legend, drawn on the green hero card (Your plan, review
 * step of Plan step by step; D-81). The bar is the budget, or everything planned when that's
 * more; `overSen` adds "· RM x over budget".
 */
export function PlanSplit({
  parts,
  budgetSen,
  overSen,
}: {
  parts: readonly SplitPart[];
  budgetSen: number;
  overSen: number;
}) {
  const { colors } = useTheme();
  const shown = parts.filter((p) => p.value > 0);
  const whole = Math.max(
    budgetSen,
    shown.reduce((sum, p) => sum + p.value, 0),
    1,
  );
  return (
    <>
      <View
        style={{
          flexDirection: "row",
          height: 14,
          borderRadius: 7,
          borderWidth: 1.5,
          borderColor: colors.onHero,
          overflow: "hidden",
          marginTop: space.xs,
        }}
      >
        {shown.map((p) => (
          <View key={p.label} style={{ flex: p.value / whole, backgroundColor: p.color }} />
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 10, rowGap: 2 }}>
        {shown.map((p) => (
          <View key={p.label} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                borderWidth: 1,
                borderColor: colors.onHero,
                backgroundColor: p.color,
              }}
            />
            <Text style={[type.small, { color: colors.onHero }]}>
              {p.label} {formatRM(sen(p.value))}
            </Text>
          </View>
        ))}
        {overSen > 0 ? (
          <Text style={[type.small, { color: colors.onHero }]}>
            · {formatRM(sen(overSen))} over budget
          </Text>
        ) : null}
      </View>
    </>
  );
}
