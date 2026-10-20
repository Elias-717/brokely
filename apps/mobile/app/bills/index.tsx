import { formatRM } from "@brokely/domain";
import { skipScheduledItem, unskipScheduledItem } from "@brokely/local-db";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { repo } from "../../src/db/client";
import { useRead } from "../../src/db/use-read";
import { readBills, type BillItem } from "../../src/lib/bills-model";
import { categoryEmoji } from "../../src/lib/essentials-meta";
import { dayMonth, today } from "../../src/lib/today";
import { Button, Empty, Heading, PageScreen, Sticker } from "../../src/ui/components";
import { Chip } from "../../src/ui/sheet-parts";
import { space, type } from "../../src/ui/theme";
import { useTheme } from "../../src/ui/theme-context";
import { useUndo } from "../../src/ui/undo";

/**
 * S6 Bills (FR-CAT-03…07, D-17, R-05): this plan's bill dates, Upcoming or Paid; Mark paid opens
 * the S6b sheet, Skip offers Undo; below, every bill with its repeat, tap to change.
 */
export default function BillsScreen() {
  const { colors } = useTheme();
  const day = today();
  const model = useRead((db) => readBills(db, day), [day]);
  const [tab, setTab] = useState<"upcoming" | "done">("upcoming");
  const showUndo = useUndo();

  const upcoming = model.items?.filter((i) => i.status === "upcoming") ?? [];
  const done = model.items?.filter((i) => i.status !== "upcoming").reverse() ?? [];
  const list = tab === "upcoming" ? upcoming : done;

  const skip = (item: BillItem) => {
    const skipped = skipScheduledItem(repo, item.id);
    if (skipped.ok) {
      showUndo(`Skipped ${item.name} · ${dayMonth(item.dueDate)}`, () =>
        unskipScheduledItem(repo, item.id),
      );
    }
  };

  return (
    <PageScreen
      title="Bills & subscriptions"
      action={<Button label="+ New" onPress={() => router.push("/bills/edit")} />}
    >
      {model.items === null ? (
        <Empty>Bill dates show up once you have a plan. You can still add bills now.</Empty>
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Chip
              label={`Upcoming · ${upcoming.length}`}
              selected={tab === "upcoming"}
              onPress={() => setTab("upcoming")}
            />
            <Chip
              label={`Paid · ${done.length}`}
              selected={tab === "done"}
              onPress={() => setTab("done")}
            />
          </View>

          {list.length === 0 ? (
            <Empty>
              {tab === "upcoming"
                ? "Nothing still to come in this plan."
                : "Nothing paid yet. Tap Mark paid when you pay one."}
            </Empty>
          ) : (
            list.map((item) => (
              <Sticker key={item.id} style={{ padding: space.md, gap: space.sm }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[type.strong, { color: colors.text }]}>
                      {item.name} {categoryEmoji(item.categoryName)}
                    </Text>
                    <Text style={[type.small, { color: colors.muted }]}>{dueLine(item, day)}</Text>
                  </View>
                  <Text
                    style={[type.strong, { color: colors.text, fontVariant: ["tabular-nums"] }]}
                  >
                    {formatRM(item.paidSen ?? item.amountSen)}
                  </Text>
                </View>
                {item.status === "upcoming" ? (
                  <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
                    <Button
                      label="Mark paid"
                      onPress={() => router.push(`/bills/pay/${item.id}`)}
                    />
                    <Button label="Skip" variant="link" onPress={() => skip(item)} />
                  </View>
                ) : item.status === "skipped" ? (
                  <Button
                    label="Undo skip"
                    variant="link"
                    onPress={() => unskipScheduledItem(repo, item.id)}
                  />
                ) : item.transactionId ? (
                  <Button
                    label="See the record"
                    variant="link"
                    onPress={() => router.push(`/record/${item.transactionId}`)}
                  />
                ) : null}
              </Sticker>
            ))
          )}
        </>
      )}

      <Heading>Your bills & subscriptions</Heading>
      {model.bills.length === 0 ? (
        <Empty>
          Nothing yet. Add what you pay on a set day: a phone plan, Spotify, Netflix, a gym or a
          weekly bus pass.
        </Empty>
      ) : (
        model.bills.map((bill) => (
          <Pressable
            key={bill.id}
            accessibilityRole="button"
            accessibilityLabel={`${bill.name}, ${formatRM(bill.amountSen)}, ${bill.describe}. Change`}
            onPress={() => router.push(`/bills/edit?id=${bill.id}`)}
          >
            <Sticker style={{ padding: space.md, gap: 2 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={[type.strong, { color: colors.text }]}>
                  {bill.name} {categoryEmoji(bill.categoryName)}
                </Text>
                <Text style={[type.strong, { color: colors.text }]}>
                  {formatRM(bill.amountSen)}
                </Text>
              </View>
              <Text style={[type.small, { color: colors.muted }]}>
                {bill.describe} · {bill.categoryName}
              </Text>
            </Sticker>
          </Pressable>
        ))
      )}
    </PageScreen>
  );
}

function dueLine(item: BillItem, day: string): string {
  if (item.status === "paid") {
    return `Paid${item.paidOn ? ` on ${dayMonth(item.paidOn)}` : ""} · due ${dayMonth(item.dueDate)}`;
  }
  if (item.status === "skipped") return `Skipped · was due ${dayMonth(item.dueDate)}`;
  if (item.dueDate === day) return "Due today";
  if (item.dueDate < day) return `Was due ${dayMonth(item.dueDate)}`;
  return `Due ${dayMonth(item.dueDate)}`;
}
