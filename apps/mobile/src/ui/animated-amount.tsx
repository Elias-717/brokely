import { formatRM, sen, type Sen } from "@brokely/domain";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Text, type StyleProp, type TextStyle } from "react-native";
import { useReduceMotion } from "./motion";

/**
 * An amount that rolls up to its value: from RM0.00 when the screen opens, then from the old
 * value to the new one whenever it changes. Each frame shows whole sen and the last frame is
 * exactly the value, so it never shows a wrong amount at rest (rules 1 and 2). Screen readers
 * get only the real amount; with Reduce motion on, it simply shows the value.
 */
export function AnimatedAmount({
  value,
  style,
  prefix = "",
  durationMs = 800,
  accessibilityLabel,
}: {
  value: Sen;
  style?: StyleProp<TextStyle>;
  prefix?: string;
  durationMs?: number;
  accessibilityLabel?: string;
}) {
  const reduce = useReduceMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const from = useRef(0);
  const [shown, setShown] = useState<number>(reduce ? value : 0);

  useEffect(() => {
    if (reduce) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = from.current;
    progress.setValue(0);
    const id = progress.addListener(({ value: t }) =>
      setShown(Math.round(start + (value - start) * t)),
    );
    Animated.timing(progress, {
      toValue: 1,
      duration: durationMs,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(() => {
      from.current = value;
      setShown(value); // land exactly on the value
    });
    return () => progress.removeListener(id);
  }, [value, reduce, durationMs, progress]);

  return (
    <Text style={style} accessibilityLabel={accessibilityLabel ?? `${prefix}${formatRM(value)}`}>
      {prefix}
      {formatRM(sen(shown))}
    </Text>
  );
}
