export const colors = {
  primary: "#2563EB",
  accent: "#06B6D4",
  dark: "#0F172A",
  light: "#FFFFFF",
  muted: "#64748B",
  success: "#10B981",
  info: "#06B6D4",
  surface: "#F6F8FB",
  border: "#E6EEF8",
  background: "#ffffff",
};

export const THEMES = {
  blue: {
    id: "blue",
    primary: "#2563EB",
    gradientStart: "#2563EB",
    gradientEnd: "#4DA3FF",
    accent: "#3B82F6",
  },
  indigo: {
    id: "indigo",
    primary: "#4F46E5",
    gradientStart: "#6366F1",
    gradientEnd: "#7C3AED",
    accent: "#8B5CF6",
  },
  cyan: {
    id: "cyan",
    primary: "#06B6D4",
    gradientStart: "#06B6D4",
    gradientEnd: "#67E8F9",
    accent: "#06B6D4",
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
    gradientStart: hex,
    gradientEnd: hex,
    accent: hex,
  };
};
