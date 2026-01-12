import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  ScrollView,
  Dimensions,
} from "react-native";
import { useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useCart } from "../context/CartContext";
import { colors } from "../theme/colors";

const SELLER_BADGE_CONFIG = {
  verified: { label: "Verified", icon: "checkmark-circle", color: "#10B981" },
  top_seller: { label: "Top Seller", icon: "trophy", color: "#F59E0B" },
  fast_shipping: { label: "Fast Ship", icon: "flash", color: "#3B82F6" },
  eco_friendly: { label: "Eco", icon: "leaf", color: "#22C55E" },
  local: { label: "Local", icon: "location", color: "#8B5CF6" },
  trending: { label: "Trending", icon: "trending-up", color: "#EC4899" },
  premium: { label: "Premium", icon: "star", color: "#EAB308" },
};

export const ProductCard = ({ product, style, variant = "grid", onPress }) => {
  const { addToCart } = useCart();
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const handleAdd = (e) => {
    e?.stopPropagation?.();
    addToCart(product, 1);
  };

  const images =
    product.thumbnails && product.thumbnails.length > 0
      ? product.thumbnails
      : [product.thumbnail];

  if (variant === "list") {
    return (
      <Pressable
        style={[styles.card, styles.listCard, style]}
        onPress={onPress}
      >
        <View style={styles.listImageContainer}>
          {images.length > 1 ? (
            <>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onScroll={(e) => {
                  const index = Math.round(e.nativeEvent.contentOffset.x / 130);
                  setActiveImageIndex(index);
                }}
                scrollEventThrottle={16}
              >
                {images.map((imageUri, index) => (
                  <Image
                    key={index}
                    source={{ uri: imageUri }}
                    style={styles.listImage}
                  />
                ))}
              </ScrollView>
              <View style={styles.listImageIndicators}>
                {images.map((_, index) => (
                  <View
                    key={index}
                    style={[
                      styles.imageIndicator,
                      activeImageIndex === index && styles.imageIndicatorActive,
                    ]}
                  />
                ))}
              </View>
            </>
          ) : (
            <Image source={{ uri: images[0] }} style={styles.listImage} />
          )}
        </View>
        <View style={styles.listContent}>
          <View style={styles.listTop}>
            <View style={{ flex: 1 }}>
              <View style={styles.vendorRow}>
                <Text style={styles.vendor}>{product.vendor}</Text>
                {product.seller?.badges && product.seller.badges.length > 0 && (
                  <View style={styles.sellerBadge}>
                    {(() => {
                      const badge =
                        SELLER_BADGE_CONFIG[product.seller.badges[0]];
                      return badge ? (
                        <Ionicons
                          name={badge.icon}
                          size={12}
                          color={badge.color}
                        />
                      ) : null;
                    })()}
                  </View>
                )}
              </View>
              <Text numberOfLines={2} style={styles.title}>
                {product.title}
              </Text>
              {product.badges && product.badges.length > 0 && (
                <View style={styles.badgeRow}>
                  {product.badges.slice(0, 1).map((label) => (
                    <View key={label} style={styles.badge}>
                      <Text numberOfLines={1} style={styles.badgeText}>
                        {label}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
          <View style={styles.listBottom}>
            <View style={{ flex: 1 }}>
              <Text style={styles.price}>${product.price?.toFixed(2)}</Text>
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={12} color={colors.secondary} />
                <Text style={styles.ratingText}>
                  {product.rating?.toFixed(1)}
                </Text>
              </View>
            </View>
            <Pressable
              style={styles.listCta}
              onPress={handleAdd}
              accessibilityLabel="Add to cart"
            >
              <LinearGradient
                colors={[colors.primary, colors.accent]}
                style={styles.listCtaGradient}
              >
                <Ionicons name="cart" size={18} color="#fff" />
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable style={[styles.card, style]} onPress={onPress}>
      <View style={styles.imageContainer}>
        {images.length > 1 ? (
          <>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={(e) => {
                const index = Math.round(e.nativeEvent.contentOffset.x / 160);
                setActiveImageIndex(index);
              }}
              scrollEventThrottle={16}
            >
              {images.map((imageUri, index) => (
                <Image
                  key={index}
                  source={{ uri: imageUri }}
                  style={styles.image}
                />
              ))}
            </ScrollView>
            <View style={styles.imageIndicators}>
              {images.map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.imageIndicator,
                    activeImageIndex === index && styles.imageIndicatorActive,
                  ]}
                />
              ))}
            </View>
          </>
        ) : (
          <Image source={{ uri: images[0] }} style={styles.image} />
        )}
      </View>
      <View style={styles.content}>
        <View style={styles.vendorRow}>
          <Text style={styles.vendor}>{product.vendor}</Text>
          {product.seller?.badges && product.seller.badges.length > 0 && (
            <View style={styles.sellerBadge}>
              {(() => {
                const badge = SELLER_BADGE_CONFIG[product.seller.badges[0]];
                return badge ? (
                  <Ionicons name={badge.icon} size={12} color={badge.color} />
                ) : null;
              })()}
            </View>
          )}
        </View>
        <Text numberOfLines={1} style={styles.title}>
          {product.title}
        </Text>
        <View style={styles.badgeRow}>
          {product.badges?.slice(0, 2).map((label) => (
            <View key={label} style={styles.badge}>
              <Text numberOfLines={1} style={styles.badgeText}>
                {label}
              </Text>
            </View>
          ))}
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.price}>${product.price?.toFixed(2)}</Text>
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={14} color={colors.secondary} />
            <Text style={styles.ratingText}>{product.rating?.toFixed(1)}</Text>
          </View>
        </View>
        <Pressable
          style={styles.cta}
          onPress={handleAdd}
          accessibilityLabel="Add to cart"
        >
          <LinearGradient
            colors={[colors.primary, colors.accent]}
            style={styles.ctaGradient}
          >
            <Ionicons name="cart" size={16} color="#fff" />
            <Text style={styles.ctaText}>Add to Cart</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    minWidth: 160,
    height: 320,
    backgroundColor: "#fff",
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    overflow: "hidden",
  },
  listCard: {
    flexDirection: "row",
    height: 140,
    alignItems: "stretch",
  },
  imageContainer: {
    position: "relative",
    width: "100%",
    height: 150,
  },
  image: {
    width: 160,
    height: 150,
  },
  imageIndicators: {
    position: "absolute",
    bottom: 8,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 4,
  },
  imageIndicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.5)",
  },
  imageIndicatorActive: {
    backgroundColor: "#fff",
    width: 12,
  },
  listImageContainer: {
    position: "relative",
    width: 130,
    marginRight: 12,
  },
  listImage: {
    width: 130,
    height: "100%",
  },
  listImageIndicators: {
    position: "absolute",
    bottom: 8,
    left: 0,
    right: 12,
    flexDirection: "row",
    justifyContent: "center",
    gap: 4,
  },
  content: {
    padding: 12,
    paddingTop: 10,
    flex: 1,
  },
  vendorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  vendor: {
    fontSize: 12,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.dark,
    marginTop: 4,
  },
  badgeRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "nowrap",
    marginTop: 8,
    overflow: "hidden",
  },
  badge: {
    backgroundColor: colors.light,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    flexShrink: 1,
  },
  badgeText: {
    fontSize: 11,
    color: colors.primary,
    numberOfLines: 1,
  },
  metaRow: {
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  price: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.dark,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ratingText: {
    fontWeight: "600",
    color: colors.muted,
  },
  cta: {
    marginTop: 8,
  },
  ctaGradient: {
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  ctaText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  listContent: {
    flex: 1,
    justifyContent: "space-between",
    paddingVertical: 4,
    paddingRight: 4,
  },
  listTop: {
    flex: 1,
  },
  listBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  listCta: {
    marginLeft: 4,
  },
  listCtaGradient: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
