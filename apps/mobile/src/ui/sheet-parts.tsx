import type { ReactNode } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { fonts, MIN_TOUCH, radius, space, type } from "./theme";
import { useTheme } from "./theme-context";

/** Pieces shared by the quick add and edit sheets (D-38). */

export function Chip({
  label,
  selected,
  dashed,
  onPress,
}: {
  label: string;
  selected?: boolean;
  dashed?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        minHeight: MIN_TOUCH - 4,
        justifyContent: "center",
        paddingHorizontal: space.md,
        borderRadius: 99,
        borderWidth: 2,
        borderStyle: dashed ? "dashed" : "solid",
        borderColor: colors.outline,
        backgroundColor: selected ? colors.primary : dashed ? undefined : colors.card,
      }}
    >
      <Text
        style={{
          fontFamily: selected ? fonts.heavy : fonts.bold,
          fontSize: 15,
          color: selected ? colors.onPrimary : colors.text,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Labelled({ label, children }: { label: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: space.xs }}>
      <Text style={[type.small, { color: colors.muted }]}>{label}</Text>
      {children}
    </View>
  );
}

export function Field({
  value,
  onChange,
  placeholder,
  label,
  numeric,
}: {
  value: string;
  onChange: (text: string) => void;
  placeholder: string;
  label?: string;
  numeric?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      accessibilityLabel={label ?? placeholder}
      keyboardType={numeric ? "decimal-pad" : "default"}
      maxLength={numeric ? 12 : 120}
      style={{
        minHeight: MIN_TOUCH,
        paddingHorizontal: space.sm,
        borderRadius: radius.button,
        borderWidth: 2,
        borderColor: colors.outline,
        backgroundColor: colors.card,
        color: colors.text,
        fontFamily: fonts.bold,
        fontSize: 15,
      }}
    />
  );
}
