import { getMoneyTips, recordTipShown } from "@brokely/local-db";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { db, repo } from "../db/client";
import { MONEY_TIPS, pickTip, TIPS_PER_DAY, type MoneyTip } from "../lib/money-tips";
import { today } from "../lib/today";
import { BrokelyAvatar } from "./chat";
import { useReduceMotion } from "./motion";
import { fonts, space, type } from "./theme";
import { useTheme } from "./theme-context";

/** How long a tip stays before leaving on its own. */
const TIP_MS = 7000;

const TipContext = createContext<((categoryName: string | null) => void) | null>(null);

/**
 * Money tips after saving an expense (D-39, D-67): a friendly message slides in at the top,
 * clear of the Undo bar at the bottom. Off in More → Settings; at most a few a day; tips don't
 * repeat until most have been shown.
 */
export function MoneyTipProvider({ children }: { children: ReactNode }) {
  const [tip, setTip] = useState<{ key: number; tip: MoneyTip } | null>(null);
  const nextKey = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const offer = useCallback((categoryName: string | null) => {
    const state = getMoneyTips(db);
    const day = today();
    if (!state.enabled) return;
    if (state.day === day && state.shownToday >= TIPS_PER_DAY) return;
    const chosen = pickTip(categoryName, state.seen);
    recordTipShown(repo, {
      tipId: chosen.id,
      today: day,
      resetAfter: Math.ceil(MONEY_TIPS.length * 0.8),
    });
    // A moment after the sheet closes, so the save and the tip don't arrive at once.
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setTip({ key: nextKey.current++, tip: chosen }), 600);
  }, []);

  return (
    <TipContext.Provider value={offer}>
      {children}
      {tip ? <TipBanner key={tip.key} tip={tip.tip} onDone={() => setTip(null)} /> : null}
    </TipContext.Provider>
  );
}

/** Call after an expense is saved; shows a tip if they're on and today's cap allows. */
export function useMoneyTip() {
  const offer = useContext(TipContext);
  if (!offer) throw new Error("useMoneyTip must be used inside MoneyTipProvider");
  return offer;
}

function TipBanner({ tip, onDone }: { tip: MoneyTip; onDone: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduce = useReduceMotion();
  const x = useRef(new Animated.Value(reduce ? 0 : width)).current;

  const leave = useCallback(() => {
    Animated.timing(x, {
      toValue: width,
      duration: reduce ? 0 : 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(onDone);
  }, [x, width, reduce, onDone]);

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(`Money tip: ${tip.text}`);
    Animated.timing(x, {
      toValue: 0,
      duration: reduce ? 0 : 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    const t = setTimeout(leave, TIP_MS);
    return () => clearTimeout(t);
  }, [x, reduce, leave, tip.text]);

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: insets.top + space.sm,
        left: space.md,
        right: space.md,
        transform: [{ translateX: x }],
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Money tip: ${tip.text}. Tap to close`}
        onPress={leave}
        style={{
          flexDirection: "row",
          gap: space.sm,
          alignItems: "flex-start",
          minHeight: 64,
          padding: space.md,
          borderRadius: 18,
          borderWidth: 2,
          borderColor: colors.primary,
          backgroundColor: colors.card,
          elevation: 6,
          shadowColor: "#000",
          shadowOpacity: 0.2,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
        }}
      >
        <BrokelyAvatar size={40} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: fonts.heavy, fontSize: 15, color: colors.text }}>
            Saved! Here's a tip 💡
          </Text>
          <Text style={[type.body, { color: colors.text, fontSize: 15 }]}>{tip.text}</Text>
          <Text style={[type.small, { color: colors.muted }]}>Tap to close</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}
