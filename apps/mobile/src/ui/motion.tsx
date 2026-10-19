import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing } from "react-native";

/**
 * Gentle motion only (D-33). Everything here respects the phone's "Reduce motion" setting:
 * when it is on, things simply appear.
 */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduce);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}

/** Fades and slides its children up a little when first shown. */
export function Appear({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const reduce = useReduceMotion();
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: reduce ? 0 : 260,
      delay: reduce ? 0 : delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress, reduce, delay]);
  return (
    <Animated.View
      style={{
        opacity: progress,
        transform: [
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

/** A small happy bounce, repeated once (the "plan is set" moment). */
export function Bounce({ children }: { children: ReactNode }) {
  const reduce = useReduceMotion();
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return;
    const hop = Animated.sequence([
      Animated.timing(y, {
        toValue: -14,
        duration: 220,
        useNativeDriver: true,
        easing: Easing.out(Easing.quad),
      }),
      Animated.timing(y, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
        easing: Easing.bounce,
      }),
    ]);
    Animated.sequence([Animated.delay(250), hop, Animated.delay(120), hop]).start();
  }, [reduce, y]);
  return <Animated.View style={{ transform: [{ translateY: y }] }}>{children}</Animated.View>;
}
