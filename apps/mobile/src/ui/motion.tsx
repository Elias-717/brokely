import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Text,
  View,
  type StyleProp,
  type TextStyle,
} from "react-native";

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

/**
 * Types its text out one character at a time with a blinking cursor, like Brokely is typing
 * (Welcome greeting). The full text is laid out invisibly underneath, so nothing below jumps
 * while it types. Screen readers get the whole text at once; with Reduce motion it just shows.
 * Emoji count as one character (Array.from splits by code point).
 */
export function TypeText({
  text,
  style,
  delay = 0,
  perCharMs = 45,
  onDone,
}: {
  text: string;
  style: StyleProp<TextStyle>;
  delay?: number;
  perCharMs?: number;
  onDone?: () => void;
}) {
  const reduce = useReduceMotion();
  const chars = Array.from(text);
  const [shown, setShown] = useState(0);
  const [cursorOn, setCursorOn] = useState(true);
  const done = reduce || shown >= chars.length;

  useEffect(() => {
    if (reduce) {
      onDone?.();
      return;
    }
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      i += 1;
      setShown(i);
      if (i < chars.length) timer = setTimeout(step, perCharMs);
      else onDone?.();
    };
    timer = setTimeout(step, delay);
    return () => clearTimeout(timer);
    // Types once per text; a parent re-render must not restart it.
  }, [reduce, text]);

  useEffect(() => {
    if (done) return;
    const blink = setInterval(() => setCursorOn((on) => !on), 400);
    return () => clearInterval(blink);
  }, [done]);

  return (
    <View accessible accessibilityLabel={text}>
      {/* Takes the final size, so the layout is still while typing. */}
      <Text style={[style, { opacity: 0 }]} importantForAccessibility="no-hide-descendants">
        {text}
      </Text>
      <Text
        style={[style, { position: "absolute", top: 0, left: 0, right: 0 }]}
        importantForAccessibility="no-hide-descendants"
      >
        {done ? text : chars.slice(0, shown).join("")}
        {done ? null : <Text style={{ opacity: cursorOn ? 1 : 0 }}>|</Text>}
      </Text>
    </View>
  );
}

/**
 * Brokely's idle motion on Welcome: a quick pop in, then a slow bob and sway, forever.
 * Transform only, on the native thread, so it costs almost nothing. Still with Reduce motion.
 */
export function Float({ children }: { children: ReactNode }) {
  const reduce = useReduceMotion();
  const pop = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) {
      pop.setValue(1);
      return;
    }
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(bob, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, pop, bob]);
  return (
    <Animated.View
      style={{
        opacity: pop,
        transform: [
          { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
          { translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) },
          { rotate: bob.interpolate({ inputRange: [0, 1], outputRange: ["-2deg", "2deg"] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}
