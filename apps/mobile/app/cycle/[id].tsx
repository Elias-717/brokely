import { formatRM, inclusiveEnd, sen } from "@brokely/domain";
import { cycleSummary, getDraftCycle, startNextCycle, type SummaryLine } from "@brokely/local-db";
import { router, useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import { repo } from "../../src/db/client";
import { useRead } from "../../src/db/use-read";
import { dayMonth } from "../../src/lib/today";
import { Button, Empty, Heading, PageScreen, Sticker } from "../../src/ui/components";
import { space, type } from "../../src/ui/theme";
import { useTheme } from "../../src/ui/theme-context";

/**
 * S10 Plan finished (FR-PLN-14, FR-PLN-17, FR-PLN-18, D-18, D-19): original → final → actual for
 * the budget and every category, recomputed live, so records changed later still count. Then
 * "Start next plan" copies the final plan as a draft to check and approve (AC-48).
 */
export default function CycleSummaryScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const summary = useRead((db) => cycleSummary(db, id), [id]);
  const hasDraft = useRead((db) => getDraftCycle(db) !== undefined);

  if (!summary) {
    return (
      <PageScreen title="Plan summary">
        <Empty>This plan doesn't exist any more.</Empty>
      </PageScreen>
    );
  }
  const left = sen(summary.finalBudgetSen - summary.spentSen);
  const finished = summary.cycle.status === "completed";

  const next = () => {
    const started = startNextCycle(repo, summary.cycle.id);
    if (started.ok) router.push("/next-plan");
  };

  return (
    <PageScreen title="Plan summary">
      <Text style={[type.small, { color: colors.muted, marginTop: -space.sm }]}>
        {dayMonth(summary.range.start)} – {dayMonth(inclusiveEnd(summary.range))}
        {finished ? " · finished" : ""}
      </Text>

      <Sticker
        offset={4}
        background={colors.hero}
        outline={colors.heroOutline}
        style={{ padding: space.md, gap: space.xs }}
      >
        <Text style={[type.strong, { color: colors.onHero, fontSize: 14 }]}>You spent</Text>
        <Text style={[type.amount, { color: colors.onHero }]}>{formatRM(summary.spentSen)}</Text>
        <Text style={[type.body, { color: colors.onHero, fontSize: 14 }]}>
          of {formatRM(summary.finalBudgetSen)}
          {summary.originalBudgetSen !== summary.finalBudgetSen
            ? ` (started at ${formatRM(summary.originalBudgetSen)})`
            : ""}
          {" · "}
          {left >= 0 ? `${formatRM(left)} not spent` : `${formatRM(sen(-left))} over`}
        </Text>
      </Sticker>

      <Sticker style={{ padding: space.md, gap: space.sm }}>
        <Heading>By category</Heading>
        <View style={{ flexDirection: "row" }}>
          <Text style={[type.small, { flex: 1, color: colors.muted }]}>Planned at start → end</Text>
          <Text style={[type.small, { color: colors.muted }]}>Spent</Text>
        </View>
        {summary.lines.length === 0 ? (
          <Text style={[type.body, { color: colors.muted }]}>Nothing planned or spent.</Text>
        ) : (
          summary.lines.map((l) => <Line key={l.categoryId} line={l} />)
        )}
        <Text style={[type.small, { color: colors.muted }]}>
          {summary.revisions > 1
            ? `You changed the plan ${summary.revisions - 1} ${summary.revisions === 2 ? "time" : "times"}; "start" is the first version.`
            : "You kept the same plan the whole time."}
        </Text>
      </Sticker>

      <Text style={[type.small, { color: colors.muted }]}>
        Forgot something? Records from these dates can still be added or changed, and this summary
        updates.
      </Text>
      {finished ? (
        <Button label={hasDraft ? "Continue your next plan" : "Start next plan"} onPress={next} />
      ) : null}
    </PageScreen>
  );
}

function Line({ line }: { line: SummaryLine }) {
  const { colors } = useTheme();
  const over = line.finalSen > 0 && line.actualSen > line.finalSen;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 44 }}>
      <View style={{ flex: 1 }}>
        <Text style={[type.strong, { color: colors.text }]}>{line.name}</Text>
        <Text style={[type.small, { color: colors.muted }]}>
          {formatRM(line.originalSen)} → {formatRM(line.finalSen)}
          {line.kind === "set_aside" ? " · set aside" : ""}
        </Text>
      </View>
      <Text
        style={[
          type.strong,
          { color: over ? colors.warning : colors.text, fontVariant: ["tabular-nums"] },
        ]}
      >
        {formatRM(line.actualSen)}
      </Text>
    </View>
  );
}
