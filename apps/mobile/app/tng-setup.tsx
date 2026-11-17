import { useCallback, useEffect, useState } from "react";
import { AppState, Share, Text, View } from "react-native";
import {
  clearCaptures,
  getCaptures,
  tngListenerAvailable,
  type TngCapture,
} from "../modules/tng-listener";
import { TngSteps, useTngStatus } from "../src/tng/tng-steps";
import { Button, PageScreen, Sticker } from "../src/ui/components";
import { space, type } from "../src/ui/theme";
import { useTheme } from "../src/ui/theme-context";

/**
 * TNG auto-collect setup (0.2, Phase 6): step 1 notification access, step 2 battery. The status
 * is re-read whenever the student comes back from Android's settings, because access can also be
 * switched off there at any time. Readable TNG notifications become pending cards on Home that
 * wait for the student's yes (D-02, D-129). Below the two steps, development builds only list the
 * raw notifications Brokely couldn't read, to collect new formats; release builds never show them.
 */
export default function TngSetupScreen() {
  const { colors } = useTheme();
  const { access, battery, refresh: refreshStatus } = useTngStatus();
  const [captures, setCaptures] = useState<TngCapture[]>([]);

  const refresh = useCallback(() => {
    refreshStatus();
    setCaptures(getCaptures());
  }, [refreshStatus]);

  useEffect(() => {
    setCaptures(getCaptures());
    const sub = AppState.addEventListener(
      "change",
      (state) => state === "active" && setCaptures(getCaptures()),
    );
    return () => sub.remove();
  }, []);

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

      <TngSteps access={access} battery={battery} />

      {/* Raw notifications include people's names: development builds only (D-13, D-128). */}
      {__DEV__ ? (
        <Sticker style={{ padding: space.md, gap: space.sm }}>
          <Text style={[type.strong, { color: colors.text }]}>
            Samples caught ({captures.length})
          </Text>
          <Text style={[type.small, { color: colors.muted }]}>
            Development only. These are TNG's raw notifications and can include people's full names.
            They stay on this phone (50 at most, 30 days at most). Transfers Brokely understands
            move to Home as payments waiting for you, so only other notifications stay here. Hide
            the names before you share any, and never put them in the repo.
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
      ) : null}

      <View style={{ height: space.md }} />
    </PageScreen>
  );
}
