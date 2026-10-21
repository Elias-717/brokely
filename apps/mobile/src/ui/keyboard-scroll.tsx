import { useEffect, useRef, type ComponentRef } from "react";
import { Keyboard, ScrollView, TextInput, type ScrollViewProps } from "react-native";
import { space } from "./theme";

/** Room kept between the field being typed in and the top of the keyboard. */
export const KEYBOARD_MARGIN = space.lg;

/**
 * A ScrollView that keeps what matters in sight when the keyboard opens. KeyboardSafe only
 * shrinks the space; Android scrolls to the focused field before that happens, so a field near
 * the bottom could stay covered or touch the keyboard. Here, once the keyboard is up and the
 * view has shrunk, the focused field is scrolled to sit KEYBOARD_MARGIN above the keyboard.
 * `stickToEnd` (a chat) keeps the newest message in view instead.
 */
export function KeyboardScroll({
  stickToEnd,
  onLayout,
  onScroll,
  onContentSizeChange,
  ...props
}: ScrollViewProps & { stickToEnd?: boolean }) {
  const ref = useRef<ComponentRef<typeof ScrollView>>(null);
  const offset = useRef(0);
  const height = useRef(0);
  const keyboardTop = useRef<number | null>(null);

  const reveal = () => {
    const scroll = ref.current;
    if (!scroll) return;
    if (stickToEnd) return scroll.scrollToEnd({ animated: true });
    const top = keyboardTop.current;
    const input = TextInput.State.currentlyFocusedInput();
    if (top === null || !input) return;
    input.measureInWindow((_x, y, _width, h) => {
      const overlap = y + h + KEYBOARD_MARGIN - top;
      if (overlap > 0) scroll.scrollTo({ y: offset.current + overlap, animated: true });
    });
  };

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const shown = Keyboard.addListener("keyboardDidShow", (e) => {
      keyboardTop.current = e.endCoordinates.screenY;
      // After KeyboardSafe has padded: the view shrinks on the next layout.
      timer = setTimeout(reveal, 80);
    });
    const hidden = Keyboard.addListener("keyboardDidHide", () => {
      keyboardTop.current = null;
    });
    return () => {
      clearTimeout(timer);
      shown.remove();
      hidden.remove();
    };
  }, [stickToEnd]);

  return (
    <ScrollView
      ref={ref}
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={32}
      {...props}
      onScroll={(e) => {
        offset.current = e.nativeEvent.contentOffset.y;
        onScroll?.(e);
      }}
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        // Shrunk for the keyboard: bring the field (or the newest message) back into view.
        if (h < height.current && keyboardTop.current !== null) reveal();
        height.current = h;
        onLayout?.(e);
      }}
      onContentSizeChange={(w, h) => {
        if (stickToEnd) ref.current?.scrollToEnd({ animated: true });
        onContentSizeChange?.(w, h);
      }}
    />
  );
}
