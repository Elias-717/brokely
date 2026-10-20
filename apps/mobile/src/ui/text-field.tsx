import { Text, TextInput, View, type TextInputProps } from "react-native";
import { fonts, radius, space, type } from "./theme";
import { useTheme } from "./theme-context";

/** A labelled text box in the sticker style (52 dp high, NFR-07). */
export function TextField({ label, ...input }: { label: string } & TextInputProps) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: space.xs }}>
      <Text style={[type.small, { color: colors.muted }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        {...input}
        style={{
          height: 52,
          borderWidth: 2,
          borderColor: colors.outline,
          borderRadius: radius.button,
          backgroundColor: colors.background,
          paddingHorizontal: space.md,
          fontFamily: fonts.bold,
          fontSize: 17,
          color: colors.text,
        }}
      />
    </View>
  );
}
