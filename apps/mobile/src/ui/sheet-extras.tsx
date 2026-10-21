import { formatRM, sen, type LocalDate, type Sen } from "@brokely/domain";
import { listWalletChecks } from "@brokely/local-db";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useRead } from "../db/use-read";
import { readDebts } from "../lib/debts-model";
import { categoryEmoji } from "../lib/essentials-meta";
import {
  billHistory,
  categoryInPlan,
  moneyInContext,
  recentPurchases,
  type RecentPurchase,
} from "../lib/sheet-extras";
import { dayMonth } from "../lib/today";
import { GroupLabel } from "./allocation-fields";
import { Sticker } from "./components";
import { ProgressBar } from "./progress-bar";
import { fonts, MIN_TOUCH, space, type } from "./theme";
import { useTheme } from "./theme-context";

/**
 * What a sheet shows once pulled up to full screen (D-87): context that helps finish the entry.
 * Never a balance (BR-12), and nothing here saves: a tap only fills the form or opens a sheet.
 */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: space.xs, marginTop: space.sm }}>
      <GroupLabel>{title}</GroupLabel>
      {children}
    </View>
  );
}

/** A list in one sticker; rows divided by a line. */
function List({ children }: { children: ReactNode }) {
  return (
    <Sticker offset={2} rounded={14} style={{ padding: 0, overflow: "hidden" }}>
      {children}
    </Sticker>
  );
}

function Row({
  title,
  detail,
  amount,
  amountColor,
  first,
  onPress,
  action,
}: {
  title: string;
  detail?: string;
  amount: string;
  amountColor?: string;
  first: boolean;
  onPress?: () => void;
  /** What a tap does, for screen readers, e.g. "Fill the form". */
  action?: string;
}) {
  const { colors } = useTheme();
  const body = (
    <>
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          style={{ fontFamily: fonts.heavy, fontSize: 15, color: colors.text }}
        >
          {title}
        </Text>
        {detail ? (
          <Text numberOfLines={1} style={[type.small, { color: colors.muted }]}>
            {detail}
          </Text>
        ) : null}
      </View>
      <Text
        style={{
          fontFamily: fonts.heavy,
          fontSize: 15,
          color: amountColor ?? colors.text,
          fontVariant: ["tabular-nums"],
        }}
      >
        {amount}
      </Text>
      {onPress ? (
        <Text style={{ fontFamily: fonts.heading, fontSize: 18, color: colors.muted }}>›</Text>
      ) : null}
    </>
  );
  const style = {
    minHeight: MIN_TOUCH,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: space.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: first ? 0 : 2,
    borderTopColor: colors.background,
  };
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}${detail ? `, ${detail}` : ""}, ${amount}`}
      accessibilityHint={action}
      onPress={onPress}
      style={({ pressed }) => ({ ...style, opacity: pressed ? 0.7 : 1 })}
    >
      {body}
    </Pressable>
  ) : (
    <View accessible style={style}>
      {body}
    </View>
  );
}

/** Spent: how much of the chosen category's plan is used, then recent purchases to repeat. */
export function SpentExtras({
  day,
  category,
  typedSen,
  categoryName,
  onRepeat,
}: {
  day: LocalDate;
  category: { id: string; name: string } | null;
  typedSen: Sen | null;
  categoryName: (id: string) => string;
  onRepeat: (purchase: RecentPurchase) => void;
}) {
  const { colors } = useTheme();
  const used = useRead(
    (db) => (category ? categoryInPlan(db, day, category.id) : null),
    [day, category?.id],
  );
  const recent = useRead((db) => recentPurchases(db, day), [day]);
  const typed = typedSen ?? 0;

  let meter: ReactNode = null;
  if (category && used) {
    const after = used.spentSen + typed;
    if (used.plannedSen === null) {
      meter = (
        <Text style={[type.small, { color: colors.muted }]}>
          {category.name} isn't in your plan · {formatRM(used.spentSen)} spent on it so far
        </Text>
      );
    } else {
      const left = used.plannedSen - after;
      meter = (
        <Sticker offset={2} rounded={14} style={{ padding: 12, gap: 2 }}>
          <Text style={{ fontFamily: fonts.heavy, fontSize: 15, color: colors.text }}>
            {categoryEmoji(category.name)} {category.name}
          </Text>
          <Text accessibilityLiveRegion="polite" style={[type.body, { color: colors.text }]}>
            {left >= 0
              ? `${formatRM(sen(left))} left of ${formatRM(used.plannedSen)}${typed > 0 ? " after this" : ""}`
              : `${formatRM(sen(-left))} more than the ${formatRM(used.plannedSen)} planned${typed > 0 ? " after this" : ""}`}
          </Text>
          <ProgressBar
            fraction={used.plannedSen > 0 ? after / used.plannedSen : 1}
            label={`${formatRM(sen(after))} spent in this plan`}
          />
        </Sticker>
      );
    }
  }

  return (
    <>
      {meter ? <Section title="In this plan">{meter}</Section> : null}
      {recent.length > 0 ? (
        <Section title="Repeat a recent one">
          <List>
            {recent.map((p, i) => (
              <Row
                key={`${p.amountSen}-${p.categoryId}-${p.note}`}
                title={p.note || categoryName(p.categoryId)}
                detail={`${categoryName(p.categoryId)} · ${dayMonth(p.localDate)}`}
                amount={formatRM(p.amountSen)}
                first={i === 0}
                onPress={() => onRepeat(p)}
                action="Fills the amount, category and note. Save is still up to you"
              />
            ))}
          </List>
        </Section>
      ) : null}
    </>
  );
}

/** Money in: this plan's money in against its budget, and recent money in to repeat. */
export function MoneyInExtras({
  day,
  onRepeat,
}: {
  day: LocalDate;
  onRepeat: (entry: { amountSen: Sen; note: string }) => void;
}) {
  const { colors } = useTheme();
  const context = useRead((db) => moneyInContext(db, day), [day]);
  return (
    <>
      {context.plan ? (
        <Section title="In this plan">
          <Sticker offset={2} rounded={14} style={{ padding: 12, gap: 2 }}>
            <Text style={[type.body, { color: colors.text }]}>
              {formatRM(context.plan.inSen)} money in so far · your budget is{" "}
              {formatRM(context.plan.budgetSen)}
            </Text>
            {context.plan.inSen > context.plan.budgetSen ? (
              <Text style={[type.small, { color: colors.muted }]}>
                That's more than your budget. You can add the difference in Your plan.
              </Text>
            ) : null}
          </Sticker>
        </Section>
      ) : null}
      {context.repeat.length > 0 ? (
        <Section title="Repeat a recent one">
          <List>
            {context.repeat.map((r, i) => (
              <Row
                key={`${r.amountSen}-${r.note}`}
                title={r.note || "Money in"}
                detail={dayMonth(r.localDate)}
                amount={formatRM(r.amountSen)}
                amountColor={colors.income}
                first={i === 0}
                onPress={() => onRepeat(r)}
                action="Fills the amount and where it's from. Save is still up to you"
              />
            ))}
          </List>
        </Section>
      ) : null}
    </>
  );
}

/** More: open debts; a tap opens its repayment, so a payback is never saved as a new loan. */
export function DebtExtras() {
  const { colors } = useTheme();
  const debts = useRead((db) => readDebts(db), []);
  const open = [...debts.owedToMe, ...debts.iOwe].slice(0, 5);
  if (open.length === 0) return null;
  return (
    <Section title="Paying back? Pick the debt">
      <List>
        {open.map((d, i) => (
          <Row
            key={d.id}
            title={d.name}
            detail={d.direction === "owed_to_me" ? "Owes you" : "You owe"}
            amount={formatRM(d.outstandingSen)}
            amountColor={d.direction === "owed_to_me" ? colors.income : colors.expense}
            first={i === 0}
            onPress={() => router.replace(`/debts/repay/${d.id}`)}
            action="Opens the repayment for this debt"
          />
        ))}
      </List>
    </Section>
  );
}

/**
 * Wallet check: earlier checks with what was counted. What the records say now stays hidden
 * until this check is saved (D-85).
 */
export function WalletExtras() {
  const checks = useRead((db) => listWalletChecks(db, 3), []);
  if (checks.length === 0) return null;
  return (
    <Section title="Your last checks">
      <List>
        {checks.map((c, i) => (
          <Row
            key={c.id}
            title={dayMonth(c.localDate as LocalDate)}
            detail={c.note || undefined}
            amount={formatRM(sen(c.amountSen))}
            first={i === 0}
          />
        ))}
      </List>
    </Section>
  );
}

/** Mark paid: this bill's earlier payments and its next date. */
export function BillExtras({ billId, dueDate }: { billId: string; dueDate: LocalDate }) {
  const { colors } = useTheme();
  const history = useRead((db) => billHistory(db, billId, dueDate), [billId, dueDate]);
  return (
    <>
      {history.paid.length > 0 ? (
        <Section title="Paid before">
          <List>
            {history.paid.map((p, i) => (
              <Row
                key={p.dueDate}
                title={`Due ${dayMonth(p.dueDate)}`}
                detail={`Paid ${dayMonth(p.paidOn)}`}
                amount={formatRM(p.paidSen)}
                first={i === 0}
              />
            ))}
          </List>
        </Section>
      ) : null}
      <Text style={[type.small, { color: colors.muted, marginTop: space.xs }]}>
        {history.next
          ? `Next one after this: ${dayMonth(history.next)}`
          : "No later date for this bill in your plan yet."}
      </Text>
    </>
  );
}
