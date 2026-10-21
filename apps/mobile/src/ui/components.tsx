import { router } from "expo-router";
import { createContext, useContext, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { KeyboardSafe } from "./keyboard-safe";
import { MIN_TOUCH, radius, space, type } from "./theme";
import { useTheme } from "./theme-context";

export function Screen({
  children,
  scroll = true,
  gutter = space.md,
  bottom = space.md,
  gap = space.md,
}: {
  children: ReactNode;
  scroll?: boolean;
  /** Side padding; Home uses 20 (D-58). */
  gutter?: number;
  /** Space after the last card, e.g. room for the Undo bar above the tab bar. */
  bottom?: number;
  gap?: number;
}) {
  const { colors } = useTheme();
  const content = {
    paddingHorizontal: gutter,
    paddingTop: space.md,
    paddingBottom: bottom,
    gap,
  };
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={["top", "left", "right"]}
    >
      {scroll ? (
        // flexGrow lets a child with flex: 1 fill the space left (e.g. a centred card on Home);
        // content taller than the screen still scrolls.
        <ScrollView contentContainerStyle={[content, { flexGrow: 1 }]}>{children}</ScrollView>
      ) : (
        <View style={[content, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <Text style={[type.title, { color: colors.text }]} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <Text style={[type.heading, { color: colors.text }]} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  const { colors } = useTheme();
  return <Text style={[type.body, { color: muted ? colors.muted : colors.text }]}>{children}</Text>;
}

/**
 * What a button sits on. A secondary button is light green so it never looks like a white text
 * field (D-77), except on a light green card, where it stays white so it doesn't disappear.
 */
const Surface = createContext<"plain" | "tint">("plain");

/**
 * The vintage "sticker": a thick outline plus a hard shadow offset down-right (D-31).
 * Android shadows are always soft, so the shadow is a second shape drawn behind.
 */
export function Sticker({
  children,
  style,
  background,
  outline,
  offset = 3,
  rounded = radius.card,
}: {
  children: ReactNode;
  style?: ViewStyle;
  background?: string;
  outline?: string;
  offset?: number;
  rounded?: number;
}) {
  const { colors } = useTheme();
  const surface = background === colors.cardTint ? "tint" : "plain";
  return (
    <Surface.Provider value={surface}>
      <View style={{ marginRight: offset, marginBottom: offset }}>
        <View
          style={{
            position: "absolute",
            top: offset,
            left: offset,
            right: -offset,
            bottom: -offset,
            borderRadius: rounded,
            backgroundColor: colors.shadow,
          }}
        />
        <View
          style={[
            {
              borderWidth: 2,
              borderColor: outline ?? colors.outline,
              borderRadius: rounded,
              backgroundColor: background ?? colors.card,
            },
            style,
          ]}
        >
          {children}
        </View>
      </View>
    </Surface.Provider>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <Sticker style={{ padding: space.md, gap: space.sm, ...style }}>{children}</Sticker>;
}

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  selected,
}: {
  label: string;
  onPress: () => void;
  /** `destructive`: an action that can't be undone, in mustard (S13e). */
  variant?: "primary" | "secondary" | "link" | "destructive";
  disabled?: boolean;
  /** For choices like Light / Dark: shows the picked one filled. */
  selected?: boolean;
}) {
  const { colors } = useTheme();
  const surface = useContext(Surface);
  const filled = variant === "primary" || selected;
  const destructive = variant === "destructive";
  const textColor = destructive ? colors.onDestructive : filled ? colors.onPrimary : colors.text;
  const text = (
    <Text
      style={[
        type.strong,
        { color: textColor, fontSize: 15 },
        variant === "link" && { textDecorationLine: "underline" },
      ]}
    >
      {label}
    </Text>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed || disabled ? 0.6 : 1 })}
    >
      {variant === "link" ? (
        <View
          style={{ minHeight: MIN_TOUCH, justifyContent: "center", paddingHorizontal: space.sm }}
        >
          {text}
        </View>
      ) : (
        <Sticker
          rounded={radius.button}
          offset={filled || destructive ? 3 : 2}
          background={
            destructive
              ? colors.destructive
              : filled
                ? colors.primary
                : surface === "tint"
                  ? colors.card
                  : colors.cardTint
          }
          style={{
            minHeight: MIN_TOUCH,
            paddingHorizontal: space.md,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {text}
        </Sticker>
      )}
    </Pressable>
  );
}

/**
 * A screen opened from More or Home (Bills, Debts…): a back arrow and a title, then content.
 * `action` sits at the top right, e.g. "+ New bill".
 */
export function PageScreen({
  title,
  children,
  action,
  keyboardSafe,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  /** Screens with text fields: keeps the content above the phone's keyboard (KeyboardSafe). */
  keyboardSafe?: boolean;
}) {
  const { colors } = useTheme();
  const scroll = (
    <ScrollView
      contentContainerStyle={{ padding: space.md, paddingTop: space.xs, gap: space.md }}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={["top", "left", "right", "bottom"]}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: space.xs,
          paddingHorizontal: space.sm,
          paddingVertical: space.xs,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/more"))}
          style={{
            width: MIN_TOUCH,
            height: MIN_TOUCH,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Svg width={26} height={26} viewBox="0 0 24 24">
            <Path
              d="M15 5l-7 7 7 7"
              stroke={colors.text}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
        </Pressable>
        <Text
          style={[type.title, { flex: 1, color: colors.text, fontSize: 26 }]}
          accessibilityRole="header"
        >
          {title}
        </Text>
        {action}
      </View>
      {keyboardSafe ? <KeyboardSafe>{scroll}</KeyboardSafe> : scroll}
    </SafeAreaView>
  );
}

/** A quiet line for an empty list, e.g. "No debts. Nice!". */
export function Empty({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        borderWidth: 2,
        borderStyle: "dashed",
        borderColor: colors.outline,
        borderRadius: radius.card,
        padding: space.md,
      }}
    >
      <Text style={[type.body, { color: colors.muted, fontSize: 15 }]}>{children}</Text>
    </View>
  );
}
