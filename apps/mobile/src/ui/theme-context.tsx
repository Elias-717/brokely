import { getAppearance, setAppearance, type Appearance } from "@brokely/local-db";
import { setBackgroundColorAsync } from "expo-system-ui";
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { repo } from "../db/client";
import { useRead } from "../db/use-read";
import { darkColors, lightColors, type Colors } from "./theme";

interface Theme {
  /** What the student chose in More: Same as phone, Light or Dark (D-32). */
  appearance: Appearance;
  /** What is actually shown right now. */
  scheme: "light" | "dark";
  colors: Colors;
  setAppearance: (appearance: Appearance) => void;
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const appearance = useRead(getAppearance);
  const phone = useColorScheme();
  const scheme = appearance === "system" ? (phone === "dark" ? "dark" : "light") : appearance;
  const colors = scheme === "dark" ? darkColors : lightColors;

  // The window behind the screens (seen during transitions) follows the theme too.
  useEffect(() => {
    void setBackgroundColorAsync(colors.background);
  }, [colors.background]);

  const theme = useMemo<Theme>(
    () => ({ appearance, scheme, colors, setAppearance: (a) => setAppearance(repo, a) }),
    [appearance, scheme, colors],
  );
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error("useTheme must be used inside ThemeProvider");
  return theme;
}
