import { setNotificationState } from "@brokely/local-db";
import { db, repo } from "../db/client";
import { buildNotificationPlan } from "./plan";

/**
 * Local notifications (D-94, FR-NOT-01…07): scheduled on the phone, no server. The native module
 * is loaded on demand, so a build without it (an older development build) simply has none.
 */

type Module = typeof import("expo-notifications");
let loaded: Module | null | undefined;

export async function notificationsModule(): Promise<Module | null> {
  if (loaded !== undefined) return loaded;
  try {
    loaded = await import("expo-notifications");
  } catch {
    loaded = null;
  }
  return loaded;
}

export type Permission = "granted" | "denied" | "undetermined" | "unavailable";

export async function notificationPermission(): Promise<Permission> {
  const N = await notificationsModule();
  if (!N) return "unavailable";
  const p = await N.getPermissionsAsync();
  if (p.granted) return "granted";
  return p.canAskAgain ? "undetermined" : "denied";
}

/** Android's own prompt (Android 13+); earlier versions grant it at install. */
export async function requestNotificationPermission(): Promise<boolean> {
  const N = await notificationsModule();
  if (!N) return false;
  const p = await N.requestPermissionsAsync();
  return p.granted;
}

const CHANNEL = "reminders";

/** "2026-10-23" + "09:00" as a local date-time. */
const at = (date: string, time: string) => {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [h, min] = time.split(":").map(Number) as [number, number];
  return new Date(y, m - 1, d, h, min, 0, 0);
};

let running: Promise<void> | null = null;

/**
 * Replaces everything scheduled with a fresh plan from the phone's data. Called on start, when
 * the app comes to the front, a moment after any change (logging today cancels tonight's
 * check-in) and when settings change. Without permission it only clears what's there.
 */
export function rescheduleNotifications(): Promise<void> {
  // One at a time: a second call waits for the first and then runs once more.
  const run = async () => {
    const N = await notificationsModule();
    if (!N) return;
    if (!(await N.getPermissionsAsync()).granted) {
      await N.cancelAllScheduledNotificationsAsync();
      return;
    }
    await N.setNotificationChannelAsync(CHANNEL, {
      name: "Reminders",
      importance: N.AndroidImportance.DEFAULT,
    });
    const { planned, remember } = buildNotificationPlan(db);
    await N.cancelAllScheduledNotificationsAsync();
    for (const n of planned) {
      await N.scheduleNotificationAsync({
        identifier: n.key,
        content: { title: n.title, body: n.body, data: { url: n.url } },
        trigger: {
          type: N.SchedulableTriggerInputTypes.DATE,
          date: at(n.date, n.time),
          channelId: CHANNEL,
        },
      });
    }
    if (Object.keys(remember).length > 0) setNotificationState(repo, remember);
  };
  running = (running ?? Promise.resolve()).then(run, run).catch((error: unknown) => {
    console.warn("[notifications]", (error as Error).message);
  });
  return running;
}
