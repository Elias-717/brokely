import { isOperator, OPERATORS, type Operator } from "@brokely/domain";
import { Pressable, Text, View } from "react-native";
import { fonts, radius, space } from "./theme";
import { useTheme } from "./theme-context";

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"] as const;
type Key = (typeof DIGITS)[number] | Operator;

/** Longest sum kept, so the line above the amount stays on screen. */
const MAX_SUM = 40;

const KEY_LABEL: Record<string, string> = {
  "⌫": "Delete",
  ".": "Decimal point",
  "÷": "Divide",
  "×": "Times",
  "−": "Minus",
  "+": "Plus",
};

/** One key on one number: at most one dot, two decimals and 7 whole digits (RM 9,999,999.99). */
function pressDigit(text: string, key: string): string {
  const [whole = "", cents] = text.split(".");
  if (key === ".") return cents !== undefined ? text : `${whole || "0"}.`;
  if (cents !== undefined) return cents.length >= 2 ? text : text + key;
  if (whole === "0") return key; // no leading zeros
  return whole.length >= 7 ? text : text + key;
}

/**
 * Applies one key to the typed amount or sum (D-115), keeping it something evaluateAmount can
 * read: digits follow the one-number rules on the number being typed; an operator never starts
 * the sum and replaces an operator (or a lone dot) typed just before it.
 */
export function pressKey(text: string, key: Key): string {
  if (key === "⌫") return text.slice(0, -1);
  if (isOperator(key)) {
    if (text === "") return text;
    const last = text.slice(-1);
    if (isOperator(last) || last === ".") return text.slice(0, -1) + key;
    return text.length >= MAX_SUM ? text : text + key;
  }
  const at = Math.max(...OPERATORS.map((op) => text.lastIndexOf(op))) + 1;
  const next = text.slice(0, at) + pressDigit(text.slice(at), key);
  return next.length > MAX_SUM ? text : next;
}

/**
 * The built-in number pad, so the phone keyboard never covers the form (D-38), with a column of
 * ÷ × − + on the right for quick sums (D-115). No "=": the total shows above as you type.
 */
export function Keypad({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const { colors } = useTheme();
  const key = (k: Key, operator: boolean) => (
    <Pressable
      key={k}
      accessibilityRole="button"
      accessibilityLabel={KEY_LABEL[k] ?? k}
      onPress={() => onChange(pressKey(value, k))}
      onLongPress={k === "⌫" ? () => onChange("") : undefined}
      style={({ pressed }) => ({
        flex: 1,
        height: 50,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: radius.button,
        borderWidth: 2,
        borderColor: colors.outline,
        backgroundColor: pressed
          ? operator
            ? colors.primary
            : colors.cardTint
          : operator
            ? colors.cardTint
            : colors.card,
      })}
    >
      <Text
        style={{
          fontFamily: fonts.heavy,
          fontSize: 22,
          color: colors.text,
        }}
      >
        {k}
      </Text>
    </Pressable>
  );
  return (
    <View style={{ gap: space.sm }}>
      {[0, 1, 2, 3].map((row) => (
        <View key={row} style={{ flexDirection: "row", gap: space.sm }}>
          {DIGITS.slice(row * 3, row * 3 + 3).map((k) => key(k, false))}
          {key(OPERATORS[row]!, true)}
        </View>
      ))}
    </View>
  );
}

/** "12.50 + 8": a typed sum with spaces around the operators. */
export function sumLabel(text: string): string {
  return text.replace(/[÷×−+]/g, (op) => ` ${op} `).trim();
}

/** The sum being typed, shown small above the big total; nothing for a plain amount (D-115). */
export function SumLine({ text }: { text: string }) {
  const { colors } = useTheme();
  if (!text.split("").some(isOperator)) return null;
  return (
    <Text
      numberOfLines={1}
      accessibilityLabel={`Sum ${sumLabel(text)}`}
      style={{
        textAlign: "center",
        fontFamily: fonts.bold,
        fontSize: 16,
        color: colors.muted,
        fontVariant: ["tabular-nums"],
      }}
    >
      {sumLabel(text)} =
    </Text>
  );
}
