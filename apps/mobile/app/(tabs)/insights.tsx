import { formatRM, inclusiveEnd, sen, type Sen } from "@brokely/domain";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRead } from "../../src/db/use-read";
import { categoryEmoji } from "../../src/lib/essentials-meta";
import { categoryRecords, readInsights, type CategoryLine } from "../../src/lib/insights-model";
import { dayMonth, today } from "../../src/lib/today";
import { Body, Button, Empty, Heading, Screen, Sticker, Title } from "../../src/ui/components";
import { Doughnut, type Slice } from "../../src/ui/doughnut";
import { space, type } from "../../src/ui/theme";
import { useTheme } from "../../src/ui/theme-context";

const OTHER = "other";
/** Meals always gets its own red slice, first from 12 o'clock (D-48). */
const MEALS = "Meals";

/** A forecast bound is a whole RM10 step (R-10), so it reads best without sen. */
const wholeRM = (amount: Sen) => `RM${Math.round(amount / 100)}`;

/**
 * S8 Insights (FR-INS-02…08): where the money went (doughnut with RM and %, tap a slice for its
 * records), daily average with coverage, the forecast as an estimate range or "not enough data
 * yet", still to come, and every category's plan, spending and what's left.
 */
export default function InsightsScreen() {
  const { colors } = useTheme();
  const day = today();
  const model = useRead((db) => readInsights(db, day), [day]);
  const [selected, setSelected] = useState<string | null>(null);
  const records = useRead(
    (db) =>
      model.kind === "plan" && selected && selected !== OTHER
        ? categoryRecords(db, model.range, selected)
        : [],
    [selected, model],
  );

  if (model.kind === "no-plan") {
    return (
      <Screen>
        <Title>Insights</Title>
        <Empty>Insights show up once you have a plan.</Empty>
        <Button label="Make a plan" onPress={() => router.push("/quick-start")} />
      </Screen>
    );
  }

  // Meals is always its own red slice; the biggest others get one colour each (in the
  // categories' fixed order, so a colour follows its category); the rest fold together.
  const meals = model.slices.find((s) => s.name === MEALS);
  const others = model.slices.filter((s) => s.name !== MEALS);
  const top = new Set(others.slice(0, colors.chart.length).map((s) => s.id));
  const named = model.lines.filter((l) => top.has(l.id));
  const rest = others.filter((s) => !top.has(s.id));
  const restSen = sen(rest.reduce((sum, s) => sum + s.spentSen, 0));
  const slice = (l: CategoryLine, color: string) => ({
    key: l.id,
    value: l.spentSen,
    color,
    label: l.name,
    percent: l.percent,
    amountSen: l.spentSen,
  });
  const slices: (Slice & { percent: number; amountSen: Sen })[] = [
    ...(meals ? [slice(meals, colors.chartMeals)] : []),
    ...named.map((l, i) => slice(l, colors.chart[i]!)),
    ...(rest.length > 0
      ? [
          {
            key: OTHER,
            value: restSen,
            color: colors.chartOther,
            label: "Everything else",
            percent: rest.reduce((sum, s) => sum + s.percent, 0),
            amountSen: restSen,
          },
        ]
      : []),
  ];
  const toggle = (key: string) => setSelected((now) => (now === key ? null : key));
  const selectedLine = model.lines.find((l) => l.id === selected);

  return (
    <Screen>
      <Title>Insights</Title>
      <Text style={[type.small, { color: colors.muted, marginTop: -space.sm }]}>
        {dayMonth(model.range.start)} – {dayMonth(inclusiveEnd(model.range))}
      </Text>

      {/* Where it went (FR-INS-03, FR-INS-04) */}
      <Sticker style={{ padding: space.md, gap: space.md }}>
        <Heading>Where it went</Heading>
        {slices.length === 0 ? (
          <Body muted>Nothing spent yet. Your chart fills in as you log.</Body>
        ) : (
          <>
            <View style={{ alignItems: "center" }}>
              <Doughnut
                slices={slices}
                centre={formatRM(model.spentSen)}
                centreLabel="spent"
                selected={selected}
                onSelect={toggle}
              />
            </View>
            <View style={{ gap: 2 }}>
              {slices.map((s) => (
                <Pressable
                  key={s.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selected === s.key }}
                  accessibilityLabel={`${s.label}: ${formatRM(s.amountSen)}, ${s.percent}%. Show records`}
                  onPress={() => toggle(s.key)}
                  style={{
                    minHeight: 48,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: space.sm,
                    paddingHorizontal: space.sm,
                    borderRadius: 12,
                    backgroundColor: selected === s.key ? colors.cardTint : undefined,
                  }}
                >
                  <View
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 4,
                      borderWidth: 2,
                      borderColor: colors.outline,
                      backgroundColor: s.color,
                    }}
                  />
                  <Text style={[type.strong, { flex: 1, color: colors.text }]}>{s.label}</Text>
                  <Text style={[type.small, { color: colors.muted }]}>{s.percent}%</Text>
                  <Text
                    style={[
                      type.strong,
                      {
                        color: colors.text,
                        fontVariant: ["tabular-nums"],
                        minWidth: 88,
                        textAlign: "right",
                      },
                    ]}
                  >
                    {formatRM(s.amountSen)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {selected === OTHER ? (
          <View style={{ gap: 2 }}>
            {rest.map((l) => (
              <Pressable key={l.id} accessibilityRole="button" onPress={() => setSelected(l.id)}>
                <Text style={[type.body, { color: colors.text }]}>
                  {l.name} · {formatRM(l.spentSen)} · {l.percent}%
                </Text>
              </Pressable>
            ))}
          </View>
        ) : selectedLine ? (
          <SliceRecords line={selectedLine} records={records} />
        ) : slices.length > 0 ? (
          <Text style={[type.small, { color: colors.muted }]}>Tap a slice to see its records.</Text>
        ) : null}
      </Sticker>

      {/* Daily average always with coverage (FR-INS-05) */}
      <Sticker style={{ padding: space.md, gap: space.xs }}>
        <Heading>Daily average</Heading>
        {model.dailyAverageSen === null ? (
          <Body muted>Shows after your first day.</Body>
        ) : (
          <>
            <Text style={[type.amount, { color: colors.text, fontSize: 32, lineHeight: 38 }]}>
              {formatRM(model.dailyAverageSen)}
              <Text style={[type.body, { color: colors.muted }]}> a day</Text>
            </Text>
            <Body muted>
              Logged {model.coveredDays} of {model.elapsedDays}{" "}
              {model.elapsedDays === 1 ? "day" : "days"} ({model.coveragePercent}%). Days with
              nothing logged make the average look lower than it is.
            </Body>
          </>
        )}
      </Sticker>

      {/* Forecast only through the gate, as a labelled estimate range (FR-INS-06, FR-INS-08) */}
      {model.forecast.kind === "hidden" ? null : (
        <Sticker style={{ padding: space.md, gap: space.xs }}>
          <Heading>Forecast</Heading>
          {model.forecast.kind === "shown" ? (
            <>
              <Text style={[type.amount, { color: colors.text, fontSize: 32, lineHeight: 38 }]}>
                {wholeRM(model.forecast.value.lowSen)} – {wholeRM(model.forecast.value.highSen)}
              </Text>
              <Body muted>
                Estimate of your total spending by the end of this plan, if you keep going like
                this.{" "}
                {model.forecast.value.pace === "on_track"
                  ? "That's on pace with your plan."
                  : `That's over your plan of ${formatRM(model.plannedSen > 0 ? model.plannedSen : model.budgetSen)}.`}
              </Body>
            </>
          ) : (
            <Body muted>
              Not enough data yet.{" "}
              {model.forecast.daysToGo > 0
                ? `The forecast shows from day 14 (${model.forecast.daysToGo} more ${model.forecast.daysToGo === 1 ? "day" : "days"})`
                : "The forecast shows from day 14"}
              {model.forecast.coverageShort || model.forecast.daysToGo === 0
                ? " once you've logged at least 70% of days."
                : "."}
            </Body>
          )}
        </Sticker>
      )}

      {/* Still to come, separate from spending (FR-INS-07) */}
      <Pressable accessibilityRole="button" onPress={() => router.push("/bills")}>
        <Sticker style={{ padding: space.md, flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Heading>Still to come</Heading>
            <Text style={[type.small, { color: colors.muted }]}>
              Bills not paid yet · not spending
            </Text>
          </View>
          <Text style={[type.strong, { color: colors.text }]}>
            {formatRM(model.stillToComeSen)}
          </Text>
        </Sticker>
      </Pressable>

      {/* Every category: plan, spent, left (FR-INS-02) */}
      <Sticker style={{ padding: space.md, gap: space.sm, marginBottom: space.lg }}>
        <View
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
        >
          <Heading>By category</Heading>
          <Button label="Change amounts" variant="link" onPress={() => router.push("/plan")} />
        </View>
        {model.lines.length === 0 ? (
          <Body muted>Add essentials from Home to give categories an amount.</Body>
        ) : (
          model.lines.map((l) => <PlanLine key={l.id} line={l} onPress={() => toggle(l.id)} />)
        )}
      </Sticker>
    </Screen>
  );
}

function SliceRecords({
  line,
  records,
}: {
  line: CategoryLine;
  records: ReturnType<typeof categoryRecords>;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <Text style={[type.small, { color: colors.muted, textTransform: "uppercase" }]}>
        {line.name} · {records.length} {records.length === 1 ? "record" : "records"}
      </Text>
      {records.length === 0 ? (
        <Body muted>Nothing logged here yet.</Body>
      ) : (
        records.map((r) => (
          <Pressable
            key={r.id}
            accessibilityRole="button"
            onPress={() => router.push(`/record/${r.id}`)}
            style={{ minHeight: 44, flexDirection: "row", alignItems: "center" }}
          >
            <Text style={[type.body, { flex: 1, color: colors.text }]}>
              {dayMonth(r.date)} · {r.title}
            </Text>
            <Text style={[type.strong, { color: colors.text, fontVariant: ["tabular-nums"] }]}>
              {r.refund ? "+" : ""}
              {formatRM(r.amountSen)}
            </Text>
          </Pressable>
        ))
      )}
    </View>
  );
}

function PlanLine({ line, onPress }: { line: CategoryLine; onPress: () => void }) {
  const { colors } = useTheme();
  const over = line.remainingSen < 0;
  const share =
    line.allocationSen > 0 ? Math.min(1, Math.max(0, line.spentSen / line.allocationSen)) : 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${line.name}: ${formatRM(line.spentSen)} spent of ${formatRM(line.allocationSen)}`}
      onPress={onPress}
      style={{ gap: 4, paddingVertical: 4 }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: space.sm,
        }}
      >
        <Text style={[type.strong, { color: colors.text, flex: 1 }]}>
          {line.name} {categoryEmoji(line.name)}
          {line.kind === "set_aside" ? (
            <Text style={[type.small, { color: colors.muted }]}> · set aside</Text>
          ) : null}
        </Text>
        {line.allocationSen === 0 ? (
          // Not in the plan yet: offer to plan it right here (D-52).
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Add ${line.name} to your plan`}
            onPress={() =>
              router.push(line.kind === "set_aside" ? "/plan" : `/essential/${line.id}`)
            }
            hitSlop={8}
            style={({ pressed }) => ({
              minHeight: 32,
              justifyContent: "center",
              paddingHorizontal: space.sm,
              borderRadius: 99,
              borderWidth: 2,
              borderColor: colors.primary,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text style={[type.small, { color: colors.primary }]}>+ Add to plan</Text>
          </Pressable>
        ) : (
          <Text style={[type.small, { color: over ? colors.warning : colors.muted }]}>
            {over
              ? `${formatRM(sen(-line.remainingSen))} over`
              : `${formatRM(line.remainingSen)} left`}
          </Text>
        )}
      </View>
      {line.allocationSen > 0 ? (
        <View
          style={{
            height: 8,
            borderRadius: 99,
            borderWidth: 1.5,
            borderColor: colors.outline,
            backgroundColor: colors.card,
            overflow: "hidden",
          }}
        >
          <View
            style={{ width: `${share * 100}%`, height: "100%", backgroundColor: colors.primary }}
          />
        </View>
      ) : null}
      <Text style={[type.small, { color: colors.muted }]}>
        {formatRM(line.spentSen)} spent
        {line.allocationSen > 0 ? ` of ${formatRM(line.allocationSen)}` : ""}
      </Text>
    </Pressable>
  );
}
