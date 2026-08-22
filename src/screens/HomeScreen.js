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
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppHeader } from "../components/AppHeader";
import { ProductCard } from "../components/ProductCard";
import { ProductCardPlaceholder } from "../components/ProductCardPlaceholder";
import { AdRenderer } from "../components/AdBanner";
import { InlineAdProductCard } from "../components/InlineAdProductCard";
import { useShop } from "../context/ShopContext";
import { useAds } from "../context/AdsContext";
import { LazyScrollContext, lazyScroll } from "../context/LazyScrollContext";
import { useTheme } from "../context/ThemeContext";
import { flashSaleService } from "../services/flashSaleService";
import { useResponsive } from "../hooks/useResponsive";
import { useAppStyles } from "../hooks/useAppStyles";
import { injectAdsIntoProducts } from "../utils/adPlacement";

const SCREEN_WIDTH = Dimensions.get("window").width;

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
  const itemWidth = getItemWidth(gridColumns, 12, 12);
  // Track the active color scheme so memoized UI-generating callbacks
  // (e.g. renderGridItem) re-create when the theme changes, even while this
  // tab stays mounted in the background.
  const { isDark, colors: themeColors } = useTheme();
  const styles = useAppStyles((c) => buildHomeStyles(c));
  const [homeAds, setHomeAds] = useState([]);
  const [featuredAds, setFeaturedAds] = useState([]);
  const [flashSales, setFlashSales] = useState([]);
  const [loadingFlashSales, setLoadingFlashSales] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadFlashSales = useCallback(async () => {
    setLoadingFlashSales(true);
    const { success, data } = await flashSaleService.getActiveFlashSales();
    if (success) {
      setFlashSales(data || []);
    }
    setLoadingFlashSales(false);
  }, []);

  const daySeed = useMemo(() => new Date().toDateString(), []);
  const scrollRef = useRef(null);
  const scrollContentRef = useRef(null);

  useEffect(() => {
    lazyScroll.viewportHeight = Dimensions.get("window").height;
  }, []);

  // Detect scroll near bottom to trigger load-more
  const handlePageScroll = useCallback(
    ({ nativeEvent }) => {
      const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
      const distanceFromBottom =
        contentSize.height - contentOffset.y - layoutMeasurement.height;
      if (distanceFromBottom < 400 && hasMore && !loadingMore && !loading) {
        loadMore();
      }
      lazyScroll.notify(contentOffset.y);
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

  // Load flash sales once on mount. No auto-refresh interval, so the section
  // doesn't reload itself; pull-to-refresh triggers a manual reload instead.
  useEffect(() => {
    loadFlashSales();
  }, [loadFlashSales]);

  const featured = useMemo(
    () =>
      products
        .slice()
        .sort(() => Math.random() - 0.5)
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

  const topCarouselAds = useMemo(
    () =>
      (homeAds || []).filter(
        (ad) => String(ad?.style || "").toLowerCase() === "carousel",
      ),
    [homeAds],
  );

  // Show a compact row of categories by default; "Show More" opens the
  // full Categories page.
  const CATEGORIES_COLLAPSED_COUNT = 8;
  const visibleCategories = useMemo(() => {
    if (!Array.isArray(categories)) return [];
    return categories.slice(0, CATEGORIES_COLLAPSED_COUNT);
  }, [categories]);

  const handleCategoryPress = useCallback(
    (category) => {
      navigation.navigate("CategoryProducts", { category });
    },
    [navigation],
  );

  const renderCategoriesSection = () => {
    if (!categories || categories.length === 0) return null;
    const canExpand = categories.length > CATEGORIES_COLLAPSED_COUNT;

    return (
      <View style={styles.sectionBlock}>
        <View style={styles.sectionHeader}>
          <Ionicons name="grid-outline" size={18} color={themeColors.primary} />
          <Text style={styles.sectionTitle}>Categories</Text>
          {canExpand && (
            <Pressable
              style={styles.showMoreBtn}
              onPress={() => navigation.navigate("Categories")}
              hitSlop={8}
            >
              <Text style={styles.showMoreText}>Show More</Text>
              <Ionicons
                name="chevron-forward"
                size={14}
                color={themeColors.primary}
              />
            </Pressable>
          )}
        </View>
        <View style={styles.categoryGrid}>
          {visibleCategories.map((cat) => (
            <Pressable
              key={cat.id}
              style={styles.categoryTile}
              onPress={() => handleCategoryPress(cat)}
            >
              <View
                style={[
                  styles.categoryIconWrap,
                  { backgroundColor: cat.color || "#F0F9FF" },
                ]}
              >
                <Ionicons
                  name={cat.icon || "apps-outline"}
                  size={22}
                  color={themeColors.primary}
                />
              </View>
              <Text numberOfLines={1} style={styles.categoryLabel}>
                {cat.name}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  };

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
            hidePrice={isFlashSaleItem}
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
    [itemWidth, navigation, isDark],
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

  // Normalized flash sale items for the product grid renderer
  const flashSaleItems = useMemo(
    () =>
      (flashSales || []).map((fs) => ({
        product: fs.product,
        flash_price: fs.flash_price,
        discount_percentage: fs.discount_percentage,
        end_time: fs.end_time,
      })),
    [flashSales],
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refresh(), loadFlashSales()]);
    } finally {
      setRefreshing(false);
    }
  }, [refresh, loadFlashSales]);

  const renderFlashSaleSection = () => {
    if (loadingFlashSales) {
      return (
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeader}>
            <Ionicons name="flash" size={18} color={themeColors.warmCoral} />
            <Text style={styles.sectionTitle}>Flash Sales</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.hScrollContent}
          >
            {Array(gridColumns)
              .fill(null)
              .map((_, i) => (
                <View
                  key={`fs-skel-${i}`}
                  style={{ width: itemWidth }}
                >
                  <ProductCardPlaceholder />
                </View>
              ))}
          </ScrollView>
        </View>
      );
    }

    if (!flashSales || flashSales.length === 0) return null;

    return (
      <View style={styles.sectionBlock}>
        <View style={styles.sectionHeader}>
          <Ionicons name="flash" size={18} color={themeColors.warmCoral} />
          <Text style={styles.sectionTitle}>Flash Sales</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.hScrollContent}
        >
          {flashSaleItems.map((item, index) => (
            <View key={`flash-${item?.product?.id || index}`} style={{ width: itemWidth }}>
              {renderGridItem(item)}
            </View>
          ))}
        </ScrollView>
      </View>
    );
  };

  return (
    <LazyScrollContext.Provider value={{ scrollContentRef }}>
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
          onChatPress={() => navigation.navigate("Chats")}
          onNotificationsPress={() => navigation.navigate("Notifications")}
        />

        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={200}
          onScroll={handlePageScroll}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          contentContainerStyle={[styles.pageContent, { paddingBottom: 16 }]}
        >
          <View ref={scrollContentRef}>
          {topCarouselAds.length > 0 && (
            <View style={styles.topCarouselWrap}>
              <AdRenderer ads={topCarouselAds} />
            </View>
          )}

          {renderCategoriesSection()}

          {renderFlashSaleSection()}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>For You</Text>
          </View>

          <View style={styles.gridSection}>
            {(forYouRows || []).map((row, rowIndex) => (
              <View key={`foryou-row-${rowIndex}`} style={styles.gridRow}>
                {row.map((item, colIndex) => (
                  <View
                    key={item?.id || `placeholder-foryou-${rowIndex}-${colIndex}`}
                    style={styles.gridItem}
                  >
                    {renderGridItem(item)}
                  </View>
                ))}
              </View>
            ))}
          </View>

          {loadingMore && (
            <View style={styles.loadMoreIndicator}>
              <ActivityIndicator size="small" color={themeColors.primary} />
            </View>
          )}
          </View>
        </ScrollView>
        {homeOverlayAds.length > 0 && <AdRenderer ads={homeOverlayAds} />}
      </View>
      </Animated.View>
    </LazyScrollContext.Provider>
  );
};

const buildHomeStyles = (c) =>
  StyleSheet.create({ 
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    homeContent: {
      flex: 1,
      backgroundColor: c.background,
    },
    pageContent: {
      flexGrow: 1,
    },
    topCarouselWrap: {
      paddingTop: 8,
      paddingBottom: 6,
    },
    sectionBlock: {
      paddingTop: 12,
      paddingBottom: 8,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "800",
      color: c.dark,
    },
    hScrollContent: {
      gap: 12,
      paddingHorizontal: 12,
      paddingBottom: 8,
    },
    showMoreBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      marginLeft: "auto",
      paddingVertical: 2,
    },
    showMoreText: {
      fontSize: 13,
      fontWeight: "700",
      color: c.primary,
    },
    categoryGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
      paddingHorizontal: 16,
    },
    categoryTile: {
      width: (SCREEN_WIDTH - 16 * 2 - 12 * 3) / 4,
      alignItems: "center",
    },
    categoryIconWrap: {
      width: 56,
      height: 56,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOpacity: 0.05,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    categoryLabel: {
      marginTop: 6,
      fontSize: 11,
      fontWeight: "600",
      color: c.dark,
      textAlign: "center",
      width: "100%",
    },
    gridSection: {
      paddingTop: 8,
      paddingBottom: 60,
      gap: 12,
    },
    loadMoreIndicator: {
    paddingVertical: 20,
    alignItems: "center",
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