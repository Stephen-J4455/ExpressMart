import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Appearance, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { buildPalette, THEME_STORAGE_KEY } from "../theme/colors";

// ── Theme mode ───────────────────────────────────────────────────────────────
// "light" | "dark" | "system". The active palette is resolved from this mode
// plus the "system" OS scheme. Toggling the mode does NOT remount the app or the
// NavigationContainer — it only updates context, so navigation history, form
// state, and scroll position are preserved.

const THEME_MODES = ["light", "dark", "system"];
const _isValidMode = (v) => THEME_MODES.includes(v);

// AsyncStorage is async, so keep an in-memory cache for native cold starts.
// Browser storage is read after hydration to keep SSR and the first client
// render identical.
let _persistedMode = "system";
try {
  // AsyncStorage is async; hydrate at import time so a cold start restores the
  // saved theme before first paint where possible.
  if (Platform.OS !== "web") {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((stored) => {
      if (_isValidMode(stored) && stored !== _persistedMode) {
        _persistedMode = stored;
      }
    });
  }
} catch {
  /* ignore */
}

const _readInitialMode = () => _persistedMode;

const ThemeContext = createContext({
  theme: "system",
  colors: buildPalette("system", Appearance.getColorScheme() === "dark"),
  isDark: false,
  setTheme: () => {},
});

export const ThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState(() => _readInitialMode());
  const [systemScheme, setSystemScheme] = useState(() =>
    Platform.OS === "web" ? null : Appearance.getColorScheme(),
  );

  useEffect(() => {
    if (Platform.OS !== "web") return;
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (_isValidMode(stored)) {
        _persistedMode = stored;
        setThemeState(stored);
      }
    } catch {
      // Storage may be disabled by the browser.
    }

    setSystemScheme(Appearance.getColorScheme());
  }, []);

  // Subscribe to OS appearance changes (matters for "system" mode). Unsubscribe
  // on unmount. We only update local state — no remount, no reload.
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme);
    });
    return () => sub.remove();
  }, []);

  const isDark = useMemo(() => {
    if (theme === "system") return systemScheme === "dark";
    return theme === "dark";
  }, [theme, systemScheme]);

  // Resolved, active palette. Memoized on (theme, systemScheme) so consumers get
  // a STABLE reference per theme and don't re-render on every provider render.
  // This is the object passed to useAppStyles / NavigationContainer.
  const colors = useMemo(
    () => buildPalette(theme, systemScheme === "dark"),
    [theme, systemScheme],
  );

  const setTheme = useCallback((next) => {
    if (!_isValidMode(next)) return;
    setThemeState(next);
    _persistedMode = next;
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      }
    } catch {
      /* ignore */
    }
    AsyncStorage.setItem(THEME_STORAGE_KEY, next).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ theme, colors, isDark, setTheme }),
    [theme, colors, isDark, setTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);

export default ThemeContext;
