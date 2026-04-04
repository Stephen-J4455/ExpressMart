import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { Platform } from "react-native";
import { supabase } from "../lib/supabase";

const AdsContext = createContext();

export const useAds = () => {
  const context = useContext(AdsContext);
  if (!context) {
    throw new Error("useAds must be used within an AdsProvider");
  }
  return context;
};

export const AdsProvider = ({ children }) => {
  const [ads, setAds] = useState([]);
  const [loading, setLoading] = useState(false);

  const normalizePlacement = (value) => {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
  };

  const parsePlacements = (placementValue) => {
    if (Array.isArray(placementValue)) {
      return placementValue.map(normalizePlacement).filter(Boolean);
    }

    if (typeof placementValue !== "string") return [];

    const raw = placementValue.trim();
    if (!raw) return [];

    if (raw.startsWith("[") && raw.endsWith("]")) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.map(normalizePlacement).filter(Boolean);
        }
      } catch {
        // Fall through to comma-split parser.
      }
    }

    return raw.split(",").map(normalizePlacement).filter(Boolean);
  };

  const placementAliases = {
    profile: ["account"],
    account: ["profile"],
    category: ["categories"],
    categories: ["category"],
    product_detail: ["product_details", "product"],
    product_details: ["product_detail", "product"],
    checkout: ["cart_checkout"],
    search: ["search_results"],
    search_results: ["search"],
    feed: ["discover"],
  };

  // Fetch ads by placement
  const fetchAdsByPlacement = useCallback(async (placement) => {
    if (!supabase) return [];

    try {
      setLoading(true);

      // Fetch active ads and filter placement/date/platform client-side for reliability.
      const { data, error } = await supabase
        .from("express_ads")
        .select("*")
        .eq("is_active", true)
        .order("position", { ascending: true });

      if (error) throw error;

      const now = Date.now();
      const requestedPlacement = normalizePlacement(placement);
      const aliasSet = new Set([
        requestedPlacement,
        ...(placementAliases[requestedPlacement] || []),
      ]);
      const onWeb = Platform.OS === "web";

      const valid = (data || []).filter((ad) => {
        const adPlacements = parsePlacements(ad.placement);
        const hasPlacement = adPlacements.some((p) => aliasSet.has(p));
        if (!hasPlacement) return false;

        const allowOnPlatform = onWeb
          ? ad.show_on_web !== false
          : ad.show_on_mobile !== false;
        if (!allowOnPlatform) return false;

        const startTs = ad.start_date
          ? new Date(ad.start_date).getTime()
          : null;
        const endTs = ad.end_date ? new Date(ad.end_date).getTime() : null;

        const afterStart =
          startTs == null || Number.isNaN(startTs) || startTs <= now;
        const beforeEnd = endTs == null || Number.isNaN(endTs) || endTs >= now;

        return afterStart && beforeEnd;
      });

      setAds(valid);
      return valid;
    } catch (error) {
      console.error("Error fetching ads:", error);
      setAds([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const trackAdEngagement = useCallback(async (adId, eventType) => {
    if (!supabase || !adId) return;

    const column = eventType === "click" ? "clicks" : "impressions";

    try {
      const { data: row, error: readError } = await supabase
        .from("express_ads")
        .select(`id,${column}`)
        .eq("id", adId)
        .maybeSingle();

      if (readError) throw readError;
      if (!row) throw new Error("Ad record not found");

      const nextValue = (Number(row[column]) || 0) + 1;

      const { error: updateError } = await supabase
        .from("express_ads")
        .update({ [column]: nextValue })
        .eq("id", adId);

      if (updateError) throw updateError;
    } catch (error) {
      console.error(`Error tracking ad ${eventType}:`, error);
    }
  }, []);

  // Track ad impression
  const trackImpression = useCallback(
    async (adId) => {
      await trackAdEngagement(adId, "impression");
    },
    [trackAdEngagement],
  );

  // Track ad click
  const trackClick = useCallback(
    async (adId) => {
      await trackAdEngagement(adId, "click");
    },
    [trackAdEngagement],
  );

  const value = useMemo(
    () => ({
      ads,
      loading,
      fetchAdsByPlacement,
      trackImpression,
      trackClick,
    }),
    [ads, loading, fetchAdsByPlacement, trackImpression, trackClick],
  );

  return <AdsContext.Provider value={value}>{children}</AdsContext.Provider>;
};
