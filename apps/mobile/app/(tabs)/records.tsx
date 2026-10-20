import { addDays, type LocalDate } from "@brokely/domain";
import { checkInNoSpending, undoCheckIn } from "@brokely/local-db";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, SectionList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { repo } from "../../src/db/client";
import { useRead } from "../../src/db/use-read";
import { readRecords, type RecordFilter, type RecordRow } from "../../src/lib/records-model";
import { dayMonth, today, weekdayName } from "../../src/lib/today";
import { fonts, MIN_TOUCH, space, type } from "../../src/ui/theme";
import { useTheme } from "../../src/ui/theme-context";
import { useUndo } from "../../src/ui/undo";
import { pickDate } from "../../src/ui/date-picker";
import { BrokelyAvatar } from "../../src/ui/chat";
import { Button } from "../../src/ui/components";
import { Float } from "../../src/ui/motion";

const FILTERS: { value: RecordFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "spending", label: "Spending" },
  { value: "money-in", label: "Money in" },
  { value: "debts", label: "Debts" },
  { value: "bills", label: "Bills & subscriptions" },
];

/**
 * S5 Records (FR-TXN-01, FR-TXN-07, FR-TXN-08, FR-DEBT-06): everything logged, by day, newest
 * first. Tap a row to edit, delete or refund it; tap a check-in to undo it.
 */
export default function RecordsScreen() {
  const { colors } = useTheme();
  const showUndo = useUndo();
  const day = today();
  const [filter, setFilter] = useState<RecordFilter>("all");
  const days = useRead((db) => readRecords(db, filter), [filter]);
  const [problem, setProblem] = useState<string | null>(null);

  /** Pick a day (yesterday first) and mark it "No spending"; Undo for 5 seconds (D-60). */
  const markNoSpendDay = async () => {
    setProblem(null);
    const chosen = await pickDate(addDays(day, -1));
    if (!chosen) return;
    const saved = checkInNoSpending(repo, chosen, day);
    if (!saved.ok) return setProblem(saved.message);
    showUndo(`Marked ${dayMonth(chosen)} as no spending`, () => undoCheckIn(repo, chosen));
  };

  const dayTitle = (date: LocalDate) =>
    date === day
      ? `Today · ${weekdayName(day).slice(0, 3)} ${dayMonth(day)}`
      : `${weekdayName(date)}, ${dayMonth(date)}`;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={["top", "left", "right"]}
    >
      <View style={{ paddingHorizontal: space.md, paddingTop: space.md, gap: space.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Text style={[type.title, { color: colors.text, flex: 1 }]} accessibilityRole="header">
            Records
          </Text>
          {/* Mark an earlier day you spent nothing on (D-60); tap a check-in to remove it. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mark a day with no spending"
            onPress={markNoSpendDay}
            hitSlop={6}
            style={({ pressed }) => ({
              minHeight: 40,
              justifyContent: "center",
              paddingHorizontal: space.md,
              borderRadius: 99,
              borderWidth: 2,
              borderColor: colors.outline,
              backgroundColor: colors.card,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text style={[type.small, { color: colors.text }]}>+ No-spend day</Text>
          </Pressable>
        </View>
        {problem ? (
          <Text accessibilityRole="alert" style={[type.small, { color: colors.warning }]}>
            {problem}
          </Text>
        ) : null}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: space.sm }}
        >
          {FILTERS.map((f) => {
            const on = f.value === filter;
            return (
              <Pressable
                key={f.value}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => setFilter(f.value)}
                style={{
                  minHeight: MIN_TOUCH - 4,
                  justifyContent: "center",
                  paddingHorizontal: space.md,
                  borderRadius: 99,
                  borderWidth: 2,
                  borderColor: colors.outline,
                  backgroundColor: on ? colors.primary : colors.card,
                }}
              >
                <Text
                  style={{
                    fontFamily: on ? fonts.heavy : fonts.bold,
                    fontSize: 15,
                    color: on ? colors.onPrimary : colors.text,
                  }}
                >
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <SectionList
        sections={days.map((d) => ({ title: dayTitle(d.date), data: d.rows }))}
        keyExtractor={(row) => row.id}
        contentContainerStyle={{
          padding: space.md,
          paddingBottom: 120,
          gap: space.sm,
          // Lets the empty message sit in the middle of the screen.
          flexGrow: days.length === 0 ? 1 : undefined,
        }}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <Text
            style={[
              type.small,
              {
                color: colors.muted,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                paddingTop: space.sm,
              },
            ]}
          >
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => (
          <Row
            row={item}
            onPress={() => {
              if (item.kind === "check-in") {
                undoCheckIn(repo, item.date);
                showUndo("No spending check-in removed", () => checkInNoSpending(repo, item.date));
              } else {
                router.push(`/record/${item.id}`);
              }
            }}
          />
        )}
        ListEmptyComponent={<EmptyRecords filter={filter} />}
      />
    </SafeAreaView>
  );
}

function Row({ row, onPress }: { row: RecordRow; onPress: () => void }) {
  const { colors } = useTheme();
  const isCheckIn = row.kind === "check-in";
  const title = isCheckIn ? "No spending today" : row.title;
  const detail = isCheckIn ? "Check-in · tap to undo" : row.detail;
  const amountColor =
    row.kind === "transaction"
      ? row.style === "money-in"
        ? colors.tabActive
        : row.style === "not-spending"
          ? colors.muted
          : colors.text
      : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        isCheckIn
          ? `${title}. ${detail}`
          : `${title}, ${detail}, ${row.kind === "transaction" ? row.amount : ""}. Edit`
      }
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1, marginRight: 2, marginBottom: 2 })}
    >
      <View
        style={{
          position: "absolute",
          top: 2,
          left: 2,
          right: -2,
          bottom: -2,
          borderRadius: 14,
          backgroundColor: colors.shadow,
        }}
      />
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: space.sm,
          minHeight: 64,
          paddingHorizontal: space.sm,
          paddingVertical: space.sm,
          borderRadius: 14,
          borderWidth: 2,
          borderColor: colors.outline,
          backgroundColor: colors.card,
        }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            borderWidth: 2,
            borderColor: colors.outline,
            backgroundColor: colors.cardTint,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 20 }}>{isCheckIn ? "✓" : row.emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[type.strong, { color: colors.text }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[type.small, { color: colors.muted }]} numberOfLines={1}>
            {detail}
          </Text>
        </View>
        {row.kind === "transaction" ? (
          <Text
            style={{
              fontFamily: fonts.heading,
              fontSize: 18,
              color: amountColor,
              fontVariant: ["tabular-nums"],
            }}
          >
            {row.amount}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Empty Records: centred, with a small Brokely and one clear action. */
function EmptyRecords({ filter }: { filter: RecordFilter }) {
  const { colors } = useTheme();
  const all = filter === "all";
  return (
    <View
      style={{
        flexGrow: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: space.md,
        paddingHorizontal: space.lg,
      }}
    >
      <Float>
        <BrokelyAvatar size={96} />
      </Float>
      <Text style={[type.heading, { color: colors.text, textAlign: "center" }]}>
        {all ? "Nothing logged yet?" : "Nothing here yet"}
      </Text>
      <Text style={[type.body, { color: colors.muted, textAlign: "center" }]}>
        {all
          ? "Log what you spend and I'll keep count. It takes two taps."
          : "Records of this kind will show up here."}
      </Text>
      {all ? (
        <Button label="Log my first spending" onPress={() => router.push("/quick-add")} />
      ) : null}
    </View>
  );
}
