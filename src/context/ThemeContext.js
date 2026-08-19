import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useColorScheme } from "react-native";
import {
  colors,
  applyThemeToColors,
  persistThemeMode,
  getInitialThemeMode,
} from "../theme/colors";

// Theme mode: "light" | "dark" | "system"
//
// How theming works (no app reload): colors.js overrides StyleSheet.create so
// the theme-neutral palette (dark/light/surface/border/background/splashback/
// muted) is resolved from the LIVE `colors` object via getters, evaluated on every
// render by RN's flattenStyle(). This provider re-renders its whole subtree when
// the mode changes, so every screen restyles immediately. The saved mode is read
// SYNCHRONOUSLY at import time inside colors.js (AsyncStorage cache on native,
// localStorage on web) so the very first paint already matches the user's
// preference — no flash of the wrong theme.

const ThemeContext = createContext({
  mode: "system",
  setMode: () => {},
  isDark: false,
});

export const ThemeProvider = ({ children }) => {
  const systemScheme = useColorScheme();
  // Initialize from the persisted choice (read synchronously at import time in
  // colors.js) so the very first render already matches the user's preference.
  const [mode, setModeState] = useState(() => getInitialThemeMode());

  // Re-apply when the OS scheme changes (matters for "system" mode). We do NOT
  // reload here — only re-bake the live `colors` object so already-mounted
  // screens that read colors at render pick up the new scheme.
  useEffect(() => {
    if (mode === "system") {
      applyThemeToColors("system", systemScheme);
    }
  }, [systemScheme, mode]);

  // The saved mode is read synchronously at import time in colors.js (RN Settings
  // on native, localStorage on web), so this provider's initial `mode` state
  // already matches the user's preference — no async restore needed here.

  // Apply the palette synchronously during render (before children mount) so
  // freshly-mounted screens read the correct `colors` values.
  applyThemeToColors(mode, systemScheme);

  const setMode = useCallback((next) => {
    setModeState(next);
    // Persist the choice so a cold start (or web reload) restores it. No reload
    // needed: colors.js makes the theme-neutral palette live via getters, and
    // this provider re-renders its whole subtree on mode change.
    persistThemeMode(next);
  }, []);

  const isDark = useMemo(() => {
    if (mode === "system") return systemScheme === "dark";
    return mode === "dark";
  }, [mode, systemScheme]);

  const value = useMemo(
    () => ({ mode, setMode, isDark }),
    [mode, setMode, isDark],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);

export default ThemeContext;
