import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { ProductCard } from "../components/ProductCard";
import { ProductCardPlaceholder } from "../components/ProductCardPlaceholder";
import { AdRenderer } from "../components/AdBanner";
import { InlineAdProductCard } from "../components/InlineAdProductCard";
import { useShop } from "../context/ShopContext";
import { useAds } from "../context/AdsContext";
import { colors } from "../theme/colors";
import { useResponsive } from "../hooks/useResponsive";
import { injectAdsIntoProducts } from "../utils/adPlacement";

const PLACEHOLDER_COUNT_PER_PAGE = 4;

export const FeedScreen = ({ route, navigation }) => {
  const { products, refresh, loading, loadMore, hasMore, loadingMore } =
    useShop();
  const { fetchAdsByPlacement } = useAds();
  const { gridColumns, getItemWidth } = useResponsive();
  const itemWidth = getItemWidth(gridColumns, 12, 12);
  const [feedAds, setFeedAds] = useState([]);
  const category = route?.params?.category;
  const daySeed = useMemo(() => new Date().toDateString(), []);

  useEffect(() => {
    fetchAdsByPlacement("feed").then((ads) => setFeedAds(ads || []));
  }, [fetchAdsByPlacement]);

  const filtered = useMemo(
    () =>
      category ? products.filter((p) => p.category === category) : products,
    [products, category],
  );

  const overlayAds = useMemo(
    () =>
      (feedAds || []).filter((ad) =>
        ["popup", "fullscreen", "sticky_footer"].includes(
          String(ad?.style || "").toLowerCase(),
        ),
      ),
    [feedAds],
  );

  const feedItems = useMemo(() => {
    if (loading && filtered.length === 0) {
      return Array(gridColumns * PLACEHOLDER_COUNT_PER_PAGE).fill(null);
    }

    return injectAdsIntoProducts({
      products: filtered,
      ads: feedAds,
      seed: `feed-${category || "all"}-${daySeed}-${filtered.length}`,
      minInterval: 5,
      maxInterval: 8,
      maxAds: 3,
    });
  }, [loading, filtered, gridColumns, feedAds, category, daySeed]);

  const handleScroll = useCallback(
    ({ nativeEvent }) => {
      const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
      const distanceFromBottom =
        contentSize.height - contentOffset.y - layoutMeasurement.height;
      if (
        distanceFromBottom < 400 &&
        hasMore &&
        !loadingMore &&
        !loading &&
        !category
      ) {
        loadMore();
      }
    },
    [hasMore, loadingMore, loading, loadMore, category],
  );

  const renderItem = useCallback(
    ({ item }) => {
      if (item?.__type === "injected_ad") {
        return (
          <View style={{ flex: 1, maxWidth: itemWidth }}>
            <InlineAdProductCard ad={item.ad} />
          </View>
        );
      }

      return (
        <View style={{ flex: 1, maxWidth: itemWidth }}>
          {item ? (
            <ProductCard
              product={item}
              onPress={() =>
                navigation.navigate("ProductDetail", { product: item })
              }
            />
          ) : (
            <ProductCardPlaceholder />
          )}
        </View>
      );
    },
    [itemWidth, navigation],
  );

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Feed</Text>
        <Pressable
          style={styles.headerIcon}
          onPress={() => navigation.navigate("Wishlist")}
        >
          <Ionicons name="heart-outline" size={24} color={colors.dark} />
        </Pressable>
      </View>

      <FlatList
        data={feedItems}
        key={`${gridColumns}-${category || "all"}`}
        keyExtractor={(item, index) =>
          item?.id?.toString?.() || `feed-${index}`
        }
        numColumns={gridColumns}
        columnWrapperStyle={styles.gridRow}
        renderItem={renderItem}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={200}
        onScroll={handleScroll}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} />
        }
        ListFooterComponent={
          <>
            {loadingMore && (
              <View style={styles.loadMoreIndicator}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            )}
            <View style={{ height: 32 }} />
          </>
        }
      />

      {overlayAds.length > 0 && <AdRenderer ads={overlayAds} />}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: 56,
    paddingBottom: 14,
    paddingHorizontal: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F8",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.dark,
    letterSpacing: -0.5,
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#EEF2F8",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  container: {
    paddingTop: 8,
    paddingBottom: 8,
    gap: 12,
    backgroundColor: colors.background,
  },
  gridRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 12,
    justifyContent: "flex-start",
  },
  loadMoreIndicator: {
    paddingVertical: 20,
    alignItems: "center",
  },
});
