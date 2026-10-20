import { createContext, useContext, useState, type ReactNode } from "react";
import { View, type LayoutChangeEvent, type ViewStyle } from "react-native";
import { useKeyboardHeight } from "./use-keyboard";

/** The height left for content above the keyboard, in dp (0 until measured). */
const AvailableHeight = createContext(0);

/** How tall content inside the nearest KeyboardSafe can be, e.g. to cap a sheet. */
export function useAvailableHeight(): number {
  return useContext(AvailableHeight);
}

/**
 * Keeps its content above the phone's keyboard, padding only what the system didn't already
 * handle. Android may or may not shrink the window when the keyboard opens (it depends on
 * edge-to-edge and the phone); padding a full keyboard height on top of a window that already
 * shrank pushed fields half off screen. So this measures how much it actually shrank and adds
 * only the rest.
 */
export function KeyboardSafe({
  children,
  style,
}: {
  children: ReactNode;
  /** Style of the inner area, e.g. { justifyContent: "flex-end" } for a sheet. */
  style?: ViewStyle;
}) {
  const keyboard = useKeyboardHeight();
  const [closedHeight, setClosedHeight] = useState(0);
  const [height, setHeight] = useState(0);

  const onLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    setHeight(h);
    // The tallest size seen: the window may shrink just before the keyboard event arrives.
    if (keyboard === 0) setClosedHeight((before) => Math.max(before, h));
  };

  const shrunkBySystem = Math.max(0, closedHeight - height);
  const pad = keyboard > 0 ? Math.max(0, keyboard - shrunkBySystem) : 0;

  return (
    <View style={{ flex: 1 }} onLayout={onLayout}>
      <AvailableHeight.Provider value={Math.max(0, height - pad)}>
        <View style={[{ flex: 1, paddingBottom: pad }, style]}>{children}</View>
      </AvailableHeight.Provider>
    </View>
  );
}
