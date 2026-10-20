import { listCategories } from "@brokely/local-db";
import { Redirect, router, Tabs, usePathname, type Href } from "expo-router";
import { useMemo, useRef } from "react";
import { PanResponder, Pressable, useWindowDimensions, View, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRead } from "../../src/db/use-read";
import { useReduceMotion } from "../../src/ui/motion";
import { Icon, type IconName } from "../../src/ui/icons";
import { fonts } from "../../src/ui/theme";
import { useTheme } from "../../src/ui/theme-context";

/**
 * Main tabs: Home · Records · (+) · Insights · More (D-24). The centre + opens quick add as a
 * modal from every tab in one tap (FR-TXN-10); Bills, Debts, Plan and Settings live under More.
 */
export default function TabsLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduce = useReduceMotion();
  const swipe = useTabSwipe();
  // First run: both Welcome buttons create the default categories, so none means "new".
  const firstRun = useRead((db) => listCategories(db, { includeArchived: true }).length === 0);
  if (firstRun) return <Redirect href="/welcome" />;

  const icon = (name: IconName) =>
    function TabIcon({ color }: { color: ColorValue }) {
      return <Icon name={name} color={color} />;
    };

  return (
    <View style={{ flex: 1 }} {...swipe.panHandlers}>
      <Tabs
        screenOptions={{
          headerShown: false,
          // Tabs slide in from the side they sit on in the tab bar (D-50); none with Reduce motion.
          animation: reduce ? "none" : "shift",
          transitionSpec: { animation: "timing", config: { duration: 220 } },
          sceneStyleInterpolator: ({ current }) => ({
            sceneStyle: {
              transform: [
                {
                  translateX: current.progress.interpolate({
                    inputRange: [-1, 0, 1],
                    outputRange: [-width, 0, width],
                  }),
                },
              ],
            },
          }),
          sceneStyle: { backgroundColor: colors.background },
          tabBarActiveTintColor: colors.tabActive,
          tabBarInactiveTintColor: colors.tabInactive,
          tabBarLabelStyle: { fontFamily: fonts.heavy, fontSize: 12 },
          tabBarStyle: {
            backgroundColor: colors.tabBar,
            borderTopWidth: 2,
            borderTopColor: colors.outline,
            // Room for the phone's gesture bar, so nothing sits under it.
            height: 64 + insets.bottom,
            paddingBottom: insets.bottom + 6,
            paddingTop: 6,
          },
        }}
      >
        <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: icon("home") }} />
        <Tabs.Screen name="records" options={{ title: "Records", tabBarIcon: icon("records") }} />
        <Tabs.Screen name="add" options={{ title: "Add", tabBarButton: () => <AddButton /> }} />
        <Tabs.Screen
          name="insights"
          options={{ title: "Insights", tabBarIcon: icon("insights") }}
        />
        <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: icon("more") }} />
      </Tabs>
    </View>
  );
}

/** The tabs a swipe moves between, in tab-bar order; the centre + is not a page. */
const SWIPE_ORDER: Href[] = ["/", "/records", "/insights", "/more"];
const PATHS = ["/", "/records", "/insights", "/more"];

/**
 * Swipe left or right to the next or previous tab (D-50). Only a clearly horizontal swipe
 * counts, and inner scroll views and chip rows get the touch first, so scrolling still works.
 */
function useTabSwipe() {
  const pathname = usePathname();
  const current = useRef(pathname);
  current.current = pathname;
  return useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
        onPanResponderRelease: (_, g) => {
          const at = PATHS.indexOf(current.current);
          if (at < 0 || Math.abs(g.dx) < 60) return;
          const next = at + (g.dx < 0 ? 1 : -1);
          const target = SWIPE_ORDER[next];
          if (target) router.navigate(target);
        },
      }),
    [],
  );
}

/** The raised green sticker + (D-31). */
function AddButton() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add a record"
        onPress={() => router.push("/quick-add")}
        style={({ pressed }) => ({ marginTop: -14, opacity: pressed ? 0.7 : 1 })}
      >
        <View
          style={{
            position: "absolute",
            top: 3,
            left: 3,
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: colors.shadow,
          }}
        />
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            borderWidth: 2,
            borderColor: colors.outline,
            backgroundColor: colors.primary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="plus" color={colors.onPrimary} size={28} strokeWidth={3} />
        </View>
      </Pressable>
    </View>
  );
}
