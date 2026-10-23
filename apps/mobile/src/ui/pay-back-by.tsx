import { payBackPresets, type LocalDate } from "@brokely/domain";
import { ScrollView, Text, View } from "react-native";
import { dayMonth } from "../lib/today";
import { pickDate } from "./date-picker";
import { Chip } from "./sheet-parts";
import { space, type } from "./theme";
import { useTheme } from "./theme-context";

/**
 * "Pay back by" (D-103): No date · In a week · End of month · Pick a date. Optional; the
 * "Debts due back" reminder (D-94) uses it. A picked date shows on its own chip.
 */
export function PayBackBy({
  today,
  value,
  onChange,
}: {
  today: LocalDate;
  value: LocalDate | null;
  onChange: (date: LocalDate | null) => void;
}) {
  const { colors } = useTheme();
  const { inAWeek, endOfMonth } = payBackPresets(today);
  const picked = value !== null && value !== inAWeek && value !== endOfMonth;
  return (
    <View style={{ gap: space.xs }}>
      <Text style={[type.small, { color: colors.muted }]}>Pay back by</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <Chip label="No date" selected={value === null} onPress={() => onChange(null)} />
          <Chip
            label={`In a week · ${dayMonth(inAWeek)}`}
            selected={value === inAWeek}
            onPress={() => onChange(inAWeek)}
          />
          <Chip
            label={`End of month · ${dayMonth(endOfMonth)}`}
            selected={value === endOfMonth}
            onPress={() => onChange(endOfMonth)}
          />
          <Chip
            label={picked ? dayMonth(value) : "Pick a date"}
            selected={picked}
            dashed={!picked}
            onPress={async () => {
              const chosen = await pickDate(value ?? inAWeek);
              if (chosen) onChange(chosen);
            }}
          />
        </View>
      </ScrollView>
    </View>
  );
}
