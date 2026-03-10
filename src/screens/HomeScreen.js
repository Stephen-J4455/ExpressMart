import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  Animated,
} from "react-native";
import { AppHeader } from "../components/AppHeader";
import { CategoryScroller } from "../components/CategoryScroller";
import { ProductCard } from "../components/ProductCard";
import { ProductCardPlaceholder } from "../components/ProductCardPlaceholder";
import { SectionHeader } from "../components/SectionHeader";
import { SellerScroller } from "../components/SellerScroller";
import { AdRenderer } from "../components/AdBanner";
import { StatusRow } from "../components/StatusRow";
import { useShop } from "../context/ShopContext";
import { useAds } from "../context/AdsContext";
import { flashSaleService } from "../services/flashSaleService";
import { colors } from "../theme/colors";
import { useResponsive } from "../hooks/useResponsive";

export const HomeScreen = ({ navigation }) => {
  const {
    products,
    categories,
    sellers,
    loading,
    refresh,
    loadMore,
    hasMore,
    loadingMore,
  } = useShop();
  const { fetchAdsByPlacement } = useAds();
  const { gridColumns, getItemWidth } = useResponsive();
  const itemWidth = getItemWidth(gridColumns, 12, 12);
  const [homeAds, setHomeAds] = useState([]);
  const [featuredAds, setFeaturedAds] = useState([]);
  const [loadingAds, setLoadingAds] = useState(true);
  const [flashSales, setFlashSales] = useState([]);
  const [loadingFlashSales, setLoadingFlashSales] = useState(true);

  // Detect scroll near bottom to trigger load-more
  const handleScroll = useCallback(
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
      setLoadingAds(true);
      const homeAdsData = await fetchAdsByPlacement("home");
      setHomeAds(homeAdsData);

      const featuredAdsData = await fetchAdsByPlacement("feed");
      setFeaturedAds(featuredAdsData);
      setLoadingAds(false);
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

  const mostPopular = useMemo(
    () =>
      products
        .slice()
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 12),
    [products],
  );

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
        contentInsetAdjustmentBehavior="automatic"
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={200}
        onScroll={handleScroll}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} />
        }
      >
        <AppHeader
          onSearchPress={() => navigation.navigate("Search")}
          onStoresPress={() => navigation.navigate("Stores")}
          onChatPress={() => navigation.navigate("Chats")}
          onNotificationsPress={() => navigation.navigate("Notifications")}
        />

        {loadingAds && homeAds.length === 0 ? (
          <View style={styles.adContainer}>
            <View
              style={{ flexDirection: "row", paddingHorizontal: 16, gap: 16 }}
            >
              {[1, 2].map((i) => (
                <AdBannerPlaceholder key={i} />
              ))}
            </View>
          </View>
        ) : homeAds.length > 0 ? (
          <View style={styles.adContainer}>
            <AdRenderer ads={homeAds} />
          </View>
        ) : null}

        <StatusRow
          onSelectStatus={(status) => {
            if (status) {
              navigation.navigate("StatusViewer", { status });
            }
          }}
        />

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

        <SectionHeader
          title="Stores"
          actionLabel="All"
          onActionPress={() => navigation.navigate("Stores")}
        />
        <SellerScroller
          sellers={sellers}
          onSelect={(seller) => navigation.navigate("Store", { seller })}
        />

        <View style={styles.sectionSpacer} />
        <SectionHeader title="ForYou" />
        <FlatList
          key={String(gridColumns)}
          data={loading ? Array(gridColumns * 2).fill(null) : featured}
          keyExtractor={(item, index) =>
            item?.id || `placeholder-foryou-${index}`
          }
          numColumns={gridColumns}
          columnWrapperStyle={{
            gap: 12,
            paddingHorizontal: 12,
            justifyContent: "flex-start",
          }}
          contentContainerStyle={{
            paddingTop: 8,
            paddingBottom: 8,
            gap: 12,
          }}
          renderItem={({ item }) => (
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
          )}
          scrollEnabled={false}
        />
        <SectionHeader title="Most Popular" />
        <FlatList
          key={`popular-${String(gridColumns)}`}
          data={loading ? Array(gridColumns * 2).fill(null) : mostPopular}
          keyExtractor={(item, index) =>
            item?.id || `placeholder-popular-${index}`
          }
          numColumns={gridColumns}
          columnWrapperStyle={{
            gap: 12,
            paddingHorizontal: 12,
            justifyContent: "flex-start",
          }}
          contentContainerStyle={{
            paddingTop: 8,
            paddingBottom: 16,
            gap: 12,
          }}
          renderItem={({ item }) => (
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
          )}
          scrollEnabled={false}
        />
        {featuredAds.length > 0 && (
          <View style={styles.adContainer}>
            <AdRenderer ads={featuredAds} />
          </View>
        )}
        {loadingMore && (
          <View style={styles.loadMoreIndicator}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        )}
      </ScrollView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  sectionSpacer: {
    gap: 8,
    marginTop: 8,
  },
  adContainer: {
    gap: 8,
    marginTop: 8,
    paddingVertical: 12,
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
