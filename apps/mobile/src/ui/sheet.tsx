import { router } from "expo-router";
import { useMemo, useRef, type ReactNode } from "react";
import {
  Animated,
  Keyboard,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReduceMotion } from "./motion";
import { useKeyboardHeight } from "./use-keyboard";
import { fonts, radius, space, type } from "./theme";
import { KeyboardSafe, useAvailableHeight } from "./keyboard-safe";
import { KeyboardScroll } from "./keyboard-scroll";
import { useTheme } from "./theme-context";

/**
 * A bottom sheet over the current screen (U-10: Mark paid, Write off, Wallet check). Tapping the
 * dimmed area or sliding the top down closes it. `footer` stays below the scrolling part, e.g. the keypad and Save.
 */
export function SheetShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <KeyboardSafe style={{ justifyContent: "flex-end" }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={() => router.back()}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(5,6,5,0.55)",
        }}
      />
      <SheetPanel
        top={
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text style={[type.heading, { color: colors.text }]} accessibilityRole="header">
              {title}
            </Text>
            {subtitle ? (
              <Text
                style={[type.small, { color: colors.muted, flexShrink: 1, textAlign: "right" }]}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
        }
      >
        {children ? (
          <KeyboardScroll
            style={{ flexGrow: 0, flexShrink: 1 }}
            contentContainerStyle={{ gap: space.sm }}
          >
            {children}
          </KeyboardScroll>
        ) : null}
        {footer}
      </SheetPanel>
    </KeyboardSafe>
  );
}

/** How far down (dp) or how fast (dp/ms) a drag must go to close the sheet. */
const CLOSE_DISTANCE = 120;
const CLOSE_VELOCITY = 0.8;

/**
 * The sliding part of every bottom sheet. Dragging down on its top part (the handle bar and
 * whatever `top` holds, e.g. the title or amount) moves the sheet with the finger; past a
 * threshold, or with a quick flick, it slides away and closes; otherwise it springs back.
 * Taps still reach buttons in `top`: the drag only starts once the finger moves down.
 * The handle is also a "Close" button for screen readers.
 */
export function SheetPanel({ top, children }: { top?: ReactNode; children?: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  // A real number, not "94%": a percentage never limited the sheet, and tall sheets ran off the
  // top with the keypad drawn over them. KeyboardSafe measures the room above the keyboard.
  const { height: screenHeight } = useWindowDimensions();
  const keyboard = useKeyboardHeight();
  const available = useAvailableHeight();
  const maxHeight = (available > 0 ? available : screenHeight - keyboard) - insets.top - space.md;
  const offset = useRef(new Animated.Value(0)).current;

  const drag = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderGrant: () => Keyboard.dismiss(),
        onPanResponderMove: (_, g) => offset.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_, g) => {
          if (g.dy > CLOSE_DISTANCE || g.vy > CLOSE_VELOCITY) {
            Animated.timing(offset, {
              toValue: 1000,
              duration: reduce ? 0 : 180,
              useNativeDriver: true,
            }).start(() => router.back());
          } else {
            Animated.spring(offset, { toValue: 0, useNativeDriver: true }).start();
          }
        },
        onPanResponderTerminate: () =>
          Animated.spring(offset, { toValue: 0, useNativeDriver: true }).start(),
      }),
    [offset, reduce],
  );

  return (
    <Animated.View
      style={{
        maxHeight,
        backgroundColor: colors.background,
        borderTopWidth: 2,
        borderColor: colors.outline,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: space.md,
        // The keyboard covers the gesture bar, so its inset is only needed while it's closed.
        paddingBottom: (keyboard > 0 ? 0 : insets.bottom) + space.md,
        gap: space.sm,
        transform: [{ translateY: offset }],
      }}
    >
      <View {...drag.panHandlers} style={{ gap: space.sm }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          accessibilityHint="Or slide the top of the sheet down"
          onPress={() => router.back()}
          style={{ alignItems: "center", justifyContent: "center", height: 24 }}
        >
          <View
            style={{
              width: 44,
              height: 5,
              borderRadius: 99,
              backgroundColor: colors.muted,
              opacity: 0.5,
            }}
          />
        </Pressable>
        {top}
      </View>
      {children}
    </Animated.View>
  );
}

/** The big amount at the top of a sheet. */
export function SheetAmount({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <Text
      style={{
        textAlign: "center",
        fontFamily: fonts.heading,
        fontSize: 48,
        lineHeight: 54,
        color: colors.text,
        fontVariant: ["tabular-nums"],
      }}
    >
      {text}
    </Text>
  );
}

/** A tinted box explaining what a save will do, e.g. "Counts as spending in Laundry". */
export function SheetNote({ title, detail }: { title: string; detail?: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        borderRadius: radius.button,
        borderWidth: 2,
        borderColor: colors.outline,
        backgroundColor: colors.cardTint,
        padding: space.sm,
        gap: 2,
      }}
    >
      <Text style={[type.strong, { color: colors.text }]}>{title}</Text>
      {detail ? <Text style={[type.small, { color: colors.muted }]}>{detail}</Text> : null}
    </View>
  );
}

/** A date button: "📅 Today, 20 Oct". */
export function DateButton({
  label,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={{
        minHeight: 48,
        justifyContent: "center",
        paddingHorizontal: space.sm,
        borderRadius: radius.button,
        borderWidth: 2,
        borderColor: colors.outline,
        backgroundColor: colors.card,
      }}
    >
      <Text style={[type.strong, { color: colors.text, fontSize: 15 }]}>📅 {label}</Text>
    </Pressable>
  );
}
