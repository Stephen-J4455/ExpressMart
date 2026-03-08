import {
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { useCart } from "../context/CartContext";
import { useToast } from "../context/ToastContext";
import { ProductCard } from "../components/ProductCard";
import { ProductCardPlaceholder } from "../components/ProductCardPlaceholder";
import { colors } from "../theme/colors";
import { useResponsive } from "../hooks/useResponsive";

const SORT_OPTIONS = [
  { key: "newest", label: "Newest", icon: "time-outline" },
  { key: "price_asc", label: "Price ↑", icon: "trending-up-outline" },
  { key: "price_desc", label: "Price ↓", icon: "trending-down-outline" },
  { key: "popular", label: "Popular", icon: "flame-outline" },
  { key: "rating", label: "Top Rated", icon: "star-outline" },
];

export const CategoryProductsScreen = ({ navigation, route }) => {
  const { category } = route.params;
  const { addToCart } = useCart();
  const toast = useToast();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [sortKey, setSortKey] = useState("newest");
  const PAGE_SIZE = 20;
  const {
    gridColumns,
    getItemWidth,
    sidebarWidth,
    width,
    isMobile,
    isDesktop,
    horizontalPadding,
  } = useResponsive();
  const contentWidth = width - sidebarWidth;
  const hPad = isMobile ? 12 : 16;
  const gap = isMobile ? 10 : 12;
  const itemWidth = getItemWidth(gridColumns, hPad, gap, contentWidth);
  const useCompact = gridColumns >= 4;

  const fetchCategoryProducts = useCallback(
    async (reset = true) => {
      try {
        if (reset) setLoading(true);
        const start = reset ? 0 : products.length;
        const end = start + PAGE_SIZE - 1;

        let query = supabase
          .from("express_products")
          .select("*, seller_id(id,name,avatar,rating,total_ratings,badges)")
          .eq("category", category.name || category)
          .eq("status", "active")
          .range(start, end);

        switch (sortKey) {
          case "price_asc":
            query = query.order("price", { ascending: true });
            break;
          case "price_desc":
            query = query.order("price", { ascending: false });
            break;
          case "popular":
            query = query.order("total_ratings", { ascending: false });
            break;
          case "rating":
            query = query.order("rating", { ascending: false });
            break;
          default:
            query = query.order("created_at", { ascending: false });
        }

        const { data, error } = await query;

        if (error) throw error;
        const mapped = (data || []).map((product) => ({
          id: product.id,
          title: product.title,
          vendor: product.vendor,
          price: Number(product.price || 0),
          rating: Number(product.rating || 0),
          badges: product.badges || [],
          thumbnail: product.thumbnail,
          thumbnails: product.thumbnails || [],
          category: product.category,
          description: product.description,
          discount: product.discount || 0,
          colors: product.colors || [],
          sizes: product.sizes || [],
          specifications: product.specifications || null,
          tags: product.tags || [],
          weight: product.weight || null,
          weight_unit: product.weight_unit || null,
          sku: product.sku || null,
          barcode: product.barcode || null,
          seller: product.seller_id || null,
        }));
        setProducts(reset ? mapped : (prev) => [...prev, ...mapped]);
        setHasMore(mapped.length === PAGE_SIZE);
      } catch (err) {
        console.error("Category products fetch error:", err);
        toast.error("Error", "Failed to load products");
        if (reset) setProducts([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [category, toast, products.length, sortKey],
  );

  useEffect(() => {
    fetchCategoryProducts(true);
  }, [category, sortKey]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchCategoryProducts(true);
    setRefreshing(false);
  }, [fetchCategoryProducts]);

  const onLoadMore = useCallback(async () => {
    if (!hasMore || loadingMore || loading) return;
    setLoadingMore(true);
    await fetchCategoryProducts(false);
  }, [hasMore, loadingMore, loading, fetchCategoryProducts]);

  const handleProductPress = (product) => {
    navigation.navigate("ProductDetail", { product });
  };

  const categoryName = typeof category === "string" ? category : category.name;
  const categoryIcon = category?.icon || "apps-outline";
  const categoryColor = category?.color || colors.primary;

  const columnWrapperStyle = useMemo(
    () => ({
      gap,
      paddingHorizontal: hPad,
      justifyContent: "flex-start",
    }),
    [gap, hPad],
  );

  const renderItem = ({ item }) => (
    <View style={{ flex: 1, maxWidth: itemWidth }}>
      {item ? (
        <ProductCard
          product={item}
          compact={useCompact}
          onPress={() => handleProductPress(item)}
        />
      ) : (
        <ProductCardPlaceholder />
      )}
    </View>
  );

  const listData =
    loading && products.length === 0
      ? Array(gridColumns * 3).fill(null)
      : products;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Hero Header */}
      <View style={[styles.header, { backgroundColor: categoryColor }]}>
        <Pressable
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <View style={styles.backButtonInner}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </View>
        </Pressable>
        <View style={styles.headerCenter}>
          <View style={styles.headerIconWrap}>
            <Ionicons name={categoryIcon} size={22} color="#fff" />
          </View>
          <View>
            <Text style={styles.headerTitle}>{categoryName}</Text>
            {!loading && (
              <Text style={styles.headerCount}>
                {products.length}
                {hasMore ? "+" : ""} product{products.length !== 1 ? "s" : ""}
              </Text>
            )}
          </View>
        </View>
        {/* right spacer to balance the back button */}
        <View style={{ width: 40 }} />
      </View>

      {/* Sort Bar */}
      <View style={styles.sortBarWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sortBar}
        >
          {SORT_OPTIONS.map((opt) => {
            const isActive = sortKey === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => {
                  setSortKey(opt.key);
                  setProducts([]);
                }}
                style={[styles.sortPill, isActive && styles.sortPillActive]}
              >
                <Ionicons
                  name={opt.icon}
                  size={13}
                  color={isActive ? "#fff" : colors.muted}
                />
                <Text
                  style={[styles.sortLabel, isActive && styles.sortLabelActive]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Products Grid */}
      {products.length === 0 && !loading ? (
        <View style={styles.emptyContainer}>
          <View
            style={[
              styles.emptyIconWrap,
              { backgroundColor: categoryColor + "18" },
            ]}
          >
            <Ionicons name={categoryIcon} size={44} color={categoryColor} />
          </View>
          <Text style={styles.emptyTitle}>No products found</Text>
          <Text style={styles.emptySubtitle}>
            This category doesn't have any products yet
          </Text>
          <Pressable
            style={[styles.browseButton, { backgroundColor: categoryColor }]}
            onPress={() => navigation.navigate("Main")}
          >
            <Ionicons name="storefront-outline" size={16} color="#fff" />
            <Text style={styles.browseText}>Browse All Products</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          key={`${gridColumns}-${sortKey}`}
          data={listData}
          keyExtractor={(item, index) =>
            item?.id ? String(item.id) : `ph-${index}`
          }
          numColumns={gridColumns}
          columnWrapperStyle={columnWrapperStyle}
          contentContainerStyle={[
            styles.gridContent,
            isDesktop && styles.gridContentDesktop,
          ]}
          showsVerticalScrollIndicator={false}
          onEndReached={onLoadMore}
          onEndReachedThreshold={0.4}
          renderItem={renderItem}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.loadMoreRow}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : hasMore && !loading ? (
              <View style={{ height: 40 }} />
            ) : null
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={categoryColor}
              colors={[categoryColor]}
            />
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 18,
  },
  backButton: {
    width: 40,
    alignItems: "flex-start",
  },
  backButtonInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  headerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.3,
  },
  headerCount: {
    fontSize: 12,
    color: "rgba(255,255,255,0.82)",
    fontWeight: "500",
    marginTop: 1,
  },
  /* ── Sort Bar ── */
  sortBarWrapper: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sortBar: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sortPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sortLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
  },
  sortLabelActive: {
    color: "#fff",
  },
  /* ── Grid ── */
  gridContent: {
    paddingTop: 14,
    paddingBottom: 32,
    gap: 10,
  },
  gridContentDesktop: {
    gap: 12,
  },
  loadMoreRow: {
    paddingVertical: 20,
    alignItems: "center",
  },
  /* ── Empty State ── */
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    gap: 12,
  },
  emptyIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.dark,
    letterSpacing: -0.3,
  },
  emptySubtitle: {
    fontSize: 15,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 22,
  },
  browseButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
  },
  browseText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});
