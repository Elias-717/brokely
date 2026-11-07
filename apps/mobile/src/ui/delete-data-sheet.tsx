import {
  dataCountsInWords,
  deleteDataCase,
  deleteWordTyped,
  needsDeleteWord,
  type DeleteDataCase,
} from "@brokely/domain";
import { deleteAllData, exportJson, phoneDataCounts } from "@brokely/local-db";
import { router } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";
import { db } from "../db/client";
import { useRead } from "../db/use-read";
import { shareExportFile } from "../lib/export-file";
import { today } from "../lib/today";
import { signOutHere } from "../sync/auth";
import { useSync } from "../sync/sync-provider";
import { Button, Sticker } from "./components";
import { ModalSheet } from "./sheet";
import { TextField } from "./text-field";
import { space, type } from "./theme";
import { useTheme } from "./theme-context";

const TITLES: Record<DeleteDataCase, string> = {
  "only-here": "Delete all your data?",
  "not-backed-up": "Delete all your data?",
  "backed-up": "Remove your data from this phone?",
};

/**
 * "Delete all my data" (D-129, FR-ACC-07): over the screen, never below the fold. Says what
 * would go in real numbers, offers a copy first, and asks for a typed word only when something
 * would be lost for good.
 */
export function DeleteDataSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { session, waiting } = useSync();
  const deleteCase = deleteDataCase({ signedIn: session !== null, waiting });
  return (
    <ModalSheet visible={visible} onClose={onClose} title={TITLES[deleteCase]}>
      {/* Only while open, so the typed word starts empty and More doesn't count on every save. */}
      {visible ? <SheetBody deleteCase={deleteCase} waiting={waiting} onClose={onClose} /> : null}
    </ModalSheet>
  );
}

function SheetBody({
  deleteCase,
  waiting,
  onClose,
}: {
  deleteCase: DeleteDataCase;
  waiting: number;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const counts = useRead(phoneDataCounts);
  const [typed, setTyped] = useState("");
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
    if (signedIn) await signOutHere();
    onClose();
    router.replace("/welcome");
  };

  return (
    <>
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
      <Button label="Keep my data" variant="secondary" onPress={onClose} />
      {/* This row only clears the phone; the account has its own delete on Profile. */}
      {signedIn ? (
        <Button
          label="Delete my account and backup instead"
          variant="link"
          onPress={() => {
            onClose();
            router.push("/profile");
          }}
        />
      ) : null}
    </>
  );
}
