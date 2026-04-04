import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from "react-native";
import { supabase } from "../lib/supabase";
import { useShop } from "../context/ShopContext";
import { useAds } from "../context/AdsContext";
import { colors } from "../theme/colors";

const mapStoryAdToStatus = (ad) => ({
  id: `ad-story-${ad.id}`,
  is_ad_story: true,
  ad,
  status_type: ad?.image_url ? "image" : "text",
  media_url: ad?.image_url || null,
  status_text: ad?.description || ad?.title || "",
  background_color: ad?.background_color || "#0F172A",
  text_color: ad?.text_color || "#FFFFFF",
  seller: {
    id: `ad-${ad.id}`,
    name: ad?.title || "Sponsored",
    avatar: ad?.image_url || null,
  },
  created_at: ad?.created_at || new Date().toISOString(),
  cta_text: ad?.cta_text || "Open",
  cta_url: ad?.cta_url || null,
});

export const StatusRow = ({ onSelectStatus }) => {
  const { followedSellers } = useShop();
  const { fetchAdsByPlacement } = useAds();
  const [activeStatuses, setActiveStatuses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActiveStatuses();
  }, [followedSellers]);

  const fetchActiveStatuses = async () => {
    try {
      let uniqueSellers = [];

      if (followedSellers.length > 0) {
        // Fetch latest status for each followed seller.
        const { data, error } = await supabase
          .from("express_seller_statuses")
          .select(
            `
          *,
          seller:express_sellers(id, name, avatar)
        `,
          )
          .in("seller_id", followedSellers)
          .eq("is_active", true)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false });

        if (!error && data) {
          uniqueSellers = [];
          const seenSellers = new Set();

          data.forEach((item) => {
            if (!seenSellers.has(item.seller_id)) {
              seenSellers.add(item.seller_id);
              uniqueSellers.push(item);
            }
          });
        }
      }

      const homeAds = await fetchAdsByPlacement("home");
      const storyAdStatuses = (homeAds || [])
        .filter((ad) => String(ad?.style || "").toLowerCase() === "story")
        .map(mapStoryAdToStatus);

      setActiveStatuses([...storyAdStatuses, ...uniqueSellers]);
    } catch (err) {
      console.error("Error fetching active statuses:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || activeStatuses.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Updates from Stores</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {activeStatuses.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.statusItem}
            onPress={() => {
              if (typeof onSelectStatus === "function") {
                onSelectStatus(item);
              }
            }}
          >
            <View style={styles.avatarContainer}>
              <Image
                source={{ uri: item.seller.avatar }}
                style={styles.avatar}
              />
              <View style={styles.indicator} />
            </View>
            <Text style={styles.sellerName} numberOfLines={1}>
              {item.seller.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.dark,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  scrollContent: {
    paddingHorizontal: 12,
  },
  statusItem: {
    alignItems: "center",
    width: 80,
    gap: 6,
  },
  avatarContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: colors.primary,
    padding: 2,
    position: "relative",
  },
  avatar: {
    width: "100%",
    height: "100%",
    borderRadius: 30,
    backgroundColor: colors.light,
  },
  indicator: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: "#fff",
  },
  sellerName: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
    textAlign: "center",
  },
});
