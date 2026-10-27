import { reopenTngImport, settleTngImport, type PendingTngImport } from "@brokely/domain";
import { getTngQueue, setTngQueue } from "@brokely/local-db";
import { router, useFocusEffect } from "expo-router";
import { useCallback } from "react";
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
import { useUndo } from "./undo";

/** At most this many cards at once; the rest are counted underneath. */
const SHOWN = 3;
/** How often Home looks for new captures while it is on screen. */
const POLL_MS = 5000;

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

  if (queue.pending.length === 0) return null;
  const shown = queue.pending.slice(0, SHOWN);
  const more = queue.pending.length - shown.length;

  return (
    <>
      {shown.map((item) => (
        <BrokelyCard
          key={item.id}
          label={tngLines.label(toLocalDate(new Date(item.postTime)))}
          actions={
            <>
              <Button
                label="Confirm"
                onPress={() => router.push({ pathname: "/quick-add", params: { tng: item.id } })}
              />
              <Button label="Decline" variant="secondary" onPress={() => decline(item)} />
            </>
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
