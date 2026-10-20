import { LilitaOne_400Regular } from "@expo-google-fonts/lilita-one/400Regular";
import { Nunito_500Medium } from "@expo-google-fonts/nunito/500Medium";
import { Nunito_700Bold } from "@expo-google-fonts/nunito/700Bold";
import { Nunito_800ExtraBold } from "@expo-google-fonts/nunito/800ExtraBold";
import { renameRetiredDefaults } from "@brokely/local-db";
import migrations from "@brokely/local-db/migrations";
import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { db, repo } from "../src/db/client";
import { ThemeProvider, useTheme } from "../src/ui/theme-context";
import { UndoProvider } from "../src/ui/undo";

/**
 * App start: bring the phone database up to the latest schema (FR-SYNC-02) and load the bundled
 * fonts (D-31) before any screen renders. Only the three weights we use are bundled (NFR-19).
 */
export default function RootLayout() {
  const { success, error } = useMigrations(db, migrations);
  const [fontsLoaded] = useFonts({
    LilitaOne_400Regular,
    Nunito_500Medium,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });

  if (error) {
    // Plain styling on purpose: the theme reads the database, which just failed.
    return (
      <View style={{ flex: 1, padding: 24, justifyContent: "center", gap: 12 }}>
        <Text style={{ fontSize: 22, fontWeight: "700" }}>Brokely couldn't open your data</Text>
        <Text style={{ fontSize: 16 }}>
          Nothing was changed. Please restart the app; if this keeps happening, tell us:
        </Text>
        <Text style={{ fontSize: 14, color: "#555" }}>{error.message}</Text>
      </View>
    );
  }
  if (!success || !fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <UndoProvider>
          <AppStack />
        </UndoProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/** Bottom sheets that slide up over the current screen (U-10). */
const SHEETS = ["bills/pay/[id]", "debts/repay/[id]", "debts/write-off/[id]", "wallet-check"];

function AppStack() {
  const { colors, scheme } = useTheme();
  // Category names changed after some phones were set up (D-43).
  useEffect(() => {
    renameRetiredDefaults(repo);
  }, []);
  return (
    <>
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="welcome" />
        <Stack.Screen
          name="quick-add"
          options={{ presentation: "transparentModal", animation: "slide_from_bottom" }}
        />
        <Stack.Screen
          name="record/[id]"
          options={{ presentation: "transparentModal", animation: "slide_from_bottom" }}
        />
        {SHEETS.map((name) => (
          <Stack.Screen
            key={name}
            name={name}
            options={{ presentation: "transparentModal", animation: "slide_from_bottom" }}
          />
        ))}
      </Stack>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
    </>
  );
}
