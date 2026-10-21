import type { ReactNode } from "react";
import { Text, TextInput, View, type TextInputProps } from "react-native";
import { fonts, radius, space, type } from "./theme";
import { useTheme } from "./theme-context";

/**
 * A labelled text box in the sticker style (52 dp high, NFR-07). `trailing` sits inside the box
 * on the right (e.g. Show/Hide); `hint` is a live line under it (e.g. "3 more characters").
 */
export function TextField({
  label,
  trailing,
  hint,
  ...input
}: { label: string; trailing?: ReactNode; hint?: string | null } & TextInputProps) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: space.xs }}>
      <Text style={[type.small, { color: colors.muted }]}>{label}</Text>
      <View
        style={{
          minHeight: 52,
          flexDirection: "row",
          alignItems: "center",
          borderWidth: 2,
          borderColor: colors.outline,
          borderRadius: radius.button,
          backgroundColor: colors.background,
        }}
      >
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={colors.muted}
          {...input}
          style={{
            flex: 1,
            minHeight: 48,
            paddingHorizontal: space.md,
            fontFamily: fonts.bold,
            fontSize: 17,
            color: colors.text,
          }}
        />
        {trailing}
      </View>
      {hint ? (
        <Text accessibilityLiveRegion="polite" style={[type.small, { color: colors.muted }]}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
