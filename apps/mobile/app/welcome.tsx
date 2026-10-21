import { NICKNAME_MAX, seedDefaultCategories, setNickname } from "@brokely/local-db";
import { router } from "expo-router";
import { useState } from "react";
import { Image, Keyboard, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { repo } from "../src/db/client";
import { useSync } from "../src/sync/sync-provider";
import { Button, Sticker } from "../src/ui/components";
import { KeyboardSafe } from "../src/ui/keyboard-safe";
import { Appear, Float, TypeText } from "../src/ui/motion";
import { useKeyboardOpen } from "../src/ui/use-keyboard";
import { fonts, MIN_TOUCH, radius, space, type } from "../src/ui/theme";
import { useTheme } from "../src/ui/theme-context";

/**
 * S1 Welcome (FR-MAS-08, FR-PLN-19, FR-PLN-04, AC-55, D-23, D-34, D-47, D-72, D-75). Brokely's
 * fixed greeting types itself out in a speech bubble, the one picture gently floats, and an
 * optional nickname is kept on this phone only. Planning step by step is offered after quick
 * start and in More, not here (D-75).
 * No XP, mood or growth; never promises the student won't run out of money.
 */
export default function WelcomeScreen() {
  const { colors } = useTheme();
  const { canSignIn } = useSync();
  const [name, setName] = useState("");
  const [greeted, setGreeted] = useState(false);
  // While typing a name, Brokely steps aside so the box and "Let's go" fit above the keyboard.
  const typing = useKeyboardOpen();

  const start = (next: "/quick-start" | "/") => {
    setNickname(repo, name); // blank stays blank (D-34)
    // Both paths offer the default categories (AC-52); this also ends the first run.
    const seeded = seedDefaultCategories(repo);
    if (!seeded.ok) return;
    router.replace(next);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardSafe>
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            padding: space.lg,
            gap: space.lg,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <Appear>
            <Sticker style={{ padding: space.md, gap: space.xs, alignItems: "center" }}>
              <View accessibilityRole="header">
                <TypeText
                  text="Hi, I'm Brokely! 🥦"
                  delay={350}
                  style={[type.title, { color: colors.text, textAlign: "center" }]}
                  onDone={() => setGreeted(true)}
                />
              </View>
              {greeted ? (
                <TypeText
                  text="Broke is my name, not your future. Let's plan it together."
                  perCharMs={22}
                  delay={150}
                  style={[type.body, { color: colors.muted, textAlign: "center" }]}
                />
              ) : (
                // Keeps the bubble's final size while the first line types.
                <Text
                  style={[type.body, { opacity: 0, textAlign: "center" }]}
                  importantForAccessibility="no-hide-descendants"
                >
                  Broke is my name, not your future. Let's plan it together.
                </Text>
              )}
            </Sticker>
          </Appear>
          {typing ? null : (
            <Float>
              <Image
                source={require("../assets/mascot/main_design.png")}
                style={{ width: "100%", height: 260 }}
                resizeMode="contain"
                accessibilityLabel="Brokely, a broccoli that grows money instead of leaves"
              />
            </Float>
          )}
          <View style={{ gap: space.xs }}>
            <Text style={[type.small, { color: colors.muted }]}>
              What should I call you? <Text style={{ fontFamily: fonts.body }}>(optional)</Text>
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              maxLength={NICKNAME_MAX}
              placeholder="Your name or nickname"
              placeholderTextColor={colors.muted}
              autoCapitalize="words"
              autoComplete="off"
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
              accessibilityLabel="What should I call you? Optional"
              style={{
                height: 56,
                borderWidth: 2,
                borderColor: colors.outline,
                borderRadius: radius.button,
                backgroundColor: colors.card,
                paddingHorizontal: space.md,
                fontFamily: fonts.bold,
                fontSize: 18,
                color: colors.text,
              }}
            />
          </View>
        </ScrollView>
        {/*
          Option A (D-75): the two first-time choices as buttons by importance, and one quiet
          line for returning students at the very bottom. While a name is being typed only
          "Let's go" stays, so the field and the button sit above the keyboard.
        */}
        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.sm }}>
          <Button label="Let's go" onPress={() => start("/quick-start")} />
          {typing ? null : (
            <Appear delay={500}>
              <View style={{ gap: space.sm }}>
                <Button
                  label="Just track my spending for now"
                  variant="secondary"
                  onPress={() => start("/")}
                />
                <Text style={[type.small, { color: colors.muted, textAlign: "center" }]}>
                  No account needed, no bank login. Everything stays on this phone.
                </Text>
                {canSignIn ? (
                  // Optional, for a returning student who doesn't want to plan again (D-72).
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Already used Brokely? Sign in"
                    onPress={() =>
                      router.push({ pathname: "/sign-in", params: { from: "welcome" } })
                    }
                    style={({ pressed }) => ({
                      minHeight: MIN_TOUCH,
                      justifyContent: "center",
                      opacity: pressed ? 0.6 : 1,
                    })}
                  >
                    <Text style={[type.body, { color: colors.muted, textAlign: "center" }]}>
                      Already used Brokely?{" "}
                      <Text
                        style={{
                          fontFamily: fonts.heavy,
                          color: colors.text,
                          textDecorationLine: "underline",
                        }}
                      >
                        Sign in
                      </Text>
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </Appear>
          )}
        </View>
      </KeyboardSafe>
    </SafeAreaView>
  );
}
