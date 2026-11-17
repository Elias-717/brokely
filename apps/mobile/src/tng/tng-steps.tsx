import { useCallback, useEffect, useState } from "react";
import { AppState, Text, View } from "react-native";
import {
  isIgnoringBatteryOptimizations,
  isNotificationAccessGranted,
  openBatterySettings,
  openNotificationAccessSettings,
} from "../../modules/tng-listener";
import { Button, Sticker } from "../ui/components";
import { space, type } from "../ui/theme";
import { useTheme } from "../ui/theme-context";

export type TngStatus = { access: boolean; battery: boolean; refresh: () => void };

/**
 * Whether the two TNG auto-collect steps are done (D-128). Re-read whenever the student comes
 * back to the app, because both are switched in Android's settings and can be undone there.
 */
export function useTngStatus(): TngStatus {
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

  return { access, battery, refresh };
}

/**
 * The two setup steps, each with its button and a status line: 1. notification access,
 * 2. battery limits. Shared by More → TNG auto-collect and the one-time sheet on Home (D-140).
 */
export function TngSteps({ access, battery }: { access: boolean; battery: boolean }) {
  const { colors } = useTheme();
  return (
    <>
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
    </>
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
