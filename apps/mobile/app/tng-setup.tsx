import { useCallback, useEffect, useState } from "react";
import { AppState, Text, View } from "react-native";
import {
  isIgnoringBatteryOptimizations,
  isNotificationAccessGranted,
  openBatterySettings,
  openNotificationAccessSettings,
  tngListenerAvailable,
} from "../modules/tng-listener";
import { Button, PageScreen, Sticker } from "../src/ui/components";
import { space, type } from "../src/ui/theme";
import { useTheme } from "../src/ui/theme-context";

/**
 * TNG auto-collect setup (0.2, Phase 6): step 1 notification access, step 2 battery. The status
 * is re-read whenever the student comes back from Android's settings, because access can also be
 * switched off there at any time. Nothing is read from notifications yet; this screen only gets
 * the phone ready (every capture will still wait for the student's yes, D-02).
 */
export default function TngSetupScreen() {
  const { colors } = useTheme();
  const [access, setAccess] = useState(false);
  const [battery, setBattery] = useState(false);

  const refresh = useCallback(() => {
    setAccess(isNotificationAccessGranted());
    setBattery(isIgnoringBatteryOptimizations());
  }, []);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener("change", (state) => state === "active" && refresh());
    return () => sub.remove();
  }, [refresh]);

  if (!tngListenerAvailable) {
    return (
      <PageScreen title="TNG auto-collect">
        <Sticker background={colors.warningCard} style={{ padding: space.md }}>
          <Text style={[type.strong, { color: colors.text }]}>
            This version of Brokely can't do this yet. Install the latest build to try it.
          </Text>
        </Sticker>
      </PageScreen>
    );
  }

  return (
    <PageScreen title="TNG auto-collect">
      <Text style={[type.body, { color: colors.text }]}>
        Brokely can notice your TNG payments and ask you to confirm each one. It reads the
        notification text on this phone only, and never sees your TNG login. Two steps, once:
      </Text>

      <Sticker style={{ padding: space.md, gap: space.sm }}>
        <Text style={[type.strong, { color: colors.text }]}>1. Let Brokely see notifications</Text>
        <Text style={[type.small, { color: colors.muted }]}>
          Find Brokely in the list and switch it on.
        </Text>
        <Button label="Open settings" onPress={() => openNotificationAccessSettings()} />
        <Status ok={access} on="Access is on" off="Not granted yet" />
      </Sticker>

      <Sticker style={{ padding: space.md, gap: space.sm }}>
        <Text style={[type.strong, { color: colors.text }]}>2. Keep Brokely awake</Text>
        <Text style={[type.small, { color: colors.muted }]}>
          Some phones (Xiaomi, Oppo, Vivo, Huawei) stop background apps early. Allow Brokely to keep
          running, and switch on "Autostart" for it if your phone has that.
        </Text>
        <Button
          label="Open battery settings"
          variant="secondary"
          onPress={() => openBatterySettings()}
        />
        <Status ok={battery} on="Battery limits are off" off="Battery limits may stop Brokely" />
      </Sticker>

      <View style={{ height: space.md }} />
    </PageScreen>
  );
}

/** One line of status with a dot, so the colour is never the only signal. */
function Status({ ok, on, off }: { ok: boolean; on: string; off: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: ok ? colors.primary : colors.warning,
        }}
      />
      <Text style={[type.small, { color: colors.text }]}>{ok ? on : off}</Text>
    </View>
  );
}
