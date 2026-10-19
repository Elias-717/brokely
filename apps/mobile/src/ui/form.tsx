import type { LocalDate } from "@brokely/domain";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { dayMonthYear, toDate, toLocalDate } from "../lib/today";
import { Sticker } from "./components";
import { fonts, MIN_TOUCH, radius, space, type } from "./theme";
import { useTheme } from "./theme-context";

/**
 * A form screen: header, scrolling fields, and the main button fixed at the bottom so it stays
 * reachable with the keyboard open.
 */
export function FormScreen({
  header,
  children,
  footer,
}: {
  header: ReactNode;
  children: ReactNode;
  footer: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="height">
        <View style={{ paddingHorizontal: space.md, paddingTop: space.sm }}>{header}</View>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: space.md, gap: space.md }}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
        <View style={{ padding: space.md, gap: space.sm }}>{footer}</View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Screen header: a back arrow and a title. */
export function Header({ title, onBack }: { title: string; onBack: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack}
        style={{ width: MIN_TOUCH, height: MIN_TOUCH, justifyContent: "center" }}
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
      <Text style={[type.heading, { color: colors.text }]} accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

/** A label above an input, with optional help text below. */
export function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: space.xs, flex: 1 }}>
      <Text style={[type.small, { color: colors.muted }]}>{label}</Text>
      {children}
      {help ? <Text style={[type.small, { color: colors.muted }]}>{help}</Text> : null}
    </View>
  );
}

function boxStyle(colors: ReturnType<typeof useTheme>["colors"]) {
  return {
    minHeight: 56,
    borderWidth: 2,
    borderColor: colors.outline,
    borderRadius: radius.button,
    backgroundColor: colors.card,
    paddingHorizontal: space.md,
    justifyContent: "center" as const,
  };
}

/** Money input with a fixed "RM" in front. The text is parsed with parseAmount by the screen. */
export function MoneyInput({
  value,
  onChange,
  accessibilityLabel,
  autoFocus,
}: {
  value: string;
  onChange: (text: string) => void;
  accessibilityLabel: string;
  autoFocus?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={[boxStyle(colors), { flexDirection: "row", alignItems: "center", gap: space.sm }]}>
      <Text style={[type.strong, { color: colors.muted }]}>RM</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholder="0.00"
        placeholderTextColor={colors.muted}
        accessibilityLabel={accessibilityLabel}
        autoFocus={autoFocus}
        style={{
          flex: 1,
          fontFamily: fonts.heavy,
          fontSize: 22,
          color: colors.text,
          fontVariant: ["tabular-nums"],
        }}
      />
    </View>
  );
}

/** A date box; tapping it opens Android's date picker (FR-PLN-02: any start and end date). */
export function DateInput({
  value,
  onChange,
  accessibilityLabel,
}: {
  value: LocalDate;
  onChange: (date: LocalDate) => void;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  const open = () =>
    DateTimePickerAndroid.open({
      value: toDate(value),
      mode: "date",
      onChange: (event, picked) => {
        if (event.type === "set" && picked) onChange(toLocalDate(picked));
      },
    });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${accessibilityLabel}: ${dayMonthYear(value)}. Change`}
      onPress={open}
      style={boxStyle(colors)}
    >
      <Text style={[type.strong, { color: colors.text }]}>{dayMonthYear(value)}</Text>
    </Pressable>
  );
}

/** A big tappable choice, e.g. Start fresh / Catch me up. */
export function ChoiceCard({
  title,
  detail,
  onPress,
}: {
  title: string;
  detail: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <Sticker style={{ padding: space.md, gap: space.xs }}>
        <Text style={[type.heading, { color: colors.text }]}>{title}</Text>
        <Text style={[type.body, { color: colors.muted }]}>{detail}</Text>
      </Sticker>
    </Pressable>
  );
}

/** A pill that can be picked, e.g. a category. */
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        minHeight: MIN_TOUCH,
        paddingHorizontal: space.md,
        borderRadius: 99,
        borderWidth: 2,
        borderColor: colors.outline,
        backgroundColor: selected ? colors.primary : colors.card,
        justifyContent: "center",
      }}
    >
      <Text
        style={[type.strong, { color: selected ? colors.onPrimary : colors.text, fontSize: 15 }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** A plain red-free error line (rule 9: fact first, no shaming). */
export function ErrorText({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <Text accessibilityRole="alert" style={[type.strong, { color: colors.warning }]}>
      {children}
    </Text>
  );
}
