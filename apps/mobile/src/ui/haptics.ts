import { getHapticsEnabled } from "@brokely/local-db";
import { db } from "../db/client";

type HapticsModule = typeof import("expo-haptics");
let loaded: Promise<HapticsModule | null> | undefined;

/** expo-haptics is native: builds made before it was added simply skip the buzz (D-109). */
function haptics(): Promise<HapticsModule | null> {
  // More → Settings → Vibration (D-111): off means no buzz at all.
  if (!getHapticsEnabled(db)) return Promise.resolve(null);
  loaded ??= import("expo-haptics").catch(() => null);
  return loaded;
}

/** A short buzz after a save: Add, Mark paid, paid back, write-off, edits, refunds and "No
 * spending today" (D-109, D-111). Never blocks or fails the save. */
export function savedBuzz(): void {
  void haptics()
    .then((m) => m?.notificationAsync(m.NotificationFeedbackType.Success))
    .catch(() => undefined);
}

/** A stronger buzz for Brokely growing (D-109). */
export function grewBuzz(): void {
  void haptics()
    .then((m) => m?.impactAsync(m.ImpactFeedbackStyle.Heavy))
    .catch(() => undefined);
}
