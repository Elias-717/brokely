import {
  dataCountsInWords,
  deleteDataCase,
  deleteWordTyped,
  needsDeleteWord,
  type DeleteDataCase,
} from "@brokely/domain";
import { deleteAllData, exportJson, phoneDataCounts } from "@brokely/local-db";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { db } from "../src/db/client";
import { useRead } from "../src/db/use-read";
import { shareExportFile } from "../src/lib/export-file";
import { today } from "../src/lib/today";
import { signOutHere } from "../src/sync/auth";
import { useSync } from "../src/sync/sync-provider";
import { Button, Sticker } from "../src/ui/components";
import { SheetShell } from "../src/ui/sheet";
import { TextField } from "../src/ui/text-field";
import { space, type } from "../src/ui/theme";
import { useTheme } from "../src/ui/theme-context";

const TITLES: Record<DeleteDataCase, string> = {
  "only-here": "Delete all your data?",
  "not-backed-up": "Delete all your data?",
  "backed-up": "Remove your data from this phone?",
};

/**
 * "Delete all my data" (D-133, FR-ACC-07): over the screen, never below the fold. Says what
 * would go in real numbers, offers a copy first, and asks for a typed word only when something
 * would be lost for good.
 *
 * A sheet with its own route, like Mark paid. It was a Modal drawn by the More tab, and it
 * closed by itself on the phone: sometimes at once, sometimes while the word was being typed.
 */
export default function DeleteDataSheet() {
  const { colors } = useTheme();
  const { session, waiting } = useSync();
  const counts = useRead(phoneDataCounts);
  const [typed, setTyped] = useState("");

  // The kind of warning is chosen when the sheet opens and only ever gets stricter. A backup
  // finishing while the sheet was open used to swap the whole sheet, taking the word field away
  // mid-typing; a change made meanwhile still makes it ask for the word.
  const live = deleteDataCase({ signedIn: session !== null, waiting });
  const [deleteCase, setDeleteCase] = useState(live);
  useEffect(() => {
    if (needsDeleteWord(live) && !needsDeleteWord(deleteCase)) setDeleteCase(live);
  }, [live, deleteCase]);

  const what = dataCountsInWords(counts) || "Your settings";
  const signedIn = deleteCase !== "only-here";
  const askWord = needsDeleteWord(deleteCase);

  const warning = {
    "only-here": `${what} will be gone for good. Nothing is saved anywhere else, and this can't be undone.`,
    "not-backed-up": `${waiting} ${waiting === 1 ? "change isn't" : "changes aren't"} backed up and will be lost for good. Everything else stays in your account. You'll be signed out.`,
    "backed-up": `${what} will leave this phone. Everything stays in your account and comes back when you sign in. You'll be signed out.`,
  }[deleteCase];

  const remove = async () => {
    deleteAllData(db);
    // Signed in, the next sync would bring everything back (D-73 c).
    if (session !== null) await signOutHere();
    router.dismissAll();
    router.replace("/welcome");
  };

  return (
    <SheetShell title={TITLES[deleteCase]}>
      <Sticker background={colors.warningCard} style={{ padding: space.md }}>
        <Text style={[type.body, { color: colors.text }]}>{warning}</Text>
      </Sticker>
      <Button
        label="Export everything first"
        variant="secondary"
        onPress={() =>
          void shareExportFile(
            `brokely-data-${today()}.json`,
            "application/json",
            exportJson(db, new Date().toISOString()),
          )
        }
      />
      {askWord ? (
        <TextField
          label="Type DELETE to confirm"
          value={typed}
          onChangeText={setTyped}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          returnKeyType="done"
        />
      ) : null}
      <Button
        label={deleteCase === "backed-up" ? "Remove from this phone" : "Delete everything"}
        variant="destructive"
        disabled={askWord && !deleteWordTyped(typed)}
        onPress={() => void remove()}
      />
      <Button label="Keep my data" variant="secondary" onPress={() => router.back()} />
      {/* This row only clears the phone; the account has its own delete on Profile. */}
      {signedIn ? (
        <Button
          label="Delete my account and backup instead"
          variant="link"
          onPress={() => router.replace("/profile")}
        />
      ) : null}
    </SheetShell>
  );
}
