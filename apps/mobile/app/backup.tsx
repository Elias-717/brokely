import { formatRM, sen } from "@brokely/domain";
import { stuckChanges } from "@brokely/local-db";
import { Redirect } from "expo-router";
import { Text, View } from "react-native";
import { useRead } from "../src/db/use-read";
import { backupState } from "../src/sync/status";
import { useSync } from "../src/sync/sync-provider";
import { Button, Heading, PageScreen, Sticker } from "../src/ui/components";
import { Icon } from "../src/ui/icons";
import { space, type } from "../src/ui/theme";
import { useTheme } from "../src/ui/theme-context";

/**
 * S13i Backup (FR-SYNC-06): opened from Profile. The state with its cloud, "Back up now", and
 * the changes that need a look, each with what it is and why. Resolving them side by side is the
 * conflict screen (FR-SYNC-08), which comes later; until then they're listed honestly.
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
            {stuck.map((c, i) => (
              <View
                key={c.operationId}
                accessible
                accessibilityLabel={`${c.label}. ${c.kind}: ${c.reason}`}
                style={{
                  minHeight: 56,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingHorizontal: space.md,
                  paddingVertical: 10,
                  borderTopWidth: i === 0 ? 0 : 2,
                  borderTopColor: colors.background,
                }}
              >
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
              </View>
            ))}
          </Sticker>
          <Text style={[type.small, { color: colors.muted }]}>
            Your other records keep backing up. Choosing which version to keep comes in a later
            update.
          </Text>
        </View>
      ) : null}
    </PageScreen>
  );
}
