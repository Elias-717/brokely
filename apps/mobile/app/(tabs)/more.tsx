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
import { router, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { db, repo } from "../../src/db/client";
import { ProfileCard } from "../../src/sync/profile-card";
import { signOutHere } from "../../src/sync/auth";
import { useSync } from "../../src/sync/sync-provider";
import { useRead } from "../../src/db/use-read";
import { shareExportFile } from "../../src/lib/export-file";
import { today } from "../../src/lib/today";
import { Button, Card, Heading, Screen, Sticker, Title } from "../../src/ui/components";
import { space, type } from "../../src/ui/theme";
import { useTheme } from "../../src/ui/theme-context";

const CHOICES: { value: Appearance; label: string }[] = [
  { value: "system", label: "Same as phone" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

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

const WEEK_STARTS = [
  { value: 1, label: "Monday" },
  { value: 0, label: "Sunday" },
  { value: 6, label: "Saturday" },
];

/** The phone's own time zone, e.g. "Asia/Kuala_Lumpur". */
const phoneTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone ?? "Asia/Kuala_Lumpur";

/**
 * S9 More: the profile card first (S13h, D-76: photo, name, backup; opens Profile, where the
 * nickname and sign-out live), places (Plan, Bills, Debts, Wallet check), Appearance (D-32),
 * settings (FR-ACC-05) and your data: export (FR-ACC-06) or delete everything (FR-ACC-07).
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
      <Card>
        <Heading>Appearance</Heading>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {CHOICES.map((choice) => (
            <Button
              key={choice.value}
              label={choice.label}
              variant="secondary"
              selected={appearance === choice.value}
              onPress={() => setAppearance(choice.value)}
            />
          ))}
        </View>
      </Card>
      <Card>
        <Heading>Settings</Heading>
        {/* Money tips after saving an expense (D-39, D-67); on by default. */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 48 }}>
          <View style={{ flex: 1 }}>
            <Text style={[type.strong, { color: colors.text }]}>Money tips</Text>
            <Text style={[type.small, { color: colors.muted }]}>
              A short tip from Brokely when you log spending, up to 10 a day
            </Text>
          </View>
          <Switch
            value={tips.enabled}
            onValueChange={(on) => setMoneyTipsEnabled(repo, on)}
            accessibilityLabel="Money tips after logging spending"
            trackColor={{ true: colors.primary, false: colors.outline }}
          />
        </View>
        <Text style={[type.small, { color: colors.muted }]}>Week starts on</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {WEEK_STARTS.map((w) => (
            <Button
              key={w.value}
              label={w.label}
              variant="secondary"
              selected={settings.weekStart === w.value}
              onPress={() => updateSettings(repo, { weekStart: w.value })}
            />
          ))}
        </View>
        <Text style={[type.small, { color: colors.muted }]}>
          Time zone: {settings.timeZone.replace(/_/g, " ")} · money is always in RM
        </Text>
        {settings.timeZone !== tz ? (
          <Button
            label={`Use this phone's: ${tz.replace(/_/g, " ")}`}
            variant="secondary"
            onPress={() => updateSettings(repo, { timeZone: tz })}
          />
        ) : null}
      </Card>
      <Card style={{ marginBottom: space.lg }}>
        <Heading>Your data</Heading>
        <Text style={[type.small, { color: colors.muted }]}>
          {session
            ? "Your records are on this phone and backed up to your account. Take a copy any time."
            : "Everything stays on this phone. Take a copy any time."}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          <Button
            label="Export records (CSV)"
            variant="secondary"
            onPress={() =>
              share(`brokely-records-${stamp}.csv`, "text/csv", exportTransactionsCsv(db))
            }
          />
          <Button
            label="Export everything (JSON)"
            variant="secondary"
            onPress={() =>
              share(
                `brokely-data-${stamp}.json`,
                "application/json",
                exportJson(db, new Date().toISOString()),
              )
            }
          />
        </View>
        {confirmDelete ? (
          <Sticker background={colors.cardTint} style={{ padding: space.md, gap: space.sm }}>
            <Text style={[type.strong, { color: colors.text }]}>
              Delete everything on this phone? Plans, records, debts, bills and settings go, and
              this can't be undone. Export first if you want a copy.
              {session ? " You'll also be signed out; the backup in your account stays." : ""}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
              <Button
                label="Delete everything"
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
            </View>
          </Sticker>
        ) : (
          <Button
            label="Delete all my data"
            variant="link"
            onPress={() => setConfirmDelete(true)}
          />
        )}
      </Card>
    </Screen>
  );
}
