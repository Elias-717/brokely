import { formatRM, inclusiveEnd, midMonthStart, parseAmount, sen } from "@brokely/domain";
import { listCategories, quickStart } from "@brokely/local-db";
import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { repo } from "../../src/db/client";
import { useRead } from "../../src/db/use-read";
import { refusalText } from "../../src/lib/messages";
import { dayMonth, monthName, today } from "../../src/lib/today";
import { Button, Card } from "../../src/ui/components";
import { Chip, ErrorText, Field, FormScreen, Header, MoneyInput } from "../../src/ui/form";
import { space, type } from "../../src/ui/theme";
import { useTheme } from "../../src/ui/theme-context";

/** The "Mostly on" choices, in this order (wireframe S1d). */
const MOSTLY_ON = ["Meals", "Snacks & treats", "Groceries & toiletries", "Other"];

/**
 * S1d Quick start · Catch me up (FR-PLN-21, BR-29, AC-59, D-25, R-12). The whole month with the
 * full amount, plus one rough "Spent before Brokely" entry dated the day before today, in the
 * category it mostly went on. It counts in left in plan; daily average and forecast count from
 * today.
 */
export default function QuickStartCatchUp() {
  const { colors } = useTheme();
  const day = today();
  const month = midMonthStart(day, "catch_up").range;
  const monthEnd = inclusiveEnd(month);

  const choices = useRead((db) => {
    const all = listCategories(db);
    return MOSTLY_ON.flatMap((name) => all.filter((c) => c.name === name));
  });

  const [budgetText, setBudgetText] = useState("");
  const [spentText, setSpentText] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const pickedId = categoryId ?? choices[0]?.id ?? null;

  const budget = parseAmount(budgetText);
  const spent = spentText === "" ? sen(0) : parseAmount(spentText);
  const canStart =
    budget !== null && budget > 0 && spent !== null && (spent === 0 || pickedId !== null);

  const startPlan = () => {
    if (!canStart) return;
    const saved = quickStart(repo, {
      budgetSen: budget,
      startDate: month.start,
      endDateInclusive: monthEnd,
      trackingStartDate: day, // progress counts from today (R-12)
      openingSpend: spent > 0 && pickedId ? { amountSen: spent, categoryId: pickedId } : undefined,
    });
    if (!saved.ok) return setRefusal(refusalText(saved.code, saved.message));
    router.replace("/");
  };

  const clear = () => setRefusal(null);

  return (
    <FormScreen
      header={<Header title="Catch me up" onBack={() => router.back()} />}
      footer={<Button label="Start my plan" onPress={startPlan} disabled={!canStart} />}
    >
      <Field label={`Money for ${monthName(day)}`}>
        <MoneyInput
          value={budgetText}
          onChange={(text) => {
            setBudgetText(text);
            clear();
          }}
          accessibilityLabel={`Money for ${monthName(day)}`}
          autoFocus
        />
      </Field>
      <Field label="Already spent (a rough guess is fine)">
        <MoneyInput
          value={spentText}
          onChange={(text) => {
            setSpentText(text);
            clear();
          }}
          accessibilityLabel="Already spent"
        />
      </Field>
      {(budgetText !== "" && budget === null) || spent === null ? (
        <ErrorText>That doesn't look like an amount. Try something like 350 or 350.50.</ErrorText>
      ) : null}

      <Field label="Mostly on">
        <View
          accessibilityRole="radiogroup"
          style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}
        >
          {choices.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              selected={c.id === pickedId}
              onPress={() => setCategoryId(c.id)}
            />
          ))}
        </View>
      </Field>

      {budget !== null && budget > 0 && spent !== null ? (
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={[type.body, { color: colors.muted }]}>Left in plan</Text>
            <Text style={[type.strong, { color: colors.text, fontVariant: ["tabular-nums"] }]}>
              {formatRM(sen(budget - spent))}
            </Text>
          </View>
          <Text style={[type.small, { color: colors.muted }]}>
            {dayMonth(month.start)} – {dayMonth(monthEnd)} · your days count from today,{" "}
            {dayMonth(day)}
          </Text>
        </Card>
      ) : null}
      {refusal ? <ErrorText>{refusal}</ErrorText> : null}
    </FormScreen>
  );
}
