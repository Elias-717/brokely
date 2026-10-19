import {
  cycleFromInclusive,
  formatRM,
  inclusiveEnd,
  lengthInDays,
  midMonthStart,
  offersCatchUp,
  parseAmount,
} from "@brokely/domain";
import { quickStart } from "@brokely/local-db";
import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { repo } from "../../src/db/client";
import { refusalText } from "../../src/lib/messages";
import { dayMonth, monthName, today } from "../../src/lib/today";
import { Button } from "../../src/ui/components";
import { DateInput, ErrorText, Field, FormScreen, Header, MoneyInput } from "../../src/ui/form";
import { space, type } from "../../src/ui/theme";
import { useTheme } from "../../src/ui/theme-context";

/**
 * S1b Quick start · Start fresh (FR-PLN-19, FR-PLN-01, FR-PLN-02, FR-PLN-08, FR-PLN-09,
 * FR-PLN-21, AC-53, AC-58). Budget only, never a balance (FR-PLN-01); dates pre-filled from
 * today to the month end; approved on this screen; then Home.
 */
export default function QuickStartFresh() {
  const { colors } = useTheme();
  const day = today();
  const firstOfMonth = !offersCatchUp(day);
  const suggested = midMonthStart(day, "fresh").range;

  const [amountText, setAmountText] = useState("");
  const [start, setStart] = useState(suggested.start);
  const [end, setEnd] = useState(inclusiveEnd(suggested));
  const [refusal, setRefusal] = useState<string | null>(null);

  const budget = parseAmount(amountText);
  const datesOk = end >= start;
  const days = datesOk ? lengthInDays(cycleFromInclusive(start, end)) : 0;
  const canStart = budget !== null && budget > 0 && datesOk;

  const startPlan = () => {
    if (!canStart) return;
    const saved = quickStart(repo, { budgetSen: budget, startDate: start, endDateInclusive: end });
    if (!saved.ok) return setRefusal(refusalText(saved.code, saved.message));
    router.replace("/");
  };

  return (
    <FormScreen
      header={<Header title="Quick start" onBack={() => router.back()} />}
      footer={<Button label="Start my plan" onPress={startPlan} disabled={!canStart} />}
    >
      <Text style={[type.title, { color: colors.text }]}>
        {firstOfMonth
          ? `How much do you have to spend until ${dayMonth(end)}?`
          : `How much do you have left to spend until ${dayMonth(end)}?`}
      </Text>
      <Field label={firstOfMonth ? `Money for ${monthName(day)}` : "Left to spend"}>
        <MoneyInput
          value={amountText}
          onChange={(text) => {
            setAmountText(text);
            setRefusal(null);
          }}
          accessibilityLabel="Amount to spend"
          autoFocus
        />
      </Field>
      <View style={{ flexDirection: "row", gap: space.md }}>
        <Field label={firstOfMonth ? "From" : "From (today)"}>
          <DateInput value={start} onChange={setStart} accessibilityLabel="From" />
        </Field>
        <Field label="Until (end of month)">
          <DateInput value={end} onChange={setEnd} accessibilityLabel="Until" />
        </Field>
      </View>
      {datesOk ? (
        <Text style={[type.small, { color: colors.muted }]}>
          Filled in for you. {days} {days === 1 ? "day" : "days"}, both dates included.
        </Text>
      ) : (
        <ErrorText>The end date is before the start date.</ErrorText>
      )}
      {amountText !== "" && budget === null ? (
        <ErrorText>That doesn't look like an amount. Try something like 250 or 250.50.</ErrorText>
      ) : null}
      {canStart ? (
        // One plain line instead of the totals box: nothing is allocated yet (FR-PLN-08, D-24).
        <Text style={[type.strong, { color: colors.text, fontSize: 18 }]}>
          {formatRM(budget)} to plan with. I'll help you add essentials next 🥦
        </Text>
      ) : null}
      {refusal ? <ErrorText>{refusal}</ErrorText> : null}
    </FormScreen>
  );
}
