import {
  deleteAllData,
  exportJson,
  exportTransactionsCsv,
  getMoneyTips,
  getSettings,
  setMoneyTipsEnabled,
  updateSettings,
  type Appearance,
} from "@brokely/local-db";
import Constants from "expo-constants";
import { router, type Href } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { db, repo } from "../../src/db/client";
import { ProfileCard } from "../../src/sync/profile-card";
import { signOutHere } from "../../src/sync/auth";
import { useSync } from "../../src/sync/sync-provider";
import { useRead } from "../../src/db/use-read";
import { shareExportFile } from "../../src/lib/export-file";
import { today } from "../../src/lib/today";
import { Button, Card, Heading, Screen, Sticker, Title } from "../../src/ui/components";
import { Segmented } from "../../src/ui/segmented";
import { space, type } from "../../src/ui/theme";
import { useTheme } from "../../src/ui/theme-context";

/** Places under More (D-24): Bills, Debts and the rest open from here. */
const PLACES: { label: string; detail: string; href: Href }[] = [
  { label: "Your plan", detail: "Budget and amounts per category", href: "/plan" },
  {
    label: "Plan step by step",
    detail: "Go through your whole plan with Brokely",
    href: "/guided",
  },
  {
    label: "Bills & subscriptions",
    detail: "Phone plan, Spotify, bus pass…",
    href: "/bills",
  },
  { label: "Debts", detail: "Who owes you, who you owe", href: "/debts" },
  { label: "Wallet check", detail: "Compare your money with your records", href: "/wallet-check" },
];

/** The phone's own time zone, e.g. "Asia/Kuala_Lumpur". */
const phoneTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone ?? "Asia/Kuala_Lumpur";

/**
 * S9 More: the profile card first (S13h, D-76: photo, name, backup; opens Profile, where the
 * nickname and sign-out live), places (Plan, Bills, Debts, Wallet check), then one compact
 * Settings card (appearance D-32, week start, money tips, time zone; FR-ACC-05, D-79) and Your
 * data as rows: export (FR-ACC-06) or delete everything (FR-ACC-07).
 */
export default function MoreScreen() {
  const { colors, appearance, setAppearance } = useTheme();
  const settings = useRead(getSettings);
  const tips = useRead(getMoneyTips);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { session } = useSync();
  const tz = phoneTimeZone();

  // A file through Android's share sheet: save to Drive or Files, email it to yourself…
  const share = (name: string, mimeType: string, text: string) =>
    void shareExportFile(name, mimeType, text);
  const stamp = today();

  return (
    <Screen>
      <Title>More</Title>
      {/* The student first (S13h, D-76): photo, name, account and backup; opens Profile. */}
      <ProfileCard />
      <Card style={{ padding: 0, gap: 0 }}>
        {PLACES.map((place, i) => (
          <Pressable
            key={place.label}
            accessibilityRole="button"
            onPress={() => router.push(place.href)}
            style={({ pressed }) => ({
              minHeight: 56,
              paddingHorizontal: space.md,
              paddingVertical: space.sm,
              flexDirection: "row",
              alignItems: "center",
              borderTopWidth: i === 0 ? 0 : 2,
              borderTopColor: colors.background,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <View style={{ flex: 1 }}>
              <Text style={[type.strong, { color: colors.text }]}>{place.label}</Text>
              <Text style={[type.small, { color: colors.muted }]}>{place.detail}</Text>
            </View>
            <Text style={[type.heading, { color: colors.muted }]}>›</Text>
          </Pressable>
        ))}
      </Card>
      {/* Settings as compact rows (S9, D-79): small switches instead of big buttons. */}
      <Sticker style={{ padding: 0 }}>
        <View style={{ paddingHorizontal: space.md, paddingTop: 14, paddingBottom: 2 }}>
          <Heading>Settings</Heading>
        </View>
        <Row title="Appearance" first>
          <Segmented
            label="Appearance"
            options={[
              { value: "system", label: "Phone", spoken: "Same as phone" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
            value={appearance}
            onChange={(a: Appearance) => setAppearance(a)}
          />
        </Row>
        <Row title="Week starts on">
          <Segmented
            label="Week starts on"
            options={[
              { value: 1, label: "Mon", spoken: "Monday" },
              { value: 0, label: "Sun", spoken: "Sunday" },
              { value: 6, label: "Sat", spoken: "Saturday" },
            ]}
            value={settings.weekStart}
            onChange={(weekStart) => updateSettings(repo, { weekStart })}
          />
        </Row>
        {/* Money tips after saving an expense (D-39, D-67); on by default. */}
        <Row title="Money tips" detail="After you add spending, up to 10 a day">
          <Switch
            value={tips.enabled}
            onValueChange={(on) => setMoneyTipsEnabled(repo, on)}
            accessibilityLabel="Money tips after adding spending"
            trackColor={{ true: colors.primary, false: colors.outline }}
          />
        </Row>
        <Row
          title="Time zone"
          detail={
            settings.timeZone === tz
              ? `${settings.timeZone.replace(/_/g, " ")} · money in RM`
              : `${settings.timeZone.replace(/_/g, " ")} · tap to use this phone's (${tz.replace(/_/g, " ")})`
          }
          onPress={
            settings.timeZone === tz ? undefined : () => updateSettings(repo, { timeZone: tz })
          }
        />
      </Sticker>

      {/* Your data (FR-ACC-06, FR-ACC-07): exports as rows; delete set apart in the warning colour. */}
      <Sticker style={{ padding: 0 }}>
        <View style={{ paddingHorizontal: space.md, paddingTop: 14, paddingBottom: 2, gap: 2 }}>
          <Heading>Your data</Heading>
          <Text style={[type.small, { color: colors.muted }]}>
            {session ? "On this phone and backed up to your account." : "Take a copy any time."}
          </Text>
        </View>
        <Row
          title="Export records"
          detail="A spreadsheet file (CSV)"
          first
          onPress={() =>
            share(`brokely-records-${stamp}.csv`, "text/csv", exportTransactionsCsv(db))
          }
        />
        <Row
          title="Export everything"
          detail="Every record and setting (JSON)"
          onPress={() =>
            share(
              `brokely-data-${stamp}.json`,
              "application/json",
              exportJson(db, new Date().toISOString()),
            )
          }
        />
        <Row
          title="Privacy notice"
          detail="What Brokely keeps, where, and your rights"
          onPress={() => router.push("/privacy")}
        />
        <Row
          title="Delete all my data"
          detail="From this phone; can't be undone"
          warning
          onPress={() => setConfirmDelete(true)}
        />
        {confirmDelete ? (
          <View style={{ padding: space.md, paddingTop: 0 }}>
            <Sticker background={colors.warningCard} style={{ padding: space.md, gap: space.sm }}>
              <Text style={[type.strong, { color: colors.text }]}>
                Delete everything on this phone? Plans, records, debts, bills and settings go, and
                this can't be undone. Export first if you want a copy.
                {session ? " You'll also be signed out; the backup in your account stays." : ""}
              </Text>
              <Button
                label="Delete everything"
                variant="destructive"
                onPress={async () => {
                  deleteAllData(db);
                  // Signed in, the next sync would bring everything back (D-73 c).
                  if (session) await signOutHere();
                  router.replace("/welcome");
                }}
              />
              <Button
                label="Keep my data"
                variant="secondary"
                onPress={() => setConfirmDelete(false)}
              />
            </Sticker>
          </View>
        ) : null}
      </Sticker>
      {/* The version, quietly at the very bottom (author). */}
      <Text
        style={[type.small, { color: colors.muted, textAlign: "center", marginBottom: space.lg }]}
      >
        Brokely {Constants.expoConfig?.version ?? ""}
      </Text>
    </Screen>
  );
}

/** One settings row: title and detail on the left, a control or a chevron on the right. */
function Row({
  title,
  detail,
  first,
  warning,
  onPress,
  children,
}: {
  title: string;
  detail?: string;
  first?: boolean;
  warning?: boolean;
  onPress?: () => void;
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  const body = (
    <>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={[type.strong, { color: warning ? colors.warning : colors.text }]}>
          {title}
        </Text>
        {detail ? <Text style={[type.small, { color: colors.muted }]}>{detail}</Text> : null}
      </View>
      {children ??
        (onPress ? <Text style={[type.heading, { color: colors.muted }]}>›</Text> : null)}
    </>
  );
  const style = {
    minHeight: 56,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    borderTopWidth: first ? 0 : 2,
    borderTopColor: colors.background,
  };
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={detail ? `${title}. ${detail}` : title}
      onPress={onPress}
      style={({ pressed }) => [style, { opacity: pressed ? 0.6 : 1 }]}
    >
      {body}
    </Pressable>
  ) : (
    <View style={style}>{body}</View>
  );
}
