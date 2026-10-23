import type { ColorValue } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

/**
 * Stroke icons (D-31): the tab bar, plus the backup states and edit (S13h–S13k).
 * The cloud shapes follow the Figma designs.
 */
export type IconName =
  | "home"
  | "records"
  | "plus"
  | "insights"
  | "more"
  | "cloud"
  | "cloud-check"
  | "cloud-upload"
  | "cloud-off"
  | "cloud-alert"
  | "pencil"
  | "sprout";

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
      {name === "cloud" && (
        <Path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" {...stroke} />
      )}
      {name === "cloud-check" && (
        <Path
          d="m17 15-5.5 5.5L9 18M5 17.743A7 7 0 1 1 15.71 10h1.79a4.5 4.5 0 0 1 1.5 8.742"
          {...stroke}
        />
      )}
      {name === "cloud-upload" && (
        <Path
          d="M12 13v8M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242M8 17l4-4 4 4"
          {...stroke}
        />
      )}
      {name === "cloud-off" && (
        <Path
          d="m2 2 20 20M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193M21.532 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7.008 7.008 0 0 0 10 5.07"
          {...stroke}
        />
      )}
      {name === "cloud-alert" && (
        <Path d="M12 12v4M12 20h.01M17 18h.5a1 1 0 0 0 0-9h-1.79A7 7 0 1 0 7 17.708" {...stroke} />
      )}
      {name === "pencil" && (
        <Path
          d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"
          {...stroke}
        />
      )}
      {name === "sprout" && (
        <Path
          d="M7 20h10M10 20c5.5-2.5.8-6.4 3-10M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8zM14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"
          {...stroke}
        />
      )}
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
