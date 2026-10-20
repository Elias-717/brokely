import { deleteAllData, syncCounts } from "@brokely/local-db";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { db } from "../db/client";
import { Button, Sticker } from "../ui/components";
import { space, type } from "../ui/theme";
import { useTheme } from "../ui/theme-context";
import { signOutHere } from "./auth";
import { useSync, type SyncStatus } from "./sync-provider";

function sinceText(at: Date | null): string {
  if (!at) return "";
  const minutes = Math.round((Date.now() - at.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  return at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** One short line about the backup, in plain words (FR-SYNC-06). */
function statusLine(status: SyncStatus, waiting: number, needsAttention: number, at: Date | null) {
  const changes = (n: number) => `${n} ${n === 1 ? "change" : "changes"}`;
  if (needsAttention > 0) return `${changes(needsAttention)} couldn't be backed up and need a look`;
  if (status === "syncing") return "Backing up…";
  if (status === "offline")
    return waiting > 0
      ? `${changes(waiting)} waiting · no internet, will retry`
      : "No internet, will retry";
  if (status === "error") return "Backup didn't work this time, will retry";
  if (waiting > 0) return `${changes(waiting)} waiting to back up`;
  return at ? `Backed up · ${sinceText(at)}` : "Backed up";
}

/**
 * The first rows of More → Settings (D-72): "Back up and sync" while signed out; the account,
 * backup status, "Back up now" and "Sign out" while signed in. Sign-out erases this phone's
 * records, but only once every change is backed up (D-73 c).
 */
export function AccountRows() {
  const { colors } = useTheme();
  const { canSignIn, session, linked, status, lastSyncedAt, waiting, needsAttention, sync } =
    useSync();
  const [signingOut, setSigningOut] = useState<"idle" | "blocked" | "confirm">("idle");

  if (!session || !linked) {
    return (
      <Pressable
        accessibilityRole="button"
        disabled={!canSignIn}
        onPress={() => router.push({ pathname: "/sign-in", params: { from: "more" } })}
        style={({ pressed }) => ({
          minHeight: 56,
          flexDirection: "row",
          alignItems: "center",
          gap: space.sm,
          opacity: pressed || !canSignIn ? 0.6 : 1,
        })}
      >
        <View style={{ flex: 1 }}>
          <Text style={[type.strong, { color: colors.text }]}>Back up and sync</Text>
          <Text style={[type.small, { color: colors.muted }]}>
            {!canSignIn
              ? "Update Brokely to sign in"
              : session
                ? "Finish signing in to start backing up"
                : "Sign in to keep a backup and use more than one phone. Optional"}
          </Text>
        </View>
        <Text style={[type.heading, { color: colors.muted }]}>›</Text>
      </Pressable>
    );
  }

  const startSignOut = async () => {
    await sync(); // back up what's waiting first
    setSigningOut(syncCounts(db).waiting > 0 ? "blocked" : "confirm");
  };

  const signOut = async () => {
    deleteAllData(db);
    await signOutHere();
    router.replace("/welcome");
  };

  return (
    <View style={{ gap: space.sm }}>
      <View>
        <Text style={[type.strong, { color: colors.text }]}>Signed in as {session.user.email}</Text>
        <Text accessibilityLiveRegion="polite" style={[type.small, { color: colors.muted }]}>
          {statusLine(status, waiting, needsAttention, lastSyncedAt)}
        </Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        <Button
          label="Back up now"
          variant="secondary"
          disabled={status === "syncing"}
          onPress={() => void sync()}
        />
        <Button label="Sign out" variant="link" onPress={() => void startSignOut()} />
      </View>
      {signingOut === "blocked" ? (
        <Sticker background={colors.cardTint} style={{ padding: space.md, gap: space.sm }}>
          <Text style={[type.strong, { color: colors.text }]}>
            {waiting} {waiting === 1 ? "change isn't" : "changes aren't"} backed up yet. Connect to
            the internet and try again, so nothing is lost.
          </Text>
          <Button label="OK" variant="secondary" onPress={() => setSigningOut("idle")} />
        </Sticker>
      ) : null}
      {signingOut === "confirm" ? (
        <Sticker background={colors.cardTint} style={{ padding: space.md, gap: space.sm }}>
          <Text style={[type.strong, { color: colors.text }]}>
            Sign out? Your records leave this phone; they stay safe in your account and come back
            when you sign in again.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            <Button label="Sign out" onPress={() => void signOut()} />
            <Button
              label="Stay signed in"
              variant="secondary"
              onPress={() => setSigningOut("idle")}
            />
          </View>
        </Sticker>
      ) : null}
    </View>
  );
}
