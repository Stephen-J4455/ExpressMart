import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Alert,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { useState, useEffect, useCallback } from "react";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { supabase } from "../lib/supabase";
import { colors } from "../theme/colors";

const SELLER_BADGE_CONFIG = {
  verified: {
    label: "Verified Seller",
    icon: "checkmark-circle",
    color: "#10B981",
  },
  top_seller: { label: "Top Seller", icon: "trophy", color: "#F59E0B" },
  fast_shipping: { label: "Fast Shipping", icon: "flash", color: "#3B82F6" },
  eco_friendly: { label: "Eco Friendly", icon: "leaf", color: "#22C55E" },
  local: { label: "Local Business", icon: "location", color: "#8B5CF6" },
  trending: { label: "Trending", icon: "trending-up", color: "#EC4899" },
  premium: { label: "Premium", icon: "star", color: "#EAB308" },
};

export const ProductDetailScreen = ({ route, navigation }) => {
  const { product } = route.params;
  const { addToCart } = useCart();
  const { user } = useAuth();
  const toast = useToast();
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [wishlistLoading, setWishlistLoading] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [reviewCount, setReviewCount] = useState(0);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const screenWidth = Dimensions.get("window").width;

  // Format price as Ghana Cedis
  const formatPrice = (price) => {
    return `GH₵${Number(price || 0).toLocaleString()}`;
  };

  // Check if product is wishlisted
  useEffect(() => {
    const checkWishlist = async () => {
      if (!user || !supabase) return;
      const { data } = await supabase
        .from("express_wishlists")
        .select("id")
        .eq("user_id", user.id)
        .eq("product_id", product.id)
        .single();
      setIsWishlisted(!!data);
    };
    checkWishlist();
  }, [user, product.id]);

  // Fetch reviews
  useEffect(() => {
    const fetchReviews = async () => {
      if (!supabase) return;
      const { data, count } = await supabase
        .from("express_reviews")
        .select("*", { count: "exact" })
        .eq("product_id", product.id)
        .order("created_at", { ascending: false })
        .limit(5);
      setReviews(data || []);
      setReviewCount(count || 0);
    };
    fetchReviews();
  }, [product.id]);

  const toggleWishlist = useCallback(async () => {
    if (!user) {
      Alert.alert(
        "Sign In Required",
        "Please sign in to add items to your wishlist",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Sign In", onPress: () => navigation.navigate("Auth") },
        ]
      );
      return;
    }
    if (!supabase) return;

    setWishlistLoading(true);
    try {
      if (isWishlisted) {
        await supabase
          .from("express_wishlists")
          .delete()
          .eq("user_id", user.id)
          .eq("product_id", product.id);
        setIsWishlisted(false);
      } else {
        await supabase.from("express_wishlists").insert({
          user_id: user.id,
          product_id: product.id,
        });
        setIsWishlisted(true);
      }
    } catch (err) {
      toast.error("Error", err.message);
    } finally {
      setWishlistLoading(false);
    }
  }, [user, isWishlisted, product.id, navigation, toast]);

  const handleAddToCart = () => {
    addToCart(product, 1);
    toast.success(
      "Added to Cart",
      `${product.title} has been added to your cart`
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        bounces={false}
        contentInsetAdjustmentBehavior="automatic"
        overScrollMode="never"
      >
        <View style={styles.imageContainer}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={(e) => {
              const index = Math.round(
                e.nativeEvent.contentOffset.x / screenWidth
              );
              setActiveImageIndex(index);
            }}
            scrollEventThrottle={16}
          >
            {(product.thumbnails && product.thumbnails.length > 0
              ? product.thumbnails
              : [product.thumbnail]
            ).map((imageUri, index) => (
              <Image
                key={index}
                source={{ uri: imageUri }}
                style={[styles.image, { width: screenWidth }]}
              />
            ))}
          </ScrollView>

          {product.thumbnails && product.thumbnails.length > 1 && (
            <View style={styles.pagination}>
              {product.thumbnails.map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.paginationDot,
                    activeImageIndex === index && styles.paginationDotActive,
                  ]}
                />
              ))}
            </View>
          )}
        </View>

        <Pressable
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.dark} />
        </Pressable>
        <Pressable
          style={styles.wishlistButton}
          onPress={toggleWishlist}
          disabled={wishlistLoading}
        >
          {wishlistLoading ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Ionicons
              name={isWishlisted ? "heart" : "heart-outline"}
              size={24}
              color={isWishlisted ? colors.accent : colors.dark}
            />
          )}
        </Pressable>

        <View style={styles.content}>
          <View style={styles.vendorRow}>
            <Text style={styles.vendor}>{product.vendor}</Text>
            {product.seller?.badges && product.seller.badges.length > 0 && (
              <View style={styles.sellerBadgesRow}>
                {product.seller.badges.slice(0, 3).map((badgeId) => {
                  const badge = SELLER_BADGE_CONFIG[badgeId];
                  if (!badge) return null;
                  return (
                    <View
                      key={badgeId}
                      style={[
                        styles.sellerBadge,
                        { backgroundColor: badge.color + "20" },
                      ]}
                    >
                      <Ionicons
                        name={badge.icon}
                        size={14}
                        color={badge.color}
                      />
                      <Text
                        style={[styles.sellerBadgeText, { color: badge.color }]}
                      >
                        {badge.label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
          <Text style={styles.title}>{product.title}</Text>

          {product.badges && product.badges.length > 0 && (
            <View style={styles.badgeRow}>
              {product.badges.map((label) => (
                <View key={label} style={styles.badge}>
                  <Text style={styles.badgeText}>{label}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatPrice(product.price)}</Text>
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={20} color={colors.secondary} />
              <Text style={styles.ratingText}>
                {product.rating?.toFixed(1) || "N/A"}
              </Text>
              <Text style={styles.ratingCount}>({reviewCount} reviews)</Text>
            </View>
          </View>

          {product.stock !== undefined && (
            <View style={styles.stockRow}>
              <Ionicons
                name={product.stock > 0 ? "checkmark-circle" : "close-circle"}
                size={18}
                color={product.stock > 0 ? colors.success : colors.accent}
              />
              <Text
                style={[
                  styles.stockText,
                  { color: product.stock > 0 ? colors.success : colors.accent },
                ]}
              >
                {product.stock > 0
                  ? `${product.stock} in stock`
                  : "Out of stock"}
              </Text>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Product Details</Text>
            <Text style={styles.description}>
              {product.description ||
                `High-quality product from ${product.vendor}. Category: ${product.category}. Perfect for your needs with excellent features and durability.`}
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Specifications</Text>
            <View style={styles.specRow}>
              <Text style={styles.specLabel}>Brand</Text>
              <Text style={styles.specValue}>{product.vendor}</Text>
            </View>
            <View style={styles.specRow}>
              <Text style={styles.specLabel}>Category</Text>
              <Text style={styles.specValue}>{product.category}</Text>
            </View>
            <View style={styles.specRow}>
              <Text style={styles.specLabel}>Rating</Text>
              <Text style={styles.specValue}>
                {product.rating?.toFixed(1) || "N/A"} / 5.0
              </Text>
            </View>
          </View>

          {reviews.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recent Reviews</Text>
              {reviews.map((review) => (
                <View key={review.id} style={styles.reviewItem}>
                  <View style={styles.reviewHeader}>
                    <View style={styles.reviewStars}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Ionicons
                          key={star}
                          name={star <= review.rating ? "star" : "star-outline"}
                          size={14}
                          color={colors.secondary}
                        />
                      ))}
                    </View>
                    <Text style={styles.reviewDate}>
                      {new Date(review.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                  {review.comment && (
                    <Text style={styles.reviewText}>{review.comment}</Text>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.ctaButton, product.stock === 0 && styles.ctaDisabled]}
          onPress={handleAddToCart}
          disabled={product.stock === 0}
        >
          <LinearGradient
            colors={
              product.stock === 0
                ? [colors.muted, colors.muted]
                : [colors.primary, colors.accent]
            }
            style={styles.ctaGradient}
          >
            <Ionicons name="cart" size={20} color="#fff" />
            <Text style={styles.ctaText}>
              {product.stock === 0
                ? "Out of Stock"
                : `Add to Cart - ${formatPrice(product.price)}`}
            </Text>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light,
  },
  scrollView: {
    flex: 1,
  },
  imageContainer: {
    position: "relative",
  },
  image: {
    height: 400,
    backgroundColor: "#f0f0f0",
  },
  pagination: {
    position: "absolute",
    bottom: 20,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255, 255, 255, 0.5)",
  },
  paginationDotActive: {
    backgroundColor: "#fff",
    width: 24,
  },
  backButton: {
    position: "absolute",
    top: 50,
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  wishlistButton: {
    position: "absolute",
    top: 50,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  content: {
    padding: 20,
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -24,
  },
  vendorRow: {
    flexDirection: "column",
    gap: 8,
    marginBottom: 8,
  },
  vendor: {
    fontSize: 14,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  sellerBadgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  sellerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  sellerBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.dark,
    marginBottom: 12,
  },
  badgeRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 16,
  },
  badge: {
    backgroundColor: colors.light,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  badgeText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: "600",
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  price: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.primary,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  ratingText: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.dark,
  },
  ratingCount: {
    fontSize: 14,
    color: colors.muted,
  },
  stockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 24,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.light,
  },
  stockText: {
    fontSize: 14,
    fontWeight: "600",
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.dark,
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    color: colors.muted,
    lineHeight: 24,
  },
  specRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.light,
  },
  specLabel: {
    fontSize: 15,
    color: colors.muted,
  },
  specValue: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.dark,
  },
  reviewItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.light,
  },
  reviewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  reviewStars: {
    flexDirection: "row",
    gap: 2,
  },
  reviewDate: {
    fontSize: 12,
    color: colors.muted,
  },
  reviewText: {
    fontSize: 14,
    color: colors.dark,
    lineHeight: 20,
  },
  footer: {
    padding: 16,
    paddingBottom: 24,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: colors.light,
  },
  ctaButton: {
    borderRadius: 16,
    overflow: "hidden",
  },
  ctaDisabled: {
    opacity: 0.6,
  },
  ctaGradient: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  ctaText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
});
