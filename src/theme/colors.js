export const colors = {
  // Tagit brand palette
  primary: "#FF5A79", // Coral Pink
  primaryDark: "#F03A70", // Vibrant Magenta
  accent: "#00E2C8", // Bright Cyan / Teal
  warmCoral: "#FF6F61", // Warm Coral ("it" in tagit)
  gradientStart: "#FF5A79", // Coral Pink
  gradientEnd: "#F03A70", // Vibrant Magenta
  dark: "#0F172A",
  light: "#ffffff",
  muted: "#64748B",
  success: "#10B981",
  info: "#00E2C8",
  surface: "#E2E6E9", // Cool Grey canvas
  border: "#E2E6E9",
  background: "#E2E6E9", // Cool Grey canvas
  splashback: "#B7B8BF",
};

// ── Theme (light/dark) support ───────────────────────────────────────────────
// IMPORTANT: React Native's StyleSheet.create() bakes color values into style
// objects ONCE at module load. Mutating `colors` at runtime cannot retroactively
// change those baked styles, which is why a simple state toggle alone does not
// restyle existing cards/pages. To make the theme apply to EVERY screen and card
// we (a) mutate the shared `colors` object synchronously here at import time so
// the very first module evaluation already sees the right palette, and (b) the
// ThemeProvider reloads the app when the user changes the mode so every module
// re-bakes its StyleSheet with the new values.

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

// Mutates the shared `colors` object in place. Call BEFORE any screen module's
// StyleSheet.create() evaluates so baked styles pick up the active theme.
export const applyThemeToColors = (mode, systemScheme) => {
  const n = resolveNeutrals(mode, systemScheme);
  colors.dark = n.dark;
  colors.light = n.light;
  colors.surface = n.surface;
  colors.border = n.border;
  colors.background = n.background;
  colors.splashback = n.splashback;
  colors.muted = n.muted;
};

// ── Live theming (no app reload) ─────────────────────────────────────────────
// React Native's StyleSheet.create() in RN 0.86 is an IDENTITY function — it
// returns the style object as-is (only freezing it in dev). At render time RN's
// flattenStyle() reads each property via `for (const key in style)`, which means
// GETTERS on style objects are evaluated live, on every render. We exploit this:
// when a style value is a theme-neutral token (colors.dark/light/surface/border/
// background/splashback/muted) we replace it with a getter that reads the CURRENT
// `colors` object. Because ThemeProvider re-renders its whole subtree when the
// mode changes, every screen re-resolves the correct palette on the next render —
// no reload, and no per-file edits (Fix A/B realized globally).
//
// Only the theme-neutral tokens become live. Brand colors (primary, accent,
// etc.), per-store THEMES, and any other static colors are passed through
// untouched, so they keep working exactly as before.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Platform, Appearance, StyleSheet: RNStyleSheet } =
  require("react-native");

const _safeGetScheme = () => {
  try {
    return Appearance && typeof Appearance.getColorScheme === "function"
      ? Appearance.getColorScheme()
      : "light";
  } catch {
    return "light";
  }
};

// Theme-neutral tokens that should track the live `colors` object.
const THEME_KEYS = [
  "dark",
  "light",
  "surface",
  "border",
  "background",
  "splashback",
  "muted",
];

// Curated map of HARD-CODED neutral hex values (the greys/slates used as card
// backgrounds, borders, dividers and muted text) to the theme token they should
// track. These differ from the token's own hex, so screens that hard-code e.g.
// backgroundColor: "#F1F5F9" instead of colors.surface still restyle correctly in
// dark mode. Semantic accent tints (reds/greens/blues/yellows) are excluded on
// purpose — they are status/brand colours that must not change with the theme.
const NEUTRAL_HEX_MAP = {
  "#F1F5F9": "surface", // slate-100  (card bg / divider)
  "#E2E8F0": "border", //  slate-200  (border / divider)
  "#EEF2F8": "border", //  app-header divider
  "#F8FAFC": "surface", // slate-50   (subtle card bg)
  "#E5E7EB": "border", //  gray-200   (border)
  "#CBD5E1": "border", //  slate-300  (border / placeholder)
  "#EAF0F7": "border", //  product-card border
  "#FAFBFC": "surface", // subtle card bg
  "#F1F1F1": "border", //  feed dividers
  "#EEF2F6": "border", //  feed dividers
  "#F0F9FF": "surface", // category scroller card bg
  "#EEF2FF": "surface", // seller-admin tab bar / highlight bg
  "#334155": "dark", //    slate-700  (secondary text)
  "#6B7280": "muted", //   gray-500   (muted text)
  "#94A3B8": "muted", //   slate-400  (muted text)
  "#1E293B": "border", //  slate-800  (dark-mode border)
  "#0B1220": "light", //   dark-mode surface
  "#070B14": "background", // dark-mode background
  "#0F172A": "dark", //     dark-mode text
  "#B7B8BF": "splashback", // splashback
  // Lowercase variants used by placeholder/skeleton styles.
  "#f0f0f0": "surface",
  "#e0e0e0": "border",
  "#D1D5DB": "border", // comment modal handle
  "#374151": "dark", // comment body text
};

// Pure white/black are context-sensitive: as a BACKGROUND/BORDER they are card
// surfaces that must invert in dark mode (→ colors.light / colors.dark), but as
// TEXT/ICON colour on a brand-coloured button they must stay white/black for
// readability. So we only map them when the style property is a surface role.
const SURFACE_PROPS = new Set([
  "backgroundColor",
  "borderColor",
  "borderBottomColor",
  "borderTopColor",
  "borderLeftColor",
  "borderRightColor",
  "shadowColor",
]);

// Build a reverse map from the CURRENT hex value of each theme-neutral token to
// its token name, plus the curated hardcoded-neutral hexes. Screens write
// `colors.background` (a hex) OR a hard-coded neutral like "#F1F5F9" inside
// StyleSheet.create(); at create time we match the hex against the live palette
// and remember which token it came from — then store a live getter that re-reads
// colors[token] on every render.
const _buildReverseMap = () => {
  const map = { ...NEUTRAL_HEX_MAP };
  for (const token of THEME_KEYS) {
    map[colors[token]] = token;
  }
  return map;
};

// Convert a single style value into a live getter when it equals a theme-neutral
// token's current hex (or a recognised hard-coded neutral); otherwise pass it
// through untouched. `prop` is the style property name so we can treat pure
// white/black context-sensitively (surface roles only).
const _liveValue = (value, reverseMap, prop) => {
  if (Array.isArray(value)) {
    return value.map((v) => _liveValue(v, reverseMap, prop));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const out = {};
    for (const k of Object.keys(value)) {
      out[k] = _liveValue(value[k], reverseMap, k);
    }
    return out;
  }
  if (typeof value === "string") {
    let token = reverseMap[value];
    // Pure white/black: only track the theme when used as a surface (bg/border),
    // never as text/icon colour on a coloured control.
    if (!token && (value === "#fff" || value === "#FFFFFF")) {
      token = SURFACE_PROPS.has(prop) ? "light" : null;
    }
    if (!token && (value === "#000" || value === "#000000")) {
      // shadowColor stays black: a black shadow is correct on light surfaces and
      // invisible-but-harmless on dark ones. Mapping it to colors.dark would
      // produce a LIGHT halo on dark cards (the reported artifact).
      token = prop === "shadowColor" ? null : "dark";
    }
    // rgba(255,255,255,…) / rgba(0,0,0,…) — e.g. the bottom-nav icon pill. Track
    // the theme through colors.light / colors.dark while preserving the alpha.
    if (!token) {
      const rgbaMatch = value.match(
        /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/
      );
      if (rgbaMatch) {
        const [, r, g, b, a] = rgbaMatch;
        const isWhite = r === "255" && g === "255" && b === "255";
        const isBlack = r === "0" && g === "0" && b === "0";
        if (isWhite && SURFACE_PROPS.has(prop)) {
          token = "light";
        } else if (isBlack && SURFACE_PROPS.has(prop) && prop !== "shadowColor") {
          token = "dark";
        }
        if (token) {
          const alpha = parseFloat(a);
          return {
            enumerable: true,
            configurable: true,
            get() {
              const hex = colors[token];
              // hex → rgb, then apply the original alpha.
              const h = hex.replace("#", "");
              const hr = parseInt(h.substring(0, 2), 16);
              const hg = parseInt(h.substring(2, 4), 16);
              const hb = parseInt(h.substring(4, 6), 16);
              return `rgba(${hr},${hg},${hb},${alpha})`;
            },
          };
        }
      }
    }
    if (token) {
      // Live getter: resolves the current palette on every render/flatten.
      return {
        enumerable: true,
        configurable: true,
        get() {
          return colors[token];
        },
      };
    }
  }
  return value;
};

// Capture the ORIGINAL create so other StyleSheet helpers keep working.
const _OriginalCreate = RNStyleSheet.create.bind(RNStyleSheet);

// Override StyleSheet.create so theme-neutral color values become live getters.
// Layout properties (padding, margin, flex, …) stay static — only colors are
// dynamic (Fix B: static StyleSheet + dynamic theme overrides). Because the
// reverse map is rebuilt on every create() call, the getter is always bound to
// the correct token even if the palette was just applied.
RNStyleSheet.create = (styles) => {
  const reverseMap = _buildReverseMap();
  const resolved = {};
  for (const key of Object.keys(styles)) {
    const style = styles[key];
    if (style && typeof style === "object") {
      const out = {};
      for (const prop of Object.keys(style)) {
        const v = _liveValue(style[prop], reverseMap, prop);
        if (v && typeof v === "object" && typeof v.get === "function") {
          Object.defineProperty(out, prop, v);
        } else {
          out[prop] = v;
        }
      }
      resolved[key] = out;
    } else {
      resolved[key] = style;
    }
  }
  return _OriginalCreate(resolved);
};

// ── Persistence (synchronous read so the first paint matches the saved theme) ──
// On native Android RN's `Settings` is an IN-MEMORY fallback and does NOT
// persist across reloads, so we persist to AsyncStorage (true durable store on
// every platform) and read it synchronously via a cached value. On web we use
// localStorage (synchronous). The saved mode is applied at import time so the
// very first render already matches the user's preference.
let _persistedMode = "system";

const _isValidMode = (v) =>
  v === "light" || v === "dark" || v === "system";

const _readPersistedModeSync = () => {
  try {
    if (Platform.OS === "web") {
      if (typeof localStorage !== "undefined") {
        const v = localStorage.getItem(THEME_STORAGE_KEY);
        if (_isValidMode(v)) return v;
      }
      return "system";
    }
    // AsyncStorage is async, so on native we rely on the cached value that
    // persistThemeMode() set synchronously before any reload, plus the async
    // hydration below for cold starts.
    return _persistedMode;
  } catch {
    return "system";
  }
};

let _initialMode = _readPersistedModeSync();
// Apply synchronously at import so the first paint already uses the right palette.
applyThemeToColors(_initialMode, _safeGetScheme());

export const getInitialThemeMode = () => _initialMode;

// AsyncStorage is the true persistence layer on every platform.
let _AsyncStorage = null;
try {
  _AsyncStorage = require("@react-native-async-storage/async-storage").default;
} catch {
  _AsyncStorage = null;
}

// Hydrate the cache from AsyncStorage at import time so a cold start restores
// the saved theme (the live getters then pick it up on the next render).
if (_AsyncStorage) {
  _AsyncStorage
    .getItem(THEME_STORAGE_KEY)
    .then((stored) => {
      if (_isValidMode(stored) && stored !== _persistedMode) {
        _persistedMode = stored;
        _initialMode = stored;
        applyThemeToColors(_initialMode, _safeGetScheme());
      }
    })
    .catch(() => {});
}

// Persist the mode synchronously to the in-memory cache (so the next import-time
// read — after a reload — sees it immediately) and to AsyncStorage (durable) and,
// on web, localStorage.
export const persistThemeMode = (mode) => {
  if (!_isValidMode(mode)) return;
  _persistedMode = mode;
  try {
    if (Platform.OS === "web") {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(THEME_STORAGE_KEY, mode);
      }
    }
  } catch {
    /* ignore */
  }
  if (_AsyncStorage) {
    _AsyncStorage.setItem(THEME_STORAGE_KEY, mode).catch(() => {});
  }
};

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