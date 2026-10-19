import migrations from "@brokely/local-db/migrations";
import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { db } from "../src/db/client";
import { Body, Screen, Title } from "../src/ui/components";
import { colors } from "../src/ui/theme";

/**
 * App start: bring the phone database up to the latest schema before any screen can read it
 * (FR-SYNC-02). Migrations run once per new version and are fast on later starts.
 */
export default function RootLayout() {
  const { success, error } = useMigrations(db, migrations);

  if (error) {
    return (
      <SafeAreaProvider>
        <Screen>
          <Title>Brokely couldn't open your data</Title>
          <Body>
            Nothing was changed. Please restart the app; if this keeps happening, tell us:
          </Body>
          <Body muted>{error.message}</Body>
        </Screen>
      </SafeAreaProvider>
    );
  }
  if (!success) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="welcome" />
        <Stack.Screen name="quick-start" />
        <Stack.Screen name="quick-add" options={{ presentation: "modal" }} />
      </Stack>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
