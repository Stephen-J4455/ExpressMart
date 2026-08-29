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
import { useFocusEffect } from "@react-navigation/native";
import { AppHeader } from "../components/AppHeader";
import { FeedProductCard } from "../components/FeedProductCard";
import { FeedCardPlaceholder } from "../components/FeedCardPlaceholder";
import { ProductCard } from "../components/ProductCard";
import { useShop } from "../context/ShopContext";
import { useAuth } from "../context/AuthContext";
import { lazyScroll } from "../context/LazyScrollContext";
import { useTheme } from "../context/ThemeContext";
import { useAppStyles } from "../hooks/useAppStyles";
import { radius } from "../theme/colors";
import { supabase } from "../lib/supabase";
import { flashSaleService } from "../services/flashSaleService";
import {
  loadHiddenSellers,
} from "../utils/hiddenSellers";
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
  // Active flash sales surfaced as a horizontally-scrolling row on the home
  // feed. `null` means we haven't fetched yet (renders nothing); an empty
  // array means "fetched and there are no live flash sales" (also renders
  // nothing); a non-empty array renders the row.
  const [flashSales, setFlashSales] = useState(null);

  // Local mirror of the device-wide hidden-sellers list. Hydrated from
  // AsyncStorage on mount / focus so we don't show previously-hidden sellers
  // again on app launch (e.g. sellers the user hid from the feed in a prior
  // session before the menu action was removed).
  const [hiddenSellers, setHiddenSellers] = useState([]);

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
  // Personalization note: when the signed-in user has enough event signal
  // (express_user_events), the "Picked for you" row at the top of the
  // feed could replace this with the user's top categories. For the
  // first cut we keep the existing recency-sorted strip and let the
  // personalized product order do the work; a follow-up can add a
  // separate `feed-top-categories` edge function that reads the same
  // signal map and returns {id, name}[].
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

  // ── Active flash sales: load once on mount and again whenever the screen
  // comes back into focus (so a flash sale that started mid-session shows up).
  // The service returns `{ success, data }` where `data` is an array of flash
  // sale rows joined with their product. We flatten it into the shape the
  // ProductCard + FlashSaleCountdown components expect.
  const loadFlashSales = useCallback(async () => {
    if (!supabase) {
      setFlashSales([]);
      return;
    }
    try {
      const { success, data } = await flashSaleService.getActiveFlashSales();
      if (!success || !Array.isArray(data)) {
        setFlashSales([]);
        return;
      }
      // Filter out entries whose product isn't loaded — those would render as
      // empty cards. Keep the rest ordered by soonest-to-end.
      const now = Date.now();
      const live = data.filter(
        (fs) =>
          fs?.product &&
          fs?.product?.status === "active" &&
          new Date(fs.end_time).getTime() > now,
      );
      setFlashSales(live);
    } catch (e) {
      console.warn("[HomeScreen] flash sales load failed:", e?.message);
      setFlashSales([]);
    }
  }, []);

  // Re-fetch on focus (and on first mount) so a flash sale that started
  // mid-session appears without needing a full reload.
  useFocusEffect(
    useCallback(() => {
      loadFlashSales();
      // Hydrate the hidden-sellers list from disk every time we re-enter the
      // screen — covers the case where the user unhides a seller from a
      // future Settings screen, or where a sibling device syncs a different
      // set.
      loadHiddenSellers()
        .then((list) => setHiddenSellers(Array.isArray(list) ? list : []))
        .catch(() => {});
    }, [loadFlashSales]),
  );

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
  // `feedItems` is the product list filtered for the current tab. If we have
  // live flash sales and the list has enough room (≥10 items), the flash-sale
  // strip is injected at the 10th index so it surfaces only after the user
  // has scrolled past 10 real products. The injected row uses the special
  // `__type === "flash_sale_row"` discriminator that `renderFeedItem` checks
  // for before falling back to a regular `FeedProductCard`.
  const FLASH_SALE_INSERT_AFTER = 10; // show flash sale strip after this many products

  const injectFlashSaleRow = useCallback(
    (items) => {
      if (!Array.isArray(items) || items.length < FLASH_SALE_INSERT_AFTER) {
        return items;
      }
      if (!Array.isArray(flashSales) || flashSales.length === 0) {
        return items;
      }
      // Insert the flash-sale row right after the 10th product (index 10).
      const insertIndex = FLASH_SALE_INSERT_AFTER;
      const before = items.slice(0, insertIndex);
      const after = items.slice(insertIndex);
      return [
        ...before,
        { __type: "flash_sale_row", id: "flash-sale-row", sales: flashSales },
        ...after,
      ];
    },
    [flashSales],
  );

  // Drop products whose seller is in the user's hidden list. Done before the
  // flash-sale splice so the 10-count gate still corresponds to real products.
  const filterHiddenSellers = useCallback(
    (items) => {
      if (!Array.isArray(hiddenSellers) || hiddenSellers.length === 0) {
        return items;
      }
      const hiddenSet = new Set(hiddenSellers);
      return items.filter((p) => {
        const sellerId =
          (p?.seller && (p.seller.id || p.seller)) ||
          p?.seller_id?.id ||
          p?.seller_id;
        return !sellerId || !hiddenSet.has(String(sellerId));
      });
    },
    [hiddenSellers],
  );

  const feedItems = useMemo(() => {
    let base;
    switch (activeFilter) {
      case "Following": {
        base = followedSellers.length
          ? products.filter((p) =>
              followedSellers.includes(p.seller?.id),
            )
          : [];
        break;
      }
      case "Trending":
        base = [...products]
          .sort((a, b) => {
            const scoreA = Number(a.rating || 0) * 10 + Number(a.discount || 0);
            const scoreB = Number(b.rating || 0) * 10 + Number(b.discount || 0);
            return scoreB - scoreA;
          })
          .slice(0, 30);
        break;
      case "Nearby":
        base = nearbyProducts || [];
        break;
      default:
        base = products;
    }
    return injectFlashSaleRow(filterHiddenSellers(base));
  }, [
    activeFilter,
    products,
    followedSellers,
    nearbyProducts,
    injectFlashSaleRow,
    filterHiddenSellers,
  ]);

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

  // Renders one row in the FlatList. Regular products go through the standard
  // FeedProductCard. The injected flash-sale row (synthesized by
  // `injectFlashSaleRow`) is matched by its `__type` discriminator and
  // rendered as a horizontal scroller of compact ProductCards — each card
  // already shows its own countdown via the `flashSale` prop, so we don't
  // stack another timer on top of it.
  const renderFeedItem = useCallback(
    ({ item }) => {
      if (item?.__type === "flash_sale_row") {
        return (
          <View style={styles.flashSaleSection}>
            <View style={styles.flashSaleHeaderRow}>
              <View style={styles.flashSaleTitleGroup}>
                <LinearGradient
                  colors={["#EF4444", "#DC2626"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.flashSaleIconBadge}
                >
                  <Ionicons name="flash" size={14} color="#fff" />
                </LinearGradient>
                <Text style={styles.flashSaleTitle}>Flash Sale</Text>
                <View style={styles.flashSaleLiveDot} />
              </View>
              <Text style={styles.flashSaleCount}>
                {item.sales.length}{" "}
                {item.sales.length === 1 ? "deal" : "deals"} live
              </Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.flashSaleRow}
            >
              {item.sales.map((fs) => (
                <View
                  key={fs.id || `${fs.product_id}-${fs.start_time}`}
                  style={styles.flashSaleCardWrap}
                >
                  <ProductCard
                    product={fs.product}
                    compact
                    hideCta
                    flashSale={fs}
                    onPress={() =>
                      navigation.navigate("ProductDetail", {
                        product: fs.product,
                      })
                    }
                  />
                </View>
              ))}
            </ScrollView>
          </View>
        );
      }
      return (
        <View style={[styles.cardWrap, { width: "100%" }]}>
          <FeedProductCard
            product={item}
            onPress={() =>
              navigation.navigate("ProductDetail", { product: item })
            }
          />
        </View>
      );
    },
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

      {/* ── Flash Sale strip (inline-injected into the FlatList data, NOT here).
          Kept out of `listHeader` so it appears only after the user has
          scrolled past 10 feed products, matching the "show after 10" rule.
          See `injectFlashSaleRow` in `feedItems` memo below. */}

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
    // ── Flash Sale strip (horizontal ProductCards, only when live deals) ───
    flashSaleSection: {
      paddingTop: 14,
      paddingBottom: 4,
    },
    flashSaleHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 14,
      paddingBottom: 10,
    },
    flashSaleTitleGroup: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    flashSaleIconBadge: {
      width: 26,
      height: 26,
      borderRadius: radius.sm,
      alignItems: "center",
      justifyContent: "center",
    },
    flashSaleTitle: {
      fontSize: 16,
      fontWeight: "900",
      color: c.dark,
      letterSpacing: 0.2,
    },
    // Pulsing-style "live" dot — flat single color (animations live in the
    // component if needed). Subtle but obvious that this is a real-time row.
    flashSaleLiveDot: {
      width: 8,
      height: 8,
      borderRadius: radius.full,
      backgroundColor: "#EF4444",
    },
    flashSaleCount: {
      fontSize: 12,
      fontWeight: "700",
      color: "#EF4444",
    },
    flashSaleRow: {
      flexDirection: "row",
      gap: 12,
      paddingHorizontal: 14,
      paddingBottom: 6,
    },
    flashSaleCardWrap: {
      width: 175,
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
