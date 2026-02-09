import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  ScrollView,
  Dimensions,
  Modal,
} from "react-native";
import { useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useCart } from "../context/CartContext";
import { useToast } from "../context/ToastContext";
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

export const ProductCard = ({ product, style, variant = "grid", onPress, hideCta, compact }) => {
  const { addToCart } = useCart();
  const toast = useToast();
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [showVariantModal, setShowVariantModal] = useState(false);
  const [selectedColor, setSelectedColor] = useState(null);
  const [selectedSize, setSelectedSize] = useState(null);

  const formatPrice = (price, discount = 0) => {
    const discountedPrice = discount > 0 ? price * (1 - discount / 100) : price;
    return `GH₵${Number(discountedPrice || 0).toLocaleString()}`;
  };

  const handleAdd = (e) => {
    e?.stopPropagation?.();
    const hasColors = product.colors && product.colors.length > 0;
    const hasSizes = product.sizes && product.sizes.length > 0;

    // Show modal if product has colors OR sizes (even single option)
    if (hasColors || hasSizes) {
      setSelectedColor(
        hasColors && product.colors.length > 1
          ? null
          : product.colors?.[0] || null,
      );
      setSelectedSize(
        hasSizes && product.sizes.length > 1
          ? null
          : product.sizes?.[0] || null,
      );
      setShowVariantModal(true);
    } else {
      // No variants, add directly
      addToCart(product, 1, null, null);
      toast.success(
        "Added to Cart",
        `${product.title} has been added to your cart`,
      );
    }
  };

  const handleConfirmAddToCart = () => {
    // Only require selection if there are multiple options
    if (
      (product.colors && product.colors.length > 1 && !selectedColor) ||
      (product.sizes && product.sizes.length > 1 && !selectedSize)
    ) {
      toast.error("Selection Required", "Please select all required options");
      return;
    }

    addToCart(product, 1, selectedSize, selectedColor);
    setShowVariantModal(false);
    toast.success(
      "Added to Cart",
      `${product.title} has been added to your cart`,
    );
  };

  const images =
    product.thumbnails && product.thumbnails.length > 0
      ? product.thumbnails
      : [product.thumbnail];

  if (variant === "list") {
    return (
      <>
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
                    const index = Math.round(
                      e.nativeEvent.contentOffset.x / 130,
                    );
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
                        activeImageIndex === index &&
                        styles.imageIndicatorActive,
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
                  <Text style={styles.vendor}>
                    {product.seller?.name || product.vendor}
                  </Text>
                  {product.seller?.badges &&
                    product.seller.badges.length > 0 && (
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
                <View style={styles.priceRow}>
                  <Text style={styles.price}>
                    {formatPrice(product.price, product.discount)}
                  </Text>
                  {product.discount > 0 && (
                    <View style={styles.discountBadgeList}>
                      <Text style={styles.discountText}>
                        {product.discount}% OFF
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.ratingRow}>
                  <Ionicons name="star" size={12} color={colors.secondary} />
                  <Text style={styles.ratingText}>
                    {product.rating !== null &&
                      product.rating !== undefined &&
                      product.rating > 0
                      ? product.rating.toFixed(1)
                      : "No rating"}
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
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Ionicons name="cart" size={18} color="#fff" />
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </Pressable>

        {/* Variant Selection Modal */}
        <Modal
          visible={showVariantModal}
          animationType="fade"
          transparent
          onRequestClose={() => setShowVariantModal(false)}
        >
          <View style={styles.variantOverlay}>
            <View style={styles.variantModal}>
              <View style={styles.variantHeader}>
                <Text style={styles.variantTitle}>Select Options</Text>
                <Pressable
                  onPress={() => setShowVariantModal(false)}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={20} color={colors.dark} />
                </Pressable>
              </View>

              {product.colors && product.colors.length > 0 && (
                <View style={styles.variantSection}>
                  <Text style={styles.variantLabel}>
                    {product.colors.length > 1 ? "Color *" : "Color"}
                  </Text>
                  <View style={styles.variantOptionsRow}>
                    {product.colors.map((colorName, index) => {
                      const COLOR_MAP = {
                        Black: "#000000",
                        White: "#FFFFFF",
                        Red: "#EF4444",
                        Blue: "#3B82F6",
                        Green: "#10B981",
                        Yellow: "#F59E0B",
                        Purple: "#8B5CF6",
                        Pink: "#EC4899",
                        Orange: "#F97316",
                        Brown: "#92400E",
                        Gray: "#6B7280",
                        Navy: "#1E3A8A",
                      };
                      const isSelected = selectedColor === colorName;
                      return (
                        <Pressable
                          key={index}
                          onPress={() => setSelectedColor(colorName)}
                          style={[
                            styles.colorOption,
                            isSelected && styles.colorOptionSelected,
                          ]}
                        >
                          <View
                            style={[
                              styles.smallColorDot,
                              {
                                backgroundColor: COLOR_MAP[colorName] || "#CCC",
                              },
                              isSelected && styles.smallColorDotSelected,
                            ]}
                          />
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              {product.sizes && product.sizes.length > 0 && (
                <View style={styles.variantSection}>
                  <Text style={styles.variantLabel}>
                    {product.sizes.length > 1 ? "Size *" : "Size"}
                  </Text>
                  <View style={styles.variantOptionsRow}>
                    {product.sizes.map((size, index) => {
                      const isSelected = selectedSize === size;
                      return (
                        <Pressable
                          key={index}
                          onPress={() => setSelectedSize(size)}
                          style={[
                            styles.sizeOption,
                            isSelected && styles.sizeOptionSelected,
                          ]}
                        >
                          <Text
                            style={[
                              styles.sizeOptionText,
                              isSelected && styles.sizeOptionTextSelected,
                            ]}
                          >
                            {size}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              <Pressable
                style={styles.variantAddButton}
                onPress={handleConfirmAddToCart}
              >
                <LinearGradient
                  colors={[colors.primary, colors.accent]}
                  style={styles.variantAddGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Text style={styles.variantAddText}>Add to Cart</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </Modal>
      </>
    );
  }

  return (
    <>
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
          {product.discount > 0 && (
            <View style={styles.discountBadge}>
              <Text style={styles.discountText}>{product.discount}% OFF</Text>
            </View>
          )}
        </View>
        <View style={styles.content}>
          <View style={styles.vendorRow}>
            <Text style={compact ? styles.vendorCompact : styles.vendor}>
              {product.seller?.name || product.vendor}
            </Text>
            {product.seller?.badges && product.seller.badges.length > 0 && (
              <View style={styles.sellerBadge}>
                {(() => {
                  const badge = SELLER_BADGE_CONFIG[product.seller.badges[0]];
                  return badge ? (
                    <Ionicons name={badge.icon} size={compact ? 10 : 12} color={badge.color} />
                  ) : null;
                })()}
              </View>
            )}
          </View>
          <Text numberOfLines={1} style={compact ? styles.titleCompact : styles.title}>
            {product.title}
          </Text>
          <View style={styles.badgeRow}>
            {product.badges?.slice(0, 2).map((label) => (
              <View key={label} style={styles.badge}>
                <Text numberOfLines={1} style={compact ? styles.badgeTextCompact : styles.badgeText}>
                  {label}
                </Text>
              </View>
            ))}
          </View>
          <View style={styles.metaRow}>
            <Text style={compact ? styles.priceCompact : styles.price}>
              {formatPrice(product.price, product.discount)}
            </Text>
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={compact ? 12 : 14} color={colors.secondary} />
              <Text style={compact ? styles.ratingTextCompact : styles.ratingText}>
                {product.rating && product.rating > 0
                  ? product.rating.toFixed(1)
                  : "New"}
              </Text>
            </View>
          </View>
          {!hideCta && (
            <Pressable
              style={styles.cta}
              onPress={handleAdd}
              accessibilityLabel="Add to cart"
            >
              <LinearGradient
                colors={[colors.primary, colors.accent]}
                style={styles.ctaGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Ionicons name="cart" size={16} color="#fff" />
                <Text style={styles.ctaText}>Add to Cart</Text>
              </LinearGradient>
            </Pressable>
          )}
        </View>
      </Pressable>

      {/* Variant Selection Modal */}
      <Modal
        visible={showVariantModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowVariantModal(false)}
      >
        <View style={styles.variantOverlay}>
          <View style={styles.variantModal}>
            <View style={styles.variantHeader}>
              <Text style={styles.variantTitle}>Select Options</Text>
              <Pressable onPress={() => setShowVariantModal(false)} hitSlop={8}>
                <Ionicons name="close" size={20} color={colors.dark} />
              </Pressable>
            </View>

            {product.colors && product.colors.length > 0 && (
              <View style={styles.variantSection}>
                <Text style={styles.variantLabel}>
                  {product.colors.length > 1 ? "Color *" : "Color"}
                </Text>
                <View style={styles.variantOptionsRow}>
                  {product.colors.map((colorName, index) => {
                    const COLOR_MAP = {
                      Black: "#000000",
                      White: "#FFFFFF",
                      Red: "#EF4444",
                      Blue: "#3B82F6",
                      Green: "#10B981",
                      Yellow: "#F59E0B",
                      Purple: "#8B5CF6",
                      Pink: "#EC4899",
                      Orange: "#F97316",
                      Brown: "#92400E",
                      Gray: "#6B7280",
                      Navy: "#1E3A8A",
                    };
                    const isSelected = selectedColor === colorName;
                    return (
                      <Pressable
                        key={index}
                        onPress={() => setSelectedColor(colorName)}
                        style={[
                          styles.colorOption,
                          isSelected && styles.colorOptionSelected,
                        ]}
                      >
                        <View
                          style={[
                            styles.smallColorDot,
                            { backgroundColor: COLOR_MAP[colorName] || "#CCC" },
                            isSelected && styles.smallColorDotSelected,
                          ]}
                        />
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {product.sizes && product.sizes.length > 0 && (
              <View style={styles.variantSection}>
                <Text style={styles.variantLabel}>
                  {product.sizes.length > 1 ? "Size *" : "Size"}
                </Text>
                <View style={styles.variantOptionsRow}>
                  {product.sizes.map((size, index) => {
                    const isSelected = selectedSize === size;
                    return (
                      <Pressable
                        key={index}
                        onPress={() => setSelectedSize(size)}
                        style={[
                          styles.sizeOption,
                          isSelected && styles.sizeOptionSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.sizeOptionText,
                            isSelected && styles.sizeOptionTextSelected,
                          ]}
                        >
                          {size}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            <Pressable
              style={styles.variantAddButton}
              onPress={handleConfirmAddToCart}
            >
              <LinearGradient
                colors={[colors.primary, colors.accent]}
                style={styles.variantAddGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.variantAddText}>Add to Cart</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  card: {
    minWidth: 165,
    height: 300,
    backgroundColor: "#fff",
    borderRadius: 24,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
    overflow: "hidden",
  },
  listCard: {
    flexDirection: "row",
    height: 150,
    alignItems: "stretch",
    borderRadius: 20,
  },
  imageContainer: {
    position: "relative",
    width: "100%",
    height: 140,
    backgroundColor: "#F8FAFC",
  },
  image: {
    width: 165,
    height: 140,
  },
  imageIndicators: {
    position: "absolute",
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 4,
  },
  imageIndicator: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255, 255, 255, 0.5)",
  },
  imageIndicatorActive: {
    backgroundColor: "#fff",
    width: 16,
  },
  listImageContainer: {
    position: "relative",
    width: 130,
    marginRight: 12,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#F8FAFC",
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
    padding: 14,
    paddingTop: 12,
    flex: 1,
  },
  vendorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  vendor: {
    fontSize: 11,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontWeight: "600",
  },
  vendorCompact: {
    fontSize: 9,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    fontWeight: "600",
  },
  sellerBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#F0FDF4",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.dark,
    marginTop: 4,
    letterSpacing: -0.2,
  },
  titleCompact: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.dark,
    marginTop: 3,
    letterSpacing: -0.2,
  },
  badgeRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "nowrap",
    marginTop: 6,
    overflow: "hidden",
  },
  badge: {
    backgroundColor: "#EEF2FF",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 1,
  },
  badgeText: {
    fontSize: 10,
    color: colors.primary,
    fontWeight: "600",
    numberOfLines: 1,
  },
  badgeTextCompact: {
    fontSize: 8,
    color: colors.primary,
    fontWeight: "600",
    numberOfLines: 1,
  },
  metaRow: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  price: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.dark,
    letterSpacing: -0.3,
  },
  priceCompact: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.dark,
    letterSpacing: -0.3,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#FEF9C3",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
  },
  ratingText: {
    fontWeight: "700",
    fontSize: 12,
    color: "#92400E",
  },
  ratingTextCompact: {
    fontWeight: "700",
    fontSize: 10,
    color: "#92400E",
  },
  cta: {
    marginTop: 10,
  },
  ctaGradient: {
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  ctaText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
  listContent: {
    flex: 1,
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingRight: 8,
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
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  variantOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  variantModal: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
    maxHeight: "55%",
  },
  variantHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  variantTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.dark,
  },
  variantSection: {
    marginBottom: 18,
  },
  variantLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.dark,
    marginBottom: 10,
  },
  variantOptionsRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  colorOption: {
    padding: 3,
  },
  colorOptionSelected: {
    opacity: 1,
  },
  smallColorDot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  smallColorDotSelected: {
    borderColor: colors.primary,
    borderWidth: 3,
  },
  sizeOption: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    backgroundColor: "#fff",
    minWidth: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  sizeOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: "#EEF2FF",
  },
  sizeOptionText: {
    fontSize: 13,
    color: colors.dark,
    fontWeight: "600",
  },
  sizeOptionTextSelected: {
    color: colors.primary,
    fontWeight: "700",
  },
  variantAddButton: {
    marginTop: 20,
    borderRadius: 14,
    overflow: "hidden",
  },
  variantAddGradient: {
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  variantAddText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  discountBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: "#EF4444",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  discountBadgeList: {
    backgroundColor: "#EF4444",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginLeft: 8,
  },
  discountText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.3,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
  },
});
