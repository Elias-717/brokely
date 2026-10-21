import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AccessibilityInfo, Animated, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "./icons";
import { useReduceMotion } from "./motion";
import { fonts } from "./theme";
import { useTheme } from "./theme-context";

/**
 * A short message at the bottom for good news, e.g. "You're backed up 🥦" after a first
 * backup (S13g). Shown for 3 s above the tab bar, read aloud by screen readers, no buttons.
 * With Reduce motion it fades without sliding.
 */
type Show = (text: string, icon?: IconName) => void;
const ToastContext = createContext<Show>(() => undefined);

export function useToast(): Show {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const [toast, setToast] = useState<{ text: string; icon?: IconName } | null>(null);
  const shown = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback<Show>((text, icon) => {
    clearTimeout(timer.current);
    setToast({ text, icon });
    AccessibilityInfo.announceForAccessibility(text);
  }, []);

  useEffect(() => {
    if (!toast) return;
    Animated.timing(shown, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    timer.current = setTimeout(() => {
      Animated.timing(shown, { toValue: 0, duration: 220, useNativeDriver: true }).start(() =>
        setToast(null),
      );
    }, 3000);
    return () => clearTimeout(timer.current);
  }, [toast, shown]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: insets.bottom + 96,
            alignItems: "center",
          }}
        >
          <Animated.View
            style={{
              opacity: shown,
              transform: reduce
                ? []
                : [{ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              backgroundColor: colors.text,
              borderRadius: 24,
              paddingVertical: 12,
              paddingHorizontal: 18,
            }}
          >
            {toast.icon ? (
              <Icon name={toast.icon} color={colors.background} size={22} strokeWidth={2} />
            ) : null}
            <Text style={{ fontFamily: fonts.heavy, fontSize: 16, color: colors.background }}>
              {toast.text}
            </Text>
          </Animated.View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}
