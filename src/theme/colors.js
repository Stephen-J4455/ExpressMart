// ── Brand palette (theme-independent) ────────────────────────────────────────
// These are the Tagit brand colors. They do NOT change with light/dark mode.
export const colors = {
  // Tagit brand palette
  primary: "#FF5A79", // Coral Pink
  primaryDark: "#F03A70", // Vibrant Magenta
  accent: "#00E2C8", // Bright Cyan / Teal
  warmCoral: "#FF6F61", // Warm Coral ("it" in tagit)
  gradientStart: "#FF5A79", // Coral Pink
  gradientEnd: "#F03A70", // Vibrant Magenta
  success: "#10B981",
  info: "#00E2C8",
  // NOTE: dark/light/surface/border/background/splashback/muted are theme
  // NEUTRAL tokens. They are intentionally NOT defined here as static values —
  // read them from the resolved palette returned by buildPalette() / useTheme()
  // instead. They are kept below only as the LIGHT default for any legacy code
  // that still imports `colors.dark` etc. directly (to be removed at the end of
  // the theming migration).
  dark: "#0F172A",
  light: "#ffffff",
  muted: "#64748B",
  surface: "#E2E6E9", // Cool Grey canvas
  border: "#E2E6E9",
  background: "#E2E6E9", // Cool Grey canvas
  splashback: "#B7B8BF",
};

// ── Theme (light/dark) support ───────────────────────────────────────────────
// Theming is now CONTEXT-DRIVEN and reactive (see src/context/ThemeContext.js).
// Components read the resolved palette via useTheme().colors or useAppStyles(),
// so toggling the theme restyles everything WITHOUT remounting the app or the
// NavigationContainer. No StyleSheet.create override is used.

const LIGHT_NEUTRALS = {
  dark: "#0F172A",
  light: "#ffffff",
  surface: "#E2E6E9",
  border: "#E2E6E9",
  background: "#E2E6E9",
  splashback: "#B7B8BF",
  muted: "#64748B",
};

const DARK_NEUTRALS = {
  dark: "#F1F5F9",
  light: "#0B1220",
  surface: "#0B1220",
  border: "#1E293B",
  background: "#070B14",
  splashback: "#1E293B",
  muted: "#94A3B8",
};

export const THEME_STORAGE_KEY = "expressmart.theme.mode";

export const resolveNeutrals = (mode, systemScheme) => {
  if (mode === "system") return systemScheme === "dark" ? DARK_NEUTRALS : LIGHT_NEUTRALS;
  return mode === "dark" ? DARK_NEUTRALS : LIGHT_NEUTRALS;
};

// Builds a STABLE, resolved ColorPalette for the given mode + system scheme.
// Brand colors are spread in so the palette is a single source of truth. The
// returned object reference is stable per (mode, isDark) because callers
// (ThemeProvider) memoize on those inputs.
export const buildPalette = (mode, isDark) => {
  const n = resolveNeutrals(mode, isDark ? "dark" : "light");
  return {
    ...colors,
    ...n,
  };
};

// ── Backward-compatible shims (to be removed at end of migration) ────────────
// Legacy code mutated the shared `colors` object at runtime. We keep a no-op
// shim so existing imports keep working during the incremental migration; the
// resolved palette now comes from buildPalette()/useTheme() instead.
export const applyThemeToColors = () => {};
export const persistThemeMode = () => {};
export const getInitialThemeMode = () => "system";

// ── NOTE ─────────────────────────────────────────────────────────────────────
// The previous global StyleSheet.create() override (live getters) has been
// REMOVED. Theming is now context-driven and reactive via useTheme()/useAppStyles
// (see src/context/ThemeContext.js). Components must read theme-neutral colors
// from the resolved palette, not from hard-coded hex values.

// Shared border-radius scale — use these tokens instead of hard-coded
// values so corner rounding stays consistent across the app (e.g. the
// home page cards and header controls).
export const radius = {
  xxs: 4,
  xs: 8,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 24,
  pill: 40,
  full: 999,
};

export const THEMES = {
  blue: {
    id: "blue",
    primary: "#FF5A79",
    gradientStart: "#FF5A79",
    gradientEnd: "#F03A70",
    accent: "#00E2C8",
  },
  indigo: {
    id: "indigo",
    primary: "#F03A70",
    gradientStart: "#FF5A79",
    gradientEnd: "#F03A70",
    accent: "#00E2C8",
  },
  cyan: {
    id: "cyan",
    primary: "#00E2C8",
    gradientStart: "#00E2C8",
    gradientEnd: "#67E8F9",
    accent: "#00E2C8",
  },
  teal: {
    id: "teal",
    primary: "#14B8A6",
    gradientStart: "#14B8A6",
    gradientEnd: "#2DD4BF",
    accent: "#0D9488",
  },
  green: {
    id: "green",
    primary: "#10B981",
    gradientStart: "#10B981",
    gradientEnd: "#34D399",
    accent: "#059669",
  },
  emerald: {
    id: "emerald",
    primary: "#059669",
    gradientStart: "#059669",
    gradientEnd: "#34D399",
    accent: "#10B981",
  },
  lime: {
    id: "lime",
    primary: "#84CC16",
    gradientStart: "#84CC16",
    gradientEnd: "#BEF264",
    accent: "#A3E635",
  },
  yellow: {
    id: "yellow",
    primary: "#F59E0B",
    gradientStart: "#F59E0B",
    gradientEnd: "#FDE68A",
    accent: "#FBBF24",
  },
  amber: {
    id: "amber",
    primary: "#F97316",
    gradientStart: "#FB923C",
    gradientEnd: "#F97316",
    accent: "#F59E0B",
  },
  orange: {
    id: "orange",
    primary: "#FB923C",
    gradientStart: "#FB923C",
    gradientEnd: "#F97316",
    accent: "#FB7185",
  },
  red: {
    id: "red",
    primary: "#EF4444",
    gradientStart: "#EF4444",
    gradientEnd: "#DC2626",
    accent: "#FB7185",
  },
  rose: {
    id: "rose",
    primary: "#F43F5E",
    gradientStart: "#FB7185",
    gradientEnd: "#F43F5E",
    accent: "#F472B6",
  },
  pink: {
    id: "pink",
    primary: "#EC4899",
    gradientStart: "#EC4899",
    gradientEnd: "#FBCFE8",
    accent: "#F472B6",
  },
  purple: {
    id: "purple",
    primary: "#8B5CF6",
    gradientStart: "#8B5CF6",
    gradientEnd: "#A78BFA",
    accent: "#C084FC",
  },
  violet: {
    id: "violet",
    primary: "#7C3AED",
    gradientStart: "#7C3AED",
    gradientEnd: "#A78BFA",
    accent: "#8B5CF6",
  },
  fuchsia: {
    id: "fuchsia",
    primary: "#D946EF",
    gradientStart: "#D946EF",
    gradientEnd: "#F0ABFC",
    accent: "#E879F9",
  },
  sky: {
    id: "sky",
    primary: "#38BDF8",
    gradientStart: "#38BDF8",
    gradientEnd: "#7DD3FC",
    accent: "#60A5FA",
  },
  slate: {
    id: "slate",
    primary: "#64748B",
    gradientStart: "#64748B",
    gradientEnd: "#94A3B8",
    accent: "#CBD5E1",
  },
  brown: {
    id: "brown",
    primary: "#92400E",
    gradientStart: "#92400E",
    gradientEnd: "#C2410C",
    accent: "#B45309",
  },
};

export const getTheme = (keyOrHex) => {
  if (!keyOrHex) return THEMES.blue;
  if (THEMES[keyOrHex]) return THEMES[keyOrHex];
  const hex = String(keyOrHex).trim();
  return {
    id: hex,
    primary: hex,
    gradientStart: colors.gradientStart,
    gradientEnd: colors.gradientEnd,
    accent: colors.accent,
  };
};