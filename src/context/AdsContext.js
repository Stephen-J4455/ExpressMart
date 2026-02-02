import React, { createContext, useContext, useState, useEffect } from "react";
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

    // Fetch ads by placement
    const fetchAdsByPlacement = async (placement) => {
        if (!supabase) return [];

        try {
            setLoading(true);
            const now = new Date().toISOString();

            const { data, error } = await supabase
                .from("express_ads")
                .select("*")
                .eq("placement", placement)
                .eq("is_active", true)
                .or(`start_date.is.null,start_date.lte.${now}`)
                .or(`end_date.is.null,end_date.gte.${now}`)
                .order("position", { ascending: true });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error("Error fetching ads:", error);
            return [];
        } finally {
            setLoading(false);
        }
    };

    // Track ad impression
    const trackImpression = async (adId) => {
        if (!supabase) return;

        try {
            const { data, error } = await supabase
                .from("express_ads")
                .select("impressions")
                .eq("id", adId)
                .single();

            if (error) throw error;

            const newImpressions = (data?.impressions || 0) + 1;

            await supabase
                .from("express_ads")
                .update({ impressions: newImpressions })
                .eq("id", adId);
        } catch (error) {
            console.error("Error tracking impression:", error);
        }
    };

    // Track ad click
    const trackClick = async (adId) => {
        if (!supabase) return;

        try {
            const { data, error } = await supabase
                .from("express_ads")
                .select("clicks")
                .eq("id", adId)
                .single();

            if (error) throw error;

            const newClicks = (data?.clicks || 0) + 1;

            await supabase
                .from("express_ads")
                .update({ clicks: newClicks })
                .eq("id", adId);
        } catch (error) {
            console.error("Error tracking click:", error);
        }
    };

    const value = {
        ads,
        loading,
        fetchAdsByPlacement,
        trackImpression,
        trackClick,
    };

    return (
        <AdsContext.Provider value={value}>
            {children}
        </AdsContext.Provider>
    );
};
