import Svg, { Path } from "react-native-svg";
import { ICON_PATHS, type IconName } from "./icon-paths";
import { useTheme } from "./theme-context";

export type { IconName } from "./icon-paths";

/**
 * A Brokely icon (D-108): Phosphor duotone, the outline in ink and the soft fill in broccoli
 * green, so it matches the cards' thick outlines in light and dark. Decorative: the label next
 * to it says what it is, so screen readers skip it.
 */
export function Icon({
  name,
  size = 24,
  color,
  accent,
}: {
  name: IconName;
  size?: number;
  color?: string;
  accent?: string;
}) {
  const { colors } = useTheme();
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {ICON_PATHS[name].map((p, i) =>
        "soft" in p ? (
          <Path key={i} d={p.d} fill={accent ?? colors.primary} opacity={0.3} />
        ) : (
          <Path key={i} d={p.d} fill={color ?? colors.text} />
        ),
      )}
    </Svg>
  );
}
