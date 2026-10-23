import { Pressable, Text, View } from "react-native";
import { fonts } from "./theme";
import { useTheme } from "./theme-context";

/**
 * A small choice of two or three, inside a settings row (S9, D-79): Phone · Light · Dark,
 * Mon · Sun · Sat. The chosen one is filled green. The switch is 48 dp high (NFR-07), each
 * choice at least 44 dp wide.
 */
export function Segmented<V extends string | number>({
  options,
  value,
  onChange,
  label,
  stretch,
}: {
  options: readonly { value: V; label: string; spoken?: string }[];
  value: V;
  onChange: (value: V) => void;
  /** What the whole choice is about, for screen readers. */
  label: string;
  /** Fills the row, the choices sharing it equally and 44 dp high (Add → More, D-119). */
  stretch?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{
        flexDirection: "row",
        gap: 2,
        padding: 3,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: colors.outline,
        backgroundColor: colors.background,
      }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={o.spoken ?? o.label}
            onPress={() => onChange(o.value)}
            style={{
              flex: stretch ? 1 : undefined,
              minHeight: stretch ? 44 : 38,
              minWidth: 44,
              paddingHorizontal: 10,
              borderRadius: 7,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: on ? colors.primary : "transparent",
            }}
          >
            <Text
              style={{
                fontFamily: fonts.heavy,
                fontSize: stretch ? 15 : 13,
                color: on ? colors.onPrimary : colors.text,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
