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
                                size={24}
                                color={colors.muted}
                              />
                            </View>
                          )}
                        </View>
                        <View style={styles.storeInfo}>
                          <Text style={styles.storeName}>{store.name}</Text>
                          <View style={styles.storeStats}>
                            <Ionicons
                              name="star"
                              size={14}
                              color={colors.secondary}
                            />
                            <Text style={styles.storeRating}>
                              {store.rating?.toFixed(1) || "0.0"}
                            </Text>
                            <Text style={styles.storeReviews}>
                              ({store.total_ratings || 0} reviews)
                            </Text>
                          </View>
                        </View>
                        <Ionicons
                          name="chevron-forward"
                          size={20}
                          color={colors.muted}
                        />
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
    backgroundColor: colors.light,
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
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  trendingSection: {
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  clearButton: {
    padding: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 10,
  },
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  tagText: {
    color: colors.dark,
  },
  list: {
    padding: 16,
    gap: 16,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingHorizontal: 5,
    paddingVertical: 5,
  },
  gridItem: {
    width: "49%",
  },
  empty: {
    alignItems: "center",
    marginTop: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "700",
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
    fontWeight: "500",
  },
  tabsContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.light,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 8,
    marginHorizontal: 4,
  },
  activeTab: {
    backgroundColor: colors.primary + "10",
  },
  tabText: {
    fontSize: 16,
    fontWeight: "500",
    color: colors.muted,
  },
  activeTabText: {
    color: colors.primary,
  },
  storeList: {
    padding: 16,
    gap: 12,
  },
  storeHeader: {
    marginBottom: 8,
  },
  storeItem: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  storeContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  storeAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  storeAvatarImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  storeAvatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.light,
    alignItems: "center",
    justifyContent: "center",
  },
  storeInfo: {
    flex: 1,
  },
  storeName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.dark,
    marginBottom: 4,
  },
  storeStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  storeRating: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.dark,
  },
  storeReviews: {
    fontSize: 14,
    color: colors.muted,
  },
  storePlaceholder: {
    height: 70,
    backgroundColor: colors.light,
    borderRadius: 8,
  },
});
