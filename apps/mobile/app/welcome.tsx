import { seedDefaultCategories } from "@brokely/local-db";
import { router } from "expo-router";
import { Image, StyleSheet, Text, View } from "react-native";
import { repo } from "../src/db/client";
import { Body, Button, Card, Screen } from "../src/ui/components";
import { colors, space, type } from "../src/ui/theme";

/**
 * S1 Welcome (FR-MAS-08, FR-PLN-19, FR-PLN-04, AC-55, D-23). One static Brokely picture and the
 * fixed greeting; no XP, mood or growth; never promises the student won't run out of money.
 */
export default function WelcomeScreen() {
  const start = (next: "/quick-start" | "/") => {
    // Both paths offer the default categories (AC-52); this also ends the first run.
    const seeded = seedDefaultCategories(repo);
    if (!seeded.ok) return;
    router.replace(next);
  };

  return (
    <Screen scroll={false}>
      <View style={styles.hero}>
        <Image
          source={require("../assets/mascot/main_design.png")}
          style={styles.mascot}
          resizeMode="contain"
          accessibilityLabel="Brokely, a broccoli that grows money instead of leaves"
        />
        <Card style={styles.greeting}>
          <Text style={[type.title, styles.center]}>Hi, I'm Brokely! 🥦</Text>
          <Body muted>Broke is my name, not your future. Let's plan it together.</Body>
        </Card>
      </View>
      <View style={styles.actions}>
        <Button label="Let's go" onPress={() => start("/quick-start")} />
        <Button label="Just track my spending for now" variant="link" onPress={() => start("/")} />
        <Text style={[type.small, styles.center, { color: colors.muted }]}>
          No account, no bank login. Everything stays on this phone.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flex: 1, justifyContent: "center", gap: space.lg },
  mascot: { width: "100%", height: 240 },
  greeting: { alignItems: "center", backgroundColor: colors.background },
  center: { textAlign: "center", color: colors.text },
  actions: { gap: space.sm, paddingBottom: space.md },
});
