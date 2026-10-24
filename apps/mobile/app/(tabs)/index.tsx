import { formatRM, sen, type Sen, type TodayGuide } from "@brokely/domain";
import {
  checkInNoSpending,
  completeEndedCycles,
  dismissCard,
  getNickname,
  getMascotIntroSeen,
  getSeenMascotStage,
  hideMoneyIn,
  postponeCard,
  setPlanBudget,
  showMoneyIn,
  setMascotIntroSeen,
  setSeenMascotStage,
  undoCheckIn,
} from "@brokely/local-db";
import { router } from "expo-router";
import { useEffect } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { repo } from "../../src/db/client";
import { useRead } from "../../src/db/use-read";
import { homeStatus } from "../../src/lib/brokely-lines";
import { categoryIcon, essentialMeta } from "../../src/lib/essentials-meta";
import { Icon, type IconName } from "../../src/ui/icon";
import { readHome } from "../../src/lib/home-model";
import { readMascot } from "../../src/lib/mascot";
import { dayMonth, today } from "../../src/lib/today";
import { AnimatedAmount } from "../../src/ui/animated-amount";
import { BrokelyCard } from "../../src/ui/brokely-card";
import { Button, Screen, Sticker } from "../../src/ui/components";
import { GrewCelebration, GrowIntroPopup, StageRing } from "../../src/ui/mascot-image";
import { ProgressRing } from "../../src/ui/progress-ring";
import { fonts, radius, space, type } from "../../src/ui/theme";
import { useTheme } from "../../src/ui/theme-context";
import { FirstVisit, MonthSoFar } from "../../src/ui/home-no-plan";
import { useUndo } from "../../src/ui/undo";
import { savedBuzz } from "../../src/ui/haptics";

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
  // Brokely's stage and mood (D-105): worried when over pace or past the budget.
  const overPace =
    home.kind === "plan" &&
    (home.leftInPlanSen < 0 ||
      (home.forecast.kind === "shown" && home.forecast.value.pace === "over_pace"));
  const mascot = useRead((db) => readMascot(db, day, overPace), [day, overPace]);
  // "Brokely grew" once per stage (D-109). The first time, the current stage is stored quietly,
  // so an update or a new phone doesn't celebrate a stage reached long ago.
  const seenStage = useRead(getSeenMascotStage);
  useEffect(() => {
    if (seenStage === null) setSeenMascotStage(repo, mascot.stage);
  }, [seenStage, mascot.stage]);
  const grew = seenStage !== null && mascot.stage > seenStage;
  // How Brokely grows, once, as soon as a day is logged (D-122): after the first record or
  // "No spending today", or on the first Home visit of a phone signed into older records.
  const introSeen = useRead(getMascotIntroSeen);
  const showIntro = !introSeen && !grew && mascot.loggedDays > 0;
  const showUndo = useUndo();
  const { width } = useWindowDimensions();
  // The ring stays smaller than the amount beside it, also on narrow phones (D-58).
  const ringSize = Math.round(Math.min(104, Math.max(80, width * 0.24)));

  // Home header (D-65): Brokely beside the greeting, in its stage and mood (D-105); no date
  // line, the budget card already says how many days are left.
  // Tapping Brokely or the greeting opens Profile (D-106), like the profile card on More.
  const header = (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${nickname ? `Hi, ${nickname}` : "Hi there"}. ${mascot.label}. Open your profile`}
        onPress={() => router.push("/profile")}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: space.md,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        {/* The ring fills towards Brokely's next stage (D-123). */}
        <StageRing source={mascot.picture} label={mascot.label} loggedDays={mascot.loggedDays} />
        <View style={{ gap: 2, flex: 1 }}>
          <Text style={[type.title, { color: colors.text }]} numberOfLines={1}>
            {nickname ? `Hi, ${nickname}` : "Hi there"}
          </Text>
          {home.kind === "plan" ? (
            <Text style={[type.body, { color: colors.muted, fontSize: 15 }]}>
              {homeStatus[home.status]}
            </Text>
          ) : (
            <Text style={[type.body, { color: colors.muted, fontSize: 15 }]}>
              {home.month.records > 0
                ? `${home.month.records} ${home.month.records === 1 ? "record" : "records"} this month`
                : "Tracking mode"}
            </Text>
          )}
        </View>
      </Pressable>
      {showIntro ? (
        <GrowIntroPopup
          first
          loggedDays={mascot.loggedDays}
          onClose={() => setMascotIntroSeen(repo)}
        />
      ) : null}
      {grew ? (
        <GrewCelebration
          stage={mascot.stage}
          picture={mascot.proudPicture}
          onClose={() => setSeenMascotStage(repo, mascot.stage)}
        />
      ) : null}
    </>
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
                Your plan ended on {dayMonth(home.ended.lastDay)}
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
          {home.draftId || home.ended ? null : home.hasRecords ? (
            <MonthSoFar month={home.month} />
          ) : (
            <FirstVisit />
          )}
        </View>
      </Screen>
    );
  }

  const meta = home.card ? essentialMeta(home.card.name) : null;
  const overBudget = home.usedPercent > 100;
  const todayText = home.today
    ? todayCard(home.today, home.daysLeft, home.freeSen, home.leftInPlanSen)
    : null;
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
          {/* Past the budget the ring turns red and shows how far over, e.g. "−20%" (D-98) */}
          <ProgressRing
            size={ringSize}
            arc={home.usedArc}
            label={overBudget ? `−${home.usedPercent - 100}%` : `${home.usedPercent}%`}
            caption={overBudget ? "over" : "spent"}
            color={overBudget ? colors.heroOver : colors.heroRing}
            track={colors.heroTile}
            textColor={overBudget ? colors.heroOver : colors.onHero}
            mutedColor={overBudget ? colors.heroOver : colors.onHero}
            accessibilityLabel={
              overBudget
                ? `${home.usedPercent - 100} percent over your budget`
                : `${home.usedPercent} percent of your budget spent`
            }
          />
        </View>

        <View style={{ height: 1, backgroundColor: colors.onHero, opacity: 0.18 }} />

        {/* Left to spend today; once over, what a day from tomorrow (D-95, D-98) */}
        {todayText?.columns ? (
          <View style={{ gap: space.sm }}>
            {/* Two columns instead of one long line: left today | about a day after today */}
            <View style={{ flexDirection: "row" }}>
              <HeroColumn
                side="left"
                label="Left today"
                value={formatRM(todayText.columns.leftTodaySen)}
                sub={todayText.columns.todaySub}
                accessibilityLabel={todayText.columns.todayA11y}
              />
              <View style={{ width: 1, backgroundColor: colors.onHero, opacity: 0.18 }} />
              {todayText.columns.thenPerDaySen !== null ? (
                <HeroColumn
                  side="right"
                  label="After today"
                  value={`~${formatRM(todayText.columns.thenPerDaySen)}`}
                  sub={todayText.columns.thenSub}
                  accessibilityLabel={`About ${formatRM(todayText.columns.thenPerDaySen)} a day after today${todayText.columns.thenSub === "a day" ? "" : ", a little less"}`}
                />
              ) : (
                <HeroColumn
                  side="right"
                  label="After today"
                  value="Last day"
                  sub="of this plan"
                  accessibilityLabel="Today is the last day of this plan"
                />
              )}
            </View>
            {forecastLine ? (
              <Text style={[type.small, { color: colors.onHero, opacity: 0.7 }]}>
                {forecastLine}
              </Text>
            ) : null}
          </View>
        ) : todayText ? (
          <View style={{ gap: 2 }}>
            <Text style={{ color: colors.onHero }} numberOfLines={1} adjustsFontSizeToFit>
              <Text style={{ fontFamily: fonts.heavy, fontSize: 24 }}>
                {formatRM(todayText.amountSen)}
              </Text>
              <Text style={{ fontFamily: fonts.body, fontSize: 16 }}> {todayText.unit}</Text>
            </Text>
            <Text style={[type.small, { color: colors.onHero, opacity: 0.85 }]}>
              {todayText.line}
            </Text>
            {forecastLine ? (
              <Text style={[type.small, { color: colors.onHero, opacity: 0.7 }]}>
                {forecastLine}
              </Text>
            ) : null}
          </View>
        ) : null}
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
              savedBuzz();
              showUndo("Marked today as no spending", () => undoCheckIn(repo, day));
            }}
          />
        </View>
      ) : null}

      {/* Money in is more than the budget: offer to add the difference, nothing changes until a
          tap (FR-TXN-11, AC-61, D-26, D-125) */}
      {home.moneyIn ? (
        <BrokelyCard
          label={`Money in · ${formatRM(home.moneyIn.receivedSen)}`}
          actions={
            <>
              <Button
                label={`Add ${formatRM(home.moneyIn.suggestionSen)}`}
                onPress={() => {
                  const before = {
                    cycleId: home.cycleId,
                    budgetSen: home.budgetSen,
                    shortfallAcknowledged: home.moneyIn!.shortfallAcknowledged,
                  };
                  const next = sen(home.budgetSen + home.moneyIn!.suggestionSen);
                  const saved = setPlanBudget(repo, { ...before, budgetSen: next });
                  if (!saved.ok) return;
                  savedBuzz();
                  // Undo is one more revision with the old budget; history is never rewritten (D-03).
                  showUndo(`Plan is now ${formatRM(next)}`, () => setPlanBudget(repo, before));
                }}
              />
              <Button
                label="Not now"
                variant="link"
                onPress={() => {
                  hideMoneyIn(repo, home.cycleId, home.moneyIn!.suggestionSen);
                  showUndo("Hidden until more money comes in", () =>
                    showMoneyIn(repo, home.cycleId),
                  );
                }}
              />
            </>
          }
        >
          That's {formatRM(home.moneyIn.suggestionSen)} more than your plan of{" "}
          {formatRM(home.budgetSen)}. Add it to your plan?
        </BrokelyCard>
      ) : null}

      {/* 2. Spending breakdown (FR-INS-02) */}
      <Sticker style={{ padding: space.md, gap: space.sm }}>
        <SectionHeader
          title="Spent so far"
          action={home.spentByCategory.length > 0 ? "View all" : "+ Add spending"}
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
              <IconBubble icon={categoryIcon(c.name)} />
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
        <BrokelyCard
          label={`Essentials · ${home.card.position} of ${home.card.total}`}
          actions={
            <>
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
            </>
          }
        >
          {home.card.position === 1 ? "Let's cover your essentials. Up next: " : "Up next: "}
          <Text style={{ fontFamily: fonts.heavy }}>{home.card.name}</Text>
        </BrokelyCard>
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
              <IconBubble icon={categoryIcon(r.categoryName)} />
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

/**
 * What the budget card says about today (D-95, D-98, D-124, D-126). While there is a share for
 * today, two columns: left today | about a day after today. Over today's share, the same columns
 * show RM0.00 with how much over, and the new (smaller) amount a day. Nothing free or over the
 * whole plan: one big amount and one plain line. Never a telling-off (rule 9).
 */
function todayCard(
  guide: TodayGuide,
  daysLeft: number,
  freeSen: Sen,
  leftInPlanSen: Sen,
): {
  amountSen: Sen;
  unit: string;
  line: string;
  /** Set while there is a share for today: the card shows two columns instead of one line. */
  columns?: {
    leftTodaySen: Sen;
    todaySub: string;
    /** What a screen reader hears for the left column. */
    todayA11y: string;
    thenPerDaySen: Sen | null;
    thenSub: string;
  };
} {
  const after = daysLeft - 1;
  const days = (n: number) => (n === 1 ? "tomorrow gets" : `the next ${n} days get`);
  if (leftInPlanSen < 0) {
    return {
      amountSen: sen(0),
      unit: "free to spend",
      line: `You've spent ${formatRM(sen(-leftInPlanSen))} more than your plan. Keep logging, it still helps.`,
    };
  }
  if (freeSen <= 0 && guide.todaySen === 0) {
    return {
      amountSen: sen(0),
      unit: "free to spend",
      line: "Bills still to come and set-asides need what's left in your plan.",
    };
  }
  if (guide.leftTodaySen < 0) {
    const overSen = sen(-guide.leftTodaySen);
    const over = `Today went ${formatRM(overSen)} over its ${formatRM(guide.todaySen)}`;
    const line =
      guide.thenPerDaySen !== null
        ? `${over}, so ${days(after)} a little less.`
        : `${over}, the last day of this plan.`;
    // Same two columns as under the share (D-126); the full sentence stays for screen readers.
    return {
      amountSen: guide.thenPerDaySen ?? sen(0),
      unit: guide.thenPerDaySen !== null ? "a day from tomorrow" : "left today",
      line,
      columns: {
        leftTodaySen: sen(0),
        todaySub: `${formatRM(overSen)} over`,
        todayA11y: `Nothing left today. ${line}`,
        thenPerDaySen: guide.thenPerDaySen,
        thenSub: "a day · a little less",
      },
    };
  }
  return {
    amountSen: guide.leftTodaySen,
    unit: "left today",
    line:
      guide.thenPerDaySen !== null
        ? `of ${formatRM(guide.todaySen)} for today · about ${formatRM(guide.thenPerDaySen)} a day after that`
        : `of ${formatRM(guide.todaySen)} · the last day of this plan`,
    columns: {
      leftTodaySen: guide.leftTodaySen,
      todaySub:
        guide.leftTodaySen === guide.todaySen ? "None used yet" : `of ${formatRM(guide.todaySen)}`,
      todayA11y: `${formatRM(guide.leftTodaySen)} left today, of ${formatRM(guide.todaySen)}`,
      thenPerDaySen: guide.thenPerDaySen,
      thenSub: "a day",
    },
  };
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
function IconBubble({ icon }: { icon: IconName }) {
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
      <Icon name={icon} size={22} />
    </View>
  );
}

/** One of the two columns under today's share on the hero card: label, big amount, small line. */
function HeroColumn({
  side,
  label,
  value,
  sub,
  accessibilityLabel,
}: {
  side: "left" | "right";
  label: string;
  value: string;
  sub: string;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        { flex: 1, gap: 2 },
        side === "left" ? { paddingRight: space.md } : { paddingLeft: space.md },
      ]}
      accessible
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={[type.small, { color: colors.onHero, opacity: 0.9 }]}>{label}</Text>
      <Text
        style={{ fontFamily: fonts.heavy, fontSize: 24, color: colors.onHero }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      <Text style={[type.small, { color: colors.onHero, opacity: 0.85 }]}>{sub}</Text>
    </View>
  );
}
