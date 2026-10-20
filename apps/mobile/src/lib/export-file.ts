import { Share } from "react-native";

/**
 * Shares an export as a real file (FR-ACC-06): written to the app's cache folder, then offered
 * through Android's share sheet (save to Drive or Files, email it, …). A build without the file
 * modules (an older development build) falls back to sharing the text itself.
 */
export async function shareExportFile(
  name: string,
  mimeType: string,
  text: string,
): Promise<"file" | "text"> {
  try {
    const { File, Paths } = await import("expo-file-system");
    const Sharing = await import("expo-sharing");
    if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing isn't available");
    const file = new File(Paths.cache, name);
    if (file.exists) file.delete();
    file.create();
    file.write(text);
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: name });
    return "file";
  } catch {
    await Share.share({ title: name, message: text });
    return "text";
  }
}
