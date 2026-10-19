import type { ReactNode } from "react";
import { Pressable, ScrollView, Text, View, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MIN_TOUCH, radius, space, type } from "./theme";
import { useTheme } from "./theme-context";

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const { colors } = useTheme();
  const content = { padding: space.md, gap: space.md };
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={["top", "left", "right"]}
    >
      {scroll ? (
        <ScrollView contentContainerStyle={content}>{children}</ScrollView>
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
  return (
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
  variant?: "primary" | "secondary" | "link";
  disabled?: boolean;
  /** For choices like Light / Dark: shows the picked one filled. */
  selected?: boolean;
}) {
  const { colors } = useTheme();
  const filled = variant === "primary" || selected;
  const textColor = filled ? colors.onPrimary : colors.text;
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
          offset={filled ? 3 : 2}
          background={filled ? colors.primary : colors.card}
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
