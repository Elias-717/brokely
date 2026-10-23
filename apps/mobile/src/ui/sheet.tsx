import { router } from "expo-router";
import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Keyboard,
  LayoutAnimation,
  Modal,
  PanResponder,
  Pressable,
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
 * A bottom sheet over the current screen (U-10: Mark paid, Write off). Tapping the
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
        {children ? <SheetScroll>{children}</SheetScroll> : null}
        {footer}
      </SheetPanel>
    </KeyboardSafe>
  );
}

/** How far down (dp) or how fast (dp/ms) a drag must go to close the sheet. */
const CLOSE_DISTANCE = 120;
const CLOSE_VELOCITY = 0.8;
/** How far up (dp) or how fast a drag must go to open the sheet to full screen (D-86). */
const EXPAND_DISTANCE = 40;
const EXPAND_VELOCITY = 0.5;

/** Whether the sheet is pulled up to full screen: its scrolling part then fills the room. */
const SheetExpanded = createContext(false);

/**
 * Shown only while the sheet is pulled up to full screen (D-87), e.g. "Repeat a recent one".
 * Its contents mount only then, so the usual sheet stays as quick as before.
 */
export function WhenFull({ children }: { children: ReactNode }) {
  return useContext(SheetExpanded) ? <>{children}</> : null;
}

/** How far the sheet's content is scrolled: a downward drag closes it only from the top. */
const SheetScrollTop = createContext<{ y: number } | null>(null);

/**
 * The scrolling part of a sheet. Normally only as tall as its content; at full screen it fills
 * the space, so the keypad and Save stay at the bottom.
 */
export function SheetScroll({ children }: { children: ReactNode }) {
  const expanded = useContext(SheetExpanded);
  const scroll = useContext(SheetScrollTop);
  return (
    <KeyboardScroll
      // Shrinks (and scrolls) when space is short, instead of pushing fields off screen.
      style={{ flexGrow: expanded ? 1 : 0, flexShrink: 1 }}
      contentContainerStyle={{ gap: space.sm }}
      onScroll={(e) => {
        if (scroll) scroll.y = e.nativeEvent.contentOffset.y;
      }}
    >
      {children}
    </KeyboardScroll>
  );
}

/**
 * A sheet over the current screen without a route of its own, e.g. "Sign out?" on Profile.
 * Closes on the dimmed area, a slide down, or the phone's back button.
 */
export function ModalSheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardSafe style={{ justifyContent: "flex-end" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
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
          onClose={onClose}
          top={
            <Text style={[type.heading, { color: colors.text }]} accessibilityRole="header">
              {title}
            </Text>
          }
        >
          <View style={{ gap: space.sm }}>{children}</View>
        </SheetPanel>
      </KeyboardSafe>
    </Modal>
  );
}

/**
 * The sliding part of every bottom sheet. A clearly vertical drag anywhere on it, wherever the
 * finger lands (author): up opens it to full screen; down from full screen brings it back to
 * its usual size, and from there it moves with the finger and, past a threshold or with a
 * quick flick, slides away and closes (D-86). A downward drag closes only while the content is
 * scrolled to the top, so scrolling still works; taps and sideways swipes (chips) are never
 * taken, since a drag starts only once the finger moves. For screen readers the handle is a
 * "Close" button with actions to make the sheet full screen or smaller.
 */
export function SheetPanel({
  top,
  children,
  onClose,
}: {
  top?: ReactNode;
  children?: ReactNode;
  /** Closing it; a sheet with a route of its own goes back. */
  onClose?: () => void;
}) {
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
  const [expanded, setExpanded] = useState(false);
  const expandedRef = useRef(false);
  const scroll = useRef({ y: 0 }).current;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const close = () => (closeRef.current ? closeRef.current() : router.back());

  /** Whether a move is a sheet drag rather than a tap, a sideways swipe or a scroll. */
  const isSheetDrag = (dx: number, dy: number) => {
    if (Math.abs(dy) < 8 || Math.abs(dy) < Math.abs(dx) * 1.5) return false;
    return dy > 0 ? scroll.y <= 0 : !expandedRef.current;
  };

  const resize = (to: boolean) => {
    if (!reduce) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    expandedRef.current = to;
    setExpanded(to);
  };

  const drag = useMemo(
    () =>
      PanResponder.create({
        // Taken before the content's own handlers, wherever the finger landed.
        onMoveShouldSetPanResponderCapture: (_, g) => isSheetDrag(g.dx, g.dy),
        onMoveShouldSetPanResponder: (_, g) => isSheetDrag(g.dx, g.dy),
        onPanResponderGrant: () => Keyboard.dismiss(),
        // Only a downward drag follows the finger; from full screen it first shrinks back.
        onPanResponderMove: (_, g) => {
          if (!expandedRef.current) offset.setValue(Math.max(0, g.dy));
        },
        onPanResponderRelease: (_, g) => {
          const up = g.dy < -EXPAND_DISTANCE || g.vy < -EXPAND_VELOCITY;
          const down = g.dy > 0 && (g.dy > CLOSE_DISTANCE || g.vy > CLOSE_VELOCITY);
          if (up && !expandedRef.current) resize(true);
          else if (expandedRef.current && (g.dy > EXPAND_DISTANCE || g.vy > EXPAND_VELOCITY)) {
            resize(false);
          } else if (down && !expandedRef.current) {
            Animated.timing(offset, {
              toValue: 1000,
              duration: reduce ? 0 : 180,
              useNativeDriver: true,
            }).start(() => {
              close();
              offset.setValue(0); // a modal sheet stays mounted and may open again
            });
            return;
          }
          Animated.spring(offset, { toValue: 0, useNativeDriver: true }).start();
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
        height: expanded ? maxHeight : undefined,
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
      {...drag.panHandlers}
    >
      <View style={{ gap: space.sm }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          accessibilityHint="Or slide the top of the sheet down. Slide it up for full screen"
          accessibilityActions={[
            expanded
              ? { name: "decrement", label: "Make the sheet smaller" }
              : { name: "increment", label: "Make the sheet full screen" },
          ]}
          onAccessibilityAction={(e) => resize(e.nativeEvent.actionName === "increment")}
          onPress={close}
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
      <SheetExpanded.Provider value={expanded}>
        <SheetScrollTop.Provider value={scroll}>{children}</SheetScrollTop.Provider>
      </SheetExpanded.Provider>
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

/** A date button: "Today, 20 Oct". */
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
      <Text style={[type.strong, { color: colors.text, fontSize: 15 }]}>{label}</Text>
    </Pressable>
  );
}
