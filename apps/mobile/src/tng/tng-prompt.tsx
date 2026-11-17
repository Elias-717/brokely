import { getNotificationPrefs, getTngPromptSeen, setTngPromptSeen } from "@brokely/local-db";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { tngListenerAvailable } from "../../modules/tng-listener";
import { repo } from "../db/client";
import { useRead } from "../db/use-read";
import { notificationPermission } from "../notifications/scheduler";
import { Button } from "../ui/components";
import { ModalSheet } from "../ui/sheet";
import { type } from "../ui/theme";
import { useTheme } from "../ui/theme-context";
import { TngSteps, useTngStatus } from "./tng-steps";

/**
 * One-time sheet on Home that walks the student through turning on TNG auto-collect (D-140):
 * the same two steps as More → TNG auto-collect, with live status that updates when they come
 * back from Android's settings. Shown once, only when the build has the listener and access is
 * still off, and never on top of another popup: Home passes `blocked` while its own popups show,
 * and it waits until "Can I nudge you?" (N2) is answered or not needed. Closing it in any way
 * counts as seen; the More row stays for later.
 */
export function TngPrompt({ blocked }: { blocked: boolean }) {
  const { colors } = useTheme();
  const seen = useRead(getTngPromptSeen);
  const nudgeAsked = useRead((db) => getNotificationPrefs(db).asked);
  const { access, battery } = useTngStatus();
  const [nudgeDone, setNudgeDone] = useState(false);
  const [open, setOpen] = useState(false);

  const eligible = tngListenerAvailable && !seen && !access && !blocked;

  // N2 only shows while Android's notification permission is still undetermined.
  useEffect(() => {
    if (!eligible || nudgeDone) return;
    if (nudgeAsked) {
      setNudgeDone(true);
      return;
    }
    let live = true;
    void notificationPermission().then((p) => live && p !== "undetermined" && setNudgeDone(true));
    return () => {
      live = false;
    };
  }, [eligible, nudgeAsked, nudgeDone]);

  useEffect(() => {
    if (!eligible || !nudgeDone) return;
    // A moment after Home appears, so the sheet doesn't land on top of the first paint.
    const timer = setTimeout(() => setOpen(true), 800);
    return () => clearTimeout(timer);
  }, [eligible, nudgeDone]);

  // Seen stays false until the sheet closes, so it stays open while the student is in settings.
  if (!open || seen) return null;

  const close = () => {
    setOpen(false);
    setTngPromptSeen(repo);
  };
  const done = access && battery;

  return (
    <ModalSheet visible onClose={close} title="Catch your TNG payments">
      <Text style={[type.body, { color: colors.muted }]}>
        Turn this on and Brokely notices your TNG transfers, then asks you to confirm each one, so
        your plan stays right without typing. It reads the notification on this phone only and never
        sees your TNG login. Two quick steps:
      </Text>
      <TngSteps access={access} battery={battery} />
      <Button
        label={done ? "All set" : access ? "Done" : "Maybe later"}
        variant={done || access ? "primary" : "secondary"}
        onPress={close}
      />
      {access ? null : (
        <Text style={[type.small, { color: colors.muted, textAlign: "center" }]}>
          You can do this any time from More → TNG auto-collect.
        </Text>
      )}
    </ModalSheet>
  );
}
