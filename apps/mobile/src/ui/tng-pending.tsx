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
  recordMoneyInTo,
  removeMoneyInRoute,
  setMoneyInRoute,
  setTngQueue,
  undoMoneyInTo,
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
/** Money in put off with "Not now": it leaves Home until the app starts again (still in the list). */
const snoozed = new Set<string>();

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
  const [, setSnoozedCount] = useState(snoozed.size);

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

  const notNow = (item: PendingTngImport) => {
    snoozed.add(item.id);
    setSnoozedCount(snoozed.size);
  };

  return { decline, addMoneyIn, notNow };
}

/** A small amount received today: Add to today is offered (D-134). */
const small = (item: PendingTngImport) =>
  item.direction === "in" &&
  offersToday(item.amountSen) &&
  toLocalDate(new Date(item.postTime)) === toLocalDate(new Date());

/** One waiting TNG item with its buttons. `onNotNow` only on Home. */
function TngCard({
  item,
  actions,
  onNotNow,
}: {
  item: PendingTngImport;
  actions: ReturnType<typeof useTngActions>;
  onNotNow?: () => void;
}) {
  const open = () => router.push({ pathname: "/quick-add", params: { tng: item.id } });
  return (
    <BrokelyCard
      label={tngLines.label(toLocalDate(new Date(item.postTime)))}
      actions={
        item.direction === "in" && !item.payment ? (
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
            {onNotNow ? <Button label="Not now" variant="link" onPress={onNotNow} /> : null}
          </>
        ) : (
          <>
            <Button label="Confirm" onPress={open} />
            <Button label="Decline" variant="secondary" onPress={() => actions.decline(item)} />
          </>
        )
      }
    >
      {item.payment?.fromPoints
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

/**
 * TNG payments the phone caught, on Home (FR-IMP-04, D-02, D-128): the newest one as a card, and
 * a row to the full list when more are waiting (D-142). One card keeps Home calm; the list keeps
 * every item reachable, which a swipe carousel would hide.
 */
export function TngPendingCards() {
  const { colors } = useTheme();
  const queue = useRead(getTngQueue);
  const actions = useTngActions();
  useCollectTng();

  const waiting = queue.pending.filter((p) => !snoozed.has(p.id));
  if (waiting.length === 0) return null;
  const newest = waiting[0]!;
  // Everything else waiting, "Not now" ones included: they stay in the list.
  const more = queue.pending.length - 1;

  return (
    <View style={{ gap: space.sm }}>
      <TngCard item={newest} actions={actions} onNotNow={() => actions.notNow(newest)} />
      {more > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${more} more from TNG. Review all`}
          onPress={() => router.push("/tng-review")}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Sticker
            rounded={14}
            offset={2}
            style={{
              minHeight: MIN_TOUCH,
              paddingHorizontal: space.md,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <Text style={{ flex: 1, fontFamily: fonts.heavy, fontSize: 15, color: colors.text }}>
              {tngLines.more(more)}
            </Text>
            <Text style={{ fontFamily: fonts.heavy, fontSize: 15, color: colors.text }}>
              Review all ›
            </Text>
          </Sticker>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Every waiting TNG item, newest first, grouped by day (D-142). */
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
      {[...days].map(([day, items]) => (
        <View key={day} style={{ gap: space.sm }}>
          <Text style={{ fontFamily: fonts.heavy, fontSize: 13, color: colors.muted }}>
            {tngLines.label(day as ReturnType<typeof toLocalDate>).toUpperCase()} · {items.length}
          </Text>
          {items.map((item) => (
            <TngCard key={item.id} item={item} actions={actions} />
          ))}
        </View>
      ))}
    </>
  );
}
