import { getNickname } from "@brokely/local-db";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useRead } from "../db/use-read";
import { Avatar } from "../ui/avatar";
import { Sticker } from "../ui/components";
import { Icon } from "../ui/icons";
import { fonts, space, type } from "../ui/theme";
import { useTheme } from "../ui/theme-context";
import { accountFirstName, accountPhoto } from "./profile";
import { backupState } from "./status";
import { useSync } from "./sync-provider";

/**
 * S13h: the first thing on More. The student's photo (or initial), name, account and backup
 * state at a glance; opens Profile.
 */
export function ProfileCard() {
  const { colors } = useTheme();
  const sync = useSync();
  const nickname = useRead(getNickname);
  const signedIn = sync.session !== null && sync.linked;
  const name = nickname || accountFirstName(sync.session) || "You";
  const state = backupState({ ...sync, signedIn });
  const toneColor =
    state.tone === "good"
      ? colors.primary
      : state.tone === "attention"
        ? colors.warning
        : colors.muted;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Profile: ${name}. ${state.title}`}
      onPress={() => router.push("/profile")}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <Sticker
        style={{
          padding: 14,
          paddingRight: space.md,
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
        }}
      >
        <Avatar size={56} photoUrl={accountPhoto(sync.session)} name={name} signedIn={signedIn} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{ fontFamily: fonts.heavy, fontSize: 19, lineHeight: 24, color: colors.text }}
            numberOfLines={1}
          >
            {name}
          </Text>
          <Text style={[type.small, { color: colors.muted }]} numberOfLines={1}>
            {signedIn ? sync.session!.user.email : "Not signed in"}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Icon name={state.icon} color={toneColor} size={16} strokeWidth={2} />
            <Text style={[type.small, { color: toneColor }]} numberOfLines={1}>
              {signedIn
                ? `${state.title}${state.tone === "good" ? ` · ${state.detail}` : ""}`
                : "Back up and sync · Optional"}
            </Text>
          </View>
        </View>
        <Text style={[type.heading, { color: colors.muted }]}>›</Text>
      </Sticker>
    </Pressable>
  );
}
