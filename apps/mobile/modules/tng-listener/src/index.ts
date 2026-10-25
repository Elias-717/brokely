import { requireOptionalNativeModule } from "expo";

/** The Kotlin module; null on builds made before it existed, so callers show "update the app". */
const native = requireOptionalNativeModule<{
  isNotificationAccessGranted(): boolean;
  isIgnoringBatteryOptimizations(): boolean;
  openNotificationAccessSettings(): boolean;
  openBatterySettings(): boolean;
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
