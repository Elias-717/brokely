import { formatRM, sen } from "@brokely/domain";
import { stuckChanges } from "@brokely/local-db";
import { Redirect, router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useRead } from "../src/db/use-read";
import { backupState } from "../src/sync/status";
import { useSync } from "../src/sync/sync-provider";
import { Button, Heading, PageScreen, Sticker } from "../src/ui/components";
import { Icon } from "../src/ui/icons";
import { space, type } from "../src/ui/theme";
import { useTheme } from "../src/ui/theme-context";

/**
 * S13i Backup (FR-SYNC-06): opened from Profile. The state with its cloud, "Back up now", and
 * the changes that need a look, each with what it is and why. A change made on two phones opens
 * S13m to choose which version stays (FR-SYNC-08); a refused one is listed with the reason.
 */
export default function BackupScreen() {
  const { colors } = useTheme();
  const sync = useSync();
  const stuck = useRead(stuckChanges);
  const signedIn = sync.session !== null && sync.linked;
  if (!signedIn) return <Redirect href="/profile" />;
  const state = backupState({ ...sync, signedIn });
  const tone =
    state.tone === "good"
      ? colors.primary
      : state.tone === "attention"
        ? colors.warning
        : colors.text;
  const last = sync.lastSyncedAt
    ? `Last backup ${sync.lastSyncedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    : "Not backed up since the app opened";

  return (
    <PageScreen title="Backup">
      <Sticker
        background={state.tone === "good" ? colors.cardTint : colors.card}
        style={{ padding: space.md, gap: space.xs, alignItems: "center" }}
      >
        <Icon name={state.icon} color={tone} size={44} strokeWidth={2} />
        <Heading>{state.title}</Heading>
        <Text
          accessibilityLiveRegion="polite"
          style={[type.small, { color: colors.muted, textAlign: "center" }]}
        >
          {state.tone === "good" ? `${last} · ${sync.session!.user.email}` : state.detail}
        </Text>
      </Sticker>
      <Button
        label={sync.status === "syncing" ? "Backing up…" : "Back up now"}
        variant="secondary"
        disabled={sync.status === "syncing"}
        onPress={() => void sync.sync()}
      />

      {stuck.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <Heading>Needs a look ({stuck.length})</Heading>
          <Sticker style={{ padding: 0 }}>
            {stuck.map((c, i) => {
              const choosable = c.status === "conflict";
              const row = (
                <>
                  <Icon name="cloud-alert" color={colors.warning} size={26} strokeWidth={2} />
                  <View style={{ flex: 1 }}>
                    <Text style={[type.strong, { color: colors.text }]}>
                      {c.label}
                      {c.amountSen !== null ? ` · ${formatRM(sen(c.amountSen))}` : ""}
                    </Text>
                    <Text style={[type.small, { color: colors.muted }]}>
                      {c.kind} · {c.reason}
                    </Text>
                  </View>
                  {choosable ? (
                    <Text
                      style={{ fontSize: 22, color: colors.muted }}
                      importantForAccessibility="no"
                    >
                      ›
                    </Text>
                  ) : null}
                </>
              );
              const style = {
                minHeight: 56,
                flexDirection: "row" as const,
                alignItems: "center" as const,
                gap: 12,
                paddingHorizontal: space.md,
                paddingVertical: 10,
                borderTopWidth: i === 0 ? 0 : 2,
                borderTopColor: colors.background,
              };
              return choosable ? (
                <Pressable
                  key={c.operationId}
                  accessibilityRole="button"
                  accessibilityLabel={`${c.label}. ${c.kind}: ${c.reason}`}
                  accessibilityHint="Choose which version stays"
                  onPress={() => router.push(`/conflict/${c.operationId}`)}
                  style={({ pressed }) => ({ ...style, opacity: pressed ? 0.7 : 1 })}
                >
                  {row}
                </Pressable>
              ) : (
                <View
                  key={c.operationId}
                  accessible
                  accessibilityLabel={`${c.label}. ${c.kind}: ${c.reason}`}
                  style={style}
                >
                  {row}
                </View>
              );
            })}
          </Sticker>
          <Text style={[type.small, { color: colors.muted }]}>
            Tap one to choose which version stays. Your other records keep backing up.
          </Text>
        </View>
      ) : null}
    </PageScreen>
  );
}
