import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AccessibilityInfo, Animated, Easing, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReduceMotion } from "./motion";
import { fonts, space, type } from "./theme";
import { useTheme } from "./theme-context";

/** How long Undo stays on screen (D-38). */
export const UNDO_MS = 5000;

interface Pending {
  readonly id: number;
  readonly message: string;
  readonly undo: () => void;
}

const UndoContext = createContext<((message: string, undo: () => void) => void) | null>(null);

/**
 * "Saved RM12.00 · Meals 🍛 · Undo": after any save the app offers Undo for a few seconds
 * instead of asking "Are you sure?" first (FR-TXN-10, D-24, D-38).
 */
export function UndoProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const nextId = useRef(0);

  const show = useCallback((message: string, undo: () => void) => {
    setPending({ id: nextId.current++, message, undo });
    AccessibilityInfo.announceForAccessibility(`${message}. Undo available for 5 seconds.`);
  }, []);

  return (
    <UndoContext.Provider value={show}>
      {children}
      {pending ? (
        <UndoBar key={pending.id} pending={pending} onDone={() => setPending(null)} />
      ) : null}
    </UndoContext.Provider>
  );
}

export function useUndo() {
  const show = useContext(UndoContext);
  if (!show) throw new Error("useUndo must be used inside UndoProvider");
  return show;
}

function UndoBar({ pending, onDone }: { pending: Pending; onDone: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const left = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const timer = setTimeout(onDone, UNDO_MS);
    Animated.timing(left, {
      toValue: 0,
      duration: reduce ? 0 : UNDO_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();
    return () => clearTimeout(timer);
  }, [left, onDone, reduce]);

  return (
    <View
      accessibilityLiveRegion="polite"
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: space.md,
        right: space.md,
        // Just above the tab bar (64 dp + the phone's gesture area).
        bottom: 64 + insets.bottom + space.sm,
      }}
    >
      <View
        style={{
          backgroundColor: colors.text,
          borderRadius: 14,
          overflow: "hidden",
          borderWidth: 2,
          borderColor: colors.primary,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: space.sm,
            paddingLeft: space.md,
            padding: 6,
          }}
        >
          <Text style={[type.strong, { flex: 1, color: colors.background, fontSize: 15 }]}>
            {pending.message}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Undo"
            onPress={() => {
              pending.undo();
              onDone();
            }}
            style={({ pressed }) => ({
              minHeight: 48,
              paddingHorizontal: space.md,
              justifyContent: "center",
              borderRadius: 10,
              borderWidth: 2,
              borderColor: colors.primary,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ fontFamily: fonts.heavy, fontSize: 16, color: colors.primary }}>
              Undo
            </Text>
          </Pressable>
        </View>
        <View style={{ height: 4, backgroundColor: colors.outline }}>
          <Animated.View
            style={{
              height: "100%",
              backgroundColor: colors.primary,
              width: left.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
            }}
          />
        </View>
      </View>
    </View>
  );
}
