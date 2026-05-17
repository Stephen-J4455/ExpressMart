import { useEffect } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { useAds } from "../context/AdsContext";
import { colors } from "../theme/colors";
import { openAdDestination } from "./AdBanner";
import { ProductCard } from "./ProductCard";

export const InlineAdProductCard = ({ ad, showCta = false }) => {
  const { trackImpression, trackClick } = useAds();
  const isFocused = useIsFocused();
  const style = String(ad?.style || "card").toLowerCase();

  useEffect(() => {
    if (!ad?.id || !isFocused) return;
    trackImpression(ad.id);
  }, [ad?.id, style, isFocused, trackImpression]);

  // Overlay/fixed styles are handled by screen-level adaptive rendering.
  if (["popup", "fullscreen", "sticky_footer"].includes(style)) {
    return null;
  }

  if (!ad) return null;

  const handlePress = async () => {
    await openAdDestination(ad, trackClick);
  };

  const mappedAdProduct = {
    id: `ad-${ad.id}`,
    title: ad.title || "Sponsored",
    vendor: "Sponsored",
    thumbnail: ad.image_url,
    thumbnails: ad.image_url ? [ad.image_url] : [],
    price: 0,
    discount: 0,
    rating: 0,
    badges: ["Sponsored"],
    description: ad.description || "",
    tags: ad.tags || [],
  };

  const ctaLabel = ad.cta_text || "Shop Now";
  const ctaButton = showCta && ad.cta_url ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${ctaLabel} for sponsored content`}
      style={styles.ctaButton}
      onPress={handlePress}
    >
      <LinearGradient
        colors={[ad.accent_color || colors.primary, colors.accent]}
        style={styles.ctaGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        <Text style={styles.ctaText}>{ctaLabel}</Text>
        <Ionicons name="arrow-forward" size={16} color="#fff" />
      </LinearGradient>
    </Pressable>
  ) : null;

  return (
    <ProductCard
      product={mappedAdProduct}
      onPress={handlePress}
      hideCta
      footerAction={ctaButton}
      priceLabelOverride={ad.description || "Sponsored"}
      priceLabelLines={1}
    />
  );
};

const styles = StyleSheet.create({
  ctaButton: {
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: colors.primary,
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  ctaGradient: {
    minHeight: 42,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  ctaText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
});
