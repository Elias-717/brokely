import { requireOptionalNativeModule } from "expo";

/** One raw TNG notification kept on this phone for sample collection (contains names). */
export type TngCapture = {
  key: string;
  /** Milliseconds since 1970 when Android posted it. */
  postTime: number;
  title: string;
  text: string;
  bigText: string;
  /** Every hidden field's name and value (kinds that are not text are shown as their type). */
  extras: Record<string, string>;
};

/** The Kotlin module; null on builds made before it existed, so callers show "update the app". */
const native = requireOptionalNativeModule<{
  isNotificationAccessGranted(): boolean;
  isIgnoringBatteryOptimizations(): boolean;
  openNotificationAccessSettings(): boolean;
  openBatterySettings(): boolean;
  getCaptures(): TngCapture[];
  clearCaptures(): void;
}>("TngListener");

/** True when this build contains the TNG listener (needs a new development build). */
export const tngListenerAvailable = native !== null;

/** Is Brokely switched on in Android's "Notification access" list? */
export function isNotificationAccessGranted(): boolean {
  return native?.isNotificationAccessGranted() ?? false;
}

/** Is Brokely exempt from battery optimisation? */
export function isIgnoringBatteryOptimizations(): boolean {
  return native?.isIgnoringBatteryOptimizations() ?? false;
}

/** Opens Android's notification-access page; false if the phone has no such page. */
export function openNotificationAccessSettings(): boolean {
  return native?.openNotificationAccessSettings() ?? false;
}

/** Opens Android's battery-optimisation request; false if the phone has no such page. */
export function openBatterySettings(): boolean {
  return native?.openBatterySettings() ?? false;
}

/** TNG notifications caught so far, newest first (at most 50, none older than 30 days). */
export function getCaptures(): TngCapture[] {
  return native?.getCaptures() ?? [];
}

/** Deletes every captured notification from this phone. */
export function clearCaptures(): void {
  native?.clearCaptures();
}
