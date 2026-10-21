import { findCycleOn, getNotificationPrefs, setNotificationState } from "@brokely/local-db";
import { addDatabaseChangeListener } from "expo-sqlite";
import { router, type Href } from "expo-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AppState, Image, Text } from "react-native";
import { db, repo } from "../db/client";
import { today } from "../lib/today";
import { Button } from "../ui/components";
import { ModalSheet } from "../ui/sheet";
import { type } from "../ui/theme";
import { useTheme } from "../ui/theme-context";
import {
  notificationPermission,
  notificationsModule,
  rescheduleNotifications,
  requestNotificationPermission,
} from "./scheduler";

/** How long after the last change to re-plan: a burst of edits schedules once. */
const AFTER_CHANGE_MS = 3000;

/**
 * Keeps the phone's scheduled notifications in step with its data (D-94): on start, back in
 * front, and shortly after any change (logging today cancels tonight's check-in). A tap opens
 * where the action is (FR-NOT-07). Once a plan exists, Brokely asks once whether it may nudge
 * (N2) before Android's own prompt; "Not now" is remembered and never asked again unprompted.
 */
export function NotificationProvider({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const [ask, setAsk] = useState(false);
  const handled = useRef<string | null>(null);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    void (async () => {
      const N = await notificationsModule();
      if (!N) return;
      N.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }),
      });
      const open = (response: {
        notification: { request: { identifier: string; content: { data?: unknown } } };
      }) => {
        const { identifier, content } = response.notification.request;
        const url = (content.data as { url?: unknown } | undefined)?.url;
        if (handled.current === identifier || typeof url !== "string") return;
        handled.current = identifier;
        // A moment for the navigator to be ready on a cold start.
        setTimeout(() => router.push(url as Href), 300);
      };
      const last = await N.getLastNotificationResponseAsync();
      if (last) open(last);
      const sub = N.addNotificationResponseReceivedListener(open);
      cleanup = () => sub.remove();

      await rescheduleNotifications();
      // Ask once, after the first plan, unless the student already answered (N2).
      const prefs = getNotificationPrefs(db);
      if (
        !prefs.asked &&
        prefs.settings.enabled &&
        findCycleOn(db, today()) &&
        (await notificationPermission()) === "undetermined"
      ) {
        setAsk(true);
      }
    })();
    return () => cleanup?.();
  }, []);

  useEffect(() => {
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") void rescheduleNotifications();
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const changes = addDatabaseChangeListener(() => {
      clearTimeout(timer);
      timer = setTimeout(() => void rescheduleNotifications(), AFTER_CHANGE_MS);
    });
    return () => {
      clearTimeout(timer);
      appState.remove();
      changes.remove();
    };
  }, []);

  const answer = async (yes: boolean) => {
    setAsk(false);
    setNotificationState(repo, { asked: true });
    if (yes && (await requestNotificationPermission())) await rescheduleNotifications();
  };

  return (
    <>
      {children}
      <NudgeSheet visible={ask} onAnswer={(yes) => void answer(yes)} mutedColor={colors.muted} />
    </>
  );
}

/** N2 "Can I nudge you?": Brokely explains before Android asks. */
export function NudgeSheet({
  visible,
  onAnswer,
  mutedColor,
}: {
  visible: boolean;
  onAnswer: (yes: boolean) => void;
  mutedColor: string;
}) {
  return (
    <ModalSheet visible={visible} onClose={() => onAnswer(false)} title="Can I nudge you?">
      <Image
        source={require("../../assets/mascot/main_design.webp")}
        style={{ width: "100%", height: 130 }}
        resizeMode="contain"
        accessibilityLabel="Brokely"
      />
      <Text style={[type.body, { color: mutedColor, textAlign: "center" }]}>
        A bill on its due date, a quick evening check-in, a debt coming back. Never more than 3 a
        day, never at night.
      </Text>
      <Button label="Yes, nudge me" onPress={() => onAnswer(true)} />
      <Button label="Not now" variant="secondary" onPress={() => onAnswer(false)} />
    </ModalSheet>
  );
}
