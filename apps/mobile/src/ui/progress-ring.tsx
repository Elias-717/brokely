import { useEffect, useRef } from "react";
import { Animated, Easing, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useReduceMotion } from "./motion";
import { fonts } from "./theme";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * A ring showing how much of something is used (D-58: the budget on Home). `arc` is 0…1 and
 * already capped; `label` is the real figure, e.g. "125%". The arc fills in once, gently, and
 * not at all with Reduce motion. Screen readers hear `accessibilityLabel`.
 */
export function ProgressRing({
  arc,
  label,
  caption,
  size,
  color,
  track,
  textColor,
  mutedColor,
  accessibilityLabel,
}: {
  arc: number;
  label: string;
  caption: string;
  size: number;
  color: string;
  track: string;
  textColor: string;
  mutedColor: string;
  accessibilityLabel: string;
}) {
  const reduce = useReduceMotion();
  const stroke = Math.max(8, Math.round(size * 0.11));
  const r = (size - stroke) / 2;
  const length = 2 * Math.PI * r;
  const shown = useRef(new Animated.Value(reduce ? arc : 0)).current;

  useEffect(() => {
    Animated.timing(shown, {
      toValue: arc,
      duration: reduce ? 0 : 700,
      easing: Easing.out(Easing.cubic),
      // strokeDashoffset is not a transform, so this runs on the JS thread; it is one value.
      useNativeDriver: false,
    }).start();
  }, [arc, reduce, shown]);

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${length} ${length}`}
          strokeDashoffset={shown.interpolate({ inputRange: [0, 1], outputRange: [length, 0] })}
        />
      </Svg>
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{ fontFamily: fonts.heading, fontSize: size * 0.24, color: textColor }}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {label}
        </Text>
        <Text style={{ fontFamily: fonts.bold, fontSize: 12, color: mutedColor }}>{caption}</Text>
      </View>
    </View>
  );
}
