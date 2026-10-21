import { Linking } from "react-native";

/**
 * "Open email app" on Check your email (S13c): Android's own "open the email app" request, so
 * the student lands in their inbox, not in a new message. A build without the launcher module
 * opens a new email instead (better than nothing).
 */
export async function openEmailApp(): Promise<void> {
  try {
    const launcher = await import("expo-intent-launcher");
    await launcher.startActivityAsync("android.intent.action.MAIN", {
      category: "android.intent.category.APP_EMAIL",
      flags: 0x10000000, // FLAG_ACTIVITY_NEW_TASK: the inbox opens as its own app
    });
  } catch {
    await Linking.openURL("mailto:").catch(() => undefined);
  }
}
