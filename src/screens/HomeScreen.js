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

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
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

const FILTERS = ["For You", "Following", "Trending", "Nearby"];
const NEARBY_RADIUS_KM = 25;

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
    if (activeFilter === "Nearby") {
      setNearbyProducts(null);
      await loadNearby();
    } else {
      await refresh({ silent: true });
    }
    setRefreshing(false);
  }, [activeFilter, refresh, loadNearby]);

  const handleScroll = useCallback(
    (e) => {
      lazyScroll.notify(e.nativeEvent.contentOffset.y);
      const { contentSize, layoutMeasurement, contentOffset } = e.nativeEvent;
      const distanceFromBottom =
        contentSize.height - layoutMeasurement.height - contentOffset.y;
      if (distanceFromBottom < 400 && hasMore && !loadingMore) {
        loadMore();
      }
    },
    [hasMore, loadingMore, loadMore],
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

  return (
    // NOTE: no LazyScrollContext here — LazyImage's measureLayout-based lazy
    // hydration only works inside a plain ScrollView (Home). Inside a
    // virtualized FlatList the measurement is invalid, so cards render their
    // images eagerly instead.
    <View style={styles.container}>
      <AppHeader
        onSearchPress={() => navigation.navigate("Search")}
        onChatPress={() => navigation.navigate("Chats")}
        onNotificationsPress={() => navigation.navigate("Notifications")}
      />

      {/* Filter pill row */}
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
                onPress={() => setActiveFilter(filter)}
                style={[styles.filterPill, isActive && styles.filterPillActive]}
              >
                <Text
                  style={[
                    styles.filterText,
                    isActive && styles.filterTextActive,
                  ]}
                >
                  {filter}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        // Skeleton placeholders shaped like feed cards — no spinner.
        <View style={styles.placeholderList}>
          {[0, 1, 2].map((i) => (
            <FeedCardPlaceholder key={i} />
          ))}
        </View>
      ) : (
        <FlatList
          data={feedItems}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderFeedItem}
          ListEmptyComponent={!nearbyLoading ? renderEmpty : null}
          onScroll={handleScroll}
          scrollEventThrottle={200}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          initialNumToRender={3}
          maxToRenderPerBatch={4}
          windowSize={5}
        ></FlatList>
      )}

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
      paddingBottom: 50,
    },
    placeholderList: {
      flex: 1,
      paddingHorizontal: 12,
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
      paddingBottom: 24,
      flexGrow: 1,
    },
    cardWrap: {
      marginBottom: 4,
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
  });
