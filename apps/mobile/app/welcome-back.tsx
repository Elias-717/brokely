import { getNickname } from "@brokely/local-db";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Image, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRead } from "../src/db/use-read";
import { Button, Sticker } from "../src/ui/components";
import { Appear, Float, TypeText } from "../src/ui/motion";
import { space, type } from "../src/ui/theme";
import { useTheme } from "../src/ui/theme-context";

/**
 * S13g Welcome back (D-72): a returning student signed in from Welcome and their records came
 * down. Brokely says hi by name and what came back, then Home.
 */
export default function WelcomeBackScreen() {
  const { colors } = useTheme();
  const { records } = useLocalSearchParams<{ records?: string }>();
  const name = useRead(getNickname);
  const [greeted, setGreeted] = useState(false);
  const count = Number(records ?? 0);
  const what =
    count > 0
      ? `Your plan and ${count} ${count === 1 ? "record are" : "records are"} here, just as you left them.`
      : "Your plan is here, just as you left it.";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flex: 1, justifyContent: "center", padding: space.lg, gap: space.lg }}>
        <Float>
          <Image
            source={require("../assets/mascot/main_design.webp")}
            style={{ width: "100%", height: 240 }}
            resizeMode="contain"
            accessibilityLabel="Brokely, happy to see you"
          />
        </Float>
        <Appear>
          <Sticker style={{ padding: space.md, gap: space.xs, alignItems: "center" }}>
            <View accessibilityRole="header">
              <TypeText
                text={name ? `Welcome back, ${name}! 🥦` : "Welcome back! 🥦"}
                delay={250}
                style={[
                  type.title,
                  { fontSize: 26, lineHeight: 30, color: colors.text, textAlign: "center" },
                ]}
                onDone={() => setGreeted(true)}
              />
            </View>
            {greeted ? (
              <TypeText
                text={what}
                perCharMs={22}
                delay={100}
                style={[type.body, { color: colors.muted, textAlign: "center" }]}
              />
            ) : (
              // Keeps the bubble's final size while the first line types.
              <Text
                style={[type.body, { opacity: 0, textAlign: "center" }]}
                importantForAccessibility="no-hide-descendants"
              >
                {what}
              </Text>
            )}
          </Sticker>
        </Appear>
      </View>
      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg }}>
        <Appear delay={400}>
          <Button label="Go to Home" onPress={() => router.replace("/")} />
        </Appear>
      </View>
    </SafeAreaView>
  );
}
