import { Text, View } from "react-native";
import { space, type } from "./theme";
import { useTheme } from "./theme-context";

/**
 * A thin outlined bar with a label: the forecast's day count (Insights), what's been paid back
 * (Debts). `onHero` draws it light on the green hero card.
 */
export function ProgressBar({
  fraction,
  label,
  onHero,
}: {
  fraction: number;
  label?: string;
  onHero?: boolean;
}) {
  const { colors } = useTheme();
  const percent = Math.max(4, Math.min(100, fraction * 100));
  return (
    <View style={{ gap: 4, marginTop: space.xs }} accessible={!!label} accessibilityLabel={label}>
      <View
        style={{
          height: 10,
          borderRadius: 5,
          borderWidth: 1.5,
          borderColor: onHero ? colors.onHero : colors.outline,
          backgroundColor: onHero ? colors.heroTile : colors.background,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            width: `${percent}%`,
            height: "100%",
            backgroundColor: onHero ? colors.onHero : colors.primary,
          }}
        />
      </View>
      {label ? (
        <Text style={[type.small, { color: onHero ? colors.onHero : colors.muted }]}>{label}</Text>
      ) : null}
    </View>
  );
}
