import { Pressable, Text } from "react-native";
import { Sticker } from "./components";
import { fonts, MIN_TOUCH } from "./theme";
import { useTheme } from "./theme-context";

/** Two or three tabs in one sticker, the chosen one filled green (sign-in, Bills). */
export function Tabs<K extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
}) {
  const { colors } = useTheme();
  return (
    <Sticker style={{ padding: 4, flexDirection: "row", gap: 4 }} rounded={14} offset={2}>
      {tabs.map((t) => {
        const on = t.key === value;
        return (
          <Pressable
            key={t.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(t.key)}
            style={{
              flex: 1,
              minHeight: MIN_TOUCH - 4,
              borderRadius: 10,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: on ? colors.primary : "transparent",
            }}
          >
            <Text
              style={{
                fontFamily: fonts.heavy,
                fontSize: 15,
                color: on ? colors.onPrimary : colors.text,
              }}
            >
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </Sticker>
  );
}
