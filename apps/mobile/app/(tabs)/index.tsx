import { formatRM, type Sen } from "@brokely/domain";
import {
  checkInNoSpending,
  completeEndedCycles,
  dismissCard,
  getNickname,
  postponeCard,
  undoCheckIn,
} from "@brokely/local-db";
import { router } from "expo-router";
import { useEffect } from "react";
import { Image, Pressable, Text, useWindowDimensions, View } from "react-native";
import { repo } from "../../src/db/client";
import { useRead } from "../../src/db/use-read";
import { homeStatus } from "../../src/lib/brokely-lines";
import { categoryEmoji, essentialMeta } from "../../src/lib/essentials-meta";
import { readHome } from "../../src/lib/home-model";
import { dayMonth, today } from "../../src/lib/today";
import { AnimatedAmount } from "../../src/ui/animated-amount";
import { BrokelyAvatar } from "../../src/ui/chat";
import { Button, Screen, Sticker } from "../../src/ui/components";
import { ProgressRing } from "../../src/ui/progress-ring";
import { fonts, radius, space, type } from "../../src/ui/theme";
import { useTheme } from "../../src/ui/theme-context";
import { useUndo } from "../../src/ui/undo";

/** The full mascot picture (author's main design). */
const MASCOT = require("../../assets/mascot/main_design.png");

/** A forecast bound is a whole RM10 step (R-10), so it reads best without sen. */
const wholeRM = (amount: Sen) => `RM${Math.round(amount / 100)}`;

/** A real minus sign (U+2212), read as "minus" by screen readers (D-54). */
const MINUS = "−";

/**
 * S3a Home (FR-INS-01, FR-INS-02, FR-INS-06, FR-INS-07, FR-PLN-20, D-24, D-28, D-30, D-35, D-37,
 * D-58): Brokely and a status line, left in plan with a daily guide and a ring of the budget
 * used, then spending so far, the next essential card, still to come and recent spending.
 */
export default function HomeScreen() {
  const { colors, scheme } = useTheme();
  const day = today();
  // A plan whose end date has passed completes by itself (FR-PLN-17, D-18).
  useEffect(() => {
    completeEndedCycles(repo, day);
  }, [day]);
  const home = useRead((db) => readHome(db, day), [day]);
  const nickname = useRead(getNickname);
  const showUndo = useUndo();
  const { width } = useWindowDimensions();
  // The ring stays smaller than the amount beside it, also on narrow phones (D-58).
  const ringSize = Math.round(Math.min(104, Math.max(80, width * 0.24)));

  // Home header (D-65): the full Brokely picture beside the greeting; no date line, the
  // budget card already says how many days are left.
  const header = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
      <Image
        source={MASCOT}
        style={{ width: 72, height: 90 }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
        accessibilityLabel="Brokely"
      />
      <View style={{ gap: 2, flex: 1 }}>
        <Text style={[type.title, { color: colors.text }]} numberOfLines={1}>
          {nickname ? `Hi, ${nickname}` : "Hi there"}
        </Text>
        {home.kind === "plan" ? (
          <Text style={[type.body, { color: colors.muted, fontSize: 15 }]}>
            {homeStatus[home.status]}
          </Text>
        ) : null}
      </View>
    </View>
  );

  if (home.kind === "no-plan") {
    // Track-first is fine (FR-PLN-04); offer a plan without pushing.
    return (
      <Screen gutter={20} bottom={96}>
        {header}
        {/* The card sits in the middle of the space below the greeting, a little above centre. */}
        <View style={{ flex: 1, justifyContent: "center", gap: space.md, paddingBottom: 72 }}>
          {home.draftId ? (
            <Sticker background={colors.cardTint} style={{ padding: space.md, gap: space.sm }}>
              <Text style={[type.heading, { color: colors.text }]}>Your next plan is ready</Text>
              <Text style={[type.body, { color: colors.muted }]}>
                Check the dates and amounts, then approve it.
              </Text>
              <Button label="Check and approve" onPress={() => router.push("/next-plan")} />
            </Sticker>
          ) : null}
          {home.ended ? (
            <Sticker style={{ padding: space.md, gap: space.sm }}>
              <Text style={[type.heading, { color: colors.text }]}>
                Your plan ended on {dayMonth(home.ended.lastDay)} 🎉
              </Text>
              <Text style={[type.body, { color: colors.muted }]}>
                See how it went: what you planned at the start, at the end, and what you spent.
              </Text>
              <Button
                label="See the summary"
                onPress={() => router.push(`/cycle/${home.ended!.id}`)}
              />
            </Sticker>
          ) : null}
          {home.draftId || home.ended ? null : (
            <Sticker style={{ padding: space.md, gap: space.sm }}>
              <Text style={[type.heading, { color: colors.text }]}>No plan yet</Text>
              <Text style={[type.body, { color: colors.muted }]}>
                You can log spending without one. When you're ready, Brokely will set one up with
                you in a minute.
              </Text>
              <Button label="Make a plan" onPress={() => router.push("/quick-start")} />
              <Button
                label="Plan step by step"
                variant="link"
                onPress={() => router.push("/guided")}
              />
            </Sticker>
          )}
        </View>
      </Screen>
    );
  }

  const meta = home.card ? essentialMeta(home.card.name) : null;
  const forecastLine =
    home.forecast.kind === "waiting"
      ? "Forecast shows from day 14"
      : home.forecast.kind === "shown"
        ? `${home.forecast.value.pace === "on_track" ? "On pace" : "Over pace"} · forecast ${wholeRM(home.forecast.value.lowSen)} – ${wholeRM(home.forecast.value.highSen)}`
        : "";

  return (
    <Screen gutter={20} bottom={96}>
      {header}

      {/* 1. Left in plan, the ring of the budget used and the daily guide (FR-INS-01, D-58, D-59) */}
      <View
        style={{
          backgroundColor: colors.hero,
          borderRadius: 24,
          borderWidth: scheme === "dark" ? 1 : 2,
          borderColor: colors.heroOutline,
          paddingHorizontal: 20,
          paddingVertical: 20,
          gap: space.md,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <View style={{ flex: 1, gap: space.xs }}>
            <Text style={[type.strong, { color: colors.onHero, fontSize: 15, opacity: 0.9 }]}>
              Left in plan
            </Text>
            <AnimatedAmount
              value={home.leftInPlanSen}
              style={{
                fontFamily: fonts.heavy,
                fontSize: 36,
                lineHeight: 42,
                color: colors.onHero,
                fontVariant: ["tabular-nums"],
              }}
              accessibilityLabel={`Left in plan: ${formatRM(home.leftInPlanSen)}`}
            />
            <Text style={[type.body, { color: colors.onHero, fontSize: 14, opacity: 0.85 }]}>
              of {formatRM(home.budgetSen)} planned
            </Text>
          </View>
          <ProgressRing
            size={ringSize}
            arc={home.usedArc}
            label={`${home.usedPercent}%`}
            caption="spent"
            color={colors.heroRing}
            track={colors.heroTile}
            textColor={colors.onHero}
            mutedColor={colors.onHero}
            accessibilityLabel={`${home.usedPercent} percent of your budget spent`}
          />
        </View>

        <View style={{ height: 1, backgroundColor: colors.onHero, opacity: 0.18 }} />

        {/* About how much a day keeps the plan, after bills and set-asides (D-58) */}
        {home.perDaySen !== null ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.onHero }} numberOfLines={1} adjustsFontSizeToFit>
                <Text style={{ fontFamily: fonts.heavy, fontSize: 24 }}>
                  {formatRM(home.freeSen > 0 ? home.perDaySen : (0 as Sen))}
                </Text>
                <Text style={{ fontFamily: fonts.body, fontSize: 16 }}> / day</Text>
              </Text>
              <Text style={[type.small, { color: colors.onHero, opacity: 0.85 }]}>
                {home.freeSen > 0
                  ? `Suggested for the next ${home.daysLeft} ${home.daysLeft === 1 ? "day" : "days"}`
                  : "Bills to come and set-asides need what's left"}
                {home.stillToComeSen > 0 && home.freeSen > 0
                  ? `, after ${formatRM(home.stillToComeSen)} of bills`
                  : ""}
              </Text>
              {forecastLine ? (
                <Text style={[type.small, { color: colors.onHero, opacity: 0.7 }]}>
                  {forecastLine}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        <View
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
        >
          <Text style={[type.body, { color: colors.onHero, fontSize: 14, opacity: 0.85 }]}>
            {formatRM(home.spentSen)} spent so far
          </Text>
          {/* Optional wallet check (FR-WAL-01, D-27) */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Wallet check"
            onPress={() => router.push("/wallet-check")}
            hitSlop={10}
            style={({ pressed }) => ({
              minHeight: 44,
              justifyContent: "center",
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text style={{ fontFamily: fonts.heavy, fontSize: 15, color: colors.onHero }}>
              Wallet check ↗
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Nothing logged today: one tap marks a covered day (FR-TXN-08, R-01) */}
      {home.offerCheckIn ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: space.sm,
            borderWidth: 2,
            borderStyle: "dashed",
            borderColor: colors.outline,
            borderRadius: radius.card,
            backgroundColor: colors.card,
            paddingLeft: space.md,
            padding: 6,
          }}
        >
          <Text style={[type.strong, { flex: 1, color: colors.text, fontSize: 15 }]}>
            Spent nothing today?
          </Text>
          <Button
            label="No spending today"
            onPress={() => {
              checkInNoSpending(repo, day, day);
              showUndo("Marked today as no spending", () => undoCheckIn(repo, day));
            }}
          />
        </View>
      ) : null}

      {/* 2. Spending breakdown (FR-INS-02) */}
      <Sticker style={{ padding: space.md, gap: space.sm }}>
        <SectionHeader
          title="Spent so far"
          action={home.spentByCategory.length > 0 ? "View all" : "+ Log spending"}
          onAction={() => router.push(home.spentByCategory.length > 0 ? "/records" : "/quick-add")}
        />
        {home.spentByCategory.length === 0 ? (
          <Text style={[type.small, { color: colors.muted }]}>Nothing logged yet.</Text>
        ) : (
          home.spentByCategory.slice(0, 5).map((c) => (
            <View
              key={c.name}
              style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}
            >
              <IconBubble emoji={categoryEmoji(c.name) || "🏷️"} />
              <View style={{ flex: 1, gap: 4 }}>
                <View
                  style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}
                >
                  <Text
                    style={[type.strong, { color: colors.text, flexShrink: 1 }]}
                    numberOfLines={1}
                  >
                    {c.name}
                  </Text>
                  <AnimatedAmount
                    value={c.amountSen}
                    style={[type.strong, { color: colors.text, fontVariant: ["tabular-nums"] }]}
                  />
                </View>
                {/* What it was, from the notes typed in quick add */}
                {c.notes.length > 0 ? (
                  <Text style={[type.small, { color: colors.muted }]} numberOfLines={1}>
                    {c.notes.slice(0, 3).join(", ")}
                    {c.notes.length > 3 ? ` +${c.notes.length - 3} more` : ""}
                  </Text>
                ) : null}
                {/* Its share of all spending */}
                <View
                  style={{
                    height: 4,
                    borderRadius: 99,
                    backgroundColor: colors.cardTint,
                    overflow: "hidden",
                  }}
                >
                  <View
                    style={{
                      width: `${Math.round(c.share * 100)}%`,
                      height: "100%",
                      backgroundColor: colors.primary,
                    }}
                  />
                </View>
              </View>
            </View>
          ))
        )}
      </Sticker>

      {/* The next essential card, one at a time (FR-PLN-20, D-30, D-35) */}
      {home.card && meta ? (
        <Sticker background={colors.cardTint} style={{ padding: space.md, gap: space.sm }}>
          <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-start" }}>
            <BrokelyAvatar size={40} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[type.small, { color: colors.muted, textTransform: "uppercase" }]}>
                Essentials · {home.card.position} of {home.card.total}
              </Text>
              <Text style={[type.body, { color: colors.text }]}>
                {home.card.position === 1 ? "Let's cover your essentials. Up next: " : "Up next: "}
                <Text style={{ fontFamily: fonts.heavy }}>{home.card.name}</Text> {meta.emoji}
              </Text>
            </View>
          </View>
          <View
            style={{ flexDirection: "row", gap: space.sm, alignItems: "center", flexWrap: "wrap" }}
          >
            <Button
              label="Add"
              onPress={() => router.push(`/essential/${home.card!.categoryId}`)}
            />
            <Button
              label="Not for me"
              variant="secondary"
              onPress={() => dismissCard(repo, home.cycleId, home.card!.categoryId)}
            />
            <Button
              label="Later"
              variant="link"
              onPress={() => postponeCard(repo, home.cycleId, home.card!.categoryId)}
            />
          </View>
        </Sticker>
      ) : null}

      {/* 3. Still to come, separate from spending (FR-INS-07) */}
      <Sticker style={{ padding: space.md, gap: space.sm }}>
        <SectionHeader
          title="Still to come"
          detail={home.stillToCome.length > 0 ? formatRM(home.stillToComeSen) : undefined}
          action={home.stillToCome.length > 3 ? `See all ${home.stillToCome.length}` : "+ Add"}
          onAction={() => router.push(home.stillToCome.length > 3 ? "/bills" : "/bills/edit")}
        />
        {home.stillToCome.length === 0 ? (
          <Text style={[type.small, { color: colors.muted }]}>No bills or subscriptions due.</Text>
        ) : (
          home.stillToCome.slice(0, 3).map((item) => (
            <View
              key={item.id}
              style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}
            >
              <View style={{ flex: 1 }}>
                <Text style={[type.strong, { color: colors.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[type.small, { color: colors.muted }]}>
                  {item.dueDate === day ? "Due today" : `Due ${dayMonth(item.dueDate)}`} ·{" "}
                  {formatRM(item.amountSen)}
                </Text>
              </View>
              {/* Mark paid straight from Home (FR-CAT-05, R-05) */}
              <Button
                label="Mark paid"
                variant={item.dueDate <= day ? "primary" : "secondary"}
                onPress={() => router.push(`/bills/pay/${item.id}`)}
              />
            </View>
          ))
        )}
      </Sticker>

      {/* 4. Recent spending (D-58) */}
      <Sticker style={{ padding: space.md, gap: space.sm }}>
        <SectionHeader
          title="Recent"
          action={home.recent.length > 0 ? "View all" : undefined}
          onAction={() => router.push("/records")}
        />
        {home.recent.length === 0 ? (
          <Text style={[type.small, { color: colors.muted }]}>
            Your latest spending shows here.
          </Text>
        ) : (
          home.recent.map((r) => (
            <Pressable
              key={r.id}
              accessibilityRole="button"
              accessibilityLabel={`${r.title}, ${r.categoryName}, ${dayMonth(r.date)}, minus ${formatRM(r.amountSen)}. Edit`}
              onPress={() => router.push(`/record/${r.id}`)}
              style={{ flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 48 }}
            >
              <IconBubble emoji={categoryEmoji(r.categoryName) || "🧾"} />
              <View style={{ flex: 1 }}>
                <Text style={[type.strong, { color: colors.text }]} numberOfLines={1}>
                  {r.title}
                </Text>
                <Text style={[type.small, { color: colors.muted }]} numberOfLines={1}>
                  {r.categoryName} · {r.date === day ? "Today" : dayMonth(r.date)}
                </Text>
              </View>
              <Text style={[type.strong, { color: colors.text, fontVariant: ["tabular-nums"] }]}>
                {MINUS}
                {formatRM(r.amountSen)}
              </Text>
            </Pressable>
          ))
        )}
      </Sticker>
    </Screen>
  );
}

/** A card title in the text font, with an optional amount and a small action on the right. */
function SectionHeader({
  title,
  detail,
  action,
  onAction,
}: {
  title: string;
  detail?: string;
  action?: string;
  onAction?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
      <Text
        style={{ fontFamily: fonts.heavy, fontSize: 17, color: colors.text, flex: 1 }}
        accessibilityRole="header"
      >
        {title}
        {detail ? <Text style={{ color: colors.muted }}> · {detail}</Text> : null}
      </Text>
      {action && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          hitSlop={8}
          style={{ minHeight: 40, justifyContent: "center" }}
        >
          <Text style={[type.small, { color: colors.primary }]}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** A round category picture for list rows. */
function IconBubble({ emoji }: { emoji: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: colors.cardTint,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontSize: 18 }}>{emoji}</Text>
    </View>
  );
}
