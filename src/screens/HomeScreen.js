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
import { AppHeader } from "../components/AppHeader";
import { CategoryScroller } from "../components/CategoryScroller";
import { ProductCard } from "../components/ProductCard";
import { ProductCardPlaceholder } from "../components/ProductCardPlaceholder";
import { SectionHeader } from "../components/SectionHeader";
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
  const [tabsUnlocked, setTabsUnlocked] = useState(false);
  const daySeed = useMemo(() => new Date().toDateString(), []);
  const homeScrollRef = useRef(null);
  const tabPagesRef = useRef(null);
  const activeFeedRef = useRef("forYou");
  const tabsUnlockedRef = useRef(false);
  const tabScrollOffsets = useRef({});
  const currentHomeOffsetY = useRef(0);
  const stickyHeaderStartY = useRef(Number.MAX_SAFE_INTEGER);
  const feedTabs = useMemo(
    () => [
      { key: "forYou", label: "For You" },
      { key: "topRated", label: "Top Rated" },
      { key: "newArrivals", label: "New Arrivals" },
      { key: "trending", label: "Trending" },
      { key: "followedStores", label: "From Followed Stores" },
      { key: "budgetPicks", label: "Budget Picks < 100 GHC" },
    ],
    [],
  );

  // Detect scroll near bottom to trigger load-more
  const handleScroll = useCallback(
    ({ nativeEvent }) => {
      const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
      currentHomeOffsetY.current = contentOffset.y;
      tabScrollOffsets.current[activeFeedRef.current] = contentOffset.y;
      const unlockNow =
        contentOffset.y >= stickyHeaderStartY.current - 8 ||
        activeFeedRef.current !== "forYou";
      if (unlockNow !== tabsUnlockedRef.current) {
        tabsUnlockedRef.current = unlockNow;
        setTabsUnlocked(unlockNow);
      }
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
    (item) => (
      <View style={{ flex: 1, maxWidth: itemWidth }}>
        {item?.__type === "injected_ad" ? (
          <InlineAdProductCard ad={item.ad} showCta />
        ) : item ? (
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
    ),
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

  const rowsByFeed = useMemo(
    () => ({
      forYou: forYouRows,
      topRated: topRatedRows,
      newArrivals: newArrivalsRows,
      trending: trendingRows,
      followedStores: followedStoresRows,
      budgetPicks: budgetPicksRows,
    }),
    [
      forYouRows,
      topRatedRows,
      newArrivalsRows,
      trendingRows,
      followedStoresRows,
      budgetPicksRows,
    ],
  );

  const switchFeed = useCallback(
    (nextFeed) => {
      if (!tabsUnlockedRef.current && nextFeed !== "forYou") return;
      if (nextFeed === activeFeedRef.current) return;
      const nextTabIndex = feedTabs.findIndex((tab) => tab.key === nextFeed);
      if (nextTabIndex < 0) return;
      tabPagesRef.current?.scrollTo({
        x: nextTabIndex * screenWidth,
        animated: true,
      });
    },
    [feedTabs, screenWidth],
  );

  const handleTabPagesScrollEnd = useCallback(
    ({ nativeEvent }) => {
      const index = Math.round(nativeEvent.contentOffset.x / screenWidth);
      const tab = feedTabs[index]?.key;
      if (!tabsUnlockedRef.current && tab !== "forYou") {
        tabPagesRef.current?.scrollTo({ x: 0, animated: true });
        return;
      }
      if (!tab || tab === activeFeedRef.current) return;

      tabScrollOffsets.current[activeFeedRef.current] = currentHomeOffsetY.current;
      activeFeedRef.current = tab;
      const shouldRestoreTabOffset =
        currentHomeOffsetY.current >= stickyHeaderStartY.current - 8;
      setActiveFeed(tab);
      if (shouldRestoreTabOffset) {
        const targetY =
          tab === "forYou"
            ? tabScrollOffsets.current[tab] || 0
            : Math.max(
                stickyHeaderStartY.current - 8,
                tabScrollOffsets.current[tab] || 0,
              );
        if (Math.abs(targetY - currentHomeOffsetY.current) > 12) {
          requestAnimationFrame(() => {
            homeScrollRef.current?.scrollTo({
              y: targetY,
              animated: true,
            });
          });
        }
      }
    },
    [activeFeed, feedTabs, screenWidth],
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
      <ScrollView
        ref={homeScrollRef}
        contentInsetAdjustmentBehavior="automatic"
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[6]}
        scrollEventThrottle={200}
        onScroll={handleScroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <AppHeader
          onSearchPress={() => navigation.navigate("Search")}
          onStoresPress={() => navigation.navigate("Stores")}
          onChatPress={() => navigation.navigate("Chats")}
          onNotificationsPress={() => navigation.navigate("Notifications")}
        />

        <View style={styles.topAdWrap}>
          {topCarouselAds.length > 0 ? (
            <AdRenderer ads={topCarouselAds} />
          ) : (
            <View style={styles.topAdPlaceholderWrap}>
              <AdBannerPlaceholder />
            </View>
          )}
        </View>

        <StatusRow
          onSelectStatus={(status) => {
            if (status) {
              navigation.navigate("StatusViewer", { status });
            }
          }}
        />

        <View>
          {flashSales.length > 0 && (
            <>
              <SectionHeader
                title="⚡ Flash Sales"
                actionLabel="All"
                onActionPress={() => navigation.navigate("FlashSales")}
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.flashSalesContainer}
              >
                {flashSales.slice(0, 6).map((flashSale) => (
                  <View key={flashSale.id} style={styles.flashSaleItem}>
                    <ProductCard
                      product={flashSale.product}
                      flashSale={flashSale}
                      compact
                      onPress={() =>
                        navigation.navigate("ProductDetail", {
                          product: flashSale.product,
                          flashSale,
                        })
                      }
                    />
                  </View>
                ))}
              </ScrollView>
            </>
          )}
        </View>

        <SectionHeader
          title="Stores"
          actionLabel="All"
          onActionPress={() => navigation.navigate("Stores")}
        />
        <SellerScroller
          sellers={sellers}
          onSelect={(seller) =>
            navigation.navigate("Store", { sellerId: seller?.id, seller })
          }
        />

        <View
          style={styles.feedStickyHeader}
          onLayout={(event) => {
            stickyHeaderStartY.current = event.nativeEvent.layout.y;
            const unlockNow =
              currentHomeOffsetY.current >= stickyHeaderStartY.current - 8 ||
              activeFeedRef.current !== "forYou";
            if (unlockNow !== tabsUnlockedRef.current) {
              tabsUnlockedRef.current = unlockNow;
              setTabsUnlocked(unlockNow);
            }
          }}
        >
          <View style={styles.feedTitleSpacer} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.feedTabsRow}
          >
            {(tabsUnlocked ? feedTabs : [feedTabs[0]]).map((tab) => (
              <Pressable
                key={tab.key}
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
          scrollEnabled={tabsUnlocked}
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onMomentumScrollEnd={handleTabPagesScrollEnd}
          style={styles.tabPagesScroll}
        >
          {feedTabs.map((tab) => (
            <View key={tab.key} style={[styles.tabPage, { width: screenWidth }]}>
              <View style={[styles.gridSection, { paddingBottom: 16 }]}>
                {(rowsByFeed[tab.key] || []).map((row, rowIndex) => (
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
                ))}
              </View>
            </View>
          ))}
        </Animated.ScrollView>
        {loadingMore && (
          <View style={styles.loadMoreIndicator}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        )}
      </ScrollView>

      {homeOverlayAds.length > 0 && <AdRenderer ads={homeOverlayAds} />}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topAdWrap: {
    paddingTop: 8,
    paddingBottom: 6,
  },
  topAdPlaceholderWrap: {
    paddingHorizontal: 16,
  },

  flashSalesContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  flashSaleItem: {
    width: 165,
    marginRight: 12,
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
    marginTop: 8,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: colors.background,
  },
  feedTitleSpacer: {
    height: 36,
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

// Shimmer skeleton for ad placeholders
const AdShimmer = () => {
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [shimmer]);
  return shimmer;
};

let _adShimmer = null;
const getAdShimmer = () => {
  if (!_adShimmer) _adShimmer = new Animated.Value(0);
  Animated.loop(
    Animated.sequence([
      Animated.timing(_adShimmer, {
        toValue: 1,
        duration: 900,
        useNativeDriver: true,
      }),
      Animated.timing(_adShimmer, {
        toValue: 0,
        duration: 900,
        useNativeDriver: true,
      }),
    ]),
  ).start();
  return _adShimmer;
};

const AdBannerPlaceholder = () => {
  const shimmer = getAdShimmer();
  const opacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 1],
  });
  return (
    <Animated.View style={[adPlaceholderStyles.card, { opacity }]}>
      <Animated.View style={adPlaceholderStyles.image} />
      <View style={adPlaceholderStyles.body}>
        <Animated.View style={adPlaceholderStyles.titleLine} />
        <Animated.View style={adPlaceholderStyles.subtitleLine} />
        <Animated.View style={adPlaceholderStyles.button} />
      </View>
    </Animated.View>
  );
};

const adPlaceholderStyles = StyleSheet.create({
  card: {
    width: 300,
    height: 180,
    borderRadius: 16,
    backgroundColor: "#e8ecf0",
    overflow: "hidden",
    flexDirection: "row",
  },
  image: {
    width: 120,
    height: "100%",
    backgroundColor: "#d0d7df",
  },
  body: {
    flex: 1,
    padding: 16,
    gap: 10,
    justifyContent: "center",
  },
  titleLine: {
    height: 14,
    borderRadius: 6,
    backgroundColor: "#d0d7df",
    width: "80%",
  },
  subtitleLine: {
    height: 10,
    borderRadius: 6,
    backgroundColor: "#d0d7df",
    width: "60%",
  },
  button: {
    height: 28,
    borderRadius: 8,
    backgroundColor: "#d0d7df",
    width: "70%",
    marginTop: 4,
  },
});
