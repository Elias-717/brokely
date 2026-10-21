import { formatRM, inclusiveEnd, sen, type DateRange, type Sen } from "@brokely/domain";
import { router } from "expo-router";
import { useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { useRead } from "../../src/db/use-read";
import { categoryEmoji } from "../../src/lib/essentials-meta";
import {
  categoryRecords,
  readInsights,
  type CategoryLine,
  type InsightsModel,
} from "../../src/lib/insights-model";
import { dayMonth, today } from "../../src/lib/today";
import { Body, Button, Heading, Screen, Sticker, Title } from "../../src/ui/components";
import { Doughnut, type Slice } from "../../src/ui/doughnut";
import { fonts, space, type } from "../../src/ui/theme";
import { useTheme } from "../../src/ui/theme-context";

const OTHER = "other";
/** Meals always gets its own red slice, first from 12 o'clock (D-48). */
const MEALS = "Meals";

/** A forecast bound is a whole RM10 step (R-10), so it reads best without sen. */
const wholeRM = (amount: Sen) => `RM${Math.round(amount / 100)}`;

type PlanModel = Extract<InsightsModel, { kind: "plan" }>;

/**
 * S8 Insights (FR-INS-02…08): where the money went (doughnut with RM and %, tap a slice for its
 * records), daily average with coverage, the forecast as an estimate range or "not enough data
 * yet", still to come, and every category's plan, spending and what's left.
 * When there's little to show (D-77): no plan and nothing spent → what Insights will show and
 * both ways in (A); no plan but spending → this month's chart (B); a plan with nothing logged
 * yet → one "Getting started" card (C).
 */
export default function InsightsScreen() {
  const { colors } = useTheme();
  const day = today();
  const model = useRead((db) => readInsights(db, day), [day]);
  const [selected, setSelected] = useState<string | null>(null);
  const toggle = (key: string) => setSelected((now) => (now === key ? null : key));

  if (model.kind === "no-plan") {
    if (model.slices.length === 0) return <BrandNew />;
    // B: tracking without a plan still shows where this month's money went.
    return (
      <Screen>
        <Title>Insights</Title>
        <Text style={[type.small, { color: colors.muted, marginTop: -space.sm }]}>
          This month so far · {dayMonth(model.month.start)} – {dayMonth(day)}
        </Text>
        <SpendingChart
          lines={model.slices}
          allLines={model.slices}
          spentSen={model.spentSen}
          range={model.month}
          selected={selected}
          onToggle={toggle}
        />
        <Sticker
          background={colors.cardTint}
          style={{ padding: space.md, gap: space.xs, marginBottom: space.lg }}
        >
          <Text
            style={{ fontFamily: fonts.heavy, fontSize: 16, lineHeight: 22, color: colors.text }}
          >
            Want to know what's left?
          </Text>
          <Body muted>Make a plan and Insights adds what's left, your pace and a forecast.</Body>
          <Button label="Make a plan" onPress={() => router.push("/quick-start")} />
        </Sticker>
      </Screen>
    );
  }

  // C: nothing logged in the plan yet: one card instead of four empty ones.
  const starting = model.spentSen === 0 && model.coveredDays === 0;

  return (
    <Screen>
      <Title>Insights</Title>
      <Text style={[type.small, { color: colors.muted, marginTop: -space.sm }]}>
        {dayMonth(model.range.start)} – {dayMonth(inclusiveEnd(model.range))}
      </Text>

      {starting ? (
        <GettingStarted model={model} />
      ) : (
        <SpendingChart
          lines={model.slices}
          allLines={model.lines}
          spentSen={model.spentSen}
          range={model.range}
          selected={selected}
          onToggle={toggle}
        />
      )}

      {/* Daily average always with coverage (FR-INS-05) */}
      {starting ? null : (
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
      )}

      {/* Forecast only through the gate, as a labelled estimate range (FR-INS-06, FR-INS-08) */}
      {model.forecast.kind === "hidden" || starting ? null : (
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
            <ForecastWaiting forecast={model.forecast} />
          )}
        </Sticker>
      )}

      {/* Still to come, separate from spending (FR-INS-07) */}
      {starting ? null : (
        <Pressable accessibilityRole="button" onPress={() => router.push("/bills")}>
          <Sticker style={{ padding: space.md, flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Heading>Still to come</Heading>
              <Text style={[type.small, { color: colors.muted }]}>
                Bills & subscriptions not paid yet · not spending
              </Text>
            </View>
            <Text style={[type.strong, { color: colors.text }]}>
              {formatRM(model.stillToComeSen)}
            </Text>
          </Sticker>
        </Pressable>
      )}

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

/** A: nothing to show yet and no plan. What Insights will show, and both ways in. */
function BrandNew() {
  const { colors } = useTheme();
  const preview = [
    { key: "a", value: 38, color: colors.chartMeals, label: "" },
    { key: "b", value: 32, color: colors.chart[0]!, label: "" },
    { key: "c", value: 16, color: colors.chart[1]!, label: "" },
    { key: "d", value: 14, color: colors.chart[2]!, label: "" },
  ];
  return (
    <Screen>
      <Title>Insights</Title>
      <Sticker style={{ padding: space.md, gap: space.md, alignItems: "center" }}>
        <View
          style={{ opacity: 0.4 }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Doughnut
            slices={preview}
            centre="RM —"
            centreLabel="spent"
            selected={null}
            onSelect={() => undefined}
          />
        </View>
        <Text style={[type.small, { color: colors.muted, textAlign: "center" }]}>
          Where your money goes · your daily average · a forecast for the month
        </Text>
      </Sticker>
      <Sticker
        style={{ padding: space.md, flexDirection: "row", alignItems: "center", gap: space.md }}
      >
        <Image
          source={require("../../assets/mascot/main_design.png")}
          style={{ width: 56, height: 70 }}
          resizeMode="contain"
          accessibilityLabel="Brokely"
        />
        <Text
          style={{
            flex: 1,
            fontFamily: fonts.heavy,
            fontSize: 15,
            lineHeight: 21,
            color: colors.text,
          }}
        >
          Log what you spend and I'll show you where it goes. A plan adds what's left and a
          forecast.
        </Text>
      </Sticker>
      <Button label="Make a plan" onPress={() => router.push("/quick-start")} />
      <Button
        label="Log something first"
        variant="secondary"
        onPress={() => router.push("/quick-add")}
      />
    </Screen>
  );
}

/** C: a plan, nothing logged yet. What's done, the next step with its button, what's coming. */
function GettingStarted({ model }: { model: PlanModel }) {
  const { colors } = useTheme();
  const forecast = model.forecast;
  const step = (
    state: "done" | "next" | "later",
    title: string,
    detail: string,
    extra?: React.ReactNode,
    divider = true,
  ) => (
    <View
      style={{
        flexDirection: "row",
        gap: space.sm + 4,
        paddingVertical: 10,
        borderTopWidth: divider ? 2 : 0,
        borderTopColor: colors.background,
      }}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          borderWidth: 2,
          borderColor: colors.outline,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor:
            state === "done" ? colors.primary : state === "next" ? colors.cardTint : colors.card,
        }}
        accessibilityElementsHidden
      >
        <Text
          style={{
            fontFamily: fonts.heavy,
            fontSize: 14,
            color: state === "done" ? colors.onPrimary : colors.text,
          }}
        >
          {state === "done" ? "✓" : state === "next" ? "→" : "·"}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{
            fontFamily: fonts.heavy,
            fontSize: 15,
            lineHeight: 20,
            color: state === "later" ? colors.muted : colors.text,
          }}
          accessibilityLabel={`${state === "done" ? "Done" : state === "next" ? "Next" : "Later"}: ${title}. ${detail}`}
        >
          {title}
        </Text>
        <Text style={[type.small, { color: colors.muted }]}>{detail}</Text>
        {extra}
      </View>
    </View>
  );
  const dayOf = forecast.kind === "waiting" ? 14 - forecast.daysToGo : null;
  return (
    <Sticker style={{ padding: space.md, gap: 0 }}>
      <Heading>Getting started</Heading>
      {step(
        "done",
        "Plan made",
        `${formatRM(model.budgetSen)} for ${dayMonth(model.range.start)} – ${dayMonth(inclusiveEnd(model.range))}`,
        undefined,
        false,
      )}
      {step(
        "next",
        "Log your first spending",
        "Your chart starts with it",
        <View style={{ marginTop: space.xs }}>
          <Button label="+ Log spending" onPress={() => router.push("/quick-add")} />
        </View>,
      )}
      {step("later", "Daily average", "Shows after your first logged day")}
      {dayOf !== null
        ? step(
            "later",
            "Forecast",
            "From day 14, when most days are logged",
            <ProgressBar
              fraction={dayOf / 14}
              label={`Day ${dayOf} of 14 · ${14 - dayOf} ${14 - dayOf === 1 ? "day" : "days"} to go`}
            />,
          )
        : null}
    </Sticker>
  );
}

/** The forecast before day 14 (FR-INS-06): a progress bar instead of a sentence. */
function ForecastWaiting({
  forecast,
}: {
  forecast: Extract<PlanModel["forecast"], { kind: "waiting" }>;
}) {
  const day = 14 - forecast.daysToGo;
  return forecast.daysToGo > 0 ? (
    <>
      <ProgressBar
        fraction={day / 14}
        label={`Day ${day} of 14 · shows in ${forecast.daysToGo} ${forecast.daysToGo === 1 ? "day" : "days"}`}
      />
      <Body muted>
        An estimate of your month needs two weeks of records
        {forecast.coverageShort ? ", with most days logged." : "."}
      </Body>
    </>
  ) : (
    <Body muted>Not enough data yet. It shows once you've logged at least 70% of days.</Body>
  );
}

function ProgressBar({ fraction, label }: { fraction: number; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 4, marginTop: space.xs }} accessible accessibilityLabel={label}>
      <View
        style={{
          height: 12,
          borderRadius: 6,
          borderWidth: 1.5,
          borderColor: colors.outline,
          backgroundColor: colors.card,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            width: `${Math.max(4, Math.min(100, fraction * 100))}%`,
            height: "100%",
            backgroundColor: colors.primary,
          }}
        />
      </View>
      <Text style={[type.small, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

/**
 * Where it went (FR-INS-03, FR-INS-04): the doughnut, its legend with RM and %, and the
 * records behind a tapped slice. Used for a plan and, without one, for this month (S8 B).
 */
function SpendingChart({
  lines,
  allLines,
  spentSen,
  range,
  selected,
  onToggle,
}: {
  lines: readonly CategoryLine[];
  allLines: readonly CategoryLine[];
  spentSen: Sen;
  range: DateRange;
  selected: string | null;
  onToggle: (key: string) => void;
}) {
  const { colors } = useTheme();
  const records = useRead(
    (db) => (selected && selected !== OTHER ? categoryRecords(db, range, selected) : []),
    [selected, range.start, range.endExclusive],
  );
  // Meals is always its own red slice; the biggest others get one colour each (in the
  // categories' fixed order, so a colour follows its category); the rest fold together.
  const meals = lines.find((s) => s.name === MEALS);
  const others = lines.filter((s) => s.name !== MEALS);
  const top = new Set(others.slice(0, colors.chart.length).map((s) => s.id));
  const named = allLines.filter((l) => top.has(l.id));
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
  const selectedLine = allLines.find((l) => l.id === selected);

  return (
    <Sticker style={{ padding: space.md, gap: space.md }}>
      <Heading>Where it went</Heading>
      {slices.length === 0 ? (
        <Body muted>Nothing spent yet. Your chart fills in as you log.</Body>
      ) : (
        <>
          <View style={{ alignItems: "center" }}>
            <Doughnut
              slices={slices}
              centre={formatRM(spentSen)}
              centreLabel="spent"
              selected={selected}
              onSelect={onToggle}
            />
          </View>
          <View style={{ gap: 2 }}>
            {slices.map((s) => (
              <Pressable
                key={s.key}
                accessibilityRole="button"
                accessibilityState={{ selected: selected === s.key }}
                accessibilityLabel={`${s.label}: ${formatRM(s.amountSen)}, ${s.percent}%. Show records`}
                onPress={() => onToggle(s.key)}
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
            <Pressable key={l.id} accessibilityRole="button" onPress={() => onToggle(l.id)}>
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
