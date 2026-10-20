import { router } from "expo-router";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fonts, radius, space, type } from "./theme";
import { useTheme } from "./theme-context";

/**
 * A bottom sheet over the current screen (U-10: Mark paid, Write off, Wallet check). Tapping the
 * dimmed area closes it. `footer` stays below the scrolling part, e.g. the keypad and Save.
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
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, justifyContent: "flex-end" }}>
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
      <KeyboardAvoidingView behavior="padding">
        <View
          style={{
            maxHeight: "94%",
            backgroundColor: colors.background,
            borderTopWidth: 2,
            borderColor: colors.outline,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: space.md,
            paddingTop: space.sm,
            paddingBottom: insets.bottom + space.md,
            gap: space.sm,
          }}
        >
          <View
            style={{
              alignSelf: "center",
              width: 44,
              height: 5,
              borderRadius: 99,
              backgroundColor: colors.muted,
              opacity: 0.5,
            }}
          />
          <View
            style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
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
          {children ? (
            <ScrollView
              style={{ flexGrow: 0, flexShrink: 1 }}
              contentContainerStyle={{ gap: space.sm }}
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
          ) : null}
          {footer}
        </View>
      </KeyboardAvoidingView>
    </View>
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
