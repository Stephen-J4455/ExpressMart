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
import { FlashSaleBadge } from "./FlashSaleBadge";
import { FlashSaleCountdown } from "./FlashSaleCountdown";

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

// Display order of seller badges — verified always first
const SELLER_BADGE_PRIORITY = [
  "verified",
  "top_seller",
  "premium",
  "fast_shipping",
  "trending",
  "eco_friendly",
  "local",
];

const PRODUCT_BADGE_CONFIG = {
  free_shipping: { icon: "rocket", color: "#3B82F6", label: "Free Shipping" },
  flash_deal: { icon: "flash", color: "#EF4444", label: "Flash Deal" },
  new_arrival: {
    icon: "sparkles-outline",
    color: "#8B5CF6",
    label: "New Arrival",
  },
  bestseller: { icon: "trophy", color: "#F59E0B", label: "Bestseller" },
  limited_stock: {
    icon: "alert-circle",
    color: "#DC2626",
    label: "Limited Stock",
  },
  top_rated: { icon: "star", color: "#EAB308", label: "Top Rated" },
  featured: { icon: "star", color: "#22C55E", label: "Featured" },
};

const toBoolean = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }
  return false;
};

export const ProductCard = ({
  product,
  style,
  variant = "grid",
  onPress,
  hideCta,
  compact,
  flashSale,
  theme,
}) => {
  const { addToCart } = useCart();
  const toast = useToast();
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [showVariantModal, setShowVariantModal] = useState(false);
  const [selectedColor, setSelectedColor] = useState(null);
  const [selectedSize, setSelectedSize] = useState(null);
  const hasInventoryValue =
    product?.quantity != null ||
    product?.stock != null ||
    product?.stock_quantity != null;
  const availableStock = Number(
    product?.quantity ?? product?.stock ?? product?.stock_quantity ?? 0,
  );
  const allowsBackorder = toBoolean(product?.allow_backorder);
  const isOutOfStock =
    hasInventoryValue && availableStock <= 0 && !allowsBackorder;

  // Determine actual price (flash sale price takes priority)
  const actualPrice = flashSale?.flash_price || product.price;
  const hasFlashSale = !!flashSale && new Date(flashSale.end_time) > new Date();
  const displayDiscount = hasFlashSale
    ? flashSale.discount_percentage
    : product.discount;

  const formatPrice = (price, discount = 0) => {
    // If there's a flash sale, use flash sale price directly
    if (hasFlashSale) {
      return `GH₵${Number(flashSale.flash_price || 0).toLocaleString()}`;
    }
    const discountedPrice = discount > 0 ? price * (1 - discount / 100) : price;
    return `GH₵${Number(discountedPrice || 0).toLocaleString()}`;
  };

  const handleAdd = (e) => {
    e?.stopPropagation?.();

    if (isOutOfStock) {
      toast.error("Out of Stock", "This product is currently unavailable");
      return;
    }

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
      addToCart(
        product,
        1,
        null,
        null,
        hasFlashSale ? flashSale.flash_price : null,
      );
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

    addToCart(
      product,
      1,
      selectedSize,
      selectedColor,
      hasFlashSale ? flashSale.flash_price : null,
    );
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

  // theme is an object from colors.getTheme() or undefined
  const themeObj = theme || {
    primary: colors.primary,
    gradientStart: colors.primary,
    gradientEnd: colors.primaryLight,
    accent: colors.primary,
  };
  const accent = themeObj.primary;
  const accentEnd =
    themeObj.gradientEnd || themeObj.gradientStart || colors.primary;
  const accentColor = themeObj.accent || themeObj.primary;

  if (variant === "list") {
    return (
      <>
        <Pressable
          style={[
            styles.card,
            styles.listCard,
            isOutOfStock && styles.outOfStockCard,
            style,
          ]}
          onPress={onPress}
        >
          <View style={styles.listImageContainer}>
            {hasFlashSale && (
              <FlashSaleBadge
                discountPercentage={flashSale.discount_percentage}
                position="top-left"
              />
            )}
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
            {isOutOfStock && (
              <View style={styles.outOfStockOverlay}>
                <Text style={styles.outOfStockOverlayText}>Out of Stock</Text>
              </View>
            )}
          </View>
          <View style={styles.listContent}>
            <View style={styles.listTop}>
              <View style={{ flex: 1 }}>
                <View style={styles.vendorRow}>
                  <Text style={styles.vendor} numberOfLines={1}>
                    {product.seller?.name || product.vendor}
                  </Text>
                  {SELLER_BADGE_PRIORITY.filter((id) =>
                    product.seller?.badges?.includes(id),
                  )
                    .slice(0, 2)
                    .map((id) => {
                      const b = SELLER_BADGE_CONFIG[id];
                      return (
                        <Ionicons
                          key={id}
                          name={b.icon}
                          size={12}
                          color={b.color}
                        />
                      );
                    })}
                </View>
                <Text numberOfLines={2} style={styles.title}>
                  {product.title}
                </Text>
                {(() => {
                  const productBadges = product.badges || [];
                  const sellerBadges = product.seller?.badges || [];
                  const displayBadges =
                    productBadges.length > 0 ? productBadges : sellerBadges;
                  if (displayBadges.length === 0) return null;
                  return (
                    <View style={styles.badgeRow}>
                      {displayBadges.slice(0, 2).map((label) => {
                        const normalized = label.toLowerCase();
                        const cfg =
                          PRODUCT_BADGE_CONFIG[normalized] ||
                          SELLER_BADGE_CONFIG[normalized];
                        const displayLabel = cfg?.label || label;
                        return (
                          <View
                            key={label}
                            style={[
                              styles.badge,
                              {
                                backgroundColor:
                                  (cfg?.color || accentColor) + "20",
                              },
                            ]}
                          >
                            {cfg?.icon && (
                              <Ionicons
                                name={cfg.icon}
                                size={10}
                                color={cfg?.color || accentColor}
                              />
                            )}
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.badgeText,
                                { color: cfg?.color || accentColor },
                              ]}
                            >
                              {displayLabel}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  );
                })()}
              </View>
            </View>
            <View style={styles.listBottom}>
              <View style={{ flex: 1 }}>
                {hasFlashSale && (
                  <FlashSaleCountdown
                    endTime={flashSale.end_time}
                    startTime={flashSale.start_time}
                    compact
                    availableQty={
                      flashSale.max_quantity != null
                        ? Math.max(
                            0,
                            (flashSale.max_quantity || 0) -
                              (flashSale.sold_quantity || 0),
                          )
                        : null
                    }
                  />
                )}
                <View style={styles.priceRow}>
                  {hasFlashSale && (
                    <Text style={styles.originalPriceList}>
                      GH₵
                      {Number(
                        flashSale.original_price || product.price,
                      ).toLocaleString()}
                    </Text>
                  )}
                  <Text style={styles.price}>
                    {formatPrice(product.price, product.discount)}
                  </Text>
                  {hasFlashSale ? (
                    <View style={styles.discountBadgeList}>
                      <LinearGradient
                        colors={["#EF4444", "#DC2626"]}
                        style={styles.flashBadgeGradient}
                      >
                        <Ionicons name="flash" size={10} color="#fff" />
                        <Text style={styles.discountText}>
                          {Math.round(flashSale.discount_percentage)}% OFF
                        </Text>
                      </LinearGradient>
                    </View>
                  ) : (
                    product.discount > 0 && (
                      <View style={styles.discountBadgeList}>
                        <Text style={styles.discountText}>
                          {product.discount}% OFF
                        </Text>
                      </View>
                    )
                  )}
                </View>
                <View style={styles.ratingRow}>
                  <Ionicons name="star" size={12} color={accentColor} />
                  <Text style={[styles.ratingText, { color: accentColor }]}>
                    {product.rating !== null &&
                    product.rating !== undefined &&
                    product.rating > 0
                      ? product.rating.toFixed(1)
                      : "No rating"}
                  </Text>
                </View>
                {hasFlashSale && flashSale.max_quantity != null && (
                  <Text style={styles.availableText}>
                    {Math.max(
                      0,
                      (flashSale.max_quantity || 0) -
                        (flashSale.sold_quantity || 0),
                    )}{" "}
                    left
                  </Text>
                )}
              </View>
              {!hasFlashSale && (
                <Pressable
                  style={[styles.listCta, isOutOfStock && styles.ctaDisabled]}
                  onPress={handleAdd}
                  disabled={isOutOfStock}
                  accessibilityLabel="Add to cart"
                >
                  <View
                    style={[
                      styles.listCtaGradient,
                      {
                        backgroundColor: isOutOfStock
                          ? "#9CA3AF"
                          : themeObj.primary || accent,
                      },
                    ]}
                  >
                    <Ionicons
                      name={isOutOfStock ? "close-circle" : "cart"}
                      size={18}
                      color="#fff"
                    />
                  </View>
                </Pressable>
              )}
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
                              isSelected && {
                                borderColor: accent,
                                borderWidth: 3,
                              },
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
                            isSelected && {
                              borderColor: accent,
                              backgroundColor: "#EEF2FF",
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.sizeOptionText,
                              isSelected && {
                                color: accent,
                                fontWeight: "700",
                              },
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
                <View
                  style={[
                    styles.variantAddGradient,
                    { backgroundColor: themeObj.primary || accent },
                  ]}
                >
                  <Text style={styles.variantAddText}>Add to Cart</Text>
                </View>
              </Pressable>
            </View>
          </View>
        </Modal>
      </>
    );
  }

  return (
    <>
      <Pressable
        style={[styles.card, isOutOfStock && styles.outOfStockCard, style]}
        onPress={onPress}
      >
        <View style={styles.imageContainer}>
          <Image source={{ uri: images[0] }} style={styles.image} />
          {hasFlashSale ? (
            <FlashSaleBadge
              discountPercentage={flashSale.discount_percentage}
              position="top-left"
            />
          ) : (
            product.discount > 0 && (
              <View style={styles.discountBadge}>
                <Text style={styles.discountText}>{product.discount}% OFF</Text>
              </View>
            )
          )}
          {isOutOfStock && (
            <View style={styles.outOfStockOverlay}>
              <Text style={styles.outOfStockOverlayText}>Out of Stock</Text>
            </View>
          )}
        </View>
        <View style={styles.content}>
          <View style={styles.vendorRow}>
            <Text
              style={compact ? styles.vendorCompact : styles.vendor}
              numberOfLines={1}
            >
              {product.seller?.name || product.vendor}
            </Text>
            {SELLER_BADGE_PRIORITY.filter((id) =>
              product.seller?.badges?.includes(id),
            )
              .slice(0, 2)
              .map((id) => {
                const b = SELLER_BADGE_CONFIG[id];
                return (
                  <Ionicons
                    key={id}
                    name={b.icon}
                    size={compact ? 10 : 12}
                    color={b.color}
                  />
                );
              })}
          </View>
          <Text
            numberOfLines={1}
            style={compact ? styles.titleCompact : styles.title}
          >
            {product.title}
          </Text>
          {(() => {
            const productBadges = product.badges || [];
            const sellerBadges = product.seller?.badges || [];
            const displayBadges =
              productBadges.length > 0 ? productBadges : sellerBadges;
            if (displayBadges.length === 0) return null;
            return (
              <View style={styles.badgeRow}>
                {displayBadges.slice(0, 2).map((label) => {
                  const normalized = label.toLowerCase();
                  const cfg =
                    PRODUCT_BADGE_CONFIG[normalized] ||
                    SELLER_BADGE_CONFIG[normalized];
                  const displayLabel = cfg?.label || label;
                  return (
                    <View
                      key={label}
                      style={[
                        styles.badge,
                        {
                          backgroundColor: (cfg?.color || accentColor) + "20",
                        },
                      ]}
                    >
                      {cfg?.icon && (
                        <Ionicons
                          name={cfg.icon}
                          size={compact ? 9 : 10}
                          color={cfg?.color || accentColor}
                        />
                      )}
                      <Text
                        numberOfLines={1}
                        style={[
                          compact ? styles.badgeTextCompact : styles.badgeText,
                          { color: cfg?.color || accentColor },
                        ]}
                      >
                        {displayLabel}
                      </Text>
                    </View>
                  );
                })}
              </View>
            );
          })()}
          <View style={styles.metaRow}>
            <View style={{ flex: 1 }}>
              {hasFlashSale && (
                <Text style={styles.originalPrice}>
                  GH₵
                  {Number(
                    flashSale.original_price || product.price,
                  ).toLocaleString()}
                </Text>
              )}
              <Text style={compact ? styles.priceCompact : styles.price}>
                {formatPrice(product.price, product.discount)}
              </Text>
            </View>
            <View style={styles.ratingRow}>
              <Ionicons
                name="star"
                size={compact ? 12 : 14}
                color={accentColor}
              />
              <Text
                style={[
                  compact ? styles.ratingTextCompact : styles.ratingText,
                  { color: accentColor },
                ]}
              >
                {product.rating && product.rating > 0
                  ? product.rating.toFixed(1)
                  : "New"}
              </Text>
            </View>
          </View>
          {hasFlashSale && (
            <FlashSaleCountdown
              endTime={flashSale.end_time}
              startTime={flashSale.start_time}
              withProgressBar
              mini
              availableQty={
                flashSale.max_quantity != null
                  ? Math.max(
                      0,
                      (flashSale.max_quantity || 0) -
                        (flashSale.sold_quantity || 0),
                    )
                  : null
              }
            />
          )}
          {!hideCta && !hasFlashSale && (
            <Pressable
              style={[styles.cta, isOutOfStock && styles.ctaDisabled]}
              onPress={handleAdd}
              disabled={isOutOfStock}
              accessibilityLabel="Add to cart"
            >
              <View
                style={[
                  styles.ctaGradient,
                  {
                    backgroundColor: isOutOfStock
                      ? "#9CA3AF"
                      : themeObj.primary || accent,
                  },
                ]}
              >
                <Ionicons
                  name={isOutOfStock ? "close-circle" : "cart"}
                  size={16}
                  color="#fff"
                />
                <Text style={styles.ctaText}>
                  {isOutOfStock ? "Out of Stock" : "Add to Cart"}
                </Text>
              </View>
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
              <View
                style={[
                  styles.variantAddGradient,
                  { backgroundColor: themeObj.primary || accent },
                ]}
              >
                <Text style={styles.variantAddText}>Add to Cart</Text>
              </View>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  outOfStockCard: {
    opacity: 0.72,
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
    height: 170,
    backgroundColor: "#F8FAFC",
  },
  outOfStockOverlay: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "rgba(31,41,55,0.9)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  outOfStockOverlayText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  image: {
    width: "100%",
    height: 170,
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
    padding: 12,
    paddingTop: 10,
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
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
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
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.08)",
    flexShrink: 1,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  badgeTextCompact: {
    fontSize: 9,
    fontWeight: "600",
  },
  metaRow: {
    marginTop: 8,
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
  originalPrice: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
    textDecorationLine: "line-through",
    marginBottom: 2,
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
    marginTop: 8,
  },
  ctaDisabled: {
    opacity: 1,
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
  flashBadgeGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  originalPriceList: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
    textDecorationLine: "line-through",
    marginRight: 6,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
  },
});
