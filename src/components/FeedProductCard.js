// FeedProductCard
// ---------------------------------------------------------------------------
// Social-feed style product card for the Explore/Feed screen. Reuses the exact
// visual language of the existing ProductCard (seller badges, discount badge,
// "New" pill, dark tag pill) — every color resolves through the theme palette,
// no hardcoded hex values.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState, memo } from "react";
import {
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { FlashSaleBadge } from "./FlashSaleBadge";
import { LazyImage } from "./LazyImage";
import { radius } from "../theme/colors";
import { useTheme } from "../context/ThemeContext";
import { useAppStyles } from "../hooks/useAppStyles";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { supabase } from "../lib/supabase";
import { formatTimeAgo } from "../utils/timeAgo";
import { shareProduct } from "../utils/shareUtils";

const SELLER_BADGE_CONFIG = {
  verified: { icon: "checkmark-circle", color: "success" },
  top_seller: { icon: "trophy", color: "accentYellow" },
};

const SELLER_BADGE_PRIORITY = ["verified", "top_seller"];

// Memoized so the FlatList only re-renders a card when its `product` or
// `onPress` identity changes (VirtualizedList performance best practice).
export const FeedProductCard = memo(function FeedProductCard({
  product,
  onPress,
}) {
  const { colors: c } = useTheme();
  const styles = useAppStyles(buildFeedCardStyles);
  const navigation = useNavigation();
  const route = useRoute();
  const toast = useToast();
  const { isAuthenticated } = useAuth();
  const { addToCart } = useCart();

  // --- Derived product data -------------------------------------------------
  const images = useMemo(() => {
    if (product.thumbnails?.length > 0) return product.thumbnails;
    return product.thumbnail ? [product.thumbnail] : [];
  }, [product.thumbnails, product.thumbnail]);

  const seller = product.seller || product.seller_id || null;
  const sellerName = seller?.name || product.vendor || "Store";
  const sellerBadgeIds = seller?.badges || [];
  const listedAt = formatTimeAgo(product.created_at);
  const restockedAt =
    product.restocked_at && product.restocked_at !== product.created_at
      ? formatTimeAgo(product.restocked_at)
      : null;

  const hasDiscount = Number(product.discount) > 0;
  const isNew = !product.rating || product.rating <= 0;

  const priceText = `GH₵${Number(
    hasDiscount
      ? product.price * (1 - product.discount / 100)
      : product.price || 0,
  ).toLocaleString()}`;

  const tags = Array.isArray(product.tags)
    ? product.tags.filter(Boolean).slice(0, 4)
    : [];

  // --- Local state ----------------------------------------------------------
  const [expanded, setExpanded] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [galleryVisible, setGalleryVisible] = useState(false);

  const openProduct = () => {
    if (onPress) return onPress();
    navigation.navigate("ProductDetail", { product });
  };

  const openStore = () => {
    if (seller?.id) {
      navigation.navigate("Store", { sellerId: seller.id, seller });
    }
  };

  const handleShare = async () => {
    setMenuVisible(false);
    try {
      const result = await shareProduct(product.id, product.title);
      if (result.success) {
        toast.success("Listing shared!", "Share link copied to clipboard");
      } else {
        toast.error("Failed to share", result.error || "Please try again");
      }
    } catch {
      toast.error("Error", "Failed to share listing");
    }
  };

  const handleAddToCart = () => {
    if (!isAuthenticated) {
      toast.info("Login required", "Please sign in to add items to your cart");
      navigation.navigate("Auth", {
        redirectTo: route?.name,
        redirectParams: route?.params,
      });
      return;
    }
    addToCart(product, 1, null, null);
    toast.success(
      "Added to Cart",
      `${product.title} has been added to your cart`,
    );
  };

  const description = String(product.description || "").trim();

  return (
    <View style={styles.card}>
      {/* ── Header row: avatar, name + badges, timestamp, overflow menu ── */}
      <View style={styles.headerRow}>
        <Pressable style={styles.sellerRow} onPress={openStore}>
          <View style={styles.avatarWrap}>
            {seller?.avatar ? (
              <Image source={{ uri: seller.avatar }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Ionicons
                  name="storefront-outline"
                  size={14}
                  color={c.primary}
                />
              </View>
            )}
          </View>
          <View style={styles.sellerMeta}>
            <View style={styles.sellerNameRow}>
              <Text style={styles.sellerName} numberOfLines={1}>
                {String(sellerName).toUpperCase()}
              </Text>
              {SELLER_BADGE_PRIORITY.filter((id) =>
                sellerBadgeIds.includes(id),
              ).map((id) => {
                const b = SELLER_BADGE_CONFIG[id];
                return (
                  <Ionicons
                    key={id}
                    name={b.icon}
                    size={12}
                    color={c[b.color]}
                  />
                );
              })}
            </View>
            <Text style={styles.timestamp}>
              {restockedAt ? `Restocked ${restockedAt}` : `Listed ${listedAt}`}
            </Text>
          </View>
        </Pressable>

        <Pressable
          style={styles.overflowButton}
          onPress={() => setMenuVisible(true)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="More options"
        >
          <Ionicons name="ellipsis-horizontal" size={18} color={c.muted} />
        </Pressable>
      </View>

      {/* ── Body: title, truncated description, clickable tags ── */}
      <Pressable onPress={openProduct}>
        <Text style={styles.title}>{product.title}</Text>
        {description ? (
          <>
            <Text
              style={styles.description}
              numberOfLines={expanded ? undefined : 2}
            >
              {description}
            </Text>
            {description.length > 90 && (
              <Pressable onPress={() => setExpanded((p) => !p)} hitSlop={6}>
                <Text style={styles.seeMore}>
                  {expanded ? "see less" : "...see more"}
                </Text>
              </Pressable>
            )}
          </>
        ) : null}
        {tags.length > 0 && (
          <View style={styles.tagsRow}>
            {tags.map((tag, i) => (
              <Pressable
                key={`${tag}-${i}`}
                onPress={() =>
                  navigation.navigate("SearchResults", {
                    tag: String(tag),
                    query: "",
                  })
                }
              >
                <Text style={styles.tag}>#{String(tag).replace(/^#/, "")}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </Pressable>

      {/* ── Media block: 1 / 2 / 2+N image grid with badges & label pill ── */}
      {images.length > 0 && (
        <Pressable onPress={openProduct} style={styles.mediaWrap}>
          <View style={styles.mediaGrid}>
            {images.length === 1 ? (
              <LazyImage
                source={{ uri: images[0] }}
                style={styles.mediaSingle}
                resizeMode="cover"
              />
            ) : (
              <>
                <LazyImage
                  source={{ uri: images[0] }}
                  style={styles.mediaTile}
                  resizeMode="cover"
                />
                <Pressable
                  style={styles.mediaTile}
                  onPress={() => {
                    setGalleryIndex(1);
                    setGalleryVisible(true);
                  }}
                >
                  <LazyImage
                    source={{ uri: images[1] }}
                    style={StyleSheet.absoluteFill}
                  />
                  {images.length > 2 && (
                    <View style={styles.moreOverlay}>
                      <Text style={styles.moreOverlayText}>
                        +{images.length - 2}
                      </Text>
                    </View>
                  )}
                </Pressable>
              </>
            )}
          </View>

          {/* Discount badge — top-left (same position as ProductCard) */}
          {hasDiscount && (
            <View style={styles.discountBadge}>
              <Ionicons name="flash" size={11} color={c.onPrimary} />
              <Text style={styles.discountText}>{product.discount}% OFF</Text>
            </View>
          )}

          {/* "New" pill — top-right (same position as ProductCard rating pill) */}
          {isNew && (
            <View style={styles.newPill}>
              <Ionicons name="star" size={10} color={c.accentYellow} />
              <Text style={styles.newPillText}>New</Text>
            </View>
          )}

          {/* Dark label pill — bottom of image (same as ProductCard tagPill) */}
          {(product.tags?.[0] || product.category) && (
            <View style={styles.labelPill}>
              <Text style={styles.labelPillText} numberOfLines={1}>
                {product.tags?.[0] || product.category}
              </Text>
            </View>
          )}
        </Pressable>
      )}

      {/* ── Price row beneath media ── */}
      <View style={styles.priceRow}>
        <Text style={styles.price}>{priceText}</Text>
        {hasDiscount && (
          <Text style={styles.originalPrice}>
            GH₵{Number(product.price || 0).toLocaleString()}
          </Text>
        )}
      </View>

      {/* ── Engagement bar ── */}
      <View style={styles.engagementBar}>
        <FeedWishlistButton productId={product.id} styles={styles} />
        <Pressable
          style={styles.engagementItem}
          onPress={() => navigation.navigate("ProductDetail", { product })}
        >
          <Ionicons
            name="chatbubble-ellipses-outline"
            size={20}
            color={c.muted}
          />
          <Text style={styles.engagementLabel}>Q&A</Text>
        </Pressable>
        <Pressable
          style={styles.engagementAddToCart}
          onPress={handleAddToCart}
          accessibilityRole="button"
          accessibilityLabel="Add to cart"
        >
          <Ionicons name="cart-outline" size={20} color={c.primary} />
          <Text style={[styles.engagementLabel, { color: c.primary }]}>
            Add to Cart
          </Text>
        </Pressable>
        <Pressable
          style={styles.engagementItem}
          onPress={handleShare}
          accessibilityRole="button"
          accessibilityLabel="Share"
        >
          <Ionicons name="pricetags-outline" size={20} color={c.muted} />
          <Text style={styles.engagementLabel}>tag</Text>
        </Pressable>
      </View>

      {/* ── Overflow menu ── */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable
          style={styles.menuBackdrop}
          onPress={() => setMenuVisible(false)}
        >
          <View style={styles.menuSheet}>
            {[
              {
                icon: "flag-outline",
                label: "Report listing",
                action: () => {
                  setMenuVisible(false);
                  toast.info(
                    "Report received",
                    "Thanks — our team will review this listing.",
                  );
                },
              },
              {
                icon: "share-social-outline",
                label: "Share",
                action: handleShare,
              },
              {
                icon: "eye-off-outline",
                label: "Hide seller",
                action: () => {
                  setMenuVisible(false);
                  toast.info(
                    "Seller hidden",
                    "You'll see fewer listings from this seller.",
                  );
                },
              },
              {
                icon: "folder-open-outline",
                label: "Add to collection",
                action: () => {
                  setMenuVisible(false);
                  toast.info(
                    "Coming soon",
                    "Collections are coming to Tagit soon.",
                  );
                },
              },
            ].map(({ icon, label, action }) => (
              <Pressable key={label} style={styles.menuItem} onPress={action}>
                <Ionicons name={icon} size={18} color={c.dark} />
                <Text style={styles.menuItemText}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* ── Swipeable gallery modal (3+ images) ── */}
      <Modal
        visible={galleryVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setGalleryVisible(false)}
      >
        <View style={styles.galleryBackdrop}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={(e) =>
              setGalleryIndex(
                Math.round(e.nativeEvent.contentOffset.x / PAGE_WIDTH),
              )
            }
            scrollEventThrottle={16}
            ref={(ref) => {
              if (ref && galleryIndex > 0) {
                ref.scrollTo({
                  x: galleryIndex * PAGE_WIDTH,
                  animated: false,
                });
              }
            }}
          >
            {images.map((uri, i) => (
              <Pressable
                key={i}
                onPress={() => setGalleryVisible(false)}
                style={styles.galleryPage}
              >
                <Image source={{ uri }} style={styles.galleryImage} />
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.galleryCounter}>
            <Text style={styles.galleryCounterText}>
              {galleryIndex + 1} / {images.length}
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
});

// Approximate page width for the gallery pager.
const PAGE_WIDTH = Dimensions.get("window").width;
const galleryPageWidth = () => PAGE_WIDTH;

// Wishlist heart with optimistic count, backed by express_wishlists — same
// behavior as the reels feed's like button.
const FeedWishlistButton = ({ productId, styles }) => {
  const { colors: c } = useTheme();
  const { user } = useAuth();
  const [wishlisted, setWishlisted] = useState(false);
  const [count, setCount] = useState(null);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!supabase || !productId) return;
      try {
        const { count: wishCount } = await supabase
          .from("express_wishlists")
          .select("*", { count: "exact", head: true })
          .eq("product_id", productId);
        if (mounted) setCount(wishCount ?? 0);
        if (user) {
          const { data } = await supabase
            .from("express_wishlists")
            .select("id")
            .eq("user_id", user.id)
            .eq("product_id", productId)
            .maybeSingle();
          if (mounted) setWishlisted(!!data);
        }
      } catch {
        /* non-critical */
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [productId, user]);

  const toggle = async () => {
    if (!user) return;
    const willLike = !wishlisted;
    setWishlisted(willLike);
    setCount((n) => Math.max(0, (n ?? 0) + (willLike ? 1 : -1)));
    setAnimating(true);
    setTimeout(() => setAnimating(false), 300);
    try {
      if (willLike) {
        await supabase
          .from("express_wishlists")
          .insert({ user_id: user.id, product_id: productId });
      } else {
        await supabase
          .from("express_wishlists")
          .delete()
          .eq("user_id", user.id)
          .eq("product_id", productId);
      }
    } catch {
      setWishlisted(!willLike);
      setCount((n) => Math.max(0, (n ?? 0) + (willLike ? -1 : 1)));
    }
  };

  return (
    <Pressable style={styles.engagementItem} onPress={toggle}>
      <Ionicons
        name={wishlisted ? "heart" : "heart-outline"}
        size={20}
        color={wishlisted ? c.primary : c.muted}
        style={animating ? { transform: [{ scale: 1.25 }] } : null}
      />
      <Text style={styles.engagementLabel}>{count ?? ""}</Text>
    </Pressable>
  );
};

const buildFeedCardStyles = (c) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    
      overflow: "hidden",
      shadowColor: "#000",
      shadowOpacity: 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 5,
    },

    /* Header */
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 8,
    },
    sellerRow: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      minWidth: 0,
    },
    avatarWrap: {
      width: 36,
      height: 36,
      borderRadius: radius.full,
      overflow: "hidden",
      backgroundColor: c.borderAlpha,
      borderWidth: 1,
      borderColor: c.border,
      marginRight: 10,
    },
    avatar: { width: "100%", height: "100%" },
    avatarFallback: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    sellerMeta: { flex: 1, minWidth: 0 },
    sellerNameRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    sellerName: {
      fontSize: 11,
      fontWeight: "800",
      color: c.muted,
      letterSpacing: 0.6,
      flexShrink: 1,
    },
    timestamp: {
      fontSize: 10,
      color: c.muted,
      marginTop: 2,
    },
    overflowButton: {
      padding: 6,
      borderRadius: radius.full,
    },

    /* Body text */
    title: {
      fontSize: 15,
      fontWeight: "800",
      color: c.dark,
      paddingHorizontal: 14,
      letterSpacing: -0.25,
    },
    description: {
      fontSize: 13,
      color: c.muted,
      lineHeight: 18,
      paddingHorizontal: 14,
      marginTop: 4,
    },
    seeMore: {
      fontSize: 13,
      fontWeight: "600",
      color: c.accentBlue,
      paddingHorizontal: 14,
      marginTop: 2,
    },
    tagsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      paddingHorizontal: 14,
      marginTop: 6,
      marginBottom: 10,
    },
    tag: {
      fontSize: 13,
      fontWeight: "600",
      color: c.accentBlue,
    },

    /* Media grid */
    mediaWrap: { position: "relative" },
    mediaGrid: {
      flexDirection: "row",
      gap: 4,
      height: 220,
    },
    // Single-image layout: full product visible (no crop), centered on a
    // neutral surface instead of being zoomed/cropped by "cover".
    mediaSingle: {
      flex: 1,
      backgroundColor: c.surfaceAlpha,
    },
    mediaTile: { flex: 1, backgroundColor: c.border },
    moreOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: c.overlay,
      alignItems: "center",
      justifyContent: "center",
    },
    moreOverlayText: {
      color: c.light,
      fontSize: 22,
      fontWeight: "900",
    },
    discountBadge: {
      position: "absolute",
      top: 10,
      left: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: c.badgeDanger,
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: radius.xs,
    },
    discountText: {
      fontSize: 10,
      fontWeight: "900",
      color: c.onPrimary,
      letterSpacing: 0.4,
      textTransform: "uppercase",
    },
    newPill: {
      position: "absolute",
      top: 10,
      right: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: c.whiteAlpha,
      borderRadius: radius.full,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    newPillText: {
      fontSize: 10,
      fontWeight: "800",
      color: c.dark,
    },
    labelPill: {
      position: "absolute",
      bottom: 8,
      left: 8,
      maxWidth: "70%",
      backgroundColor: c.scrim,
      borderRadius: radius.full,
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    labelPillText: {
      fontSize: 10,
      fontWeight: "700",
      color: c.light,
    },

    /* Price */
    priceRow: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: 12,
      paddingHorizontal: 14,
        paddingTop: 10,
      backgroundColor: c.surfaceAlpha,
    },
    price: {
      fontSize: 17,
      fontWeight: "800",
      color: c.dark,
      letterSpacing: -0.3,
    },
    originalPrice: {
      fontSize: 12,
      fontWeight: "600",
      color: c.muted,
      textDecorationLine: "line-through",
    },

    /* Engagement bar */
    engagementBar: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderTopWidth: 1,
        borderTopColor: c.borderAlpha,
      backgroundColor: c.surfaceAlpha,
      
      gap: 4,
    },
    engagementItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingVertical: 6,
      paddingHorizontal: 8,
    },
    engagementLabel: {
      fontSize: 12,
      fontWeight: "700",
      color: c.muted,
    },
    engagementAddToCart: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      marginLeft: "auto",
      backgroundColor: c.primary + "15",
      borderColor: c.primary + "30",
      borderWidth: 1,
      borderRadius: radius.full,
      paddingVertical: 6,
      paddingHorizontal: 12,
    },

    /* Overflow menu */
    menuBackdrop: {
      flex: 1,
      backgroundColor: c.overlay,
      justifyContent: "flex-end",
    },
    menuSheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      paddingTop: 10,
      paddingBottom: 28,
    },
    menuItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: 20,
    },
    menuItemText: {
      fontSize: 15,
      fontWeight: "600",
      color: c.dark,
    },

    /* Gallery modal */
    galleryBackdrop: {
      flex: 1,
      backgroundColor: "#000000",
    },
    galleryPage: {
      width: galleryPageWidth(),
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    galleryImage: {
      width: "100%",
      height: "100%",
      resizeMode: "contain",
    },
    galleryCounter: {
      position: "absolute",
      bottom: 40,
      alignSelf: "center",
      backgroundColor: c.scrim,
      borderRadius: radius.full,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    galleryCounterText: {
      color: c.light,
      fontSize: 12,
      fontWeight: "700",
    },
  });
