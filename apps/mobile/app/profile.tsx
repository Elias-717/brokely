import {
  deleteAllData,
  exportJson,
  getMascotIntroSeen,
  getNickname,
  NICKNAME_MAX,
  setMascotIntroSeen,
  setNickname,
  syncCounts,
} from "@brokely/local-db";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { db, repo } from "../src/db/client";
import { useRead } from "../src/db/use-read";
import { shareExportFile } from "../src/lib/export-file";
import { readMascot } from "../src/lib/mascot";
import { today } from "../src/lib/today";
import { signOutHere } from "../src/sync/auth";
import { accountFirstName, accountPhoto, signedInWith } from "../src/sync/profile";
import { backupState } from "../src/sync/status";
import { useSync } from "../src/sync/sync-provider";
import { deleteAccountOnServer, OfflineError } from "../src/sync/transport";
import { Avatar } from "../src/ui/avatar";
import { Button, PageScreen, Sticker } from "../src/ui/components";
import { GrowIntroCard } from "../src/ui/mascot-image";
import { ModalSheet } from "../src/ui/sheet";
import { Icon, type IconName } from "../src/ui/icons";
import { TextField } from "../src/ui/text-field";
import { fonts, MIN_TOUCH, space, type } from "../src/ui/theme";
import { useTheme } from "../src/ui/theme-context";

/**
 * Profile (S13j signed in, S13k not signed in; D-34, D-72, D-73 c). Opened from the card at the
 * top of More: the photo from the account (or the initial), what Brokely calls you, backup, and
 * sign out with its rule: only once everything is backed up, and it clears this phone.
 */
export default function ProfileScreen() {
  const introSeen = useRead(getMascotIntroSeen);
  // Days logged, for the growth path on the intro card (D-120); read only while it shows.
  const loggedDays = useRead(
    (d) => (introSeen ? 0 : readMascot(d, today(), false).loggedDays),
    [introSeen],
  );
  const { colors } = useTheme();
  const sync = useSync();
  const nickname = useRead(getNickname);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [signingOut, setSigningOut] = useState<"idle" | "blocked" | "confirm">("idle");
  const signedIn = sync.session !== null && sync.linked;
  const name = nickname || accountFirstName(sync.session) || "You";
  const state = backupState({ ...sync, signedIn });
  const method = signedInWith(sync.session);

  const save = () => {
    setNickname(repo, draft);
    setEditing(false);
  };

  const startSignOut = async () => {
    await sync.sync(); // back up what's waiting first
    setSigningOut(syncCounts(db).waiting > 0 ? "blocked" : "confirm");
  };

  const [deleting, setDeleting] = useState<"idle" | "confirm" | "working">("idle");
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);

  const exportFirst = () =>
    void shareExportFile(
      `brokely-data-${today()}.json`,
      "application/json",
      exportJson(db, new Date().toISOString()),
    );

  /** FR-ACC-07: the account on the server first, then this phone. Nothing changes offline. */
  const deleteMyAccount = async () => {
    setDeleting("working");
    setDeleteMessage(null);
    try {
      await deleteAccountOnServer();
    } catch (error) {
      setDeleting("confirm");
      setDeleteMessage(
        error instanceof OfflineError
          ? "Connect to the internet to delete your account. Nothing was changed."
          : "Brokely couldn't delete your account just now. Nothing was changed; please try again.",
      );
      return;
    }
    deleteAllData(db);
    await signOutHere();
    router.replace("/welcome");
  };

  const signOut = async () => {
    deleteAllData(db);
    await signOutHere();
    router.replace("/welcome");
  };

  const row = (
    icon: IconName,
    iconColor: string,
    title: string,
    detail: string,
    onPress: () => void,
    divider: boolean,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}: ${detail}`}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 56,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: space.md,
        paddingVertical: 10,
        borderTopWidth: divider ? 2 : 0,
        borderTopColor: colors.background,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Icon name={icon} color={iconColor} size={26} strokeWidth={2} />
      <View style={{ flex: 1 }}>
        <Text style={[type.strong, { color: colors.text }]}>{title}</Text>
        <Text style={[type.small, { color: colors.muted }]}>{detail}</Text>
      </View>
      <Text style={[type.heading, { color: colors.muted }]}>›</Text>
    </Pressable>
  );

  return (
    <PageScreen title="Profile" keyboardSafe>
      <View style={{ alignItems: "center", gap: space.xs }}>
        <Avatar size={96} photoUrl={accountPhoto(sync.session)} name={name} signedIn={signedIn} />
        <Text style={[type.title, { fontSize: 28, color: colors.text }]} accessibilityRole="header">
          {name}
        </Text>
        <Text style={[type.small, { color: colors.muted, textAlign: "center" }]}>
          {signedIn
            ? `Signed in${method === "Google" ? " with Google" : ""} · ${sync.session!.user.email}`
            : "Not signed in · everything stays on this phone"}
        </Text>
      </View>

      {/* Once: how Brokely grows, with the three stages (D-110) */}
      {introSeen ? null : (
        <GrowIntroCard loggedDays={loggedDays} onDone={() => setMascotIntroSeen(repo)} />
      )}

      {editing ? (
        <Sticker style={{ padding: space.md, gap: space.sm }}>
          <TextField
            label="What Brokely calls you"
            value={draft}
            onChangeText={setDraft}
            maxLength={NICKNAME_MAX}
            autoFocus
            autoCapitalize="words"
            placeholder="Your name or nickname"
            returnKeyType="done"
            onSubmitEditing={save}
          />
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Button label="Save" onPress={save} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Cancel" variant="secondary" onPress={() => setEditing(false)} />
            </View>
          </View>
          <Text style={[type.small, { color: colors.muted }]}>Kept on this phone only.</Text>
        </Sticker>
      ) : (
        <Sticker style={{ padding: 0 }}>
          {row(
            "pencil",
            colors.text,
            "What Brokely calls you",
            nickname || "Not set",
            () => {
              setDraft(nickname ?? "");
              setEditing(true);
            },
            false,
          )}
          {signedIn
            ? row(
                state.icon,
                state.tone === "good"
                  ? colors.primary
                  : state.tone === "attention"
                    ? colors.warning
                    : colors.text,
                "Backup",
                state.tone === "good" ? `${state.title} · ${state.detail}` : state.title,
                () => router.push("/backup"),
                true,
              )
            : row(
                "cloud",
                colors.text,
                "Back up and sync",
                "Sign in to keep a copy · Optional",
                () => router.push({ pathname: "/sign-in", params: { from: "profile" } }),
                true,
              )}
        </Sticker>
      )}

      {signedIn ? (
        <View style={{ gap: space.xs }}>
          <Pressable
            accessibilityRole="button"
            onPress={() => void startSignOut()}
            style={({ pressed }) => ({
              minHeight: MIN_TOUCH,
              justifyContent: "center",
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text
              style={{
                fontFamily: fonts.heavy,
                fontSize: 16,
                color: colors.text,
                textAlign: "center",
                textDecorationLine: "underline",
              }}
            >
              Sign out
            </Text>
          </Pressable>
          <Text style={[type.small, { color: colors.muted, textAlign: "center" }]}>
            Signing out removes your records from this phone. They stay safe in your account.
            Changes not backed up yet block it.
          </Text>
          {/* FR-ACC-07: quieter than Sign out, and always confirmed first. */}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setDeleteMessage(null);
              setDeleting("confirm");
            }}
            style={({ pressed }) => ({
              minHeight: MIN_TOUCH,
              justifyContent: "center",
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text
              style={{
                fontFamily: fonts.heavy,
                fontSize: 14,
                color: colors.warning,
                textAlign: "center",
                textDecorationLine: "underline",
              }}
            >
              Delete my account
            </Text>
          </Pressable>
        </View>
      ) : (
        <Button
          label="Sign in"
          onPress={() => router.push({ pathname: "/sign-in", params: { from: "profile" } })}
        />
      )}

      {/* Confirmations open as sheets over the screen, never below the fold (author). */}
      <ModalSheet
        visible={signingOut === "blocked"}
        onClose={() => setSigningOut("idle")}
        title="Not backed up yet"
      >
        <Text style={[type.body, { color: colors.text }]}>
          {sync.waiting} {sync.waiting === 1 ? "change isn't" : "changes aren't"} backed up yet.
          Connect to the internet and try again, so nothing is lost.
        </Text>
        <Button label="OK" variant="secondary" onPress={() => setSigningOut("idle")} />
      </ModalSheet>
      <ModalSheet
        visible={signingOut === "confirm"}
        onClose={() => setSigningOut("idle")}
        title="Sign out?"
      >
        <Text style={[type.body, { color: colors.text }]}>
          Your records leave this phone; they stay safe in your account and come back when you sign
          in again.
        </Text>
        <Button label="Sign out" onPress={() => void signOut()} />
        <Button label="Stay signed in" variant="secondary" onPress={() => setSigningOut("idle")} />
      </ModalSheet>
      <ModalSheet
        visible={deleting !== "idle"}
        onClose={() => (deleting === "working" ? undefined : setDeleting("idle"))}
        title="Delete your account?"
      >
        <Sticker background={colors.warningCard} style={{ padding: space.md }}>
          <Text style={[type.body, { color: colors.text }]}>
            Your account and everything backed up with it are removed for good, and so are the
            records on this phone. This can't be undone.
          </Text>
        </Sticker>
        {deleteMessage ? (
          <Text accessibilityLiveRegion="polite" style={[type.strong, { color: colors.text }]}>
            {deleteMessage}
          </Text>
        ) : null}
        <Button label="Export everything first" variant="secondary" onPress={exportFirst} />
        <Button
          label={deleting === "working" ? "Deleting…" : "Delete my account"}
          variant="destructive"
          disabled={deleting === "working"}
          onPress={() => void deleteMyAccount()}
        />
        <Button label="Keep my account" variant="link" onPress={() => setDeleting("idle")} />
      </ModalSheet>
    </PageScreen>
  );
}
