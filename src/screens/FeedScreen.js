import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { LinearGradient } from "expo-linear-gradient";
import { ProductCard } from "../components/ProductCard";
import { ProductCardPlaceholder } from "../components/ProductCardPlaceholder";
import { SellerCard } from "../components/SellerCard";
import { useShop } from "../context/ShopContext";
import { useAds } from "../context/AdsContext";
import { colors } from "../theme/colors";
import { useResponsive } from "../hooks/useResponsive";

// Insert a mixed ad+store row every N product rows
const AD_STORE_INTERVAL = 5;

export const FeedScreen = ({ route, navigation }) => {
  const {
    products,
    sellers,
    refresh,
    loading,
    loadMore,
    hasMore,
    loadingMore,
  } = useShop();
  const { fetchAdsByPlacement, trackImpression, trackClick } = useAds();
  const { gridColumns, getItemWidth } = useResponsive();
  const itemWidth = getItemWidth(gridColumns, 12, 12);
  const [feedAds, setFeedAds] = useState([]);
  const category = route?.params?.category;

  useEffect(() => {
    fetchAdsByPlacement("feed").then((ads) => setFeedAds(ads || []));
  }, [fetchAdsByPlacement]);

  const filtered = useMemo(
    () =>
      category ? products.filter((p) => p.category === category) : products,
    [products, category],
  );

  // Build mixed feed: product rows, with ad+store rows interleaved
  const feedItems = useMemo(() => {
    const productList =
      loading && filtered.length === 0
        ? Array(gridColumns * 4).fill(null)
        : filtered;

    const rows = [];
    // Group products into rows of gridColumns
    for (let i = 0; i < productList.length; i += gridColumns) {
      rows.push({
        type: "product_row",
        products: productList.slice(i, i + gridColumns),
      });
    }

    const mixed = [];
    let adIndex = 0;
    let storeIndex = 0;

    rows.forEach((row, idx) => {
      mixed.push(row);
      // After every AD_STORE_INTERVAL rows, insert a mixed ad+store row
      if (
        (idx + 1) % AD_STORE_INTERVAL === 0 &&
        (feedAds.length > 0 || sellers.length > 0)
      ) {
        const ad =
          feedAds.length > 0 ? feedAds[adIndex % feedAds.length] : null;
        const seller =
          sellers.length > 0 ? sellers[storeIndex % sellers.length] : null;
        mixed.push({ type: "mixed_row", ad, seller });
        if (ad) adIndex++;
        if (seller) storeIndex++;
      }
    });

    return mixed;
  }, [filtered, feedAds, sellers, loading, gridColumns]);

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
      if (item.type === "product_row") {
        return (
          <View style={styles.productRow}>
            {item.products.map((product, idx) => (
              <View
                key={product?.id || `placeholder-${idx}`}
                style={{ flex: 1, maxWidth: itemWidth }}
              >
                {product ? (
                  <ProductCard
                    product={product}
                    onPress={() =>
                      navigation.navigate("ProductDetail", { product })
                    }
                  />
                ) : (
                  <ProductCardPlaceholder />
                )}
              </View>
            ))}
          </View>
        );
      }

      if (item.type === "mixed_row") {
        return (
          <View style={styles.mixedRow}>
            {item.ad ? (
              <View style={{ flex: 1, maxWidth: itemWidth }}>
                <FeedAdCard
                  ad={item.ad}
                  trackImpression={trackImpression}
                  trackClick={trackClick}
                />
              </View>
            ) : (
              <View style={{ flex: 1, maxWidth: itemWidth }} />
            )}
            {item.seller ? (
              <View style={{ flex: 1, maxWidth: itemWidth }}>
                <SellerCard
                  seller={item.seller}
                  onPress={() =>
                    navigation.navigate("Store", { seller: item.seller })
                  }
                />
              </View>
            ) : (
              <View style={{ flex: 1, maxWidth: itemWidth }} />
            )}
          </View>
        );
      }

      return null;
    },
    [itemWidth, navigation, trackImpression, trackClick],
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
        keyExtractor={(item, index) => {
          if (item.type === "product_row") return `pr-${index}`;
          if (item.type === "mixed_row")
            return `mixed-${item.ad?.id ?? ""}-${item.seller?.id ?? ""}-${index}`;
          return String(index);
        }}
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
    </View>
  );
};

// ─── Inline feed ad card — looks like a product card ─────────────────────────
const FeedAdCard = ({ ad, trackImpression, trackClick }) => {
  useEffect(() => {
    if (ad) trackImpression(ad.id);
  }, [ad]);

  if (!ad) return null;

  const handlePress = async () => {
    trackClick(ad.id);
    if (ad.cta_url) {
      try {
        await Linking.openURL(ad.cta_url);
      } catch {}
    }
  };

  const accentColor = ad.accent_color || colors.primary;

  return (
    <Pressable style={adStyles.card} onPress={handlePress}>
      {/* Image */}
      <View style={adStyles.imageContainer}>
        <Image source={{ uri: ad.image_url }} style={adStyles.image} />
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.28)"]}
          style={StyleSheet.absoluteFill}
        />
        {/* Sponsored pill */}
        <View style={adStyles.sponsoredPill}>
          <Ionicons name="megaphone-outline" size={9} color="#fff" />
          <Text style={adStyles.sponsoredText}>Ad</Text>
        </View>
        {/* Discount badge */}
        {ad.discount_badge && (
          <View
            style={[
              adStyles.discountBadge,
              { backgroundColor: ad.discount_color || "#EF4444" },
            ]}
          >
            <Text style={adStyles.discountText}>{ad.discount_badge}</Text>
          </View>
        )}
      </View>

      {/* Content */}
      <View style={adStyles.content}>
        <Text style={adStyles.brand} numberOfLines={1}>
          {ad.title}
        </Text>
        <Text style={adStyles.description} numberOfLines={2}>
          {ad.description || ad.title}
        </Text>
        <View
          style={[adStyles.ctaButton, { backgroundColor: accentColor + "18" }]}
        >
          <Text style={[adStyles.ctaText, { color: accentColor }]}>
            {ad.cta_text || "Shop Now"}
          </Text>
          <Ionicons name="arrow-forward" size={11} color={accentColor} />
        </View>
      </View>
    </Pressable>
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
    backgroundColor: colors.background,
  },
  productRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 12,
    paddingBottom: 12,
    justifyContent: "flex-start",
  },
  mixedRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 12,
    paddingBottom: 12,
    justifyContent: "flex-start",
  },
  loadMoreIndicator: {
    paddingVertical: 20,
    alignItems: "center",
  },
});

const adStyles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 24,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  imageContainer: {
    width: "100%",
    height: 140,
    backgroundColor: "#F8FAFC",
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  sponsoredPill: {
    position: "absolute",
    top: 10,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 20,
    gap: 3,
  },
  sponsoredText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.3,
  },
  discountBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  discountText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#fff",
  },
  content: {
    padding: 12,
    paddingTop: 10,
    gap: 4,
  },
  brand: {
    fontSize: 11,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontWeight: "600",
  },
  description: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.dark,
    letterSpacing: -0.2,
    marginTop: 2,
  },
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    alignSelf: "flex-start",
    marginTop: 6,
  },
  ctaText: {
    fontSize: 11,
    fontWeight: "700",
  },
});
