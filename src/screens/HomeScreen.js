import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Animated,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppHeader } from "../components/AppHeader";
import { CategoryScroller } from "../components/CategoryScroller";
import { ProductCard } from "../components/ProductCard";
import { ProductCardPlaceholder } from "../components/ProductCardPlaceholder";
import { SellerScroller } from "../components/SellerScroller";
import { AdRenderer } from "../components/AdBanner";
import { InlineAdProductCard } from "../components/InlineAdProductCard";
import { StatusRow } from "../components/StatusRow";
import { useShop } from "../context/ShopContext";
import { useAds } from "../context/AdsContext";
import { flashSaleService } from "../services/flashSaleService";
import { colors } from "../theme/colors";
import { useResponsive } from "../hooks/useResponsive";
import { injectAdsIntoProducts } from "../utils/adPlacement";

export const HomeScreen = ({ navigation }) => {
  const {
    products,
    categories,
    sellers,
    followedSellers,
    loading,
    refresh,
    loadMore,
    hasMore,
    loadingMore,
  } = useShop();
  const { fetchAdsByPlacement } = useAds();
  const { gridColumns, getItemWidth } = useResponsive();
  const { width: screenWidth } = useWindowDimensions();
  const itemWidth = getItemWidth(gridColumns, 12, 12);
  const [homeAds, setHomeAds] = useState([]);
  const [featuredAds, setFeaturedAds] = useState([]);
  const [flashSales, setFlashSales] = useState([]);
  const [loadingFlashSales, setLoadingFlashSales] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFeed, setActiveFeed] = useState("forYou");
  const daySeed = useMemo(() => new Date().toDateString(), []);
  const tabPagesRef = useRef(null);
  const feedTabsScrollRef = useRef(null);
  const [tabsContainerWidth, setTabsContainerWidth] = useState(0);
  const [tabLayouts, setTabLayouts] = useState({});
  const feedTabs = useMemo(
    () => [
      { key: "forYou", label: "For You" },
      { key: "flashSales", label: "⚡ Flash Sales" },
      { key: "topRated", label: "Top Rated" },
      { key: "newArrivals", label: "New Arrivals" },
      { key: "trending", label: "Trending" },
      { key: "followedStores", label: "From Followed Stores" },
      { key: "budgetPicks", label: "Budget Picks < 100 GHC" },
    ],
    [],
  );

  // Detect scroll near bottom to trigger load-more for the currently visible tab
  const handlePageScroll = useCallback(
    ({ nativeEvent }) => {
      const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
      const distanceFromBottom =
        contentSize.height - contentOffset.y - layoutMeasurement.height;
      if (distanceFromBottom < 400 && hasMore && !loadingMore && !loading) {
        loadMore();
      }
    },
    [hasMore, loadingMore, loading, loadMore],
  );

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  // Opening animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  // Load ads
  useEffect(() => {
    const loadAds = async () => {
      const homeAdsData = await fetchAdsByPlacement("home");
      setHomeAds(homeAdsData);

      const featuredAdsData = await fetchAdsByPlacement("feed");
      setFeaturedAds(featuredAdsData);
    };

    loadAds();
  }, [fetchAdsByPlacement]);

  // Load flash sales
  useEffect(() => {
    const loadFlashSales = async () => {
      setLoadingFlashSales(true);
      const { success, data } = await flashSaleService.getActiveFlashSales();
      if (success) {
        setFlashSales(data || []);
      }
      setLoadingFlashSales(false);
    };

    loadFlashSales();

    // Refresh flash sales every minute to update countdowns
    const interval = setInterval(loadFlashSales, 60000);
    return () => clearInterval(interval);
  }, []);

  const featured = useMemo(
    () =>
      products
        .slice()
        .sort(() => Math.random() - 0.5)
        .slice(0, 12),
    [products],
  );

  const topRated = useMemo(
    () =>
      products
        .slice()
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 12),
    [products],
  );

  const newArrivals = useMemo(
    () =>
      products
        .slice()
        .sort(
          (a, b) =>
            new Date(b?.created_at || 0).getTime() -
            new Date(a?.created_at || 0).getTime(),
        )
        .slice(0, 12),
    [products],
  );

  const trending = useMemo(
    () =>
      products
        .slice()
        .sort((a, b) => {
          const score = (item) => {
            const badges = (item?.badges || []).join(" ").toLowerCase();
            const badgeBoost =
              badges.includes("flash") ||
              badges.includes("deal") ||
              badges.includes("bestseller") ||
              badges.includes("top")
                ? 1
                : 0;
            return Number(item?.rating || 0) + Number(item?.discount || 0) / 25 + badgeBoost;
          };
          return score(b) - score(a);
        })
        .slice(0, 12),
    [products],
  );

  const followedStoreProducts = useMemo(() => {
    if (!Array.isArray(followedSellers) || followedSellers.length === 0) return [];
    const followedSet = new Set(followedSellers);
    return products
      .filter((product) => followedSet.has(product?.seller?.id))
      .slice(0, 12);
  }, [products, followedSellers]);

  const budgetPicks = useMemo(
    () =>
      products
        .filter((product) => Number(product?.price || 0) <= 100)
        .sort((a, b) => Number(a?.price || 0) - Number(b?.price || 0))
        .slice(0, 12),
    [products],
  );

  const forYouData = useMemo(() => {
    const baseData = loading ? Array(gridColumns * 2).fill(null) : featured;
    if (loading) return baseData;

    return injectAdsIntoProducts({
      products: baseData,
      ads: homeAds,
      seed: `home-foryou-${daySeed}-${featured.length}`,
      minInterval: 4,
      maxInterval: 7,
      maxAds: 2,
    });
  }, [loading, gridColumns, featured, homeAds, daySeed]);

  const topRatedData = useMemo(() => {
    const baseData = loading ? Array(gridColumns * 2).fill(null) : topRated;
    if (loading) return baseData;

    return injectAdsIntoProducts({
      products: baseData,
      ads: featuredAds,
      seed: `home-top-rated-${daySeed}-${topRated.length}`,
      minInterval: 4,
      maxInterval: 7,
      maxAds: 2,
    });
  }, [loading, gridColumns, topRated, featuredAds, daySeed]);

  const newArrivalsData = useMemo(() => {
    const baseData = loading ? Array(gridColumns * 2).fill(null) : newArrivals;
    if (loading) return baseData;

    return injectAdsIntoProducts({
      products: baseData,
      ads: homeAds,
      seed: `home-new-arrivals-${daySeed}-${newArrivals.length}`,
      minInterval: 4,
      maxInterval: 7,
      maxAds: 2,
    });
  }, [loading, gridColumns, newArrivals, homeAds, daySeed]);

  const trendingData = useMemo(() => {
    const baseData = loading ? Array(gridColumns * 2).fill(null) : trending;
    if (loading) return baseData;

    return injectAdsIntoProducts({
      products: baseData,
      ads: featuredAds,
      seed: `home-trending-${daySeed}-${trending.length}`,
      minInterval: 4,
      maxInterval: 7,
      maxAds: 2,
    });
  }, [loading, gridColumns, trending, featuredAds, daySeed]);

  const followedStoresData = useMemo(() => {
    const baseData = loading ? Array(gridColumns * 2).fill(null) : followedStoreProducts;
    if (loading) return baseData;
    if (!baseData.length) return [];

    return injectAdsIntoProducts({
      products: baseData,
      ads: homeAds,
      seed: `home-followed-stores-${daySeed}-${followedStoreProducts.length}`,
      minInterval: 4,
      maxInterval: 7,
      maxAds: 1,
    });
  }, [loading, gridColumns, followedStoreProducts, homeAds, daySeed]);

  const budgetPicksData = useMemo(() => {
    const baseData = loading ? Array(gridColumns * 2).fill(null) : budgetPicks;
    if (loading) return baseData;

    return injectAdsIntoProducts({
      products: baseData,
      ads: featuredAds,
      seed: `home-budget-picks-${daySeed}-${budgetPicks.length}`,
      minInterval: 4,
      maxInterval: 7,
      maxAds: 2,
    });
  }, [loading, gridColumns, budgetPicks, featuredAds, daySeed]);

  const topCarouselAds = useMemo(
    () =>
      (homeAds || []).filter(
        (ad) => String(ad?.style || "").toLowerCase() === "carousel",
      ),
    [homeAds],
  );

  const homeOverlayAds = useMemo(
    () =>
      (homeAds || []).filter((ad) =>
        ["popup", "fullscreen", "sticky_footer"].includes(
          String(ad?.style || "").toLowerCase(),
        ),
      ),
    [homeAds],
  );

  const renderGridItem = useCallback(
    (item) => {
      if (!item) {
        return (
          <View style={{ flex: 1, maxWidth: itemWidth }}>
            <ProductCardPlaceholder />
          </View>
        );
      }

      if (item.__type === "injected_ad") {
        return (
          <View style={{ flex: 1, maxWidth: itemWidth }}>
            <InlineAdProductCard ad={item.ad} showCta />
          </View>
        );
      }

      const isFlashSaleItem =
        item?.product &&
        (item?.flash_price != null || item?.discount_percentage != null);
      const productItem = isFlashSaleItem ? item.product : item;

      return (
        <View style={{ flex: 1, maxWidth: itemWidth }}>
          <ProductCard
            product={productItem}
            flashSale={isFlashSaleItem ? item : undefined}
            compact={isFlashSaleItem}
            onPress={() =>
              navigation.navigate("ProductDetail", {
                product: productItem,
                flashSale: isFlashSaleItem ? item : undefined,
              })
            }
          />
        </View>
      );
    },
    [itemWidth, navigation],
  );

  const toRows = useCallback((items, columns) => {
    const rows = [];
    for (let i = 0; i < items.length; i += columns) {
      rows.push(items.slice(i, i + columns));
    }
    return rows;
  }, []);

  const forYouRows = useMemo(
    () => toRows(forYouData, gridColumns),
    [forYouData, gridColumns, toRows],
  );

  const topRatedRows = useMemo(
    () => toRows(topRatedData, gridColumns),
    [topRatedData, gridColumns, toRows],
  );
  const newArrivalsRows = useMemo(
    () => toRows(newArrivalsData, gridColumns),
    [newArrivalsData, gridColumns, toRows],
  );
  const trendingRows = useMemo(
    () => toRows(trendingData, gridColumns),
    [trendingData, gridColumns, toRows],
  );
  const followedStoresRows = useMemo(
    () => toRows(followedStoresData, gridColumns),
    [followedStoresData, gridColumns, toRows],
  );
  const budgetPicksRows = useMemo(
    () => toRows(budgetPicksData, gridColumns),
    [budgetPicksData, gridColumns, toRows],
  );

  const flashSalesRows = useMemo(() => {
    const rowsSource = loadingFlashSales
      ? Array(gridColumns * 2).fill(null)
      : flashSales;
    return toRows(rowsSource, gridColumns);
  }, [flashSales, gridColumns, loadingFlashSales, toRows]);

  const rowsByFeed = useMemo(
    () => ({
      forYou: forYouRows,
      flashSales: flashSalesRows,
      topRated: topRatedRows,
      newArrivals: newArrivalsRows,
      trending: trendingRows,
      followedStores: followedStoresRows,
      budgetPicks: budgetPicksRows,
    }),
    [
      forYouRows,
      flashSalesRows,
      topRatedRows,
      newArrivalsRows,
      trendingRows,
      followedStoresRows,
      budgetPicksRows,
    ],
  );

  const emptyStateConfig = useMemo(
    () => ({
      forYou: {
        icon: "heart-outline",
        title: "No recommendations yet",
        subtitle: "Come back soon for personalized product picks.",
      },
      flashSales: {
        icon: "flash-outline",
        title: "No flash sales right now",
        subtitle: "We’ll notify you when the next deal goes live.",
      },
      topRated: {
        icon: "star-outline",
        title: "No top rated products yet",
        subtitle: "Popular items will appear here once they are available.",
      },
      newArrivals: {
        icon: "sparkles-outline",
        title: "No new arrivals yet",
        subtitle: "Fresh products will show up here as soon as they land.",
      },
      trending: {
        icon: "trending-up-outline",
        title: "Nothing trending yet",
        subtitle: "Browse products to surface trending picks.",
      },
      followedStores: {
        icon: "people-outline",
        title: "No followed store products",
        subtitle: "Follow stores to see their latest arrivals here.",
        action: {
          label: "Browse stores",
          onPress: () => navigation.navigate("Stores"),
        },
      },
      budgetPicks: {
        icon: "pricetag-outline",
        title: "No budget picks under 100 GHC",
        subtitle: "Check back for more wallet-friendly deals soon.",
      },
    }),
    [navigation],
  );

  const renderEmptyTabState = useCallback(
    (feedKey) => {
      const config = emptyStateConfig[feedKey] || {
        icon: "sad-outline",
        title: "Nothing to show",
        subtitle: "Try another tab or refresh the home screen.",
      };

      return (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name={config.icon} size={54} color={colors.muted} />
          </View>
          <Text style={styles.emptyTitle}>{config.title}</Text>
          <Text style={styles.emptySubtitle}>{config.subtitle}</Text>
          {config.action ? (
            <Pressable
              style={styles.emptyAction}
              onPress={config.action.onPress}
            >
              <Text style={styles.emptyActionText}>{config.action.label}</Text>
            </Pressable>
          ) : null}
        </View>
      );
    },
    [emptyStateConfig],
  );

  const scrollActiveTabIntoView = useCallback(
    (tabKey) => {
      const layout = tabLayouts[tabKey];
      if (!layout || tabsContainerWidth === 0 || !feedTabsScrollRef.current) return;
      const targetX = Math.max(layout.x + layout.width / 2 - tabsContainerWidth / 2, 0);
      feedTabsScrollRef.current.scrollTo({ x: targetX, animated: true });
    },
    [tabLayouts, tabsContainerWidth],
  );

  const switchFeed = useCallback(
    (nextFeed) => {
      if (nextFeed === activeFeed) return;
      const nextTabIndex = feedTabs.findIndex((tab) => tab.key === nextFeed);
      if (nextTabIndex < 0) return;
      scrollActiveTabIntoView(nextFeed);
      tabPagesRef.current?.scrollTo({
        x: nextTabIndex * screenWidth,
        animated: true,
      });
      setActiveFeed(nextFeed);
    },
    [activeFeed, feedTabs, screenWidth, scrollActiveTabIntoView],
  );

  const handleTabPagesScroll = useCallback(
    ({ nativeEvent }) => {
      const index = Math.round(nativeEvent.contentOffset.x / screenWidth);
      const tab = feedTabs[index]?.key;
      if (!tab || tab === activeFeed) return;
      setActiveFeed(tab);
      scrollActiveTabIntoView(tab);
    },
    [activeFeed, feedTabs, screenWidth, scrollActiveTabIntoView],
  );

  const handleTabPagesScrollEnd = useCallback(
    ({ nativeEvent }) => {
      const index = Math.round(nativeEvent.contentOffset.x / screenWidth);
      const tab = feedTabs[index]?.key;
      if (!tab || tab === activeFeed) return;
      setActiveFeed(tab);
      scrollActiveTabIntoView(tab);
    },
    [activeFeed, feedTabs, screenWidth, scrollActiveTabIntoView],
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={styles.homeContent}>
        <AppHeader
          onSearchPress={() => navigation.navigate("Search")}
          onStoresPress={() => navigation.navigate("Stores")}
          onChatPress={() => navigation.navigate("Chats")}
          onNotificationsPress={() => navigation.navigate("Notifications")}
        />

        <View style={styles.topCarouselWrap}>
          {topCarouselAds.length > 0 && <AdRenderer ads={topCarouselAds} />}
        </View>

        <View
          style={styles.feedStickyHeader}
          onLayout={({ nativeEvent }) => setTabsContainerWidth(nativeEvent.layout.width)}
        >
          <View style={styles.feedTitleSpacer} />
          <ScrollView
            ref={feedTabsScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.feedTabsRow}
          >
            {feedTabs.map((tab) => (
              <Pressable
                key={tab.key}
                onLayout={({ nativeEvent }) =>
                  setTabLayouts((prev) => ({
                    ...prev,
                    [tab.key]: nativeEvent.layout,
                  }))
                }
                onPress={() => switchFeed(tab.key)}
                style={[styles.feedTab, activeFeed === tab.key && styles.feedTabActive]}
              >
                <Text
                  style={[
                    styles.feedTabText,
                    activeFeed === tab.key && styles.feedTabTextActive,
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <Animated.ScrollView
          ref={tabPagesRef}
          horizontal
          pagingEnabled
          scrollEnabled={true}
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={handleTabPagesScroll}
          onMomentumScrollEnd={handleTabPagesScrollEnd}
          style={styles.tabPagesScroll}
        >
          {feedTabs.map((tab) => {
            const rows = rowsByFeed[tab.key] || [];
            const showEmptyState =
              rows.length === 0 &&
              (!loading ||
                (tab.key === "flashSales" && !loadingFlashSales));

            return (
              <View key={tab.key} style={[styles.tabPage, { width: screenWidth }]}>
                <ScrollView
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                  scrollEventThrottle={200}
                  onScroll={handlePageScroll}
                  refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
                  }
                  contentContainerStyle={[styles.tabPageContent, { paddingBottom: 16 }]}
                >

                  <View style={styles.gridSection}>
                    {showEmptyState ? (
                      renderEmptyTabState(tab.key)
                    ) : (
                      (rows || []).map((row, rowIndex) => (
                        <View key={`${tab.key}-row-${rowIndex}`} style={styles.gridRow}>
                          {row.map((item, colIndex) => (
                            <View
                              key={item?.id || `placeholder-${tab.key}-${rowIndex}-${colIndex}`}
                              style={styles.gridItem}
                            >
                              {renderGridItem(item)}
                            </View>
                          ))}
                        </View>
                      ))
                    )}
                  </View>
                  {loadingMore && activeFeed === tab.key && (
                    <View style={styles.loadMoreIndicator}>
                      <ActivityIndicator size="small" color={colors.primary} />
                    </View>
                  )}
                </ScrollView>
              </View>
            );
          })}
        </Animated.ScrollView>
        {homeOverlayAds.length > 0 && <AdRenderer ads={homeOverlayAds} />}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  homeContent: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tabPage: {
    minHeight: 300,
    flex: 1,
  },
  tabPageContent: {
    flexGrow: 1,
  },
  topCarouselWrap: {
    paddingTop: 8,
    paddingBottom: 6,
  },

  flashSalesContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  flashSaleItem: {
    width: 165,
    marginRight: 12,
  },
  emptyState: {
    minHeight: 240,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: colors.background,
  },
  emptyIconWrap: {
    marginBottom: 16,
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(100, 116, 139, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.dark,
    marginBottom: 8,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 16,
  },
  emptyAction: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  emptyActionText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  loadMoreIndicator: {
    paddingVertical: 20,
    alignItems: "center",
  },
  gridSection: {
    paddingTop: 8,
    gap: 12,
  },
  feedStickyHeader: {
    marginTop: 0,
    paddingTop: 0,
    paddingBottom: 10,
    backgroundColor: colors.background,
  },
  feedTitleSpacer: {
    
    marginBottom: 10,
  },
  feedTabsRow: {
    gap: 10,
    paddingHorizontal: 16,
  },
  feedTab: {
    borderWidth: 1,
    borderColor: "#D9E2EF",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  feedTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  feedTabText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.dark,
    textAlign: "center",
  },
  feedTabTextActive: {
    color: "#fff",
  },
  tabPagesScroll: {
    flexGrow: 0,
  },
  tabPage: {
    minHeight: 300,
    flex: 1,
  },
  homeContent: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tabPageContent: {
    flexGrow: 1,
  },
  gridRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 12,
    justifyContent: "flex-start",
  },
  gridItem: {
    flex: 1,
  },
});
