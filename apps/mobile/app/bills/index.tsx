import { formatRM, inclusiveEnd, type LocalDate } from "@brokely/domain";
import { unskipScheduledItem } from "@brokely/local-db";
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { repo } from "../../src/db/client";
import { useRead } from "../../src/db/use-read";
import { BILL_PRESETS, billTypeOf } from "../../src/lib/bill-types";
import { readBills, type BillItem, type BillsModel } from "../../src/lib/bills-model";
import { categoryEmoji } from "../../src/lib/essentials-meta";
import { dayMonth, today } from "../../src/lib/today";
import { Button, Heading, PageScreen, Sticker } from "../../src/ui/components";
import { Tabs } from "../../src/ui/tabs";
import { fonts, MIN_TOUCH, space, type } from "../../src/ui/theme";
import { useTheme } from "../../src/ui/theme-context";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** Whole days from `a` to `b` (local dates). */
function daysBetween(a: LocalDate, b: LocalDate): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

/**
 * S6 Bills & subscriptions (FR-CAT-03…07, D-17, R-05, D-77): a summary first (still to come,
 * paid, plan end); this plan's dates grouped by urgency, with Mark paid only where it matters
 * now and every row opening Mark paid (where Skip lives); Done for paid and skipped; then every
 * bill once with its next date. A first visit offers the usual ones in one tap.
 */
export default function BillsScreen() {
  const day = today();
  const model = useRead((db) => readBills(db, day), [day]);
  const [tab, setTab] = useState<"upcoming" | "done">("upcoming");

  if (model.bills.length === 0 && (model.items?.length ?? 0) === 0) return <NothingYet />;

  const upcoming = model.items?.filter((i) => i.status === "upcoming") ?? [];
  const done = model.items?.filter((i) => i.status !== "upcoming").reverse() ?? [];
  const now = upcoming.filter((i) => i.dueDate <= day);
  const later = upcoming.filter((i) => i.dueDate > day);

  return (
    <PageScreen
      title="Bills & subscriptions"
      action={<Button label="+ Add" onPress={() => router.push("/bills/edit")} />}
    >
      {model.items === null || !model.summary || !model.range ? (
        <NoPlan />
      ) : (
        <>
          <Summary summary={model.summary} range={model.range} day={day} />
          <Tabs
            tabs={[
              { key: "upcoming", label: `Upcoming · ${upcoming.length}` },
              { key: "done", label: `Done · ${done.length}` },
            ]}
            value={tab}
            onChange={setTab}
          />
          {tab === "upcoming" ? (
            upcoming.length === 0 ? (
              <Quiet text="Nothing still to come in this plan. 🎉" />
            ) : (
              <>
                {now.length > 0 ? (
                  <Group title="Needs paying">
                    {now.map((item, i) => (
                      <Row key={item.id} item={item} day={day} first={i === 0} />
                    ))}
                  </Group>
                ) : null}
                {later.length > 0 ? (
                  <Group title="Later this plan">
                    {later.map((item, i) => (
                      <Row key={item.id} item={item} day={day} first={i === 0} />
                    ))}
                  </Group>
                ) : null}
                <Hint text="Tap a bill to mark it paid or skip it." />
              </>
            )
          ) : done.length === 0 ? (
            <Quiet text="Nothing paid yet. Tap a bill when you pay it." />
          ) : (
            <Group>
              {done.map((item, i) => (
                <DoneRow key={item.id} item={item} first={i === 0} />
              ))}
            </Group>
          )}
        </>
      )}
      <YourBills bills={model.bills} day={day} />
    </PageScreen>
  );
}

function Hint({ text }: { text: string }) {
  const { colors } = useTheme();
  return <Text style={[type.small, { color: colors.muted, textAlign: "center" }]}>{text}</Text>;
}

/** Still to come this plan, in the style of Home's "Left in plan" card. */
function Summary({
  summary,
  range,
  day,
}: {
  summary: NonNullable<BillsModel["summary"]>;
  range: NonNullable<BillsModel["range"]>;
  day: LocalDate;
}) {
  const { colors, scheme } = useTheme();
  const next = summary.next;
  const nextText = next
    ? `next: ${next.name}, ${next.dueDate === day ? "today" : next.dueDate < day ? `was due ${dayMonth(next.dueDate)}` : dayMonth(next.dueDate)}`
    : "all done for this plan";
  return (
    <View
      accessible
      accessibilityLabel={`Still to come this plan: ${formatRM(summary.stillToComeSen)}, ${summary.upcoming} bills, ${nextText}. Paid ${formatRM(summary.paidSen)}. Plan ends ${dayMonth(inclusiveEnd(range))}.`}
      style={{
        backgroundColor: colors.hero,
        borderRadius: 24,
        borderWidth: scheme === "dark" ? 1 : 2,
        borderColor: colors.heroOutline,
        padding: 20,
        gap: space.xs,
      }}
    >
      <Text style={[type.strong, { color: colors.onHero, fontSize: 15, opacity: 0.9 }]}>
        Still to come this plan
      </Text>
      <Text style={[type.amount, { color: colors.onHero, fontSize: 40, lineHeight: 44 }]}>
        {formatRM(summary.stillToComeSen)}
      </Text>
      <Text style={[type.body, { color: colors.onHero, fontSize: 14, opacity: 0.9 }]}>
        {summary.upcoming} {summary.upcoming === 1 ? "bill" : "bills"} · {nextText}
      </Text>
      <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.xs }}>
        {[
          ["Paid", formatRM(summary.paidSen)],
          ["Plan ends", dayMonth(inclusiveEnd(range))],
        ].map(([label, value]) => (
          <View
            key={label}
            style={{ flex: 1, backgroundColor: colors.heroTile, borderRadius: 12, padding: 10 }}
          >
            <Text style={[type.small, { color: colors.onHero, opacity: 0.9 }]}>{label}</Text>
            <Text style={{ fontFamily: fonts.heavy, fontSize: 16, color: colors.onHero }}>
              {value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Group({ title, children }: { title?: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: space.xs }}>
      {title ? (
        <Text
          accessibilityRole="header"
          style={{ fontFamily: fonts.heavy, fontSize: 13, letterSpacing: 0.5, color: colors.muted }}
        >
          {title.toUpperCase()}
        </Text>
      ) : null}
      <Sticker style={{ padding: 0 }}>{children}</Sticker>
    </View>
  );
}

/** "15 / NOV": green today, mustard when late, tinted when done. */
function DateBadge({ date, tone }: { date: LocalDate; tone: "today" | "late" | "plain" | "done" }) {
  const { colors } = useTheme();
  const [, m, d] = date.split("-").map(Number) as [number, number, number];
  const bg =
    tone === "today"
      ? colors.primary
      : tone === "late"
        ? colors.destructive
        : tone === "done"
          ? colors.cardTint
          : colors.background;
  const fg =
    tone === "today" ? colors.onPrimary : tone === "late" ? colors.onDestructive : colors.text;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: 48,
        height: 52,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: colors.outline,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontFamily: fonts.heading, fontSize: 20, lineHeight: 22, color: fg }}>
        {d}
      </Text>
      <Text style={{ fontFamily: fonts.heavy, fontSize: 10, color: fg }}>{MONTHS[m - 1]}</Text>
    </View>
  );
}

function rowStyle(first: boolean, colors: ReturnType<typeof useTheme>["colors"]) {
  return {
    minHeight: 72,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: space.md,
    borderTopWidth: first ? 0 : 2,
    borderTopColor: colors.background,
  };
}

/** An upcoming date. Late or due today: amount and status, and Mark paid on the row. */
function Row({ item, day, first }: { item: BillItem; day: LocalDate; first: boolean }) {
  const { colors } = useTheme();
  const late = item.dueDate < day;
  const today = item.dueDate === day;
  const urgent = late || today;
  const inDays = daysBetween(day, item.dueDate);
  const status = late
    ? `Was due ${dayMonth(item.dueDate)}`
    : today
      ? "Due today"
      : inDays === 1
        ? "Tomorrow"
        : `In ${inDays} days`;
  const open = () => router.push(`/bills/pay/${item.id}`);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${formatRM(item.amountSen)}, ${status}. Mark paid or skip`}
      onPress={open}
      style={({ pressed }) => [rowStyle(first, colors), { opacity: pressed ? 0.7 : 1 }]}
    >
      <DateBadge date={item.dueDate} tone={late ? "late" : today ? "today" : "plain"} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ fontFamily: fonts.heavy, fontSize: 16, lineHeight: 22, color: colors.text }}>
          {item.name} {categoryEmoji(item.categoryName)}
        </Text>
        {urgent ? (
          <Text style={{ fontFamily: fonts.heavy, fontSize: 14, color: colors.text }}>
            {formatRM(item.amountSen)}
          </Text>
        ) : null}
        <Text style={[type.small, { color: late ? colors.warning : colors.muted }]}>{status}</Text>
      </View>
      {urgent ? (
        <Button label="Mark paid" onPress={open} />
      ) : (
        <Text
          style={{
            fontFamily: fonts.heavy,
            fontSize: 16,
            color: colors.text,
            fontVariant: ["tabular-nums"],
          }}
        >
          {formatRM(item.amountSen)}
        </Text>
      )}
    </Pressable>
  );
}

/** Paid (with what was really paid; opens the record) or skipped (Undo). */
function DoneRow({ item, first }: { item: BillItem; first: boolean }) {
  const { colors } = useTheme();
  const paid = item.status === "paid";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        paid
          ? `${item.name}, paid ${formatRM(item.paidSen ?? item.amountSen)}. See the record`
          : `${item.name}, skipped. Undo skip`
      }
      onPress={() =>
        paid && item.transactionId
          ? router.push(`/record/${item.transactionId}`)
          : unskipScheduledItem(repo, item.id)
      }
      style={({ pressed }) => [rowStyle(first, colors), { opacity: pressed ? 0.7 : 1 }]}
    >
      <DateBadge date={item.dueDate} tone="done" />
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ fontFamily: fonts.heavy, fontSize: 16, lineHeight: 22, color: colors.text }}>
          {item.name} {categoryEmoji(item.categoryName)}
        </Text>
        <Text style={[type.small, { color: colors.muted }]}>
          {paid
            ? `Paid${item.paidOn ? ` ${dayMonth(item.paidOn)}` : ""} · see the record`
            : "Skipped · tap to undo"}
        </Text>
      </View>
      <Text
        style={{
          fontFamily: fonts.heavy,
          fontSize: 16,
          color: colors.text,
          fontVariant: ["tabular-nums"],
        }}
      >
        {paid ? formatRM(item.paidSen ?? item.amountSen) : "—"}
      </Text>
    </Pressable>
  );
}

/** Every bill once: how it repeats, its next date, its amount; tap to change. */
function YourBills({ bills, day }: { bills: BillsModel["bills"]; day: LocalDate }) {
  const { colors } = useTheme();
  if (bills.length === 0) return null;
  return (
    <View style={{ gap: space.sm, marginBottom: space.lg }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <Heading>Your bills</Heading>
        </View>
        <Text style={[type.small, { color: colors.muted }]}>{bills.length}</Text>
      </View>
      <Sticker style={{ padding: 0 }}>
        {bills.map((bill, i) => {
          const next = bill.next
            ? bill.next < day
              ? ` · was due ${dayMonth(bill.next)}`
              : bill.next === day
                ? " · next today"
                : ` · next ${dayMonth(bill.next)}`
            : "";
          return (
            <Pressable
              key={bill.id}
              accessibilityRole="button"
              accessibilityLabel={`${bill.name}, ${formatRM(bill.amountSen)}, ${bill.describe}${next}. Change`}
              onPress={() => router.push(`/bills/edit?id=${bill.id}`)}
              style={({ pressed }) => [
                rowStyle(i === 0, colors),
                { minHeight: 64, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: colors.cardTint,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 20 }}>{billTypeOf(bill.categoryName).emoji}</Text>
              </View>
              <View style={{ flex: 1, gap: 1 }}>
                <Text
                  style={{
                    fontFamily: fonts.heavy,
                    fontSize: 16,
                    lineHeight: 22,
                    color: colors.text,
                  }}
                >
                  {bill.name}
                </Text>
                <Text style={[type.small, { color: colors.muted }]}>
                  {bill.describe}
                  {next}
                </Text>
              </View>
              <Text
                style={{
                  fontFamily: fonts.heavy,
                  fontSize: 15,
                  color: colors.text,
                  fontVariant: ["tabular-nums"],
                }}
              >
                {formatRM(bill.amountSen)}
              </Text>
              <Text style={[type.heading, { color: colors.muted }]}>›</Text>
            </Pressable>
          );
        })}
      </Sticker>
    </View>
  );
}

/** Bills exist but no plan covers today: dates only exist inside a plan (FR-CAT-04). */
function NoPlan() {
  const { colors } = useTheme();
  return (
    <Sticker background={colors.cardTint} style={{ padding: space.md, gap: space.xs }}>
      <Text style={{ fontFamily: fonts.heavy, fontSize: 16, color: colors.text }}>
        Dates show up with a plan
      </Text>
      <Text style={[type.body, { color: colors.muted }]}>
        Make a plan and your bills get their dates, a total still to come and Mark paid.
      </Text>
      <Button label="Make a plan" onPress={() => router.push("/quick-start")} />
    </Sticker>
  );
}

function Quiet({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <Sticker style={{ padding: space.md }}>
      <Text style={[type.body, { color: colors.muted, textAlign: "center" }]}>{text}</Text>
    </Sticker>
  );
}

/** A first visit: Brokely in one line, the usual ones one tap away (each opens the form filled in). */
function NothingYet() {
  const { colors } = useTheme();
  return (
    <PageScreen
      title="Bills & subscriptions"
      action={<Button label="+ Add" onPress={() => router.push("/bills/edit")} />}
    >
      <Image
        source={require("../../assets/mascot/main_design.webp")}
        style={{ width: "100%", height: 170 }}
        resizeMode="contain"
        accessibilityLabel="Brokely"
      />
      <Sticker style={{ padding: space.md }}>
        <Text
          style={{
            fontFamily: fonts.heavy,
            fontSize: 17,
            lineHeight: 23,
            color: colors.text,
            textAlign: "center",
          }}
        >
          Something you pay every week or month? Add it once and I'll keep it in your plan.
        </Text>
      </Sticker>
      <Text
        style={{ fontFamily: fonts.heavy, fontSize: 13, letterSpacing: 0.5, color: colors.muted }}
      >
        QUICK ADD
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {BILL_PRESETS.map((p) => (
          <Pressable
            key={p.label}
            accessibilityRole="button"
            accessibilityLabel={`Add ${p.label}`}
            onPress={() => router.push(`/bills/edit?preset=${encodeURIComponent(p.label)}`)}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Sticker
              rounded={12}
              offset={2}
              style={{ minHeight: MIN_TOUCH, paddingHorizontal: 14, justifyContent: "center" }}
            >
              <Text style={{ fontFamily: fonts.heavy, fontSize: 15, color: colors.text }}>
                {p.emoji} {p.label}
              </Text>
            </Sticker>
          </Pressable>
        ))}
      </View>
      <Button
        label="+ Something else"
        variant="secondary"
        onPress={() => router.push("/bills/edit")}
      />
    </PageScreen>
  );
}
