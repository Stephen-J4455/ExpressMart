import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  FlatList,
  Pressable,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  Linking,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../lib/supabase";
import { useShop } from "../context/ShopContext";
import { useAuth } from "../context/AuthContext";
import {getTheme, radius } from "../theme/colors";
import { useTheme } from "../context/ThemeContext";
import { useAppStyles } from "../hooks/useAppStyles";
import { useToast } from "../context/ToastContext";
import { useResponsive } from "../hooks/useResponsive";
import { ProductCard } from "../components/ProductCard";
import { ProductCardPlaceholder } from "../components/ProductCardPlaceholder";
import {
  loadHiddenSellers,
  unhideSeller,
} from "../utils/hiddenSellers";

const TABS = ["products", "profile", "reviews"];

const BADGE_CONFIG = {
  verified: {
    label: "Verified",
    icon: "checkmark-circle",
    color: "#10B981",
  },
  fast_shipping: {
    label: "Fast Shipping",
    icon: "flash",
    color: "#F59E0B",
  },
  trusted_seller: {
    label: "Trusted Seller",
    icon: "shield-checkmark",
    color: "#3B82F6",
  },
  eco_friendly: {
    label: "Eco Friendly",
    icon: "leaf",
    color: "#059669",
  },
  top_seller: {
    label: "Top Seller",
    icon: "trophy",
    color: "#F59E0B",
  },
  local: {
    label: "Local Business",
    icon: "location",
    color: "#8B5CF6",
  },
  trending: {
    label: "Trending",
    icon: "trending-up",
    color: "#EC4899",
  },
  premium: {
    label: "Premium",
    icon: "star",
    color: "#EAB308",
  },
};

const FALLBACK_BADGE_STYLE = {
  icon: "pricetag",
  color: "#64748B",
};

const normalizeBadgeId = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_");

const toBadgeLabel = (badgeId) =>
  String(badgeId || "")
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const normalizeSellerBadges = (badges) => {
  let rawBadges = [];

  if (Array.isArray(badges)) {
    rawBadges = badges;
  } else if (typeof badges === "string") {
    try {
      const parsed = JSON.parse(badges);
      if (Array.isArray(parsed)) {
        rawBadges = parsed;
      } else {
        rawBadges = badges.split(",");
      }
    } catch {
      rawBadges = badges.split(",");
    }
  } else if (badges && typeof badges === "object") {
    rawBadges = Object.entries(badges)
      .filter(([, enabled]) => enabled === true)
      .map(([badgeId]) => badgeId);
  }

  return [...new Set(rawBadges.map(normalizeBadgeId).filter(Boolean))];
};

const dedupeProductsById = (items = []) => {
  const seen = new Set();
  return (items || []).filter((item) => {
    const id = item?.id;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

export const StoreScreen = ({ route, navigation }) => {
  const rawSeller = route?.params || null;
  const routeSellerId =
    rawSeller?.sellerId ||
    rawSeller?.id ||
    rawSeller?.seller?.id ||
    rawSeller?.seller?.seller_id?.id ||
    rawSeller?.seller?.seller_id ||
    null;
  const [sellerDetail, setSellerDetail] = useState(
    rawSeller?.seller && typeof rawSeller.seller === "object"
      ? rawSeller.seller
      : null,
  );
  const sellerId = routeSellerId || sellerDetail?.id;
  const insets = useSafeAreaInsets();
  const { width: screenWidth, gridColumns, getItemWidth } = useResponsive();
  const itemWidth = getItemWidth(gridColumns, 12, 12);
  const { colors: themeColors } = useTheme();

  // Resolve a theme object from seller.theme_color only if seller allows it for customers
  const theme =
    (sellerDetail?.theme_apply_customer
      ? getTheme(
          sellerDetail?.theme_color ||
            sellerDetail?.theme ||
            themeColors.primary,
        )
      : getTheme(themeColors.primary)) || getTheme(themeColors.primary);
  const accent =
    (theme && theme.accent) || (theme && theme.primary) || themeColors.accent;
  const accentGradient = [
    (theme && theme.gradientStart) || themeColors.primary,
    (theme && theme.gradientEnd) || themeColors.primary,
  ];
  const { refresh, loading, followSeller, unfollowSeller, isFollowing } =
    useShop();
  const { user } = useAuth();
  const toast = useToast();
  // buildStoreStyles depends on the resolved `accent` (per-seller theme)
  // in addition to the active palette, so we memoise the factory itself
  // by `accent`. Without this the inner closure would change every render
  // and the styles would be rebuilt on every state update.
  const buildStyles = useCallback(
    (c) => buildStoreStyles(c, accent),
    [accent],
  );
  const styles = useAppStyles(buildStyles);
  const tabScrollRef = useRef(null);

  const [statuses, setStatuses] = useState([]);
  const [storeProducts, setStoreProducts] = useState([]);
  const [storeLoading, setStoreLoading] = useState(true);
  const [storeLoadingMore, setStoreLoadingMore] = useState(false);
  const [storeHasMore, setStoreHasMore] = useState(true);
  const STORE_PAGE_SIZE = 20;
  const [activeTab, setActiveTab] = useState("products");
  const [storeReviews, setStoreReviews] = useState([]);
  const [userProfiles, setUserProfiles] = useState({});
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  // `true` when this seller is currently in the device's hidden-sellers list
  // (set via the FeedProductCard "Hide seller" overflow action). When true we
  // render a banner above the tabs letting the user undo the action — the
  // inverse of the menu action in the feed.
  const [isHidden, setIsHidden] = useState(false);
  const [unhiding, setUnhiding] = useState(false);

  const openExternalLink = useCallback(
    async (rawUrl, label = "link") => {
      const value = String(rawUrl || "").trim();
      if (!value) {
        toast.error(`Invalid ${label}`);
        return;
      }

      const normalizedUrl = /^(https?:|mailto:|tel:|sms:|whatsapp:)/i.test(
        value,
      )
        ? value
        : `https://${value}`;

      try {
        const supported = await Linking.canOpenURL(normalizedUrl);
        if (!supported) {
          toast.error(`Unable to open ${label}`);
          return;
        }
        await Linking.openURL(normalizedUrl);
      } catch (err) {
        console.error(`Error opening ${label}:`, err);
        toast.error(`Failed to open ${label}`);
      }
    },
    [toast],
  );

  const openWhatsAppLink = useCallback(
    (rawValue) => {
      const value = String(rawValue || "").trim();
      if (!value) {
        toast.error("Invalid WhatsApp");
        return;
      }

      if (/^(https?:|whatsapp:)/i.test(value)) {
        openExternalLink(value, "WhatsApp");
        return;
      }

      const digits = value.replace(/[^0-9]/g, "");
      if (!digits) {
        toast.error("Invalid WhatsApp");
        return;
      }

      openExternalLink(`https://wa.me/${digits}`, "WhatsApp");
    },
    [openExternalLink, toast],
  );

  const averageRating =
    storeReviews.length > 0
      ? (
          storeReviews.reduce((sum, r) => sum + (r.rating || 0), 0) /
          storeReviews.length
        ).toFixed(1)
      : "0.0";
  const sellerBadgeIds = useMemo(
    () => normalizeSellerBadges(sellerDetail?.badges),
    [sellerDetail?.badges],
  );

  useEffect(() => {
    if (!sellerId) return;
    const routeSeller =
      rawSeller?.seller && typeof rawSeller.seller === "object"
        ? rawSeller.seller
        : null;
    setSellerDetail((prev) => {
      if (routeSeller?.id === sellerId) return routeSeller;
      if (prev?.id === sellerId) return prev;
      return { id: sellerId };
    });
    setStoreProducts([]);
    setStoreHasMore(true);
    setStoreLoading(true);
    setStoreLoadingMore(false);
    setStatuses([]);
    setStoreReviews([]);
    setUserProfiles({});
    setFollowerCount(0);
    setActiveTab("products");
    tabScrollRef.current?.scrollTo({ x: 0, animated: false });
  }, [sellerId, rawSeller?.seller]);

  const handleFollowToggle = async () => {
    if (!sellerId) return;
    if (!user) {
      toast.info("Login required", "Please sign in to follow stores");
      navigation.navigate("Auth", {
        redirectTo: "Store",
        redirectParams: route?.params,
      });
      return;
    }
    setFollowLoading(true);
    try {
      if (isFollowing(sellerId)) {
        await unfollowSeller(sellerId);
        toast.error("Unfollowed store");
      } else {
        await followSeller(sellerId);
        toast.success("Following store");
      }
    } catch (err) {
      console.error("Follow toggle error", err);
      toast.error("Failed to update follow status");
    } finally {
      setFollowLoading(false);
    }
  };

  // ── Hidden-seller awareness ─────────────────────────────────────────────
  // Mirror the device-wide hidden-sellers list and check whether THIS seller
  // is in it. We refresh on every focus so opening this page right after
  // hiding from the feed reflects immediately.
  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      if (!sellerId) {
        setIsHidden(false);
        return () => {
          mounted = false;
        };
      }
      loadHiddenSellers()
        .then((list) => {
          if (mounted) {
            setIsHidden(Array.isArray(list) && list.includes(sellerId));
          }
        })
        .catch(() => {});
      return () => {
        mounted = false;
      };
    }, [sellerId]),
  );

  const handleUnhide = async () => {
    if (!sellerId || unhiding) return;
    setUnhiding(true);
    try {
      await unhideSeller(sellerId);
      setIsHidden(false);
      toast.success(
        "Seller unhidden",
        "You'll start seeing their products in the feed again.",
      );
    } catch (e) {
      console.warn("[StoreScreen] unhide failed:", e?.message);
      toast.error("Could not unhide", "Please try again in a moment.");
    } finally {
      setUnhiding(false);
    }
  };

  useEffect(() => {
    // If we were passed only a seller id (string), hydrate seller detail.
    const fetchSeller = async () => {
      if (!supabase || !sellerId) return;

      try {
        const { data, error } = await supabase
          .from("express_sellers")
          .select(
            "id,name,avatar,cover_image,badges,rating,store_description,social_facebook,social_instagram,social_twitter,social_whatsapp,social_website,theme_color,theme_apply_customer",
          )
          .eq("id", sellerId)
          .single();
        if (!error && data) {
          setSellerDetail((prev) => ({
            ...prev,
            ...data,
            badges: data.badges ?? prev?.badges ?? [],
          }));
        }
      } catch (err) {
        console.error("Error fetching seller detail:", err);
      }
    };
    fetchSeller();

    const fetchStoreReviews = async () => {
      if (!sellerId) return;
      setReviewsLoading(true);
      try {
        const { data: sellerProducts, error: productsError } = await supabase
          .from("express_products")
          .select("id")
          .eq("seller_id", sellerId)
          .eq("status", "active");

        if (productsError) throw productsError;

        const productIds = (sellerProducts || []).map((p) => p.id);
        if (productIds.length === 0) {
          setStoreReviews([]);
          setUserProfiles({});
          setReviewsLoading(false);
          return;
        }

        const { data: reviewsData, error: reviewsError } = await supabase
          .from("express_reviews")
          .select("*")
          .in("product_id", productIds)
          .eq("is_approved", true)
          .order("created_at", { ascending: false });

        if (reviewsError) throw reviewsError;

        setStoreReviews(reviewsData || []);

        const userIds = [...new Set((reviewsData || []).map((r) => r.user_id))];
        if (userIds.length > 0) {
          const { data: profilesData, error: profilesError } = await supabase
            .from("express_profiles")
            .select("id, full_name")
            .in("id", userIds);
          if (!profilesError && profilesData) {
            const profilesMap = {};
            profilesData.forEach((profile) => {
              profilesMap[profile.id] = profile;
            });
            setUserProfiles(profilesMap);
          }
        } else {
          setUserProfiles({});
        }
      } catch (err) {
        console.error("Error fetching store reviews:", err);
        setStoreReviews([]);
        setUserProfiles({});
      } finally {
        setReviewsLoading(false);
      }
    };
    fetchStoreReviews();
  }, [sellerId]);

  useEffect(() => {
    const fetchFollowerCount = async () => {
      if (!sellerId) return;
      try {
        const { count, error } = await supabase
          .from("express_follows")
          .select("*", { count: "exact", head: true })
          .eq("seller_id", sellerId);

        if (error) throw error;
        setFollowerCount(count || 0);
      } catch (err) {
        console.error("Error fetching follower count:", err);
        setFollowerCount(0);
      }
    };
    fetchFollowerCount();
  }, [sellerId]);

  useEffect(() => {
    const fetchStatuses = async () => {
      if (!supabase || !sellerId) return;
      try {
        const { data, error } = await supabase
          .from("express_seller_statuses")
          .select("*")
          .eq("seller_id", sellerId)
          .eq("is_active", true)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: true });

        if (!error && data) {
          setStatuses(data);
        }
      } catch (err) {
        console.error("Error fetching statuses:", err);
      }
    };
    fetchStatuses();
  }, [sellerId]);

  const handleTabPress = (tab) => {
    setActiveTab(tab);
    const index = TABS.indexOf(tab);
    tabScrollRef.current?.scrollTo({ x: index * screenWidth, animated: true });
  };

  const handleScroll = (event) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / screenWidth);
    if (TABS[index] && TABS[index] !== activeTab) {
      setActiveTab(TABS[index]);
    }
  };

  // Fetch only this store's products and dedupe by product id.
  const fetchStoreProducts = useCallback(
    async (reset = true) => {
      if (!supabase || !sellerId) return;
      const start = reset ? 0 : storeProducts.length;
      const end = start + STORE_PAGE_SIZE - 1;
      try {
        const { data, error } = await supabase
          .from("express_products")
          .select("*, seller_id(id,name,avatar,rating,total_ratings,badges)")
          .eq("seller_id", sellerId)
          .eq("status", "active")
          .eq("seller_id.is_active", true)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(start, end);
        if (error) throw error;

        const rows = data || [];
        const mapped = rows.map((p) => {
          const normalizedQuantity = p.quantity ?? p.stock ?? p.stock_quantity;
          const normalizedStock = p.stock ?? p.quantity ?? p.stock_quantity;
          const normalizedBackorder =
            p.allow_backorder === true ||
            p.allow_backorder === 1 ||
            String(p.allow_backorder || "")
              .trim()
              .toLowerCase() === "true";

          return {
            id: p.id,
            title: p.title,
            vendor: p.vendor,
            price: Number(p.price || 0),
            quantity: normalizedQuantity,
            stock: normalizedStock,
            allow_backorder: normalizedBackorder,
            rating: Number(p.rating || 0),
            badges: p.badges || [],
            thumbnail: p.thumbnail,
            thumbnails: p.thumbnails || [],
            category: p.category,
            description: p.description,
            discount: p.discount || 0,
            colors: p.colors || [],
            sizes: p.sizes || [],
            specifications: p.specifications || null,
            tags: p.tags || [],
            weight: p.weight || null,
            weight_unit: p.weight_unit || null,
            sku: p.sku || null,
            barcode: p.barcode || null,
            seller: p.seller_id || null,
          };
        });

        const uniqueMapped = dedupeProductsById(mapped);
        const nextProducts = reset
          ? uniqueMapped
          : dedupeProductsById([...storeProducts, ...uniqueMapped]);

        if (reset && rows[0]?.seller_id) {
          setSellerDetail((prev) => ({
            ...prev,
            ...rows[0].seller_id,
            badges: rows[0].seller_id.badges ?? prev?.badges ?? [],
          }));
        }

        setStoreProducts(nextProducts);
        const receivedFullPage = rows.length === STORE_PAGE_SIZE;
        const appendedNewProducts =
          reset || nextProducts.length > storeProducts.length;
        setStoreHasMore(receivedFullPage && appendedNewProducts);
      } catch (err) {
        console.error("fetchStoreProducts error", err);
      } finally {
        setStoreLoadingMore(false);
        setStoreLoading(false);
      }
    },
    [sellerId, storeProducts],
  );

  const handleLoadMoreStoreProducts = useCallback(async () => {
    if (!storeHasMore || storeLoadingMore || loading) return;
    setStoreLoadingMore(true);
    await fetchStoreProducts(false);
  }, [storeHasMore, storeLoadingMore, loading, fetchStoreProducts]);

  useEffect(() => {
    if (sellerId) fetchStoreProducts(true);
  }, [sellerId]);

  const storeInfo = storeProducts.length > 0 ? storeProducts[0] : null;

  const displayData =
    storeLoading && storeProducts.length === 0
      ? Array(4).fill(null)
      : storeProducts;

  return (
    <>
      <FlatList
        data={displayData}
        keyExtractor={(item, index) => `outer-${item?.id || index}`}
        bounces={true}
        showsVerticalScrollIndicator={false}
        onEndReached={handleLoadMoreStoreProducts}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          storeLoadingMore ? (
            <View style={{ paddingVertical: 20, alignItems: "center" }}>
              <ActivityIndicator size="small" color={themeColors.primary} />
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} />
        }
        ListHeaderComponent={
          <View>
            {/* Cover image area. Renders the seller's `cover_image` when
                uploaded; falls back to the seller's `avatar` (the profile
                image used by the seller admin) so the header always has a
                real photo; otherwise falls back to the seller-themed
                gradient so the header never collapses to a blank strip.
                The hovering card below is positioned with a positive
                marginTop (sized so it sits just inside the bottom of the
                image), so ~90% of the card sits BELOW the image and only a
                small slice peeks ABOVE the image's bottom edge. */}
            <View style={styles.headerBackdrop}>
              {(() => {
                // Prefer an explicit `cover_image`; otherwise use the
                // `avatar` (which is what the seller admin currently sets —
                // there's no separate cover-image upload flow today).
                const coverUri =
                  sellerDetail?.cover_image || sellerDetail?.avatar;
                if (!coverUri) return null;
                return (
                  <Image
                    source={{ uri: coverUri }}
                    style={styles.headerBackdropImage}
                    resizeMode="cover"
                    onError={(e) => {
                      // Surface broken URLs to the JS console so the cover
                      // can be debugged without staring at a blank strip.
                      console.warn(
                        "[StoreScreen] cover image failed to load:",
                        coverUri,
                        e?.nativeEvent,
                      );
                    }}
                  />
                );
              })()}
              {/* Gradient is always rendered as a backdrop, so if the image
                  URL is missing or fails to load the strip still has colour
                  instead of a transparent hole. Sits at opacity 0.18 so the
                  image still shows through. */}
              <LinearGradient
                colors={[
                  (theme && theme.gradientStart) || themeColors.primary,
                  (theme && theme.gradientEnd) || themeColors.primary,
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.headerBackdropGradient}
              />
            </View>

            <View style={styles.headerCard}>
              <View style={styles.headerNameRow}>
                <Text
                  style={styles.headerStoreName}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {(sellerDetail?.name || "Store").toString().toUpperCase()}
                </Text>
                {sellerDetail?.is_verified ? (
                  <View style={styles.headerVerifiedBadge}>
                    <Ionicons
                      name="checkmark"
                      size={14}
                      color={themeColors.onPrimary || "#fff"}
                    />
                  </View>
                ) : null}
              </View>

              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {sellerDetail?.location
                  ? String(sellerDetail.location)
                  : sellerDetail?.store_description
                    ? String(sellerDetail.store_description).slice(0, 60)
                    : "Verified seller on ExpressMart"}
              </Text>

              <View style={styles.headerStatsRow}>
                {Number(averageRating) >= 4.0 ? (
                  <View style={styles.headerStatChip}>
                    <Ionicons name="star" size={14} color="#F59E0B" />
                    <Text style={styles.headerStatTextHighRated}>
                      High Rated
                    </Text>
                  </View>
                ) : null}

                <View style={styles.headerStatChip}>
                  <Ionicons
                    name="cube-outline"
                    size={14}
                    color={themeColors.muted}
                  />
                  <Text style={styles.headerStatText}>
                    {storeProducts.length}{" "}
                    {storeProducts.length === 1 ? "product" : "products"}
                  </Text>
                </View>

                <View style={styles.headerStatChip}>
                  <Ionicons
                    name="people-outline"
                    size={14}
                    color={themeColors.muted}
                  />
                  <Text
                    style={[
                      styles.headerStatText,
                      { color: accent, fontWeight: "700" },
                    ]}
                  >
                    {followerCount} followers
                  </Text>
                </View>
              </View>

              <View style={styles.headerActionsRow}>
                <Pressable
                  style={[
                    styles.headerFollowBtn,
                    isFollowing(sellerId) && styles.headerFollowBtnActive,
                  ]}
                  onPress={handleFollowToggle}
                  disabled={followLoading}
                  accessibilityRole="button"
                  accessibilityLabel={
                    isFollowing(sellerId) ? "Unfollow store" : "Follow store"
                  }
                >
                  {followLoading ? (
                    <ActivityIndicator
                      size="small"
                      color={themeColors.dark}
                    />
                  ) : (
                    <Text
                      style={[
                        styles.headerFollowBtnText,
                        isFollowing(sellerId) &&
                          styles.headerFollowBtnTextActive,
                      ]}
                    >
                      {isFollowing(sellerId) ? "Following" : "Follow"}
                    </Text>
                  )}
                </Pressable>

                <Pressable
                  style={styles.headerMessageBtn}
                  onPress={() => {
                    if (!sellerDetail) return;
                    navigation.navigate("Chat", { seller: sellerDetail });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Message seller"
                >
                  <Ionicons
                    name="chatbubble-outline"
                    size={18}
                    color={themeColors.onPrimary || "#fff"}
                  />
                  <Text style={styles.headerMessageBtnText}>Message</Text>
                </Pressable>
              </View>

              <View style={styles.headerDivider} />

              <View style={styles.headerTrustGrid}>
                <View style={styles.headerTrustItem}>
                  <View style={styles.headerTrustIconWrap}>
                    <Ionicons name="car-outline" size={18} color={accent} />
                  </View>
                  <View style={styles.headerTrustTextWrap}>
                    <Text style={styles.headerTrustTitle}>
                      {sellerDetail?.default_shipping_fee === 0 ||
                      sellerDetail?.default_shipping_fee == null
                        ? "Free shipping"
                        : "Standard shipping"}
                    </Text>
                    <Text style={styles.headerTrustSubtitle}>
                      {sellerDetail?.default_shipping_fee > 0
                        ? `Fee GH₵${Number(
                            sellerDetail.default_shipping_fee,
                          ).toFixed(2)}`
                        : "On all orders from this store"}
                    </Text>
                  </View>
                </View>

                <View style={styles.headerTrustItem}>
                  <View style={styles.headerTrustIconWrap}>
                    <Ionicons
                      name="refresh-outline"
                      size={18}
                      color={accent}
                    />
                  </View>
                  <View style={styles.headerTrustTextWrap}>
                    <Text style={styles.headerTrustTitle}>Easy returns</Text>
                    <Text style={styles.headerTrustSubtitle}>
                      Store return policy
                    </Text>
                  </View>
                </View>

                <View style={styles.headerTrustItem}>
                  <View style={styles.headerTrustIconWrap}>
                    <Ionicons
                      name="shield-checkmark-outline"
                      size={18}
                      color={accent}
                    />
                  </View>
                  <View style={styles.headerTrustTextWrap}>
                    <Text style={styles.headerTrustTitle}>
                      Buyer protection
                    </Text>
                    <Text style={styles.headerTrustSubtitle}>
                      Secured by ExpressMart
                    </Text>
                  </View>
                </View>

                <View style={styles.headerTrustItem}>
                  <View style={styles.headerTrustIconWrap}>
                    <Ionicons name="time-outline" size={18} color={accent} />
                  </View>
                  <View style={styles.headerTrustTextWrap}>
                    <Text style={styles.headerTrustTitle}>
                      Fast response
                    </Text>
                    <Text style={styles.headerTrustSubtitle}>
                      {sellerDetail?.fulfillment_speed
                        ? `Replies in ${String(
                            sellerDetail.fulfillment_speed,
                          ).toLowerCase()}`
                        : "Replies within a few hours"}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* ── Hidden-seller banner ─────────────────────────────────────────
                Shown only when the user previously hid this seller from the
                feed. Lets them undo that action without leaving the page. The
                banner is full-width, sits between the hero and the tab nav,
                and uses a subtle muted style so it doesn't compete with the
                primary "Follow" CTA above. */}
            {isHidden && (
              <View style={styles.hiddenBanner}>
                <View style={styles.hiddenBannerIconWrap}>
                  <Ionicons
                    name="eye-off-outline"
                    size={18}
                    color={themeColors.muted}
                  />
                </View>
                <View style={styles.hiddenBannerText}>
                  <Text style={styles.hiddenBannerTitle}>
                    You've hidden this seller
                  </Text>
                  <Text style={styles.hiddenBannerSubtitle}>
                    Their products won't show up in your home feed.
                  </Text>
                </View>
                <Pressable
                  style={[
                    styles.hiddenBannerBtn,
                    unhiding && styles.hiddenBannerBtnDisabled,
                  ]}
                  onPress={handleUnhide}
                  disabled={unhiding}
                  accessibilityRole="button"
                  accessibilityLabel="Unhide this seller"
                >
                  {unhiding ? (
                    <ActivityIndicator size="small" color={accent} />
                  ) : (
                    <>
                      <Ionicons
                        name="eye-outline"
                        size={14}
                        color={accent}
                      />
                      <Text
                        style={[
                          styles.hiddenBannerBtnText,
                          { color: accent },
                        ]}
                      >
                        Unhide
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            )}

            {/* Tab Navigation */}
            <View style={styles.tabContainer}>
              <Pressable
                style={[
                  styles.tab,
                  activeTab === "products" && styles.tabActive,
                ]}
                onPress={() => handleTabPress("products")}
              >
                <Ionicons
                  name="storefront-outline"
                  size={20}
                  color={activeTab === "products" ? accent : themeColors.muted}
                />
                <Text
                  style={[
                    styles.tabText,
                    activeTab === "products" && {
                      color: accent,
                      fontWeight: "800",
                    },
                  ]}
                >
                  Products ({storeProducts.length})
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.tab,
                  activeTab === "profile" && styles.tabActive,
                ]}
                onPress={() => handleTabPress("profile")}
              >
                <Ionicons
                  name="person-outline"
                  size={20}
                  color={activeTab === "profile" ? accent : themeColors.muted}
                />
                <Text
                  style={[
                    styles.tabText,
                    activeTab === "profile" && {
                      color: accent,
                      fontWeight: "800",
                    },
                  ]}
                >
                  Profile
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.tab,
                  activeTab === "reviews" && styles.tabActive,
                ]}
                onPress={() => handleTabPress("reviews")}
              >
                <Ionicons
                  name="star-outline"
                  size={20}
                  color={activeTab === "reviews" ? accent : themeColors.muted}
                />
                <Text
                  style={[
                    styles.tabText,
                    activeTab === "reviews" && {
                      color: accent,
                      fontWeight: "800",
                    },
                  ]}
                >
                  Reviews ({storeReviews.length})
                </Text>
              </Pressable>
            </View>

            {/* Swipeable Tab Content */}
            <ScrollView
              ref={tabScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={handleScroll}
              scrollEventThrottle={16}
              style={styles.tabScrollView}
            >
              {/* Products Tab */}
              <View
                style={[styles.tabPage, { width: screenWidth, marginTop: 12 }]}
              >
                {displayData.length > 0 ? (
                  <FlatList
                    key={String(gridColumns)}
                    data={displayData}
                    keyExtractor={(item, index) =>
                      item?.id || `placeholder-${index}`
                    }
                    numColumns={gridColumns}
                    columnWrapperStyle={{
                      gap: 12,
                      paddingHorizontal: 12,
                      justifyContent: "flex-start",
                    }}
                    contentContainerStyle={{
                      paddingTop: 8,
                      paddingBottom: 24,
                    }}
                    renderItem={({ item }) => (
                      <View
                        style={{
                          flex: 1,
                          maxWidth: itemWidth,
                          marginBottom: 12,
                        }}
                      >
                        {item ? (
                          <ProductCard
                            product={item}
                            theme={theme}
                            onPress={() =>
                              navigation.navigate("ProductDetail", {
                                product: item,
                              })
                            }
                          />
                        ) : (
                          <ProductCardPlaceholder />
                        )}
                      </View>
                    )}
                    scrollEnabled={false}
                  />
                ) : !loading ? (
                  <View style={styles.emptyState}>
                    <Ionicons
                      name="cube-outline"
                      size={64}
                      color={themeColors.muted}
                    />
                    <Text style={styles.emptyText}>No products</Text>
                    <Text style={styles.emptySubtext}>
                      This store has no products available
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Profile Tab */}
              <View style={[styles.tabPage, { width: screenWidth }]}>
                <View style={styles.tabContent}>
                  <View style={styles.profileSection}>
                    <Text style={[styles.sectionTitle, { color: accent }]}>
                      About {sellerDetail?.name}
                    </Text>
                    <Text style={styles.profileText}>
                      {sellerDetail?.store_description?.trim()
                        ? sellerDetail.store_description.trim()
                        : `Welcome to ${sellerDetail?.name}! We are committed to providing high-quality products and excellent customer service.`}
                    </Text>
                  </View>

                  {/* Chat Button */}
                  <View style={styles.profileSection}>
                    <Pressable
                      style={[
                        styles.chatButton,
                        { backgroundColor: accent, borderColor: accent },
                      ]}
                      onPress={() =>
                        navigation.navigate("Chat", { seller: sellerDetail })
                      }
                    >
                      <Ionicons
                        name="chatbubble-outline"
                        size={20}
                        color="#fff"
                      />
                      <Text style={styles.chatButtonText}>
                        Chat with Seller
                      </Text>
                    </Pressable>
                  </View>

                  {/* Social Media Links */}
                  {(sellerDetail?.social_facebook ||
                    sellerDetail?.social_instagram ||
                    sellerDetail?.social_twitter ||
                    sellerDetail?.social_whatsapp ||
                    sellerDetail?.social_website) && (
                    <View style={styles.profileSection}>
                      <Text style={styles.sectionTitle}>Connect with Us</Text>
                      <View style={styles.socialLinks}>
                        {sellerDetail?.social_facebook && (
                          <Pressable
                            style={styles.socialButton}
                            onPress={() =>
                              openExternalLink(
                                sellerDetail.social_facebook,
                                "Facebook",
                              )
                            }
                          >
                            <Ionicons
                              name="logo-facebook"
                              size={20}
                              color="#1877F2"
                            />
                            <Text style={styles.socialText}>Facebook</Text>
                          </Pressable>
                        )}
                        {sellerDetail?.social_instagram && (
                          <Pressable
                            style={styles.socialButton}
                            onPress={() =>
                              openExternalLink(
                                sellerDetail.social_instagram,
                                "Instagram",
                              )
                            }
                          >
                            <Ionicons
                              name="logo-instagram"
                              size={20}
                              color="#E4405F"
                            />
                            <Text style={styles.socialText}>Instagram</Text>
                          </Pressable>
                        )}
                        {sellerDetail?.social_twitter && (
                          <Pressable
                            style={styles.socialButton}
                            onPress={() =>
                              openExternalLink(
                                sellerDetail.social_twitter,
                                "Twitter",
                              )
                            }
                          >
                            <Ionicons
                              name="logo-twitter"
                              size={20}
                              color="#1DA1F2"
                            />
                            <Text style={styles.socialText}>Twitter</Text>
                          </Pressable>
                        )}
                        {sellerDetail?.social_whatsapp && (
                          <Pressable
                            style={styles.socialButton}
                            onPress={() =>
                              openWhatsAppLink(sellerDetail.social_whatsapp)
                            }
                          >
                            <Ionicons
                              name="logo-whatsapp"
                              size={20}
                              color="#25D366"
                            />
                            <Text style={styles.socialText}>WhatsApp</Text>
                          </Pressable>
                        )}
                        {sellerDetail?.social_website && (
                          <Pressable
                            style={styles.socialButton}
                            onPress={() =>
                              openExternalLink(
                                sellerDetail.social_website,
                                "Website",
                              )
                            }
                          >
                            <Ionicons
                              name="globe-outline"
                              size={20}
                              color={themeColors.primary}
                            />
                            <Text style={styles.socialText}>Website</Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  )}

                  <View style={styles.profileSection}>
                    <Text style={[styles.sectionTitle, { color: accent }]}>
                      Store Statistics
                    </Text>
                    <View style={styles.statsGrid}>
                      <View style={styles.statBox}>
                        <Text style={[styles.statNumber, { color: accent }]}>
                          {storeProducts.length}
                        </Text>
                        <Text style={styles.statLabelSmall}>Products</Text>
                      </View>
                      <View style={styles.statBox}>
                        <Text style={[styles.statNumber, { color: accent }]}>
                          {storeReviews.length}
                        </Text>
                        <Text style={styles.statLabelSmall}>Reviews</Text>
                      </View>
                      <View style={styles.statBox}>
                        <Text style={[styles.statNumber, { color: accent }]}>
                          {averageRating}
                        </Text>
                        <Text style={styles.statLabelSmall}>Rating</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>

              {/* Reviews Tab */}
              <View style={[styles.tabPage, { width: screenWidth }]}>
                <View style={styles.tabContent}>
                  <View style={styles.reviewsHeader}>
                    <Text style={[styles.sectionTitle, { color: accent }]}>
                      Customer Reviews
                    </Text>
                    <View style={styles.ratingSummary}>
                      <Ionicons name="star" size={24} color={accent} />
                      <Text style={[styles.ratingNumber, { color: accent }]}>
                        {averageRating}
                      </Text>
                      <Text style={[styles.ratingCount, { color: accent }]}>
                        ({storeReviews.length} reviews)
                      </Text>
                    </View>
                  </View>
                  <View style={styles.reviewsList}>
                    {reviewsLoading ? (
                      <View style={{ alignItems: "center", padding: 24 }}>
                        <Text>Loading reviews...</Text>
                      </View>
                    ) : storeReviews.length > 0 ? (
                      storeReviews.map((review, reviewIndex) => {
                        const product = storeProducts.find(
                          (p) => p.id === review.product_id,
                        );
                        return (
                          <View
                            key={`${review.id}-${review.created_at || reviewIndex}`}
                            style={styles.reviewItem}
                          >
                            <View style={styles.reviewHeader}>
                              <View style={styles.reviewerAvatar}>
                                <Ionicons
                                  name="person"
                                  size={20}
                                  color={accent}
                                />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.reviewerName}>
                                  {userProfiles[review.user_id]?.full_name ||
                                    "Customer"}
                                </Text>
                                <Text style={styles.productName}>
                                  on {product?.title || "Unknown Product"}
                                </Text>
                                <View style={styles.reviewStars}>
                                  {[1, 2, 3, 4, 5].map((star) => (
                                    <Ionicons
                                      key={`${review.id}-star-${star}`}
                                      name={
                                        star <= review.rating
                                          ? "star"
                                          : "star-outline"
                                      }
                                      size={14}
                                      color={accent}
                                    />
                                  ))}
                                </View>
                              </View>
                            </View>
                            {review.comment && (
                              <Text style={styles.reviewText}>
                                {review.comment}
                              </Text>
                            )}
                            <Text style={styles.reviewDate}>
                              {new Date(review.created_at).toLocaleDateString()}
                            </Text>
                          </View>
                        );
                      })
                    ) : (
                      <View style={{ alignItems: "center", padding: 24 }}>
                        <Ionicons
                          name="chatbubble-outline"
                          size={48}
                          color={themeColors.muted}
                        />
                        <Text style={styles.emptyText}>No reviews yet</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            </ScrollView>
          </View>
        }
        renderItem={() => null}
        contentContainerStyle={[
          styles.listContainer,
          { paddingBottom: insets.bottom + 24 },
        ]}
        scrollEnabled={true}
        scrollIndicatorInsets={{ top: 0 }}
        overScrollMode="never"
      />

      {/* Status viewing now handled by StatusViewer screen */}
    </>
  );
};

const buildStoreStyles = (c, accent) =>
  StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    backButton: {
      padding: 8,
      marginLeft: -8,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: c.light,
    },
    listContainer: {
      flexGrow: 1,
    },
    // ── Compact store header card (replaces the old dark hero) ─────────────
    // Mirrors the reference design: cover image (or seller-themed gradient
    // fallback) at the top, with a floating white card that holds name +
    // verified badge, subtitle, inline stats, two CTAs, and a 2×2
    // trust-badges grid. The card overlaps the bottom of the image with
    // marginTop = -(coverHeight - peekHeight) so ~90% of the card sits on
    // top of the image and only a small slice peeks above. All colors come
    // from the theme palette so light/dark mode just works.
    headerBackdrop: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: 240,
    },
    headerBackdropImage: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: "100%",
      height: "100%",
    },
    headerBackdropGradient: {
      // Absolute so the gradient always sits edge-to-edge over the 240px
      // cover area, regardless of the image's render status. Combined with
      // its low opacity, the image still shows through on top of it.
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      opacity: 0.18,
    },
    headerCard: {
      marginHorizontal: 16,
      // Positive marginTop pushes the card down so its top edge sits inside
      // the bottom of the cover image: with the cover area at 240px and a
      // card of ~280-340px, this leaves only a thin slice of the card peeking
      // ABOVE the image's bottom edge while ~90% of the card sits BELOW it
      // — the classic "floating card on a cover" hero pattern.
      marginTop: 210,
      marginBottom: 12,
      padding: 18,
      borderRadius: 20,
      backgroundColor: c.surface,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.08,
      shadowRadius: 14,
      elevation: 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    headerNameRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    headerStoreName: {
      flexShrink: 1,
      fontSize: 22,
      fontWeight: "800",
      letterSpacing: 0.2,
      color: c.dark,
    },
    headerVerifiedBadge: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: c.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    headerSubtitle: {
      marginTop: 6,
      fontSize: 14,
      color: c.muted,
      fontWeight: "500",
    },
    headerStatsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 14,
      marginTop: 14,
    },
    headerStatChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    headerStatText: {
      fontSize: 14,
      color: c.muted,
      fontWeight: "600",
    },
    headerStatTextHighRated: {
      fontSize: 14,
      color: c.dark,
      fontWeight: "700",
    },
    headerActionsRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginTop: 18,
    },
    headerFollowBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: radius.full,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.background,
      alignItems: "center",
      justifyContent: "center",
    },
    headerFollowBtnActive: {
      // `accent` is the per-seller theme accent (falls back to brand primary
      // inside the component). We receive it as a builder arg because
      // buildStoreStyles runs at module scope where the component's
      // `themeColors` / `accent` are not in scope.
      backgroundColor: (accent || c.primary) + "20",
      borderColor: accent || c.primary,
    },
    headerFollowBtnText: {
      fontSize: 15,
      fontWeight: "700",
      color: c.dark,
    },
    headerFollowBtnTextActive: {
      color: c.light,
    },
    headerMessageBtn: {
      flex: 1.4,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 12,
      borderRadius: radius.full,
      backgroundColor: c.primary,
      shadowColor: c.primary,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.25,
      shadowRadius: 6,
      elevation: 3,
    },
    headerMessageBtnText: {
      fontSize: 15,
      fontWeight: "700",
      color: c.onPrimary,
    },
    headerDivider: {
      height: 1,
      backgroundColor: c.border,
      marginVertical: 18,
    },
    headerTrustGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
    },
    headerTrustItem: {
      width: "50%",
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      paddingVertical: 6,
      paddingRight: 8,
    },
    headerTrustIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: (accent || c.primary) + "14",
      alignItems: "center",
      justifyContent: "center",
      marginTop: 2,
    },
    headerTrustTextWrap: {
      flex: 1,
      minWidth: 0,
    },
    headerTrustTitle: {
      fontSize: 13,
      fontWeight: "700",
      color: c.dark,
    },
    headerTrustSubtitle: {
      fontSize: 12,
      color: c.muted,
      marginTop: 2,
    },
    // ── "You've hidden this seller" banner ─────────────────────────────────
    // Sits between the hero and the tab navigation. Muted style so it
    // doesn't compete with the primary Follow CTA. Uses the seller accent
    // color for the Unhide button so it stays consistent with the rest of
    // the page's accent system.
    hiddenBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginHorizontal: 16,
      marginTop: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: radius.md,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    hiddenBannerIconWrap: {
      width: 34,
      height: 34,
      borderRadius: radius.sm,
      backgroundColor: c.background,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
    },
    hiddenBannerText: {
      flex: 1,
    },
    hiddenBannerTitle: {
      fontSize: 13,
      fontWeight: "700",
      color: c.dark,
    },
    hiddenBannerSubtitle: {
      fontSize: 12,
      color: c.muted,
      marginTop: 2,
    },
    hiddenBannerBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radius.md,
      backgroundColor: c.background,
      borderWidth: 1.5,
      borderColor: c.border,
    },
    hiddenBannerBtnDisabled: {
      opacity: 0.6,
    },
    hiddenBannerBtnText: {
      fontSize: 13,
      fontWeight: "700",
    },
    productItem: {
      paddingHorizontal: 8,
    },
    columnWrapper: {
      justifyContent: "space-between",
      paddingHorizontal: 5,
    },
    gridItem: {
      width: "49%",
    },
    emptyState: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 60,
      gap: 12,
    },
    emptyText: {
      fontSize: 18,
      fontWeight: "700",
      color: c.dark,
    },
    emptySubtext: {
      fontSize: 13,
      color: c.muted,
    },
    tabScrollView: {
      flexGrow: 0,
    },
    tabPage: {
      minHeight: 300,
    },
    tabContainer: {
      flexDirection: "row",
      backgroundColor: c.light,
      marginHorizontal: 16,
      marginTop: 16,
      borderRadius: 12,
      padding: 4,
      shadowColor: "#000",
      shadowOpacity: 0.05,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    tab: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 12,
      paddingHorizontal: 8,
      borderRadius: 8,
    },
    tabActive: {
      backgroundColor: c.primary + "10",
    },
    tabText: {
      fontSize: 12,
      fontWeight: "600",
      color: c.muted,
    },
    tabTextActive: {
      color: c.primary,
    },
    tabContent: {
      padding: 16,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: c.dark,
      marginBottom: 12,
    },
    profileSection: {
      backgroundColor: c.light,
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
      shadowColor: "#000",
      shadowOpacity: 0.05,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    profileText: {
      fontSize: 14,
      color: c.dark,
      lineHeight: 20,
    },
    statsGrid: {
      flexDirection: "row",
      justifyContent: "space-around",
      marginTop: 8,
    },
    statBox: {
      alignItems: "center",
      gap: 4,
    },
    statNumber: {
      fontSize: 24,
      fontWeight: "800",
      color: c.primary,
    },
    statLabelSmall: {
      fontSize: 12,
      color: c.muted,
      fontWeight: "500",
    },
    reviewsHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 16,
    },
    ratingSummary: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    ratingNumber: {
      fontSize: 20,
      fontWeight: "700",
      color: c.dark,
    },
    ratingCount: {
      fontSize: 14,
      color: c.muted,
    },
    reviewsList: {
      gap: 16,
    },
    reviewItem: {
      backgroundColor: c.light,
      borderRadius: 12,
      padding: 16,
      shadowColor: "#000",
      shadowOpacity: 0.05,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    reviewHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginBottom: 8,
    },
    reviewerAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.light,
      alignItems: "center",
      justifyContent: "center",
    },
    reviewerName: {
      fontSize: 14,
      fontWeight: "600",
      color: c.dark,
      marginBottom: 2,
    },
    productName: {
      fontSize: 12,
      color: c.muted,
      marginBottom: 4,
    },
    reviewStars: {
      flexDirection: "row",
      gap: 2,
    },
    reviewText: {
      fontSize: 14,
      color: c.dark,
      lineHeight: 20,
      marginBottom: 8,
    },
    reviewDate: {
      fontSize: 12,
      color: c.muted,
    },
    chatButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.primary,
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: radius.md,
      gap: 8,
    },
    chatButtonText: {
      color: c.light,
      fontSize: 16,
      fontWeight: "600",
    },
    socialLinks: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
    },
    socialButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: radius.md,
      backgroundColor: c.light,
      minWidth: 100,
      justifyContent: "center",
    },
    socialText: {
      fontSize: 12,
      fontWeight: "500",
      color: c.dark,
    },
    // Status Styles
    storeAvatarContainer: {
      position: "relative",
      borderRadius: 50,
      padding: 3,
    },
    statusActive: {
      borderWidth: 3,
      borderColor: c.primary,
    },
    statusBadge: {
      position: "absolute",
      bottom: 0,
      right: 0,
      backgroundColor: c.primary,
      borderRadius: 12,
      minWidth: 20,
      height: 20,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: c.light,
    },
    statusBadgeText: {
      color: c.light,
      fontSize: 10,
      fontWeight: "800",
    },
    // Modal Styles
    modalContainer: {
      flex: 1,
      backgroundColor: "#000",
    },
    fullStatusImage: {
      width: "100%",
      height: "100%",
      resizeMode: "cover",
    },
    modalHeader: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      paddingHorizontal: 20,
      zIndex: 10,
    },
    progressBars: {
      flexDirection: "row",
      gap: 4,
      marginBottom: 16,
    },
    progressBar: {
      flex: 1,
      height: 3,
      backgroundColor: "rgba(255,255,255,0.3)",
      borderRadius: 2,
    },
    progressBarActive: {
      backgroundColor: c.light,
    },
    modalUserInfoRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    modalUserInfo: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    modalAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 2,
      borderColor: c.light,
    },
    modalUserName: {
      color: c.light,
      fontWeight: "700",
      fontSize: 16,
    },
    modalTime: {
      color: "rgba(255,255,255,0.8)",
      fontSize: 12,
    },
    closeButton: {
      padding: 8,
    },
    statusTextContainer: {
      position: "absolute",
      bottom: 100,
      left: 20,
      right: 20,
      backgroundColor: "rgba(0,0,0,0.5)",
      padding: 16,
      borderRadius: 12,
    },
    fullStatusText: {
      color: c.light,
      fontSize: 16,
      lineHeight: 22,
      textAlign: "center",
    },
    statusFooter: {
      position: "absolute",
      bottom: 40,
      left: 0,
      right: 0,
      paddingHorizontal: 20,
    },
    replyButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.2)",
      paddingVertical: 14,
      borderRadius: radius.full,
      gap: 10,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.3)",
    },
    replyButtonText: {
      color: c.light,
      fontWeight: "700",
      fontSize: 16,
    },
  });
