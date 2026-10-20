import { useEffect, useState } from "react";
import { Keyboard } from "react-native";

/**
 * Whether the phone's keyboard is open, e.g. for a note or a friend's name. Sheets with their own
 * number keypad hide it meanwhile, so the field being typed in stays on screen above the
 * keyboard instead of being pushed off the top.
 */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", () => setOpen(true));
    const hidden = Keyboard.addListener("keyboardDidHide", () => setOpen(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  return open;
}
