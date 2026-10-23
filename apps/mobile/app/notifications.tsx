import type { NotificationKind } from "@brokely/domain";
import {
  getNotificationPrefs,
  setNotificationSettings,
  setNotificationState,
} from "@brokely/local-db";
import { useEffect, useState, type ReactNode } from "react";
import { AppState, Linking, Pressable, Switch, Text, View } from "react-native";
import { repo } from "../src/db/client";
import { useRead } from "../src/db/use-read";
import { NudgeSheet } from "../src/notifications/notification-provider";
import {
  notificationPermission,
  requestNotificationPermission,
  rescheduleNotifications,
  type Permission,
} from "../src/notifications/scheduler";
import { Button, PageScreen, Sticker } from "../src/ui/components";
import { clockTime } from "../src/lib/today";
import { pickTime } from "../src/ui/date-picker";
import { Chip } from "../src/ui/sheet-parts";
import { GroupLabel } from "../src/ui/allocation-fields";
import { fonts, space, type } from "../src/ui/theme";
import { useTheme } from "../src/ui/theme-context";

const KINDS: { kind: NotificationKind; title: string; detail: string }[] = [
  { kind: "bill_due", title: "Bills due", detail: "9:00 on the due date · opens Mark paid" },
  { kind: "evening", title: "Evening check-in", detail: "Only if nothing is logged today" },
  { kind: "debt_due", title: "Debts due back", detail: "9:00 on the date you set" },
  { kind: "pace", title: "Pace heads-up", detail: "At most once a week, when over plan" },
  { kind: "streak", title: "Streaks", detail: "After 3, 7, 14… days in a row" },
];

/**
 * N1 More → Notifications (FR-NOT-05, FR-NOT-06, D-94): mute all, one switch per type with what
 * it does and when, the evening check-in's time and tone, quiet hours. Every change re-plans what
 * is scheduled on this phone.
 */
export default function NotificationsScreen() {
  const { colors } = useTheme();
  const prefs = useRead((db) => getNotificationPrefs(db), []);
  const s = prefs.settings;
  const [permission, setPermission] = useState<Permission>("undetermined");
  const [ask, setAsk] = useState(false);

  useEffect(() => {
    const check = () => void notificationPermission().then(setPermission);
    check();
    const sub = AppState.addEventListener("change", (state) => state === "active" && check());
    return () => sub.remove();
  }, []);

  const change = (c: Parameters<typeof setNotificationSettings>[1]) => {
    setNotificationSettings(repo, c);
    void rescheduleNotifications();
    // Turning something on without Android's permission yet: explain first (N2).
    const turningOn = c.enabled === true || Object.values(c.kinds ?? {}).some(Boolean);
    if (turningOn && permission === "undetermined") setAsk(true);
  };

  const answer = async (yes: boolean) => {
    setAsk(false);
    setNotificationState(repo, { asked: true });
    if (yes) await requestNotificationPermission();
    setPermission(await notificationPermission());
    await rescheduleNotifications();
  };

  const time = async (key: "eveningTime" | "quietStart" | "quietEnd") => {
    const picked = await pickTime(s[key]);
    if (picked) change({ [key]: picked });
  };

  return (
    <PageScreen title="Notifications">
      {permission !== "granted" ? (
        <Sticker background={colors.warningCard} style={{ padding: space.md, gap: space.sm }}>
          <Text style={[type.strong, { color: colors.text }]}>
            {permission === "unavailable"
              ? "This version of Brokely can't send notifications yet. Update the app to get them."
              : permission === "denied"
                ? "Notifications are switched off for Brokely in Android's settings."
                : "Brokely can't nudge you yet."}
          </Text>
          {permission === "denied" ? (
            <Button label="Open settings" onPress={() => void Linking.openSettings()} />
          ) : permission === "undetermined" ? (
            <Button label="Turn on" onPress={() => setAsk(true)} />
          ) : null}
        </Sticker>
      ) : null}

      <Sticker style={{ padding: 0 }}>
        <Row title="Notifications" detail="Up to 3 a day, never in quiet hours" first>
          <Toggle label="Notifications" on={s.enabled} onChange={(v) => change({ enabled: v })} />
        </Row>
      </Sticker>

      <View style={{ gap: space.xs, opacity: s.enabled ? 1 : 0.5 }}>
        <GroupLabel>What to remind me about</GroupLabel>
        <Sticker style={{ padding: 0 }}>
          {KINDS.map((k, i) => (
            <Row key={k.kind} title={k.title} detail={k.detail} first={i === 0}>
              <Toggle
                label={k.title}
                on={s.kinds[k.kind]}
                disabled={!s.enabled}
                onChange={(v) => change({ kinds: { [k.kind]: v } })}
              />
            </Row>
          ))}
        </Sticker>
      </View>

      <View style={{ gap: space.xs, opacity: s.enabled ? 1 : 0.5 }}>
        <GroupLabel>Evening check-in</GroupLabel>
        <Sticker style={{ padding: 0 }}>
          <Row title="Time" first>
            <Pill label={clockTime(s.eveningTime)} onPress={() => void time("eveningTime")} />
          </Row>
          <Row title="Tone" detail={s.tone === "cheeky" ? "Nags kindly until you log" : undefined}>
            <View style={{ flexDirection: "row", gap: 6 }}>
              <Chip
                label="Friendly"
                selected={s.tone === "friendly"}
                onPress={() => change({ tone: "friendly" })}
              />
              <Chip
                label="Cheeky"
                selected={s.tone === "cheeky"}
                onPress={() => change({ tone: "cheeky" })}
              />
            </View>
          </Row>
          <Row title="Quiet hours" detail="Nothing arrives in between">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Pill label={clockTime(s.quietStart)} onPress={() => void time("quietStart")} />
              <Text style={[type.small, { color: colors.muted }]}>to</Text>
              <Pill label={clockTime(s.quietEnd)} onPress={() => void time("quietEnd")} />
            </View>
          </Row>
        </Sticker>
      </View>
      <Text style={[type.small, { color: colors.muted, paddingBottom: space.lg }]}>
        Everything is worked out on this phone. Nothing about your spending is sent to send a
        notification.
      </Text>

      <NudgeSheet visible={ask} onAnswer={(yes) => void answer(yes)} mutedColor={colors.muted} />
    </PageScreen>
  );
}

function Row({
  title,
  detail,
  first,
  children,
}: {
  title: string;
  detail?: string;
  first?: boolean;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        minHeight: 56,
        flexDirection: "row",
        alignItems: "center",
        gap: space.sm,
        paddingHorizontal: space.md,
        paddingVertical: 10,
        borderTopWidth: first ? 0 : 2,
        borderTopColor: colors.background,
      }}
    >
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ fontFamily: fonts.heavy, fontSize: 15, color: colors.text }}>{title}</Text>
        {detail ? <Text style={[type.small, { color: colors.muted }]}>{detail}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function Toggle({
  label,
  on,
  disabled,
  onChange,
}: {
  label: string;
  on: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  const { colors } = useTheme();
  return (
    <Switch
      accessibilityLabel={label}
      value={on}
      disabled={disabled}
      onValueChange={onChange}
      trackColor={{ true: colors.primary, false: colors.outline }}
    />
  );
}

function Pill({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. Change`}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 40,
        justifyContent: "center",
        paddingHorizontal: 10,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: colors.outline,
        backgroundColor: colors.card,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ fontFamily: fonts.heavy, fontSize: 13, color: colors.text }}>{label}</Text>
    </Pressable>
  );
}
