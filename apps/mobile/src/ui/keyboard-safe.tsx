import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from "react";
import { View, type ViewStyle } from "react-native";
import { useKeyboardTop } from "./use-keyboard";

/** The height left for content above the keyboard, in dp (0 until measured). */
const AvailableHeight = createContext(0);

/** How tall content inside the nearest KeyboardSafe can be, e.g. to cap a sheet. */
export function useAvailableHeight(): number {
  return useContext(AvailableHeight);
}

/**
 * Keeps its content above the phone's keyboard. It compares where this area ends on screen with
 * where the keyboard starts and pads only the overlap: whether Android shrank the window or not
 * (it depends on edge-to-edge and the phone), and whatever the keyboard's reported height leaves
 * out (Samsung's toolbar and bottom bar), the content ends just above the keyboard.
 */
export function KeyboardSafe({
  children,
  style,
}: {
  children: ReactNode;
  /** Style of the inner area, e.g. { justifyContent: "flex-end" } for a sheet. */
  style?: ViewStyle;
}) {
  const keyboardTop = useKeyboardTop();
  const outer = useRef<ComponentRef<typeof View>>(null);
  const [box, setBox] = useState({ top: 0, height: 0 });

  const measure = () =>
    outer.current?.measureInWindow((_x, y, _w, h) =>
      setBox((now) => (now.top === y && now.height === h ? now : { top: y, height: h })),
    );
  // The window may shrink a moment after the keyboard event: measure again then.
  useEffect(() => {
    measure();
    const later = setTimeout(measure, 120);
    return () => clearTimeout(later);
  }, [keyboardTop]);

  const pad = keyboardTop === null ? 0 : Math.max(0, box.top + box.height - keyboardTop);

  return (
    <View ref={outer} style={{ flex: 1 }} onLayout={measure}>
      <AvailableHeight.Provider value={Math.max(0, box.height - pad)}>
        <View style={[{ flex: 1, paddingBottom: pad }, style]}>{children}</View>
      </AvailableHeight.Provider>
    </View>
  );
}
