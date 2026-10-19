import { seedDefaultCategories } from "@brokely/local-db";
import { router } from "expo-router";
import { Image, Text, View } from "react-native";
import { repo } from "../src/db/client";
import { Body, Button, Card, Screen } from "../src/ui/components";
import { space, type } from "../src/ui/theme";
import { useTheme } from "../src/ui/theme-context";

/**
 * S1 Welcome (FR-MAS-08, FR-PLN-19, FR-PLN-04, AC-55, D-23). One static Brokely picture and the
 * fixed greeting; no XP, mood or growth; never promises the student won't run out of money.
 */
export default function WelcomeScreen() {
  const { colors } = useTheme();
  const start = (next: "/quick-start" | "/") => {
    // Both paths offer the default categories (AC-52); this also ends the first run.
    const seeded = seedDefaultCategories(repo);
    if (!seeded.ok) return;
    router.replace(next);
  };

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, justifyContent: "center", gap: space.lg }}>
        <Image
          source={require("../assets/mascot/main_design.png")}
          style={{ width: "100%", height: 260 }}
          resizeMode="contain"
          accessibilityLabel="Brokely, a broccoli that grows money instead of leaves"
        />
        <Card style={{ alignItems: "center" }}>
          <Text style={[type.title, { color: colors.text, textAlign: "center" }]}>
            Hi, I'm Brokely! 🥦
          </Text>
          <Body muted>Broke is my name, not your future. Let's plan it together.</Body>
        </Card>
      </View>
      <View style={{ gap: space.sm, paddingBottom: space.md }}>
        <Button label="Let's go" onPress={() => start("/quick-start")} />
        <Button label="Just track my spending for now" variant="link" onPress={() => start("/")} />
        <Text style={[type.small, { color: colors.muted, textAlign: "center" }]}>
          No account, no bank login. Everything stays on this phone.
        </Text>
      </View>
    </Screen>
  );
}
