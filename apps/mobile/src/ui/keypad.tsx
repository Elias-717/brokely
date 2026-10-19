import { Pressable, Text, View } from "react-native";
import { fonts, radius, space } from "./theme";
import { useTheme } from "./theme-context";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"] as const;

/**
 * Applies one key to the typed amount, keeping it something parseAmount can read: at most one
 * dot, two decimals and 7 whole digits (RM 9,999,999.99).
 */
export function pressKey(text: string, key: (typeof KEYS)[number]): string {
  if (key === "⌫") return text.slice(0, -1);
  const [whole = "", cents] = text.split(".");
  if (key === ".") return cents !== undefined ? text : `${whole || "0"}.`;
  if (cents !== undefined) return cents.length >= 2 ? text : text + key;
  if (whole === "0") return key; // no leading zeros
  return whole.length >= 7 ? text : text + key;
}

/** The built-in number pad, so the phone keyboard never covers the form (D-38). */
export function Keypad({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
      {KEYS.map((key) => (
        <Pressable
          key={key}
          accessibilityRole="button"
          accessibilityLabel={key === "⌫" ? "Delete" : key === "." ? "Decimal point" : key}
          onPress={() => onChange(pressKey(value, key))}
          onLongPress={key === "⌫" ? () => onChange("") : undefined}
          style={({ pressed }) => ({
            width: "31.5%",
            height: 50,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: radius.button,
            borderWidth: 2,
            borderColor: colors.outline,
            backgroundColor: pressed ? colors.cardTint : colors.card,
          })}
        >
          <Text style={{ fontFamily: fonts.heavy, fontSize: 22, color: colors.text }}>{key}</Text>
        </Pressable>
      ))}
    </View>
  );
}
