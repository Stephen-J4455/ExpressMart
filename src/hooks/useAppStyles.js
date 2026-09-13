import { useMemo } from "react";
import { StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";

// ── useAppStyles ─────────────────────────────────────────────────────────────
// Wraps StyleSheet.create in a useMemo keyed on the resolved `colors` palette,
// so styles are rebuilt only when the theme actually changes (not on every
// provider render). The factory receives the active ColorPalette and returns a
// plain style object; the returned styles are typed to match the factory's
// shape.
//
// Usage:
//   const styles = useAppStyles((c) => StyleSheet.create({
//     container: { backgroundColor: c.background },
//     text: { color: c.dark },
//   }));
//
// `c` is the stable, resolved palette from useTheme().colors — so every color
// reference is theme-reactive and there are no hard-coded hex values.
export function useAppStyles(factory) {
  const { colors } = useTheme();
  // `colors` is memoized per theme in ThemeProvider, so this useMemo only
  // recomputes when the active palette changes.
  return useMemo(() => factory(colors), [colors, factory]);
}
