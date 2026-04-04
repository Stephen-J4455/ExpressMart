import { supabase } from "../lib/supabase";
import Constants from "expo-constants";
import { Platform } from "react-native";

const compareVersions = (a = "0.0.0", b = "0.0.0") => {
  const pa = String(a)
    .split(".")
    .map((n) => parseInt(n || "0", 10));
  const pb = String(b)
    .split(".")
    .map((n) => parseInt(n || "0", 10));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
};

export const getUpdateForApp = async (app, platform = null) => {
  if (!supabase) return null;
  try {
    if (platform) {
      const { data, error } = await supabase
        .from("app_updates")
        .select("*")
        .eq("app", app)
        .eq("platform", platform)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      if (data) return data;
    }

    const { data, error } = await supabase
      .from("app_updates")
      .select("*")
      .eq("app", app)
      .is("platform", null)
      .maybeSingle();
    if (error && error.code !== "PGRST116") throw error;
    return data ?? null;
  } catch (e) {
    console.error("getUpdateForApp error:", e);
    return null;
  }
};

export const checkForUpdate = async (app, currentVersion) => {
  const platform = Platform?.OS || null;
  const row = await getUpdateForApp(app, platform);
  if (!row) return null;
  const cur =
    currentVersion ||
    (Constants?.expoConfig?.version ?? Constants?.manifest?.version ?? "1.0.0");
  const needsForce =
    row.force_update && row.min_version
      ? compareVersions(cur, row.min_version) < 0
      : false;
  const hasLatest = row.latest_version
    ? compareVersions(cur, row.latest_version) < 0
    : false;

  return {
    updateAvailable: needsForce || hasLatest,
    forceUpdate: needsForce,
    latestVersion: row.latest_version,
    updateRow: row,
  };
};
