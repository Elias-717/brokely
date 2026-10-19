import type { LocalDate } from "@brokely/domain";
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

const FILTERS: { value: RecordFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "spending", label: "Spending" },
  { value: "money-in", label: "Money in" },
  { value: "debts", label: "Debts" },
  { value: "bills", label: "Bills" },
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
        <Text style={[type.title, { color: colors.text }]} accessibilityRole="header">
          Records
        </Text>
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
        contentContainerStyle={{ padding: space.md, paddingBottom: 120, gap: space.sm }}
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
        ListEmptyComponent={
          <Text
            style={[type.body, { color: colors.muted, textAlign: "center", paddingTop: space.xl }]}
          >
            {filter === "all" ? "Nothing logged yet. Tap + when you spend." : "Nothing here yet."}
          </Text>
        }
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
