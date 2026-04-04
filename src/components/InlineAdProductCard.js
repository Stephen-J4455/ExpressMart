import { useEffect } from "react";
import * as Linking from "expo-linking";
import { useIsFocused } from "@react-navigation/native";
import { useAds } from "../context/AdsContext";
import { AdRenderer } from "./AdBanner";
import { ProductCard } from "./ProductCard";

export const InlineAdProductCard = ({ ad }) => {
  const { trackImpression, trackClick } = useAds();
  const isFocused = useIsFocused();
  const style = String(ad?.style || "card").toLowerCase();

  useEffect(() => {
    if (!ad?.id || !isFocused) return;
    // Non-card styles are delegated to AdRenderer and track themselves.
    if (style === "card") {
      trackImpression(ad.id);
    }
  }, [ad?.id, style, isFocused, trackImpression]);

  // Overlay/fixed styles are handled by screen-level adaptive rendering.
  if (["popup", "fullscreen", "sticky_footer"].includes(style)) {
    return null;
  }

  // For non-card styles, defer to the canonical ad renderer so selected format is honored.
  if (["banner", "carousel", "story", "sidebar"].includes(style)) {
    return <AdRenderer ad={ad} />;
  }

  if (!ad) return null;

  const handlePress = async () => {
    await Promise.resolve(trackClick(ad.id));
    if (!ad.cta_url) return;

    try {
      await Linking.openURL(ad.cta_url);
    } catch (error) {
      console.error("Error opening ad URL:", error);
    }
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

  return (
    <ProductCard
      product={mappedAdProduct}
      onPress={handlePress}
      hideCta
      priceLabelOverride={ad.description || "Sponsored"}
    />
  );
};
