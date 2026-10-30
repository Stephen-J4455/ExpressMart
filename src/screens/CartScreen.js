import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useToast } from "../context/ToastContext";
import { useShop } from "../context/ShopContext";
import { useAds } from "../context/AdsContext";
import { AdRenderer } from "../components/AdBanner";
import { FeedProductCard } from "../components/FeedProductCard";
import { SectionHeader } from "../components/SectionHeader";
import { supabase } from "../lib/supabase";
import { useResponsive } from "../hooks/useResponsive";
import { useGrounding } from "../hooks/useGrounding";
import { useTheme } from "../context/ThemeContext";
import { useAppStyles } from "../hooks/useAppStyles";
import { radius } from "../theme/colors";
import { showTabBar, updateTabBarOnScroll } from "../utils/tabBarAutoHide";

// Map color names to hex values
const colorMap = {
  red: "#EF4444",
  blue: "#3B82F6",
  green: "#22C55E",
  yellow: "#EAB308",
  orange: "#F97316",
  purple: "#A855F7",
  pink: "#EC4899",
  black: "#1F2937",
  white: "#FFFFFF",
  gray: "#6B7280",
  grey: "#6B7280",
  brown: "#92400E",
  navy: "#1E3A5A",
  "navy blue": "#1E3A5A",
  "sky blue": "#38BDF8",
  "light blue": "#7DD3FC",
  "dark blue": "#1E40AF",
  teal: "#14B8A6",
  cyan: "#06B6D4",
  maroon: "#7F1D1D",
  beige: "#D4B896",
  cream: "#FFFDD0",
  gold: "#CA8A04",
  silver: "#A8A29E",
  olive: "#65A30D",
  coral: "#F87171",
  mint: "#86EFAC",
  lavender: "#C4B5FD",
  burgundy: "#881337",
  turquoise: "#2DD4BF",
  khaki: "#BEA77F",
  charcoal: "#374151",
  ivory: "#FFFFF0",
  peach: "#FDBA74",
  rose: "#FB7185",
  wine: "#7F1D1D",
  tan: "#D2B48C",
  nude: "#E8C4A2",
  multicolor:
    "linear-gradient(90deg, #EF4444, #F97316, #EAB308, #22C55E, #3B82F6, #A855F7)",
  multi: "#CBD5E1",
};

const getColorHex = (colorName) => {
  if (!colorName) return "#CBD5E1";
  const lowerColor = colorName.toLowerCase().trim();
  return colorMap[lowerColor] || "#CBD5E1";
};

export const CartScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { user, isAuthenticated } = useAuth();
  const { items, total, updateQuantity, removeFromCart, clearCart } = useCart();
  const { products } = useShop();
  const { fetchAdsByPlacement } = useAds();
  const toast = useToast();
  const { isWide, contentMaxWidth } = useResponsive();
  const { colors: themeColors } = useTheme();
  const styles = useAppStyles((c) => buildCartStyles(c));

  // AI grounding ref — lets the assistant point at the checkout button.
  const checkoutBtnRef = useGrounding("cart.checkoutButton");

  // ── Bottom tab bar auto-hide (direction-aware) ────────────────────────────
  // Same convention as Home/Feed: swipe up hides the bar, swipe down or
  // being near the top reveals it again. Arriving on the tab always shows
  // the bar so it never starts hidden.
  const handleCartScroll = useCallback((e) => {
    updateTabBarOnScroll(e.nativeEvent.contentOffset.y);
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => showTabBar());
    return unsubscribe;
  }, [navigation]);

  // ── Per-item pending actions (loading animations) ──────────────────────────
  // Maps item.id → "remove" | "inc" | "dec" while the async cart operation
  // (DB sync + cart reload) is in flight, so the exact button the user tapped
  // shows a spinner instead of the icon.
  const [pendingItemActions, setPendingItemActions] = useState({});

  const setItemPending = useCallback((itemId, action) => {
    setPendingItemActions((prev) => {
      const next = { ...prev };
      if (action) next[itemId] = action;
      else delete next[itemId];
      return next;
    });
  }, []);

  const handleRemoveItem = useCallback(
    async (item) => {
      if (pendingItemActions[item.id]) return; // one action at a time per item
      setItemPending(item.id, "remove");
      try {
        await removeFromCart(item.product.id, item.size, item.color, item.id);
      } finally {
        // Item unmounts on success; the state cleanup is harmless then.
        setItemPending(item.id, null);
      }
    },
    [pendingItemActions, removeFromCart, setItemPending],
  );

  const handleChangeQuantity = useCallback(
    async (item, nextQuantity, action) => {
      if (pendingItemActions[item.id]) return;
      setItemPending(item.id, action);
      try {
        await updateQuantity(item.product.id, nextQuantity, item.id);
      } finally {
        setItemPending(item.id, null);
      }
    },
    [pendingItemActions, updateQuantity, setItemPending],
  );

  // ── Empty-cart discovery content: ads, liked products, trending feed ──
  const [cartAds, setCartAds] = useState([]);
  const [likedProducts, setLikedProducts] = useState([]);

  useEffect(() => {
    if (items.length > 0) return; // only needed for the empty state
    fetchAdsByPlacement("cart").then((ads) => setCartAds(ads || []));
  }, [items.length, fetchAdsByPlacement]);

  useEffect(() => {
    if (!user || !supabase) {
      setLikedProducts([]);
      return;
    }
    let mounted = true;
    // Liked products: wishlist rows joined to product data (same two-step
    // pattern as WishlistScreen — no FK join available).
    (async () => {
      try {
        const { data: wishes } = await supabase
          .from("express_wishlists")
          .select("product_id")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10);
        const ids = (wishes || []).map((w) => w.product_id);
        if (!mounted) return;
        if (ids.length === 0) {
          setLikedProducts([]);
          return;
        }
        const { data: prods } = await supabase
          .from("express_products")
          .select("*, seller_id(id,name,avatar,rating,total_ratings,badges)")
          .in("id", ids)
          .eq("status", "active");
        if (!mounted) return;
        const mapped = (prods || []).map((p) => ({
          ...p,
          seller: p.seller_id,
        }));
        // Preserve wishlist recency order.
        const order = new Map(ids.map((id, i) => [id, i]));
        mapped.sort(
          (a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99),
        );
        setLikedProducts(mapped);
      } catch (e) {
        console.warn("[CartScreen] liked products load failed:", e?.message);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [user]);

  // Trending fallback: top-rated/discounted products from the shop feed.
  const trendingProducts = useMemo(() => {
    return [...products]
      .sort((a, b) => {
        const scoreA = Number(a.rating || 0) * 10 + Number(a.discount || 0);
        const scoreB = Number(b.rating || 0) * 10 + Number(b.discount || 0);
        return scoreB - scoreA;
      })
      .slice(0, 8);
  }, [products]);
  const getAvailableStock = (product) =>
    Number(product?.quantity ?? product?.stock ?? 0);
  const hasInventoryValue = (product) =>
    product?.quantity != null || product?.stock != null;
  const hasOutOfStockItems = items.some(
    ({ product }) =>
      hasInventoryValue(product) &&
      getAvailableStock(product) <= 0 &&
      !product?.allow_backorder,
  );

  const handleCheckout = () => {
    if (hasOutOfStockItems) {
      toast.warning(
        "Unavailable items",
        "Remove out-of-stock items before checkout.",
      );
      return;
    }

    if (!isAuthenticated) {
      navigation.navigate("Auth", {
        redirectTo: "Cart",
      });
    } else {
      navigation.navigate("Checkout");
    }
  };

  // Total savings across all items (base price vs. effective price paid).
  // Declared BEFORE the early return below so the hook count stays constant
  // on every render (otherwise the empty-cart branch renders fewer hooks).
  const totalSavings = useMemo(() => {
    return items.reduce((sum, { product, price, quantity }) => {
      const effective =
        price != null && price > 0
          ? price
          : product.discount > 0
            ? product.price * (1 - product.discount / 100)
            : product.price;
      const base = Number(product.price || 0);
      const diff = (base - effective) * (quantity || 1);
      return sum + (diff > 0 ? diff : 0);
    }, 0);
  }, [items]);

  if (!items.length) {
    // Never show a bare empty cart — render a discovery page with the empty
    // banner, ads, liked products and a trending feed instead.
    const discoveryFeed =
      likedProducts.length > 0 ? likedProducts : trendingProducts;
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Shopping Cart</Text>
            <View style={styles.itemCountBadge}>
              <Text style={styles.itemCountText}>0</Text>
            </View>
          </View>
          <Text style={styles.headerSubtitle}>
            Review your items before checkout
          </Text>
        </View>

        <ScrollView
          style={styles.itemList}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 0 }}
          onScroll={handleCartScroll}
          scrollEventThrottle={16}
        >
          {/* Empty banner */}
          <View style={styles.emptyBanner}>
            <View style={styles.emptyIconContainer}>
              <Ionicons
                name="cart-outline"
                size={44}
                color={themeColors.primary}
              />
            </View>
            <Text style={styles.emptyTitle}>Your cart is empty</Text>
            <Text style={styles.emptySubtitle}>
              Explore these picks while you decide what to add.
            </Text>
          </View>

          {/* Ads */}
          {cartAds.length > 0 && (
            <View style={styles.discoveryAdsWrap}>
              <AdRenderer ads={cartAds} />
            </View>
          )}

          {/* Liked products (falls back to trending when no wishlist) */}
          {discoveryFeed.length > 0 && (
            <>
              <SectionHeader
                title={
                  likedProducts.length > 0
                    ? "Liked products"
                    : "Trending right now"
                }
              />
              <View style={styles.discoveryFeedWrap}>
                {discoveryFeed.slice(0, 6).map((product) => (
                  <FeedProductCard
                    key={product.id}
                    product={product}
                    onPress={() =>
                      navigation.navigate("ProductDetail", { product })
                    }
                  />
                ))}
              </View>
            </>
          )}
        </ScrollView>
      </View>
    );
  }

  const summaryContent = (
    <View style={styles.summaryCard}>
      <View style={styles.summaryCardHeader}>
        <View style={styles.summaryCardHeaderLeft}>
          <Ionicons
            name="receipt-outline"
            size={18}
            color={themeColors.primary}
          />
          <Text style={styles.summaryCardTitle}>Order Summary</Text>
        </View>
        <View style={styles.summaryItemCountBadge}>
          <Text style={styles.summaryItemCountText}>
            {items.length} {items.length === 1 ? "item" : "items"}
          </Text>
        </View>
      </View>

      <View style={styles.summaryDivider} />

      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Subtotal</Text>
        <Text style={styles.summaryValue}>GH₵{total.toLocaleString()}</Text>
      </View>

      {totalSavings > 0 && (
        <View style={styles.summaryRow}>
          <Text style={styles.savingsLabel}>
            <Ionicons name="pricetag-outline" size={13} color="#10B981" /> You
            save
          </Text>
          <Text style={styles.savingsValue}>
            -GH₵{totalSavings.toLocaleString()}
          </Text>
        </View>
      )}

      <View style={styles.shippingHintContainer}>
        <Ionicons
          name="information-circle-outline"
          size={14}
          color={themeColors.primary}
        />
        <Text style={styles.shippingHint}>
          Shipping & service fees calculated at checkout
        </Text>
      </View>

      {hasOutOfStockItems && (
        <View style={styles.stockWarningContainer}>
          <Ionicons name="alert-circle-outline" size={14} color="#B91C1C" />
          <Text style={styles.stockWarningText}>
            Some items are out of stock. Remove them before checkout.
          </Text>
        </View>
      )}

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue}>GH₵{total.toLocaleString()}</Text>
      </View>

      <Pressable ref={checkoutBtnRef} style={styles.checkout} onPress={handleCheckout}>
        <LinearGradient
          colors={
            hasOutOfStockItems
              ? [themeColors.muted, themeColors.muted]
              : [themeColors.primary, themeColors.accent]
          }
          style={styles.checkoutGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <Ionicons name="lock-closed" size={18} color="#fff" />
          <Text style={styles.checkoutText}>Proceed to Checkout</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );

  const summaryStyle = isWide
    ? styles.summaryWide
    : [styles.summary, { paddingBottom: insets.bottom + 16 }];

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Shopping Cart</Text>
          <View style={styles.itemCountBadge}>
            <Text style={styles.itemCountText}>{items.length}</Text>
          </View>
        </View>
        <Text style={styles.headerSubtitle}>
          Review your items before checkout
        </Text>
      </View>

      <View style={isWide ? styles.wideBody : styles.mobileBody}>
        <ScrollView
          style={isWide ? styles.itemListWide : styles.itemList}
          showsVerticalScrollIndicator={false}
          onScroll={handleCartScroll}
          scrollEventThrottle={16}
        >
          {items.map(({ id, product, quantity, size, color, price }) => {
            const knownInventory = hasInventoryValue(product);
            const maxStock = getAvailableStock(product);
            const isOutOfStock =
              knownInventory && maxStock <= 0 && !product?.allow_backorder;
            const isMaxStockReached =
              knownInventory &&
              !product?.allow_backorder &&
              maxStock > 0 &&
              quantity >= maxStock;

            // Resolve effective unit price: stored price (may be flash-sale or discounted),
            // falling back to a discount-based calculation, or base price.
            const effectivePrice =
              price != null && price > 0
                ? price
                : product.discount > 0
                  ? product.price * (1 - product.discount / 100)
                  : product.price;

            // Determine whether any price reduction was applied vs the base product price.
            const hasReduction = effectivePrice < product.price - 0.001; // small epsilon for float safety
            const isFlashSaleItem = hasReduction && !(product.discount > 0);
            const reductionPct = hasReduction
              ? Math.round((1 - effectivePrice / product.price) * 100)
              : 0;

            return (
              <View
                key={id}
                style={[
                  styles.itemCard,
                  isOutOfStock && styles.itemCardOutOfStock,
                  pendingItemActions[id] === "remove" && styles.itemCardRemoving,
                ]}
              >
                <Pressable
                  style={styles.itemRow}
                  onPress={() =>
                    navigation.navigate("ProductDetail", { product })
                  }
                >
                  <View style={styles.thumbnailContainer}>
                    <Image
                      source={{
                        uri: product.thumbnail || product.thumbnails?.[0],
                      }}
                      style={styles.thumbnail}
                      resizeMode="cover"
                    />
                    {hasReduction && (
                      <View
                        style={[
                          styles.discountBadge,
                          isFlashSaleItem && styles.flashBadge,
                        ]}
                      >
                        <Text style={styles.discountText}>
                          {isFlashSaleItem ? "\u26a1" : ""}-{reductionPct}%
                        </Text>
                      </View>
                    )}
                    {isOutOfStock && (
                      <View style={styles.outOfStockBadge}>
                        <Text style={styles.outOfStockBadgeText}>
                          Out of Stock
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.itemContent}>
                    <Text style={styles.title} numberOfLines={2}>
                      {product.title}
                    </Text>
                    {(size || color) && (
                      <View style={styles.specsRow}>
                        {size && (
                          <View style={styles.specBadge}>
                            <Ionicons
                              name="resize"
                              size={10}
                              color={themeColors.primary}
                            />
                            <Text style={styles.specText}>{size}</Text>
                          </View>
                        )}
                        {color && (
                          <View style={styles.specBadge}>
                            <View
                              style={[
                                styles.colorDot,
                                { backgroundColor: getColorHex(color) },
                              ]}
                            />
                            <Text style={styles.specText}>{color}</Text>
                          </View>
                        )}
                      </View>
                    )}
                    <View style={styles.priceRow}>
                      <Text style={styles.price}>
                        GH₵{Number(effectivePrice).toLocaleString()}
                      </Text>
                      {hasReduction && (
                        <Text style={styles.originalPrice}>
                          GH₵{Number(product.price).toLocaleString()}
                        </Text>
                      )}
                    </View>
                    {isOutOfStock && (
                      <Text style={styles.outOfStockText}>
                        This item is currently unavailable
                      </Text>
                    )}
                  </View>
                </Pressable>
                <View style={styles.itemActions}>
                  <Pressable
                    style={styles.removeButton}
                    onPress={() => handleRemoveItem({ id, product, size, color })}
                    disabled={!!pendingItemActions[id]}
                    accessibilityRole="button"
                    accessibilityLabel="Remove from cart"
                  >
                    {pendingItemActions[id] === "remove" ? (
                      <ActivityIndicator size="small" color="#EF4444" />
                    ) : (
                      <Ionicons name="trash-outline" size={16} color="#EF4444" />
                    )}
                    <Text style={styles.removeText}>Remove</Text>
                  </Pressable>
                  <View style={styles.quantityRow}>
                    <Pressable
                      style={[
                        styles.qtyButton,
                        quantity <= 1 && styles.qtyButtonDisabled,
                      ]}
                      onPress={() =>
                        handleChangeQuantity(
                          { id, product },
                          Math.max(1, quantity - 1),
                          "dec",
                        )
                      }
                      disabled={quantity <= 1 || !!pendingItemActions[id]}
                    >
                      {pendingItemActions[id] === "dec" ? (
                        <ActivityIndicator size="small" color={themeColors.dark} />
                      ) : (
                        <Ionicons
                          name="remove"
                          size={18}
                          color={quantity <= 1 ? themeColors.light : themeColors.dark}
                        />
                      )}
                    </Pressable>
                    <View style={styles.qtyValueContainer}>
                      {pendingItemActions[id] === "inc" ||
                      pendingItemActions[id] === "dec" ? (
                        <ActivityIndicator size="small" color={themeColors.primary} />
                      ) : (
                        <Text style={styles.qtyValue}>{quantity}</Text>
                      )}
                    </View>
                    <Pressable
                      style={[
                        styles.qtyButton,
                        styles.qtyButtonAdd,
                        (isOutOfStock || isMaxStockReached) &&
                          styles.qtyButtonDisabledAdd,
                      ]}
                      onPress={() =>
                        handleChangeQuantity({ id, product }, quantity + 1, "inc")
                      }
                      disabled={
                        isOutOfStock || isMaxStockReached || !!pendingItemActions[id]
                      }
                    >
                      {pendingItemActions[id] === "inc" ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Ionicons name="add" size={18} color="#fff" />
                      )}
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          })}
          <View style={{ height: 20 }} />

          {/* Order summary sits above the discovery feed on mobile so the
              total/checkout is always visible before scrolling into likes. */}
          {!isWide && <View style={summaryStyle}>{summaryContent}</View>}

          {/* Liked products — shown even when the cart has items, so users
              can keep discovering without emptying their cart. */}
          {likedProducts.length > 0 && (
            <>
              <SectionHeader title="Liked products" />
              <View style={styles.discoveryFeedWrap}>
                {likedProducts.slice(0, 6).map((product) => (
                  <FeedProductCard
                    key={product.id}
                    product={product}
                    onPress={() =>
                      navigation.navigate("ProductDetail", { product })
                    }
                  />
                ))}
              </View>
            </>
          )}
        </ScrollView>

        {isWide && <View style={summaryStyle}>{summaryContent}</View>}
      </View>
    </View>
  );
};

const buildCartStyles = (c) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
     
    },
    header: {
      paddingHorizontal: 20,
      paddingBottom: 10,
      backgroundColor: c.light,
      shadowColor: "#000",
      shadowOpacity: 0.05,
      shadowRadius: 10,
      elevation: 5,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    headerTitle: {
      fontSize: 26,
      fontWeight: "800",
      color: c.dark,
      letterSpacing: -0.5,
    },
    itemCountBadge: {
      backgroundColor: c.primary,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    itemCountText: {
      fontSize: 12,
      fontWeight: "700",
      color: c.light,
    },
    headerSubtitle: {
      fontSize: 14,
      color: c.muted,
      marginTop: 4,
      fontWeight: "500",
    },
    emptyBanner: {
      alignItems: "center",
      paddingVertical: 28,
      paddingHorizontal: 24,
      marginHorizontal: 16,
      marginTop: 16,
      backgroundColor: c.light,
      borderRadius: 20,
    },
    emptyIconContainer: {
      width: 84,
      height: 84,
      borderRadius: 30,
      backgroundColor: c.primary + "15",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 14,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: "800",
      color: c.dark,
    },
    emptySubtitle: {
      marginTop: 6,
      color: c.muted,
      textAlign: "center",
      fontSize: 14,
      lineHeight: 20,
    },
    discoveryAdsWrap: {
      marginTop: 8,
    },
    discoveryFeedWrap: {
      paddingHorizontal: 0,
    },
    itemList: {
      flex: 1,
      padding: 0,
      paddingTop: 4,
    },
    itemCard: {
      backgroundColor: c.light,
      marginBottom: 4,
      shadowColor: "#000",
      shadowOpacity: 0.05,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 3 },
      elevation: 3,
      overflow: "hidden",
    },
    itemCardOutOfStock: {
      opacity: 0.72,
    },
    itemRow: {
      flexDirection: "row",
      padding: 12,
      paddingBottom: 10,
    },
    thumbnailContainer: {
      width: 90,
      height: 90,
      backgroundColor: c.light,
      borderRadius: 14,
      overflow: "hidden",
      position: "relative",
    },
    thumbnail: {
      width: "100%",
      height: "100%",
    },
    discountBadge: {
      position: "absolute",
      top: 6,
      left: 6,
      backgroundColor: "#EF4444",
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    flashBadge: {
      backgroundColor: "#F97316",
    },
    discountText: {
      color: c.light,
      fontSize: 10,
      fontWeight: "700",
    },
    outOfStockBadge: {
      position: "absolute",
      top: 6,
      right: 6,
      backgroundColor: "rgba(31,41,55,0.9)",
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    outOfStockBadgeText: {
      color: c.light,
      fontSize: 9,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 0.3,
    },
    itemContent: {
      flex: 1,
      paddingLeft: 12,
      justifyContent: "center",
    },
    title: {
      fontWeight: "700",
      fontSize: 15,
      color: c.dark,
      lineHeight: 20,
      letterSpacing: -0.2,
    },
    specsRow: {
      flexDirection: "row",
      gap: 8,
      marginTop: 8,
    },
    specBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: c.surface,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    specText: {
      fontSize: 11,
      color: c.primary,
      fontWeight: "600",
    },
    colorDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      borderWidth: 1,
      borderColor: c.border,
    },
    priceRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 8,
    },
    price: {
      fontSize: 17,
      fontWeight: "800",
      color: c.primary,
    },
    originalPrice: {
      fontSize: 13,
      color: c.muted,
      textDecorationLine: "line-through",
    },
    outOfStockText: {
      marginTop: 6,
      color: "#B91C1C",
      fontSize: 12,
      fontWeight: "700",
    },
    itemActions: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: c.surface,
      backgroundColor: c.surfaceAlpha,
    },
    removeButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: radius.md,
      backgroundColor: "#FEF2F2",
    },
    removeText: {
      fontSize: 12,
      fontWeight: "600",
      color: "#EF4444",
    },
    quantityRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.surface,
      borderRadius: 12,
      padding: 4,
    },
    qtyButton: {
      width: 34,
      height: 34,
      borderRadius: radius.lg,
      backgroundColor: c.light,
      alignItems: "center",
      justifyContent: "center",
    },
    qtyButtonDisabled: {
      backgroundColor: c.surfaceAlpha,
    },
    qtyButtonAdd: {
      backgroundColor: c.primary,
    },
    qtyButtonDisabledAdd: {
      backgroundColor: c.surface,
    },
    qtyValueContainer: {
      minWidth: 36,
      alignItems: "center",
    },
    qtyValue: {
      fontWeight: "700",
      fontSize: 16,
      color: c.dark,
    },
    // Dim the whole card while a removal is in flight so the user sees the
    // item is being deleted.
    itemCardRemoving: {
      opacity: 0.45,
    },
    summary: {
      backgroundColor: "transparent",
      paddingBottom: 0,
    },
    summaryCard: {
      backgroundColor: c.light,
      padding: 24,
      paddingBottom: 28,
      shadowColor: "#000",
      shadowOpacity: 0.1,
      shadowOffset: { width: 0, height: -6 },
      shadowRadius: 16,
      elevation: 12,
    },
    summaryCardHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    summaryCardHeaderLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    summaryCardTitle: {
      fontSize: 17,
      fontWeight: "800",
      color: c.dark,
      letterSpacing: -0.3,
    },
    summaryItemCountBadge: {
      backgroundColor: c.primary + "15",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    summaryItemCountText: {
      fontSize: 12,
      fontWeight: "700",
      color: c.primary,
    },
    summaryDivider: {
      height: 1,
      backgroundColor: c.border,
      marginVertical: 12,
    },
    summaryRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    summaryLabel: {
      color: c.muted,
      fontSize: 15,
      fontWeight: "500",
    },
    summaryValue: {
      fontSize: 15,
      fontWeight: "700",
      color: c.dark,
    },
    savingsLabel: {
      color: "#10B981",
      fontSize: 14,
      fontWeight: "600",
    },
    savingsValue: {
      fontSize: 15,
      fontWeight: "700",
      color: "#10B981",
    },
    freeShipping: {
      color: "#10B981",
    },
    shippingHintContainer: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: c.surface,
      padding: 10,
      borderRadius: 12,
      marginBottom: 14,
    },
    shippingHint: {
      fontSize: 12,
      color: c.primary,
      fontWeight: "600",
    },
    stockWarningContainer: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: "#FEF2F2",
      borderWidth: 1,
      borderColor: "#FECACA",
      padding: 10,
      borderRadius: 12,
      marginBottom: 14,
    },
    stockWarningText: {
      fontSize: 12,
      color: "#B91C1C",
      fontWeight: "600",
      flex: 1,
    },
    totalRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingTop: 14,
      borderTopWidth: 1,
      borderTopColor: c.border,
      marginTop: 8,
      marginBottom: 20,
    },
    totalLabel: {
      fontSize: 17,
      fontWeight: "800",
      color: c.dark,
    },
    totalValue: {
      fontSize: 22,
      fontWeight: "800",
      color: c.primary,
    },
    checkout: {
      borderRadius: 18,
      overflow: "hidden",
    },
    checkoutGradient: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 18,
      gap: 10,
    },
    checkoutText: {
      color: c.light,
      fontWeight: "700",
      fontSize: 17,
    },

    // Wide-screen (tablet/desktop) - side-by-side layout
    wideBody: {
      flex: 1,
      flexDirection: "row",
      paddingHorizontal: 24,
      paddingTop: 20,
      gap: 24,
    },
    mobileBody: {
      flex: 1,
    },
    itemListWide: {
      flex: 1,
    },
    summaryWide: {
      width: 360,
      backgroundColor: c.light,
      borderRadius: 24,
      padding: 24,
      alignSelf: "flex-start",
      shadowColor: "#000",
      shadowOpacity: 0.08,
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 16,
      elevation: 6,
      marginBottom: 20,
    },
  });
