// HomeScreen
// ---------------------------------------------------------------------------
// Social-feed style discovery home screen (the app's landing tab). Keeps the
// same AppHeader, theme tokens, and floating bottom-nav patterns.
//
// Filter tabs:
//   For You   — default, uses the ShopContext product feed (Upstash-cached)
//   Following — products from sellers the user follows (express_follows)
//   Trending  — highest rated / discounted active products
//   Nearby    — location-based via browser geolocation / expo-location fallback
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppHeader } from "../components/AppHeader";
import { FeedProductCard } from "../components/FeedProductCard";
import { FeedCardPlaceholder } from "../components/FeedCardPlaceholder";
import { useShop } from "../context/ShopContext";
import { useAuth } from "../context/AuthContext";
import { lazyScroll } from "../context/LazyScrollContext";
import { useTheme } from "../context/ThemeContext";
import { useAppStyles } from "../hooks/useAppStyles";
import { radius } from "../theme/colors";
import { supabase } from "../lib/supabase";
import { updateTabBarOnScroll, showTabBar } from "../utils/tabBarAutoHide";

const FILTERS = ["For You", "Following", "Trending", "Nearby"];
const NEARBY_RADIUS_KM = 25;
// Number of categories shown in the horizontal strip on Home — ranked by the
// most active products. Tapping "See More" opens the full Categories tab.
const TOP_CATEGORIES_LIMIT = 5;
// Skeleton cards rendered in place of feed cards during the initial load.
// Rendered through the same FlatList as the real cards so the loading state
// keeps the page's full structure and is scrollable like the loaded feed.
const FEED_PLACEHOLDER_ITEMS = Array.from(
  { length: 6 },
  (_, i) => `feed-placeholder-${i}`,
);

export const HomeScreen = ({ navigation }) => {
  const { colors: c } = useTheme();
  const styles = useAppStyles(buildHomeStyles);
  const { user } = useAuth();
  const {
    products,
    loading,
    refresh,
    loadMore,
    hasMore,
    loadingMore,
    followedSellers,
  } = useShop();

  const [activeFilter, setActiveFilter] = useState("For You");
  const [refreshing, setRefreshing] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [nearbyProducts, setNearbyProducts] = useState(null);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [topCategories, setTopCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  // ── Auto-hiding header (direction-aware) ─────────────────────────────────
  // Same convention as the tab bar auto-hide util: finger swipe UP (reading
  // further down the feed) hides the header; swipe DOWN or being near the top
  // reveals it again. While hidden, the feed scrolls edge-to-edge — including
  // under the status bar.
  const insets = useSafeAreaInsets();
  // 1 = shown, 0 = hidden. The value is animated IMPERATIVELY from the scroll
  // handler (same pattern as the bottom tab bar in App.js) so the motion
  // starts in the same tick as the gesture instead of waiting for a React
  // re-render round-trip — that round-trip is what made it feel laggy.
  const headerAnim = useRef(new Animated.Value(1)).current;
  const headerHiddenRef = useRef(false);
  // Mirrors headerHiddenRef for pointerEvents only — never gates animation.
  const [headerHidden, setHeaderHidden] = useState(false);
  // Measured from the rendered header via onLayout (falls back to an estimate
  // for the first frame). Drives both the slide distance and the list's top
  // content inset.
  const [headerHeight, setHeaderHeight] = useState(insets.top + 76);
  const lastScrollYRef = useRef(0);

  const animateHeader = useCallback(
    (hide) => {
      if (headerHiddenRef.current === hide) return;
      headerHiddenRef.current = hide;
      setHeaderHidden(hide);
      Animated.timing(headerAnim, {
        toValue: hide ? 0 : 1,
        duration: 150, // snappier than the tab bar's 220ms
        easing: Easing.out(Easing.quad),
        useNativeDriver: true, // translateY only
      }).start();
    },
    [headerAnim],
  );

  const showHeader = useCallback(() => animateHeader(false), [animateHeader]);

  // ── Top categories: the 5 categories with the most active products ────────
  const loadTopCategories = useCallback(async () => {
    if (!supabase) {
      setTopCategories([]);
      setCategoriesLoading(false);
      return;
    }

    const toRanked = (rows) =>
      rows
        .map((cat) => ({
          id: cat.id,
          name: cat.name,
          icon: cat.icon,
          color: cat.color,
          image_url: cat.image_url,
          productCount: Number(cat.products_count?.[0]?.count || 0),
        }))
        .sort(
          (a, b) =>
            b.productCount - a.productCount ||
            String(a.name).localeCompare(String(b.name)),
        )
        .slice(0, TOP_CATEGORIES_LIMIT);

    try {
      // Preferred: server-side count via an embedded aggregate. The FK hint
      // disambiguates between the two relationships products has with
      // categories (category_id → id and category → name).
      const { data, error } = await supabase
        .from("express_categories")
        .select(
          "id,name,icon,color,image_url," +
            "products_count:express_products!express_products_category_fkey(count)",
        )
        .eq("is_active", true)
        .eq("express_products.status", "active")
        .order("sort_order");

      if (error) throw error;
      if (data) {
        setTopCategories(toRanked(data));
        setCategoriesLoading(false);
        return;
      }
    } catch (embedErr) {
      console.warn(
        "[HomeScreen] embedded category count failed, falling back:",
        embedErr?.message,
      );
    }

    // Fallback: aggregate counts client-side from the product `category`
    // name column (same field CategoryProductsScreen filters on).
    try {
      const [{ data: cats }, { data: prods }] = await Promise.all([
        supabase
          .from("express_categories")
          .select("id,name,icon,color,image_url")
          .eq("is_active", true)
          .order("sort_order"),
        supabase.from("express_products").select("category").eq("status", "active"),
      ]);

      const counts = new Map();
      (prods || []).forEach((p) => {
        const key = String(p.category || "").toLowerCase();
        if (!key) return;
        counts.set(key, (counts.get(key) || 0) + 1);
      });

      const ranked = (cats || [])
        .map((cat) => ({
          ...cat,
          productCount: counts.get(String(cat.name).toLowerCase()) || 0,
        }))
        .filter((cat) => cat.productCount > 0)
        .sort((a, b) => b.productCount - a.productCount)
        .slice(0, TOP_CATEGORIES_LIMIT);

      setTopCategories(ranked);
    } catch (fallbackErr) {
      console.warn("[HomeScreen] top categories load failed:", fallbackErr?.message);
      setTopCategories([]);
    } finally {
      setCategoriesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTopCategories();
  }, [loadTopCategories]);

  // ── Nearby: request geolocation and fetch sellers within radius ──────────
  const loadNearby = useCallback(async () => {
    if (!supabase) return;
    setNearbyLoading(true);
    try {
      let coords = null;
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        coords = await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve(pos.coords),
            () => resolve(null),
            { timeout: 8000 },
          );
        });
      }
      setUserLocation(coords);

      // Fetch sellers with coordinates; fall back to all products when no
      // geo data is available on either side.
      const { data: sellers } = await supabase
        .from("express_sellers")
        .select("id, latitude, longitude")
        .eq("is_active", true);

      if (!coords || !sellers?.length) {
        setNearbyProducts([]);
        return;
      }

      const nearbyIds = sellers
        .filter((s) => {
          if (s.latitude == null || s.longitude == null) return false;
          const dLat = (s.latitude - coords.latitude) * 111;
          const dLon =
            (s.longitude - coords.longitude) *
            111 *
            Math.cos((coords.latitude * Math.PI) / 180);
          return Math.sqrt(dLat * dLat + dLon * dLon) <= NEARBY_RADIUS_KM;
        })
        .map((s) => s.id);

      if (nearbyIds.length === 0) {
        setNearbyProducts([]);
        return;
      }

      const { data } = await supabase
        .from("express_products")
        .select(
          "*, seller_id(id,name,avatar,rating,total_ratings,badges,store_description)",
        )
        .eq("status", "active")
        .not("seller_id", "is", null)
        .eq("seller_id.is_active", true)
        .in("seller_id", nearbyIds)
        .order("created_at", { ascending: false })
        .limit(30);
      setNearbyProducts(data || []);
    } catch (e) {
      console.warn("[HomeScreen] nearby load failed:", e?.message);
      setNearbyProducts([]);
    } finally {
      setNearbyLoading(false);
    }
  }, []);

  useEffect(() => {
    if (
      activeFilter === "Nearby" &&
      nearbyProducts === null &&
      !nearbyLoading
    ) {
      loadNearby();
    }
  }, [activeFilter, nearbyProducts, nearbyLoading, loadNearby]);

  // ── Feed items per filter ────────────────────────────────────────────────
  const feedItems = useMemo(() => {
    switch (activeFilter) {
      case "Following": {
        if (!followedSellers.length) return [];
        return products.filter((p) => followedSellers.includes(p.seller?.id));
      }
      case "Trending":
        return [...products]
          .sort((a, b) => {
            const scoreA = Number(a.rating || 0) * 10 + Number(a.discount || 0);
            const scoreB = Number(b.rating || 0) * 10 + Number(b.discount || 0);
            return scoreB - scoreA;
          })
          .slice(0, 30);
      case "Nearby":
        return nearbyProducts || [];
      default:
        return products;
    }
  }, [activeFilter, products, followedSellers, nearbyProducts]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    showHeader();
    if (activeFilter === "Nearby") {
      setNearbyProducts(null);
      await loadNearby();
    } else {
      await refresh({ silent: true });
    }
    loadTopCategories();
    setRefreshing(false);
  }, [activeFilter, refresh, loadNearby, loadTopCategories, showHeader]);

  const handleScroll = useCallback(
    (e) => {
      lazyScroll.notify(e.nativeEvent.contentOffset.y);
      // Direction-aware tab bar auto-hide (hide on upward swipe, show on
      // downward swipe / near top).
      updateTabBarOnScroll(e.nativeEvent.contentOffset.y);
      const y = e.nativeEvent.contentOffset.y;
      // Direction-aware header auto-hide (same convention as the tab bar:
      // swipe up → hide, swipe down or near top → show). Animated directly
      // here so it reacts instantly, no re-render round-trip.
      const delta = y - lastScrollYRef.current;
      lastScrollYRef.current = y;
      if (y <= 60) {
        animateHeader(false);
      } else if (delta > 8) {
        animateHeader(true);
      } else if (delta < -8) {
        animateHeader(false);
      }
      const { contentSize, layoutMeasurement, contentOffset } = e.nativeEvent;
      const distanceFromBottom =
        contentSize.height - layoutMeasurement.height - contentOffset.y;
      if (distanceFromBottom < 400 && hasMore && !loadingMore) {
        loadMore();
      }
    },
    [hasMore, loadingMore, loadMore, animateHeader],
  );

  const renderFeedItem = useCallback(
    ({ item }) => (
      <View style={[styles.cardWrap, { width: "100%" }]}>
        <FeedProductCard
          product={item}
          onPress={() =>
            navigation.navigate("ProductDetail", { product: item })
          }
        />
      </View>
    ),
    [navigation, styles],
  );

  // Skeleton rows for the initial load — same wrapper as renderFeedItem so
  // placeholder cards sit exactly where real cards will appear.
  const renderPlaceholderItem = useCallback(
    () => (
      <View style={[styles.cardWrap, { width: "100%" }]}>
        <FeedCardPlaceholder />
      </View>
    ),
    [styles],
  );

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <Ionicons
        name={
          activeFilter === "Following"
            ? "people-outline"
            : activeFilter === "Nearby"
              ? "location-outline"
              : "sparkles-outline"
        }
        size={40}
        color={c.muted}
      />
      <Text style={styles.emptyTitle}>
        {activeFilter === "Following"
          ? "No listings from sellers you follow yet"
          : activeFilter === "Nearby"
            ? userLocation
              ? "No listings found near you"
              : "Location permission needed to find nearby listings"
            : "Nothing trending right now"}
      </Text>
      {activeFilter === "Following" && !followedSellers.length && (
        <Pressable
          style={styles.emptyAction}
          onPress={() => navigation.navigate("Stores")}
        >
          <Text style={styles.emptyActionText}>Discover stores</Text>
        </Pressable>
      )}
    </View>
  );

  // Categories strip rendered as the FlatList's header so it scrolls away
  // together with the feed cards.
  const listHeader = (
    <View style={styles.catSection}>
      {/* Filter pills — scroll with the feed: hide as you read down, come
          back when you scroll up. */}
      <View style={styles.filterBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {FILTERS.map((filter) => {
            const isActive = filter === activeFilter;
            return (
              <Pressable
                key={filter}
                onPress={() => {
                  setActiveFilter(filter);
                  // Content resets on filter switch — keep bars visible.
                  showTabBar();
                  showHeader();
                }}
                style={[styles.filterPill, isActive && styles.filterPillActive]}
              >
                <Text
                  style={[styles.filterText, isActive && styles.filterTextActive]}
                >
                  {filter}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.catHeaderRow}>
        <Text style={styles.catSectionTitle}>Categories</Text>
        <Pressable
          hitSlop={8}
          style={styles.seeMoreBtn}
          onPress={() => navigation.navigate("Categories")}
          accessibilityRole="button"
          accessibilityLabel="See more categories"
        >
          <Text style={styles.seeMoreText}>See More</Text>
          <Ionicons name="chevron-forward" size={14} color={c.primary} />
        </Pressable>
      </View>

      {categoriesLoading && !topCategories.length ? (
        // Skeleton cards shaped like the category cards
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catRow}
        >
          {Array.from({ length: TOP_CATEGORIES_LIMIT }).map((_, i) => (
            <View key={i} style={styles.catCard}>
              <View style={[styles.catImageFallback, styles.catSkeletonBg]} />
              <View style={styles.catInfo}>
                <View style={[styles.catSkeletonLine, { width: 80 }]} />
                <View style={[styles.catSkeletonLine, { width: 44 }]} />
              </View>
            </View>
          ))}
        </ScrollView>
      ) : topCategories.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catRow}
        >
          {topCategories.map((cat) => (
            <Pressable
              key={cat.id}
              style={({ pressed }) => [
                styles.catCard,
                pressed && styles.catCardPressed,
              ]}
              onPress={() =>
                navigation.navigate("CategoryProducts", {
                  category: { id: cat.id, name: cat.name },
                })
              }
            >
              {/* Background: photo if one exists, otherwise brand color with
                  the category icon. Only ever one of the two renders, so the
                  card reads as a single surface. */}
              {cat.image_url ? (
                <Image
                  source={{ uri: cat.image_url }}
                  style={styles.catImage}
                  resizeMode="cover"
                />
              ) : (
                <View
                  style={[
                    styles.catImageFallback,
                    cat.color ? { backgroundColor: cat.color } : null,
                  ]}
                >
                  <Ionicons
                    name={cat.icon || "apps"}
                    size={40}
                    color="rgba(255,255,255,0.9)"
                  />
                </View>
              )}

              {/* Layer 3: bottom-weighted gradient — one continuous surface
                  under both the photo and the label, no seam */}
              <LinearGradient
                colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.25)", "rgba(0,0,0,0.75)"]}
                locations={[0.45, 0.7, 1]}
                style={styles.catScrim}
              />

              {/* Layer 4: label overlaid on the gradient */}
              <View style={styles.catInfo}>
                <Text style={styles.catName} numberOfLines={1}>
                  {cat.name}
                </Text>
                <Text style={styles.catCount}>
                  {cat.productCount} {cat.productCount === 1 ? "item" : "items"}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );

  return (
    // NOTE: no LazyScrollContext here — LazyImage's measureLayout-based lazy
    // hydration only works inside a plain ScrollView (Home). Inside a
    // virtualized FlatList the measurement is invalid, so cards render their
    // images eagerly instead.
    <View style={styles.container}>
      {/* Auto-hide header: overlays the feed (not in flow) and slides up out
          of view on upward swipe. While hidden, cards scroll edge-to-edge,
          including under the status bar. */}
      <Animated.View
        pointerEvents={headerHidden ? "none" : "auto"}
        style={[
          styles.headerOverlay,
          {
            transform: [
              {
                translateY: headerAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-headerHeight, 0],
                }),
              },
            ],
          },
        ]}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h > 0 && Math.abs(h - headerHeight) > 1) setHeaderHeight(h);
        }}
      >
        <AppHeader
          onAccountPress={() => navigation.navigate("Account")}
          onSearchPress={() => navigation.navigate("Search")}
          onStoresPress={() => navigation.navigate("Stores")}
          onNotificationsPress={() => navigation.navigate("Notifications")}
        />
      </Animated.View>

      {/* Categories strip renders inside the FlatList header so it scrolls
          together with the feed — see listHeader below. */}

      {/* Filter pill row lives inside the FlatList header (see listHeader)
          so it scrolls away with the feed and back again. */}

      {/* FlatList renders in BOTH states: while loading it receives skeleton
          items so the page keeps its exact structure (filter pills →
          categories strip → feed-shaped skeletons) and the placeholders are
          scrollable exactly like the loaded feed. */}
      <FlatList
        data={loading ? FEED_PLACEHOLDER_ITEMS : feedItems}
        keyExtractor={(item) =>
          loading ? String(item) : String(item?.id ?? item)
        }
        renderItem={loading ? renderPlaceholderItem : renderFeedItem}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={!loading && !nearbyLoading ? renderEmpty : null}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: headerHeight + 8 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            progressViewOffset={headerHeight}
          />
        }
        initialNumToRender={3}
        maxToRenderPerBatch={4}
        windowSize={5}
      />

      {(activeFilter === "Nearby" && nearbyLoading) || loadingMore ? (
        <View style={styles.footerLoader}>
          <ActivityIndicator size="small" color={c.primary} />
        </View>
      ) : null}
    </View>
  );
};

const buildHomeStyles = (c) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
      
    },
    // Header floats above the feed; translateY slides it fully off-screen.
    headerOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10,
      elevation: 10,
    },
    filterBar: {
      paddingTop: 10,
      paddingBottom: 6,
    },
    filterRow: {
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 12,
    },
    filterPill: {
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surfaceAlpha,
      paddingVertical: 8,
      paddingHorizontal: 18,
    },
    filterPillActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    filterText: {
      fontSize: 13,
      fontWeight: "700",
      color: c.muted,
    },
    filterTextActive: {
      color: c.onPrimary,
    },
    listContent: {
      flexGrow: 1,
    },
    cardWrap: {
      marginBottom: 0,
    },
    emptyState: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 60,
      gap: 12,
      paddingHorizontal: 32,
    },
    emptyTitle: {
      fontSize: 14,
      fontWeight: "600",
      color: c.muted,
      textAlign: "center",
    },
    emptyAction: {
      backgroundColor: c.primary,
      borderRadius: radius.full,
      paddingVertical: 10,
      paddingHorizontal: 22,
    },
    emptyActionText: {
      color: c.onPrimary,
      fontSize: 13,
      fontWeight: "700",
    },
    footerLoader: {
      position: "absolute",
      bottom: 130,
      alignSelf: "center",
    },
    // ── Top categories strip (ProductCard-style cards) ──────────────────────
    catSection: {
      paddingTop: 8,
    },
    catHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 14,
      paddingBottom: 10,
    },
    catSectionTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: c.dark,
    },
    seeMoreBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
    },
    seeMoreText: {
      fontSize: 13,
      fontWeight: "700",
      color: c.primary,
    },
    catRow: {
      flexDirection: "row",
      gap: 12,
      paddingHorizontal: 14,
      paddingBottom: 6,
    },
    // Mirrors ProductCard's card treatment: rounded, bordered, soft shadow
    catCard: {
      width: 170,
      height: 220,
      backgroundColor: c.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: c.border,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOpacity: 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 5,
    },
    catCardPressed: {
      opacity: 0.8,
      transform: [{ scale: 0.98 }],
    },
    catImage: {
      ...StyleSheet.absoluteFillObject,
      width: "100%",
      height: "100%",
      zIndex: 0,
    },
    catImageFallback: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: c.primary,
      alignItems: "center",
      justifyContent: "center",
      // Nudge the icon's optical center up so it sits in the open space
      // above the name/count block instead of crowding it.
      paddingBottom: 40,
      zIndex: 0,
    },
    // Bottom-weighted gradient dim — spans the whole card so image and label
    // share one continuous surface with no visible seam.
    catScrim: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 1,
    },
    // Label is a true overlay pinned to the card's bottom edge — same surface
    // as the image behind it, never a separate block.
    catInfo: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 2,
      paddingHorizontal: 12,
      paddingBottom: 10,
      gap: 1,
    },
    catName: {
      fontSize: 13,
      fontWeight: "800",
      color: "#FFFFFF",
      textShadowColor: "rgba(0, 0, 0, 0.4)",
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    catCount: {
      fontSize: 11,
      fontWeight: "600",
      color: "rgba(255, 255, 255, 0.9)",
    },
    catSkeletonBg: {
      backgroundColor: c.surfaceAlpha,
    },
    catSkeletonLine: {
      height: 8,
      borderRadius: 4,
      backgroundColor: "rgba(255, 255, 255, 0.5)",
    },
  });
