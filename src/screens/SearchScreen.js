import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, Image } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { SearchBar } from "../components/SearchBar";
import { ProductCard } from "../components/ProductCard";
import { ProductCardPlaceholder } from "../components/ProductCardPlaceholder";
import { useShop } from "../context/ShopContext";
import { supabase } from "../lib/supabase";
import { colors } from "../theme/colors";

const trending = [
  "smart watch",
  "gaming laptop",
  "home decor",
  "wireless earbuds",
];

export const SearchScreen = ({ navigation, route }) => {
  const { products, sellers } = useShop();
  const [query, setQuery] = useState(route.params?.query || "");
  const [tag, setTag] = useState(route.params?.tag || "");
  const [remoteResults, setRemoteResults] = useState([]);
  const [storeResults, setStoreResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("products");
  const [recentSearches, setRecentSearches] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);

  const localResults = useMemo(() => {
    if (!query && !tag) return [];
    const normalized = query.toLowerCase();
    return products.filter((product) => {
      const matchesQuery =
        !query ||
        product.title.toLowerCase().includes(normalized) ||
        product.category?.toLowerCase().includes(normalized);
      const matchesTag =
        !tag ||
        (product.tags &&
          product.tags.some((t) =>
            t.toLowerCase().includes(tag.toLowerCase()),
          ));
      return matchesQuery && matchesTag;
    });
  }, [products, query, tag]);

  const triggerRemoteSearch = useCallback(async (text, tagFilter = tag) => {
    if (!supabase || (!text && !tagFilter)) {
      setRemoteResults([]);
      return;
    }
    setLoading(true);
    try {
      let query = supabase
        .from("express_products")
        .select("*, seller_id(id,name,avatar,rating,total_ratings,badges)")
        .eq("status", "active");

      if (text) {
        query = query.ilike("title", `%${text}%`);
      }

      if (tagFilter) {
        query = query.contains("tags", [tagFilter]);
      }

      const { data, error } = await query.limit(20);
      if (error) throw error;
      setRemoteResults(
        data?.map((product) => ({
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
        })) || [],
      );
    } catch (error) {
      console.warn("Search failed", error.message);
      setRemoteResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const triggerStoreSearch = useCallback(async (text) => {
    if (!supabase || !text) {
      setStoreResults([]);
      return;
    }
    setLoading(true);
    try {
      // First, get sellers matching the search
      const { data: sellersData, error: sellersError } = await supabase
        .from("express_sellers")
        .select("id,name,avatar,badges")
        .eq("is_active", true)
        .ilike("name", `%${text}%`)
        .limit(20);

      if (sellersError) throw sellersError;

      if (!sellersData || sellersData.length === 0) {
        setStoreResults([]);
        return;
      }

      // For each seller, calculate accurate ratings from reviews
      const sellersWithRatings = await Promise.all(
        sellersData.map(async (seller) => {
          try {
            // Get all products for this seller
            const { data: productsData, error: productsError } = await supabase
              .from("express_products")
              .select("id")
              .eq("seller_id", seller.id)
              .eq("status", "active");

            if (productsError) throw productsError;

            if (!productsData || productsData.length === 0) {
              return {
                ...seller,
                rating: 0,
                total_ratings: 0,
              };
            }

            const productIds = productsData.map((p) => p.id);

            // Get all reviews for these products
            const { data: reviewsData, error: reviewsError } = await supabase
              .from("express_reviews")
              .select("rating")
              .in("product_id", productIds)
              .eq("is_approved", true);

            if (reviewsError) throw reviewsError;

            if (!reviewsData || reviewsData.length === 0) {
              return {
                ...seller,
                rating: 0,
                total_ratings: 0,
              };
            }

            // Calculate average rating
            const totalRating = reviewsData.reduce(
              (sum, review) => sum + review.rating,
              0,
            );
            const averageRating = totalRating / reviewsData.length;

            return {
              ...seller,
              rating: Number(averageRating.toFixed(1)),
              total_ratings: reviewsData.length,
            };
          } catch (error) {
            console.warn(
              `Error calculating rating for seller ${seller.id}:`,
              error,
            );
            return {
              ...seller,
              rating: 0,
              total_ratings: 0,
            };
          }
        }),
      );

      setStoreResults(sellersWithRatings);
    } catch (error) {
      console.warn("Store search failed", error.message);
      setStoreResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasSearched) {
      if (activeTab === "stores" && query) {
        saveSearch(query);
        const handle = setTimeout(() => triggerStoreSearch(query), 400);
        return () => clearTimeout(handle);
      } else if (activeTab === "products") {
        if (query) saveSearch(query);
        const handle = setTimeout(() => triggerRemoteSearch(query), 400);
        return () => clearTimeout(handle);
      } else if (activeTab === "stores" && !query) {
        // Show featured stores when no query
        setStoreResults(sellers.slice(0, 10));
      }
    }
  }, [
    query,
    activeTab,
    hasSearched,
    triggerRemoteSearch,
    triggerStoreSearch,
    sellers,
  ]);

  useEffect(() => {
    if (tag && !query && activeTab === "products") {
      triggerRemoteSearch("", tag);
    }
  }, [tag, triggerRemoteSearch, activeTab]);

  useEffect(() => {
    const loadRecentSearches = async () => {
      try {
        const stored = await AsyncStorage.getItem("recentSearches");
        if (stored) {
          setRecentSearches(JSON.parse(stored));
        }
      } catch (error) {
        console.warn("Failed to load recent searches", error);
      }
    };
    loadRecentSearches();
  }, []);

  const saveSearch = async (searchQuery) => {
    if (!searchQuery.trim()) return;
    try {
      const updated = [
        searchQuery,
        ...recentSearches.filter((s) => s !== searchQuery),
      ].slice(0, 10);
      setRecentSearches(updated);
      await AsyncStorage.setItem("recentSearches", JSON.stringify(updated));
    } catch (error) {
      console.warn("Failed to save search", error);
    }
  };

  const productResults = remoteResults.length ? remoteResults : localResults;
  const storeDisplayResults = query
    ? storeResults
    : sellers && sellers.length > 0
      ? sellers.slice(0, 10)
      : [];
  const results =
    activeTab === "products" ? productResults : storeDisplayResults;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={22} color={colors.dark} />
        </Pressable>
        <SearchBar
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            if (!text.trim()) {
              setHasSearched(false);
            }
          }}
          onSubmitEditing={() => {
            if (query.trim()) {
              setHasSearched(true);
            }
          }}
          autoFocus={!tag}
          placeholder={tag ? `Search in "${tag}"` : "Search everything"}
        />
      </View>

      <View style={styles.tabsContainer}>
        <Pressable
          style={[styles.tab, activeTab === "products" && styles.activeTab]}
          onPress={() => setActiveTab("products")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "products" && styles.activeTabText,
            ]}
          >
            Products
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "stores" && styles.activeTab]}
          onPress={() => setActiveTab("stores")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "stores" && styles.activeTabText,
            ]}
          >
            Stores
          </Text>
        </Pressable>
      </View>

      {!hasSearched && (
        <>
          {recentSearches.length > 0 && (
            <View style={styles.trendingSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Recent searches</Text>
                <Pressable
                  onPress={async () => {
                    setRecentSearches([]);
                    try {
                      await AsyncStorage.removeItem("recentSearches");
                    } catch (error) {
                      console.warn("Failed to clear recent searches", error);
                    }
                  }}
                  style={styles.clearButton}
                >
                  <Ionicons
                    name="trash-outline"
                    size={16}
                    color={colors.muted}
                  />
                </Pressable>
              </View>
              <View style={styles.tags}>
                {recentSearches.map((search) => (
                  <Pressable
                    key={search}
                    style={styles.tag}
                    onPress={() => setQuery(search)}
                  >
                    <Text style={styles.tagText}>{search}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
          <View style={styles.trendingSection}>
            <Text style={styles.sectionTitle}>Trending searches</Text>
            <View style={styles.tags}>
              {trending.map((keyword) => (
                <Pressable
                  key={keyword}
                  style={styles.tag}
                  onPress={() => setQuery(keyword)}
                >
                  <Text style={styles.tagText}>{keyword}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </>
      )}

      {hasSearched && (
        <View>
          {tag && activeTab === "products" && (
            <View style={styles.tagFilterSection}>
              <Text style={styles.sectionTitle}>Filtering by tag: "{tag}"</Text>
              <Pressable
                style={styles.clearTagButton}
                onPress={() => {
                  setTag("");
                  setQuery("");
                  setHasSearched(false);
                }}
              >
                <Ionicons
                  name="close-circle"
                  size={20}
                  color={colors.primary}
                />
                <Text style={styles.clearTagText}>Clear filter</Text>
              </Pressable>
            </View>
          )}

          {activeTab === "products" ? (
            <View style={styles.grid}>
              {loading && results.length === 0
                ? Array(4)
                  .fill(null)
                  .map((_, index) => (
                    <View
                      key={`placeholder-${index}`}
                      style={styles.gridItem}
                    >
                      <ProductCardPlaceholder />
                    </View>
                  ))
                : results.map((item) => (
                  <View key={item.id} style={styles.gridItem}>
                    <ProductCard
                      product={item}
                      onPress={() =>
                        navigation.navigate("ProductDetail", {
                          product: item,
                        })
                      }
                    />
                  </View>
                ))}
            </View>
          ) : (
            <View style={styles.storeList}>
              {!query && results.length > 0 && (
                <View style={styles.storeHeader}>
                  <Text style={styles.sectionTitle}>Featured Stores</Text>
                </View>
              )}
              {loading && query && results.length === 0
                ? Array(3)
                  .fill(null)
                  .map((_, index) => (
                    <View
                      key={`store-placeholder-${index}`}
                      style={styles.storeItem}
                    >
                      <View style={styles.storePlaceholder} />
                    </View>
                  ))
                : results.map((store) => (
                  <Pressable
                    key={store.id}
                    style={styles.storeItem}
                    onPress={() =>
                      navigation.navigate("Store", { seller: store })
                    }
                  >
                    <View style={styles.storeContent}>
                      <View style={styles.storeAvatar}>
                        {store.avatar ? (
                          <Image
                            source={{ uri: store.avatar }}
                            style={styles.storeAvatarImage}
                          />
                        ) : (
                          <View style={styles.storeAvatarPlaceholder}>
                            <Ionicons
                              name="storefront"
                              size={26}
                              color={colors.primary}
                            />
                          </View>
                        )}
                      </View>
                      <View style={styles.storeInfo}>
                        <Text style={styles.storeName}>{store.name}</Text>
                        <View style={styles.storeStats}>
                          <Ionicons
                            name="star"
                            size={12}
                            color="#F59E0B"
                          />
                          <Text style={styles.storeRating}>
                            {store.rating?.toFixed(1) || "0.0"}
                          </Text>
                          <Text style={styles.storeReviews}>
                            ({store.total_ratings || 0})
                          </Text>
                        </View>
                      </View>
                      <View style={styles.storeArrow}>
                        <Ionicons
                          name="chevron-forward"
                          size={18}
                          color={colors.primary}
                        />
                      </View>
                    </View>
                  </Pressable>
                ))}
            </View>
          )}

          {(query || (tag && activeTab === "products")) &&
            results.length === 0 &&
            !loading && (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>
                  {activeTab === "products"
                    ? "No products found"
                    : "No stores found"}
                </Text>
                <Text style={styles.emptySub}>
                  {activeTab === "products"
                    ? tag
                      ? `No products found with tag "${tag}"`
                      : "Try a different keyword"
                    : "Try a different store name"}
                </Text>
              </View>
            )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  trendingSection: {
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  clearButton: {
    padding: 6,
    backgroundColor: "#FEE2E2",
    borderRadius: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 12,
    color: colors.dark,
    letterSpacing: -0.3,
  },
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  tag: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  tagText: {
    color: colors.dark,
    fontWeight: "500",
    fontSize: 14,
  },
  list: {
    padding: 16,
    gap: 16,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  gridItem: {
    width: "49%",
    marginBottom: 4,
  },
  empty: {
    alignItems: "center",
    marginTop: 50,
    paddingHorizontal: 24,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.dark,
    letterSpacing: -0.3,
  },
  emptySub: {
    marginTop: 8,
    color: colors.muted,
  },
  tagFilterSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.primary + "10",
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  clearTagButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  clearTagText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "600",
  },
  tabsContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 4,
    backgroundColor: "#fff",
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 14,
    marginHorizontal: 6,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
  },
  activeTab: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.muted,
    letterSpacing: -0.2,
  },
  activeTabText: {
    color: "#fff",
  },
  storeList: {
    padding: 16,
    gap: 14,
  },
  storeHeader: {
    marginBottom: 8,
  },
  storeItem: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  storeContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  storeAvatar: {
    width: 56,
    height: 56,
    borderRadius: 16,
    marginRight: 14,
    backgroundColor: "#F8FAFC",
    overflow: "hidden",
  },
  storeAvatarImage: {
    width: 56,
    height: 56,
    borderRadius: 16,
  },
  storeAvatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  storeInfo: {
    flex: 1,
  },
  storeName: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.dark,
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  storeStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FEF9C3",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  storeRating: {
    fontSize: 13,
    fontWeight: "700",
    color: "#92400E",
  },
  storeReviews: {
    fontSize: 12,
    color: "#B45309",
    fontWeight: "500",
  },
  storePlaceholder: {
    height: 80,
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
  },
  storeArrow: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
});
