import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  Image,
  ScrollView,
  TextInput,
  Animated,
  Dimensions,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { SearchBar } from "../components/SearchBar";
import { ProductCard } from "../components/ProductCard";
import { ProductCardPlaceholder } from "../components/ProductCardPlaceholder";
import { useShop } from "../context/ShopContext";
import { supabase } from "../lib/supabase";
import { colors } from "../theme/colors";
import { useResponsive } from "../hooks/useResponsive";

const { width: screenWidth } = Dimensions.get("window");

export const SearchResultsScreen = ({ navigation, route }) => {
  const { products } = useShop();
  const initialQuery = route.params?.query || "";
  const initialTag = route.params?.tag || "";
  const [query, setQuery] = useState(initialQuery);
  const [tag, setTag] = useState(initialTag);
  const [activeTab, setActiveTab] = useState("products");
  const [productResults, setProductResults] = useState([]);
  const [storeResults, setStoreResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMoreSearch, setLoadingMoreSearch] = useState(false);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchOffset, setSearchOffset] = useState(0);
  const SEARCH_PAGE_SIZE = 24;
  const [recentSearches, setRecentSearches] = useState([]);
  const [trendingSearches, setTrendingSearches] = useState([
    "iPhone",
    "Samsung",
    "Nike",
    "Adidas",
    "Laptop",
    "Headphones",
  ]);
  const searchTimerRef = useRef(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  const { gridColumns, getItemWidth } = useResponsive();
  const itemWidth = getItemWidth(gridColumns, 12, 12);

  // Load recent searches on mount
  useEffect(() => {
    loadRecentSearches();
    // Animate in
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const loadRecentSearches = async () => {
    try {
      const searches = await AsyncStorage.getItem("recentSearches");
      if (searches) {
        setRecentSearches(JSON.parse(searches));
      }
    } catch (error) {
      console.warn("Failed to load recent searches", error);
    }
  };

  const saveRecentSearch = async (searchTerm) => {
    try {
      const updated = [
        searchTerm,
        ...recentSearches.filter((s) => s !== searchTerm),
      ].slice(0, 5);
      setRecentSearches(updated);
      await AsyncStorage.setItem("recentSearches", JSON.stringify(updated));
    } catch (error) {
      console.warn("Failed to save recent search", error);
    }
  };

  const clearRecentSearches = async () => {
    setRecentSearches([]);
    await AsyncStorage.removeItem("recentSearches");
  };

  const localProductResults = useMemo(() => {
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

  const triggerProductSearch = useCallback(
    async (text, tagFilter = tag) => {
      if (!supabase || (!text && !tagFilter)) {
        setProductResults([]);
        setSearchHasMore(false);
        setSearchOffset(0);
        return;
      }
      setLoading(true);
      setSearchOffset(0);
      try {
        let dbQuery = supabase
          .from("express_products")
          .select("*, seller_id(id,name,avatar,rating,total_ratings,badges)")
          .eq("status", "active");

        if (text) {
          dbQuery = dbQuery.ilike("title", `%${text}%`);
        }

        if (tagFilter) {
          dbQuery = dbQuery.contains("tags", [tagFilter]);
        }

        const { data, error } = await dbQuery.range(0, SEARCH_PAGE_SIZE - 1);
        if (error) throw error;
        const mapped =
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
          })) || [];
        setProductResults(mapped);
        setSearchHasMore(mapped.length === SEARCH_PAGE_SIZE);
      } catch (error) {
        console.warn("Product search failed", error.message);
        setProductResults([]);
        setSearchHasMore(false);
      } finally {
        setLoading(false);
      }
    },
    [tag],
  );

  const loadMoreSearchResults = useCallback(async () => {
    if (!supabase || loadingMoreSearch || !searchHasMore) return;
    const newOffset = searchOffset + SEARCH_PAGE_SIZE;
    setLoadingMoreSearch(true);
    try {
      let dbQuery = supabase
        .from("express_products")
        .select("*, seller_id(id,name,avatar,rating,total_ratings,badges)")
        .eq("status", "active");
      if (query) dbQuery = dbQuery.ilike("title", `%${query}%`);
      if (tag) dbQuery = dbQuery.contains("tags", [tag]);
      const { data, error } = await dbQuery.range(
        newOffset,
        newOffset + SEARCH_PAGE_SIZE - 1,
      );
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
      setProductResults((prev) => [...prev, ...mapped]);
      setSearchHasMore(mapped.length === SEARCH_PAGE_SIZE);
      setSearchOffset(newOffset);
    } catch (error) {
      console.warn("Load more search failed", error.message);
    } finally {
      setLoadingMoreSearch(false);
    }
  }, [loadingMoreSearch, searchHasMore, searchOffset, query, tag]);

  const triggerStoreSearch = useCallback(async (text) => {
    if (!supabase || !text) {
      setStoreResults([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("express_sellers")
        .select("id,name,avatar,location,rating,total_ratings")
        .ilike("name", `%${text}%`)
        .eq("is_active", true)
        .limit(20);

      if (error) throw error;
      setStoreResults(data || []);
    } catch (error) {
      console.warn("Store search failed", error.message);
      setStoreResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search - waits 400ms after user stops typing before making DB calls
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (query || tag) {
      searchTimerRef.current = setTimeout(() => {
        triggerProductSearch(query);
        if (query) triggerStoreSearch(query);
        if (query) saveRecentSearch(query);
      }, 400);
    } else {
      setProductResults([]);
      setStoreResults([]);
    }
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [query, tag, triggerProductSearch, triggerStoreSearch]);

  const productsToShow = productResults.length
    ? productResults
    : localProductResults;
  const results = activeTab === "products" ? productsToShow : storeResults;

  const handleSearchSubmit = (searchTerm) => {
    setQuery(searchTerm);
    saveRecentSearch(searchTerm);
  };

  const renderSearchSuggestions = () => (
    <Animated.View
      style={[
        styles.suggestionsContainer,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      {!query && (
        <>
          {recentSearches.length > 0 && (
            <View style={styles.suggestionSection}>
              <View style={styles.sectionHeader}>
                <Ionicons
                  name="time-outline"
                  size={20}
                  color={colors.primary}
                />
                <Text style={styles.sectionTitle}>Recent Searches</Text>
                <Pressable
                  onPress={clearRecentSearches}
                  style={styles.clearButton}
                >
                  <Text style={styles.clearButtonText}>Clear</Text>
                </Pressable>
              </View>
              <View style={styles.suggestionGrid}>
                {recentSearches.map((search, index) => (
                  <Pressable
                    key={index}
                    style={styles.suggestionChip}
                    onPress={() => handleSearchSubmit(search)}
                  >
                    <Text style={styles.suggestionText}>{search}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          <View style={styles.suggestionSection}>
            <View style={styles.sectionHeader}>
              <Ionicons
                name="trending-up-outline"
                size={20}
                color={colors.primary}
              />
              <Text style={styles.sectionTitle}>Trending Now</Text>
            </View>
            <View style={styles.suggestionGrid}>
              {trendingSearches.map((search, index) => (
                <Pressable
                  key={index}
                  style={styles.suggestionChip}
                  onPress={() => handleSearchSubmit(search)}
                >
                  <Text style={styles.suggestionText}>{search}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </>
      )}
    </Animated.View>
  );

  return (
    <View style={styles.container}>
      {/* Clean Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={24} color={colors.dark} />
        </Pressable>

        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={20} color={colors.muted} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search products, stores..."
            placeholderTextColor={colors.muted}
            autoFocus
            returnKeyType="search"
            onSubmitEditing={() => handleSearchSubmit(query)}
          />
          {query ? (
            <Pressable onPress={() => setQuery("")} style={styles.clearIcon}>
              <Ionicons name="close-circle" size={20} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Enhanced Tabs */}
      <View style={styles.tabsContainer}>
        <Pressable
          style={[styles.tab, activeTab === "products" && styles.activeTab]}
          onPress={() => setActiveTab("products")}
        >
          <Ionicons
            name="cube-outline"
            size={20}
            color={activeTab === "products" ? "#fff" : colors.primary}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === "products" && styles.activeTabText,
            ]}
          >
            Products ({productsToShow.length})
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "stores" && styles.activeTab]}
          onPress={() => setActiveTab("stores")}
        >
          <Ionicons
            name="storefront-outline"
            size={20}
            color={activeTab === "stores" ? "#fff" : colors.primary}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === "stores" && styles.activeTabText,
            ]}
          >
            Stores ({storeResults.length})
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={200}
        onScroll={({ nativeEvent }) => {
          if (activeTab !== "products") return;
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          const distanceFromBottom =
            contentSize.height - contentOffset.y - layoutMeasurement.height;
          if (
            distanceFromBottom < 400 &&
            searchHasMore &&
            !loadingMoreSearch &&
            !loading
          ) {
            loadMoreSearchResults();
          }
        }}
      >
        {activeTab === "products" ? (
          <>
            {tag && (
              <View style={styles.tagFilterSection}>
                <View style={styles.tagIndicator}>
                  <Ionicons name="pricetag" size={16} color={colors.primary} />
                  <Text style={styles.tagText}>Tag: "{tag}"</Text>
                </View>
                <Pressable
                  style={styles.clearTagButton}
                  onPress={() => {
                    setTag("");
                    setQuery(query);
                  }}
                >
                  <Ionicons
                    name="close-circle"
                    size={20}
                    color={colors.primary}
                  />
                  <Text style={styles.clearTagText}>Clear</Text>
                </Pressable>
              </View>
            )}

            {/* Show suggestions when no query */}
            {!query && !tag && renderSearchSuggestions()}

            {/* Products Grid */}
            {query || tag ? (
              <FlatList
                key={String(gridColumns)}
                data={
                  loading && results.length === 0
                    ? Array(6).fill(null)
                    : results
                }
                keyExtractor={(item, index) =>
                  item?.id || `placeholder-${index}`
                }
                numColumns={gridColumns}
                columnWrapperStyle={{
                  gap: 12,
                  paddingHorizontal: 12,
                  justifyContent: "flex-start",
                }}
                contentContainerStyle={{
                  paddingTop: 8,
                  gap: 12,
                }}
                renderItem={({ item }) => (
                  <View style={{ flex: 1, maxWidth: itemWidth }}>
                    {item ? (
                      <ProductCard
                        product={item}
                        onPress={() =>
                          navigation.navigate("ProductDetail", {
                            product: item,
                          })
                        }
                      />
                    ) : (
                      <ProductCardPlaceholder />
                    )}
                  </View>
                )}
                scrollEnabled={false}
              />
            ) : null}

            {loadingMoreSearch && (
              <View style={{ paddingVertical: 20, alignItems: "center" }}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            )}

            {query && results.length === 0 && !loading && (
              <View style={styles.empty}>
                <View style={styles.emptyIcon}>
                  <Ionicons
                    name="search-outline"
                    size={64}
                    color={colors.muted}
                  />
                </View>
                <Text style={styles.emptyText}>No products found</Text>
                <Text style={styles.emptySub}>
                  {tag
                    ? `No products found with tag "${tag}"`
                    : "Try different keywords or check spelling"}
                </Text>
                <Pressable
                  style={styles.emptyAction}
                  onPress={() => setQuery("")}
                >
                  <Text style={styles.emptyActionText}>Clear search</Text>
                </Pressable>
              </View>
            )}
          </>
        ) : (
          <>
            {/* Show suggestions when no query */}
            {!query && renderSearchSuggestions()}

            {/* Stores List */}
            {query ? (
              <View style={styles.storeList}>
                {loading && results.length === 0
                  ? Array(3)
                      .fill(null)
                      .map((_, index) => (
                        <View
                          key={`store-placeholder-${index}`}
                          style={styles.storeItem}
                        >
                          <View style={styles.storeAvatarPlaceholder} />
                          <View style={styles.storeInfoPlaceholder}>
                            <View style={styles.storeNamePlaceholder} />
                            <View style={styles.storeAddressPlaceholder} />
                          </View>
                        </View>
                      ))
                  : results.map((store) => (
                      <Pressable
                        key={store.id}
                        style={styles.storeItem}
                        onPress={() =>
                          navigation.navigate("Store", {
                            sellerId: store.id,
                          })
                        }
                      >
                        <View style={styles.storeAvatarContainer}>
                          <Image
                            source={{
                              uri:
                                store.avatar ||
                                "https://via.placeholder.com/60",
                            }}
                            style={styles.storeAvatar}
                          />
                          <View style={styles.storeBadge}>
                            <Ionicons name="checkmark" size={12} color="#fff" />
                          </View>
                        </View>
                        <View style={styles.storeInfo}>
                          <Text style={styles.storeName}>{store.name}</Text>
                          <Text style={styles.storeAddress}>
                            {store.location || "Location not specified"}
                          </Text>
                          <View style={styles.storeStats}>
                            <View style={styles.stat}>
                              <Ionicons name="star" size={14} color="#FCD34D" />
                              <Text style={styles.statText}>
                                {store.rating ? store.rating.toFixed(1) : "N/A"}
                              </Text>
                            </View>
                            <View style={styles.stat}>
                              <Ionicons
                                name="people"
                                size={14}
                                color={colors.muted}
                              />
                              <Text style={styles.statText}>
                                {store.total_ratings || 0} reviews
                              </Text>
                            </View>
                          </View>
                        </View>
                        <Ionicons
                          name="chevron-forward"
                          size={20}
                          color={colors.muted}
                        />
                      </Pressable>
                    ))}
              </View>
            ) : null}

            {query && results.length === 0 && !loading && (
              <View style={styles.empty}>
                <View style={styles.emptyIcon}>
                  <Ionicons
                    name="storefront-outline"
                    size={64}
                    color={colors.muted}
                  />
                </View>
                <Text style={styles.emptyText}>No stores found</Text>
                <Text style={styles.emptySub}>Try a different store name</Text>
                <Pressable
                  style={styles.emptyAction}
                  onPress={() => setQuery("")}
                >
                  <Text style={styles.emptyActionText}>Clear search</Text>
                </Pressable>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
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
    backgroundColor: "#fff",
    paddingTop: Platform.OS === "ios" ? 54 : 44,
    paddingBottom: 12,
    paddingHorizontal: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.dark,
    paddingVertical: 0,
  },
  clearIcon: {
    padding: 4,
  },
  tabsContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#fff",
    gap: 12,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.primary,
    gap: 8,
  },
  activeTab: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.primary,
    letterSpacing: -0.2,
  },
  activeTabText: {
    color: "#fff",
  },
  content: {
    flex: 1,
  },
  suggestionsContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  suggestionSection: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.dark,
    letterSpacing: -0.3,
  },
  clearButton: {
    marginLeft: "auto",
  },
  clearButtonText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: "600",
  },
  suggestionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  suggestionChip: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  suggestionText: {
    fontSize: 14,
    color: colors.dark,
    fontWeight: "500",
  },
  tagFilterSection: {
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: colors.primary + "10",
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tagIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tagText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.primary,
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
  storeList: {
    padding: 20,
    gap: 12,
  },
  storeItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#fff",
    borderRadius: 16,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  storeAvatarContainer: {
    position: "relative",
    marginRight: 16,
  },
  storeAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  storeAvatarPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#E2E8F0",
    marginRight: 16,
  },
  storeBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: colors.primary,
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  storeInfo: {
    flex: 1,
  },
  storeInfoPlaceholder: {
    flex: 1,
  },
  storeName: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.dark,
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  storeNamePlaceholder: {
    height: 18,
    backgroundColor: "#E2E8F0",
    borderRadius: 4,
    marginBottom: 8,
  },
  storeAddress: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 8,
  },
  storeAddressPlaceholder: {
    height: 14,
    backgroundColor: "#E2E8F0",
    borderRadius: 4,
    width: "70%",
  },
  storeStats: {
    flexDirection: "row",
    gap: 16,
  },
  stat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statText: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: "500",
  },
  empty: {
    alignItems: "center",
    marginTop: 60,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    marginBottom: 20,
    opacity: 0.6,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.dark,
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 16,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  emptyAction: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
  },
  emptyActionText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
