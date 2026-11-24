import {
  formatRM,
  offersToday,
  reopenTngImport,
  settleTngImport,
  type PendingTngImport,
} from "@brokely/domain";
import {
  findCycleOn,
  getTngQueue,
  deleteTransaction,
  recordMoneyInTo,
  recordTransaction,
  removeMoneyInRoute,
  setMoneyInRoute,
  setPlanLink,
  setTngQueue,
  transferIntoPlan,
  undoMoneyInTo,
  undoTransferIntoPlan,
} from "@brokely/local-db";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { AppState, Pressable, Text, View } from "react-native";
import { db, repo } from "../db/client";
import { useRead } from "../db/use-read";
import { tngLines } from "../lib/brokely-lines";
import { toLocalDate } from "../lib/today";
import { collectTngImports } from "../tng/collect";
import { BrokelyCard } from "./brokely-card";
import { Button, Sticker } from "./components";
import { fonts, MIN_TOUCH, space, type } from "./theme";
import { useTheme } from "./theme-context";
import { savedBuzz } from "./haptics";
import { useUndo } from "./undo";

/** How often Home looks for new captures while it is on screen. */
const POLL_MS = 5000;

/**
 * Looks for new captures while a screen is in view: on focus, when the app returns, and every few
 * seconds. The listener runs without the app; this only collects its results (FR-IMP-04).
 */
export function useCollectTng() {
  useFocusEffect(
    useCallback(() => {
      collectTngImports();
      const timer = setInterval(collectTngImports, POLL_MS);
      const sub = AppState.addEventListener("change", (state) => {
        if (state === "active") collectTngImports();
      });
      return () => {
        clearInterval(timer);
        sub.remove();
      };
    }, []),
  );
}

/** What a waiting TNG item can do, shared by Home and the From TNG list. */
function useTngActions() {
  const showUndo = useUndo();

  const decline = (item: PendingTngImport) => {
    setTngQueue(repo, settleTngImport(getTngQueue(db), item.id));
    showUndo(tngLines.declined(item.amountSen), () =>
      setTngQueue(repo, reopenTngImport(getTngQueue(db), item)),
    );
  };

  /**
   * Money in from a friend in one tap (D-132): saved as Money in · From a friend and added to
   * this month's plan (or today, D-134). Undo takes both back and the item waits again.
   */
  const addMoneyIn = (item: PendingTngImport, to: "plan" | "today") => {
    const when = new Date(item.postTime);
    const localDate = toLocalDate(when);
    const cycleId = findCycleOn(db, localDate)?.id ?? null;
    const saved = recordMoneyInTo(repo, {
      amountSen: item.amountSen,
      occurredAt: when.toISOString(),
      localDate,
      note: `From a friend · ${item.counterparty}`,
      cycleId,
      goesTo: { kind: to },
      reason: `Money in · From a friend · ${item.counterparty}${to === "today" ? " · to today" : ""}`,
    });
    if (!saved.ok) return;
    if (cycleId) {
      setMoneyInRoute(repo, cycleId, saved.value.id, {
        to,
        amountSen: item.amountSen,
        localDate,
        ...(saved.value.revisionId ? { revisionId: saved.value.revisionId } : {}),
      });
    }
    setTngQueue(repo, settleTngImport(getTngQueue(db), item.id));
    savedBuzz();
    showUndo(
      cycleId
        ? `${formatRM(item.amountSen)} from ${item.counterparty} added to ${to === "today" ? "today" : "your plan"}`
        : `Saved money in ${formatRM(item.amountSen)} from ${item.counterparty}`,
      () => {
        undoMoneyInTo(repo, saved.value);
        if (cycleId) removeMoneyInRoute(repo, cycleId, saved.value.id);
        setTngQueue(repo, reopenTngImport(getTngQueue(db), item));
      },
    );
  };

  /**
   * A TNG top-up (D-149): saved as a transfer, added to this month's plan or just recorded.
   * Never spending or money in. Undo takes it back and the item waits again.
   */
  const topUp = (item: PendingTngImport, toPlan: boolean) => {
    const when = new Date(item.postTime);
    const localDate = toLocalDate(when);
    const cycleId = findCycleOn(db, localDate)?.id ?? null;
    const base = {
      amountSen: item.amountSen,
      occurredAt: when.toISOString(),
      localDate,
      note: "Top up to TNG",
    };
    const reopen = () => setTngQueue(repo, reopenTngImport(getTngQueue(db), item));
    if (toPlan && cycleId) {
      const saved = transferIntoPlan(repo, {
        ...base,
        cycleId,
        reason: `Top up ${formatRM(item.amountSen)} added to the plan`,
      });
      if (!saved.ok) return;
      setPlanLink(repo, cycleId, saved.value.transactionId, saved.value.revisionId);
      setTngQueue(repo, settleTngImport(getTngQueue(db), item.id));
      savedBuzz();
      showUndo(`Top up ${formatRM(item.amountSen)} added to your plan`, () => {
        undoTransferIntoPlan(repo, saved.value);
        reopen();
      });
      return;
    }
    const saved = recordTransaction(repo, { ...base, type: "transfer", lines: [] });
    if (!saved.ok) return;
    setTngQueue(repo, settleTngImport(getTngQueue(db), item.id));
    savedBuzz();
    showUndo(`Top up ${formatRM(item.amountSen)} recorded · plan unchanged`, () => {
      deleteTransaction(repo, saved.value.id);
      reopen();
    });
  };

  return { decline, addMoneyIn, topUp };
}

/** A small amount received today: Add to today is offered (D-134). */
const small = (item: PendingTngImport) =>
  item.direction === "in" &&
  offersToday(item.amountSen) &&
  toLocalDate(new Date(item.postTime)) === toLocalDate(new Date());

/** One waiting TNG item with every option, shown under its row when tapped. */
function TngCard({
  item,
  actions,
}: {
  item: PendingTngImport;
  actions: ReturnType<typeof useTngActions>;
}) {
  const open = () => router.push({ pathname: "/quick-add", params: { tng: item.id } });
  return (
    <BrokelyCard
      label={tngLines.label(toLocalDate(new Date(item.postTime)))}
      actions={
        item.reload ? (
          <>
            <Button label="Add to my plan" onPress={() => actions.topUp(item, true)} />
            <Button
              label="Just record it"
              variant="secondary"
              onPress={() => actions.topUp(item, false)}
            />
            <Button label="Decline" variant="link" onPress={() => actions.decline(item)} />
          </>
        ) : item.direction === "in" && !item.payment ? (
          <>
            <Button label="Add to my plan" onPress={() => actions.addMoneyIn(item, "plan")} />
            {small(item) ? (
              <Button
                label="Add to today"
                variant="secondary"
                onPress={() => actions.addMoneyIn(item, "today")}
              />
            ) : null}
            <Button label="Something else" variant="secondary" onPress={open} />
          </>
        ) : (
          <>
            <Button label="Confirm" onPress={open} />
            <Button label="Decline" variant="secondary" onPress={() => actions.decline(item)} />
          </>
        )
      }
    >
      {item.reload
        ? tngLines.reload(item.amountSen)
        : item.payment?.fromPoints
          ? tngLines.points(item.amountSen)
          : item.payment
            ? tngLines.paid(item.amountSen, item.counterparty)
            : item.direction === "out"
              ? tngLines.out(item.amountSen, item.counterparty)
              : small(item)
                ? tngLines.inSmall(item.amountSen, item.counterparty)
                : tngLines.in(item.amountSen, item.counterparty)}
    </BrokelyCard>
  );
}

/** "4:10 PM" from a notification's time. */
const timeOf = (postTime: number) =>
  new Date(postTime).toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" });

/** The small grey line under a row: what it is and when. */
function rowDetail(item: PendingTngImport): string {
  const what = item.reload
    ? "From your bank or card"
    : item.payment?.fromPoints
      ? "About, from TNG points"
      : item.payment
        ? (item.payment.categoryHint ?? "Payment")
        : item.direction === "in"
          ? "Sent you"
          : "You sent";
  return `${what} · ${timeOf(item.postTime)}`;
}

/**
 * One waiting TNG item as a compact row (D-142): amount and who, then a tick and a cross. The tick
 * on money in from a friend adds it to the plan in one tap (D-132); on anything going out it opens
 * Add filled in, because a category is still needed (FR-IMP-08). The cross declines, with Undo.
 * Tapping the row opens the full card with every option underneath.
 */
function TngRow({
  item,
  actions,
  first,
}: {
  item: PendingTngImport;
  actions: ReturnType<typeof useTngActions>;
  first: boolean;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const incoming = item.direction === "in" && !item.payment && !item.reload;
  const name = item.payment?.fromPoints ? "Somewhere" : item.counterparty;
  const confirm = () =>
    item.reload
      ? actions.topUp(item, true)
      : incoming
        ? actions.addMoneyIn(item, "plan")
        : router.push({ pathname: "/quick-add", params: { tng: item.id } });
  const square = (filled: boolean) => ({
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.outline,
    backgroundColor: filled ? colors.primary : colors.card,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  });
  return (
    <View
      style={{
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.background,
        paddingVertical: space.xs,
        gap: space.xs,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityHint="Shows every option"
          onPress={() => setOpen((o) => !o)}
          style={({ pressed }) => ({
            flex: 1,
            minHeight: MIN_TOUCH,
            justifyContent: "center",
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text
            numberOfLines={1}
            style={{
              fontFamily: fonts.heavy,
              fontSize: 15,
              color: incoming || item.reload ? colors.income : colors.text,
            }}
          >
            {`${incoming || item.reload ? "+" : "−"} ${formatRM(item.amountSen)}  ${name}`}
          </Text>
          <Text numberOfLines={1} style={[type.small, { color: colors.muted }]}>
            {rowDetail(item)}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            item.reload
              ? `Add top up ${formatRM(item.amountSen)} to your plan`
              : incoming
                ? `Add ${formatRM(item.amountSen)} from ${name} to your plan`
                : `Confirm ${formatRM(item.amountSen)}, ${name}`
          }
          onPress={confirm}
          style={({ pressed }) => ({ ...square(true), opacity: pressed ? 0.7 : 1 })}
        >
          <Text style={{ fontFamily: fonts.heavy, fontSize: 18, color: colors.onPrimary }}>✓</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decline ${formatRM(item.amountSen)}, ${name}`}
          onPress={() => actions.decline(item)}
          style={({ pressed }) => ({ ...square(false), opacity: pressed ? 0.7 : 1 })}
        >
          <Text style={{ fontFamily: fonts.heavy, fontSize: 18, color: colors.text }}>✕</Text>
        </Pressable>
      </View>
      {open ? <TngCard item={item} actions={actions} /> : null}
    </View>
  );
}

/** Up to this many rows on Home; the rest wait behind View more (author). */
const ON_HOME = 3;

/**
 * TNG payments the phone caught, on Home (FR-IMP-04, D-02, D-128): one "From TNG" card with the
 * newest rows and "View more" to the whole list (D-142). Compact rows keep Home calm and every
 * item one tap away, which a swipe carousel would hide.
 */
export function TngPendingCards() {
  const { colors } = useTheme();
  const queue = useRead(getTngQueue);
  const actions = useTngActions();
  useCollectTng();

  const waiting = queue.pending;
  if (waiting.length === 0) return null;
  return (
    <Sticker style={{ paddingHorizontal: space.md, paddingVertical: space.sm, gap: space.xs }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={[type.heading, { flex: 1, color: colors.text }]}>From TNG</Text>
        <Text style={{ fontFamily: fonts.heavy, fontSize: 13, color: colors.muted }}>
          {waiting.length} to review
        </Text>
      </View>
      {waiting.slice(0, ON_HOME).map((item, i) => (
        <TngRow key={item.id} item={item} actions={actions} first={i === 0} />
      ))}
      {waiting.length > ON_HOME ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View more: all ${waiting.length} from TNG`}
          onPress={() => router.push("/tng-review")}
          style={({ pressed }) => ({
            minHeight: MIN_TOUCH,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ fontFamily: fonts.heavy, fontSize: 15, color: colors.primary }}>
            View more ›
          </Text>
        </Pressable>
      ) : null}
    </Sticker>
  );
}

/** The whole list (D-142): every waiting item as a row, newest first, one card per day. */
export function TngReviewList() {
  const { colors } = useTheme();
  const queue = useRead(getTngQueue);
  const actions = useTngActions();
  useCollectTng();

  if (queue.pending.length === 0) {
    return (
      <Text style={[type.body, { color: colors.muted }]}>
        Nothing waiting from TNG. New payments show up here and on Home.
      </Text>
    );
  }
  const days = new Map<string, PendingTngImport[]>();
  for (const item of queue.pending) {
    const day = toLocalDate(new Date(item.postTime));
    days.set(day, [...(days.get(day) ?? []), item]);
  }
  return (
    <>
      <Text style={[type.small, { color: colors.muted }]}>
        {queue.pending.length} to review. ✓ adds it, ✕ leaves it out, tap a row for every option.
      </Text>
      {[...days].map(([day, items]) => (
        <View key={day} style={{ gap: space.xs }}>
          <Text style={{ fontFamily: fonts.heavy, fontSize: 13, color: colors.muted }}>
            {tngLines.label(day as ReturnType<typeof toLocalDate>).toUpperCase()} · {items.length}
          </Text>
          <Sticker style={{ paddingHorizontal: space.md, paddingVertical: space.xs }}>
            {items.map((item, i) => (
              <TngRow key={item.id} item={item} actions={actions} first={i === 0} />
            ))}
          </Sticker>
        </View>
      ))}
    </>
  );
}
