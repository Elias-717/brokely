import { formatRM, reopenTngImport, settleTngImport, type PendingTngImport } from "@brokely/domain";
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
import { AppState, Text } from "react-native";
import { db, repo } from "../db/client";
import { useRead } from "../db/use-read";
import { tngLines } from "../lib/brokely-lines";
import { toLocalDate } from "../lib/today";
import { collectTngImports } from "../tng/collect";
import { BrokelyCard } from "./brokely-card";
import { Button } from "./components";
import { type } from "./theme";
import { useTheme } from "./theme-context";
import { savedBuzz } from "./haptics";
import { useUndo } from "./undo";

/** At most this many cards at once; the rest are counted underneath. */
const SHOWN = 3;
/** How often Home looks for new captures while it is on screen. */
const POLL_MS = 5000;
/** Money in put off with "Not now": it waits, and shows again the next time the app starts. */
const snoozed = new Set<string>();

/**
 * TNG payments the phone caught, waiting for the student under the main card (FR-IMP-04, D-02,
 * D-128). Confirm opens Quick add with the amount, date and name filled in: the student still
 * chooses the type and, for spending, the category, so nothing is saved as spending by itself
 * (FR-IMP-08, AC-35). Decline leaves it out. Both can be undone for a few seconds.
 */
export function TngPendingCards() {
  const { colors } = useTheme();
  const showUndo = useUndo();
  const queue = useRead(getTngQueue);
  const [, setSnoozedCount] = useState(snoozed.size);

  // Look for new captures when Home comes into view, when the app returns, and every few seconds
  // while Home stays open. The listener runs without the app; this only collects its results.
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

  const decline = (item: PendingTngImport) => {
    setTngQueue(repo, settleTngImport(getTngQueue(db), item.id));
    showUndo(tngLines.declined(item.amountSen), () =>
      setTngQueue(repo, reopenTngImport(getTngQueue(db), item)),
    );
  };

  /**
   * Money in from a friend in one tap (D-132): saved as Money in · From a friend and added to
   * this month's plan, like the Money in sheet's default (D-130). Undo takes both back and the
   * card waits again.
   */
  const addToPlan = (item: PendingTngImport) => {
    const when = new Date(item.postTime);
    const localDate = toLocalDate(when);
    const cycleId = findCycleOn(db, localDate)?.id ?? null;
    const saved = recordMoneyInTo(repo, {
      amountSen: item.amountSen,
      occurredAt: when.toISOString(),
      localDate,
      note: `From a friend · ${item.counterparty}`,
      cycleId,
      goesTo: { kind: "plan" },
    });
    if (!saved.ok) return;
    if (cycleId) {
      setMoneyInRoute(repo, cycleId, saved.value.id, {
        to: "plan",
        amountSen: item.amountSen,
        localDate,
      });
    }
    setTngQueue(repo, settleTngImport(getTngQueue(db), item.id));
    savedBuzz();
    showUndo(
      cycleId
        ? `${formatRM(item.amountSen)} from ${item.counterparty} added to your plan`
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

  const waiting = queue.pending.filter((p) => !snoozed.has(p.id));
  if (waiting.length === 0) return null;
  const shown = waiting.slice(0, SHOWN);
  const more = waiting.length - shown.length;

  return (
    <>
      {shown.map((item) => (
        <BrokelyCard
          key={item.id}
          label={tngLines.label(toLocalDate(new Date(item.postTime)))}
          actions={
            item.direction === "in" ? (
              <>
                <Button label="Add to my plan" onPress={() => addToPlan(item)} />
                <Button
                  label="Something else"
                  variant="secondary"
                  onPress={() => router.push({ pathname: "/quick-add", params: { tng: item.id } })}
                />
                <Button label="Not now" variant="link" onPress={() => notNow(item)} />
              </>
            ) : (
              <>
                <Button
                  label="Confirm"
                  onPress={() => router.push({ pathname: "/quick-add", params: { tng: item.id } })}
                />
                <Button label="Decline" variant="secondary" onPress={() => decline(item)} />
              </>
            )
          }
        >
          {item.direction === "out"
            ? tngLines.out(item.amountSen, item.counterparty)
            : tngLines.in(item.amountSen, item.counterparty)}
        </BrokelyCard>
      ))}
      {more > 0 ? (
        <Text style={[type.small, { color: colors.muted }]}>{tngLines.more(more)}</Text>
      ) : null}
    </>
  );
}
