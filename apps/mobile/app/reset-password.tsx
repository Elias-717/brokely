import * as Linking from "expo-linking";
import { router } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";
import { MIN_PASSWORD, setNewPassword } from "../src/sync/auth";
import { Body, Button, Card, Heading, PageScreen } from "../src/ui/components";
import { TextField } from "../src/ui/text-field";
import { type } from "../src/ui/theme";
import { useTheme } from "../src/ui/theme-context";

/** The reset email's link (brokely://reset-password#access_token=…&refresh_token=…&type=recovery). */
function tokensFrom(url: string | null) {
  const fragment = url?.split("#")[1];
  if (!fragment) return null;
  const params = new URLSearchParams(fragment);
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  return accessToken && refreshToken ? { accessToken, refreshToken } : null;
}

/**
 * Choose a new password, opened from the "Forgot password?" email (D-74). Saving it also signs
 * the student in; the sign-in screen then links this phone (D-73).
 */
export default function ResetPasswordScreen() {
  const { colors } = useTheme();
  const tokens = tokensFrom(Linking.useURL());
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!tokens) return;
    setSaving(true);
    const result = await setNewPassword(tokens, password);
    setSaving(false);
    if (!result.ok) return setMessage(result.message);
    router.replace({ pathname: "/sign-in", params: { from: "more" } });
  };

  return (
    <PageScreen title="New password" keyboardSafe>
      <Card>
        {tokens ? (
          <>
            <Heading>Choose a new password</Heading>
            <TextField
              label={`New password (at least ${MIN_PASSWORD} characters)`}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              onSubmitEditing={() => void save()}
            />
            {message ? <Text style={[type.strong, { color: colors.text }]}>{message}</Text> : null}
            <Button label="Save password" disabled={saving} onPress={() => void save()} />
          </>
        ) : (
          <>
            <Heading>This link didn't work</Heading>
            <Body>It may have expired. Ask for a new one under More → Back up and sync.</Body>
            <Button label="Go to sign in" onPress={() => router.replace("/sign-in")} />
          </>
        )}
      </Card>
    </PageScreen>
  );
}
