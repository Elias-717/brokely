import type { ColorValue } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

/** Stroke icons for the tab bar (D-31): the same shapes as the style mockups. */
export type IconName = "home" | "records" | "plus" | "insights" | "more";

export function Icon({
  name,
  color,
  size = 24,
  strokeWidth = 2.5,
}: {
  name: IconName;
  color: ColorValue;
  size?: number;
  strokeWidth?: number;
}) {
  const stroke = {
    stroke: color,
    strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    fill: "none",
  } as const;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      {name === "home" && (
        <Path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" {...stroke} />
      )}
      {name === "records" && (
        <Path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" {...stroke} />
      )}
      {name === "plus" && <Path d="M12 5v14M5 12h14" {...stroke} />}
      {name === "insights" && <Path d="M4 20V10M10 20V4M16 20v-7M22 20H2" {...stroke} />}
      {name === "more" && (
        <>
          <Circle cx="5" cy="12" r="1.2" {...stroke} />
          <Circle cx="12" cy="12" r="1.2" {...stroke} />
          <Circle cx="19" cy="12" r="1.2" {...stroke} />
        </>
      )}
    </Svg>
  );
}
