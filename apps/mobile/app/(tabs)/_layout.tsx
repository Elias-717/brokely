import { listCategories } from "@brokely/local-db";
import { Redirect, router, Tabs } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";
import { useRead } from "../../src/db/use-read";
import { colors, MIN_TOUCH } from "../../src/ui/theme";

/**
 * Main tabs: Home · Records · (+) · Insights · More (D-24). The centre + opens quick add as a
 * modal from every tab in one tap (FR-TXN-10); Bills, Debts, Plan and Settings live under More.
 */
export default function TabsLayout() {
  // First run: both Welcome buttons create the default categories, so none means "new".
  const firstRun = useRead((db) => listCategories(db, { includeArchived: true }).length === 0);
  if (firstRun) return <Redirect href="/welcome" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.muted,
        tabBarIconStyle: { display: "none" }, // text labels until the visual style is chosen
        tabBarLabelStyle: { fontSize: 14, fontWeight: "600" },
        tabBarStyle: { height: 64 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="records" options={{ title: "Records" }} />
      <Tabs.Screen name="add" options={{ title: "Add", tabBarButton: () => <AddButton /> }} />
      <Tabs.Screen name="insights" options={{ title: "Insights" }} />
      <Tabs.Screen name="more" options={{ title: "More" }} />
    </Tabs>
  );
}

function AddButton() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add a record"
      onPress={() => router.push("/quick-add")}
      style={({ pressed }) => [styles.add, pressed && { opacity: 0.6 }]}
    >
      <Text style={styles.plus}>+</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  add: {
    width: 56,
    height: 56,
    minHeight: MIN_TOUCH,
    marginTop: 4,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  plus: { color: colors.onPrimary, fontSize: 30, lineHeight: 32, fontWeight: "600" },
});
