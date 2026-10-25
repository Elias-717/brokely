import { useCallback, useEffect, useState } from "react";
import { AppState, Share, Text, View } from "react-native";
import {
  clearCaptures,
  getCaptures,
  isIgnoringBatteryOptimizations,
  isNotificationAccessGranted,
  openBatterySettings,
  openNotificationAccessSettings,
  tngListenerAvailable,
  type TngCapture,
} from "../modules/tng-listener";
import { Button, PageScreen, Sticker } from "../src/ui/components";
import { space, type } from "../src/ui/theme";
import { useTheme } from "../src/ui/theme-context";

/**
 * TNG auto-collect setup (0.2, Phase 6): step 1 notification access, step 2 battery. The status
 * is re-read whenever the student comes back from Android's settings, because access can also be
 * switched off there at any time. Below the two steps, development builds list the raw TNG
 * notifications caught so far, to collect real formats; nothing is parsed or imported yet and
 * every future import will still wait for the student's yes (D-02).
 */
export default function TngSetupScreen() {
  const { colors } = useTheme();
  const [access, setAccess] = useState(false);
  const [battery, setBattery] = useState(false);
  const [captures, setCaptures] = useState<TngCapture[]>([]);

  const refresh = useCallback(() => {
    setAccess(isNotificationAccessGranted());
    setBattery(isIgnoringBatteryOptimizations());
    setCaptures(getCaptures());
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

      <Sticker style={{ padding: space.md, gap: space.sm }}>
        <Text style={[type.strong, { color: colors.text }]}>
          Samples caught ({captures.length})
        </Text>
        <Text style={[type.small, { color: colors.muted }]}>
          Development only. These are TNG's raw notifications and can include people's full names.
          They stay on this phone (50 at most, 30 days at most). Hide the names before you share
          any, and never put them in the repo.
        </Text>
        {captures.slice(0, 5).map((c) => (
          <View key={`${c.key}-${c.postTime}`} style={{ gap: 2 }}>
            <Text style={[type.small, { color: colors.muted }]}>
              {new Date(c.postTime).toLocaleString()}
            </Text>
            <Text style={[type.body, { color: colors.text }]}>{c.title}</Text>
            <Text style={[type.body, { color: colors.text }]}>{c.text || c.bigText}</Text>
            <Text style={[type.small, { color: colors.muted }]}>
              Hidden fields: {Object.keys(c.extras).join(", ")}
            </Text>
          </View>
        ))}
        <Button label="Refresh" variant="secondary" onPress={refresh} />
        <Button
          label="Share all samples"
          variant="secondary"
          disabled={captures.length === 0}
          onPress={() => void Share.share({ message: JSON.stringify(captures, null, 2) })}
        />
        <Button
          label="Delete all samples"
          variant="destructive"
          disabled={captures.length === 0}
          onPress={() => {
            clearCaptures();
            refresh();
          }}
        />
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
