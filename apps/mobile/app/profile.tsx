import {
  deleteAllData,
  getNickname,
  NICKNAME_MAX,
  setNickname,
  syncCounts,
} from "@brokely/local-db";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { db, repo } from "../src/db/client";
import { useRead } from "../src/db/use-read";
import { signOutHere } from "../src/sync/auth";
import { accountFirstName, accountPhoto, signedInWith } from "../src/sync/profile";
import { backupState } from "../src/sync/status";
import { useSync } from "../src/sync/sync-provider";
import { Avatar } from "../src/ui/avatar";
import { Button, PageScreen, Sticker } from "../src/ui/components";
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
        </View>
      ) : (
        <Button
          label="Sign in"
          onPress={() => router.push({ pathname: "/sign-in", params: { from: "profile" } })}
        />
      )}

      {signingOut === "blocked" ? (
        <Sticker background={colors.warningCard} style={{ padding: space.md, gap: space.sm }}>
          <Text style={[type.strong, { color: colors.text }]}>
            {sync.waiting} {sync.waiting === 1 ? "change isn't" : "changes aren't"} backed up yet.
            Connect to the internet and try again, so nothing is lost.
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
          <Button label="Sign out" onPress={() => void signOut()} />
          <Button
            label="Stay signed in"
            variant="secondary"
            onPress={() => setSigningOut("idle")}
          />
        </Sticker>
      ) : null}
    </PageScreen>
  );
}
