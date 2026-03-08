import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { SearchBar } from "../components/SearchBar";
import { useShop } from "../context/ShopContext";
import { colors } from "../theme/colors";

const trending = [
  "smart watch",
  "gaming laptop",
  "home decor",
  "wireless earbuds",
];

export const SearchScreen = ({ navigation, route }) => {
  const { products } = useShop();
  const [query, setQuery] = useState(route.params?.query || "");
  const [tag, setTag] = useState(route.params?.tag || "");
  const [recentSearches, setRecentSearches] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

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

  // Generate suggestions when typing
  useEffect(() => {
    if (query.length > 0) {
      const queryLower = query.toLowerCase();
      const productSuggestions = products
        .filter(
          (product) =>
            product.title.toLowerCase().includes(queryLower) ||
            product.category?.toLowerCase().includes(queryLower) ||
            (product.tags &&
              product.tags.some((tag) =>
                tag.toLowerCase().includes(queryLower),
              )),
        )
        .slice(0, 5)
        .map((product) => ({
          type: "product",
          text: product.title,
          id: product.id,
        }));

      const categorySuggestions = [
        ...new Set(
          products
            .filter((product) =>
              product.category?.toLowerCase().includes(queryLower),
            )
            .map((product) => product.category),
        ),
      ]
        .slice(0, 3)
        .map((category) => ({
          type: "category",
          text: category,
          id: category,
        }));

      const tagSuggestions = [
        ...new Set(
          products
            .flatMap((product) => product.tags || [])
            .filter((tag) => tag.toLowerCase().includes(queryLower)),
        ),
      ]
        .slice(0, 3)
        .map((tag) => ({
          type: "tag",
          text: tag,
          id: tag,
        }));

      setSuggestions([
        ...productSuggestions,
        ...categorySuggestions,
        ...tagSuggestions,
      ]);
      setShowSuggestions(true);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [query, products]);

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
          }}
          onSubmitEditing={() => {
            if (query.trim()) {
              saveSearch(query);
              navigation.navigate("SearchResults", { query, tag });
            }
          }}
          autoFocus={!tag}
          placeholder={tag ? `Search in "${tag}"` : "Search everything"}
        />
      </View>

      {showSuggestions && suggestions.length > 0 ? (
        <View style={styles.suggestionsContainer}>
          {suggestions.map((suggestion, index) => (
            <Pressable
              key={`${suggestion.type}-${suggestion.id}-${index}`}
              style={styles.suggestionItem}
              onPress={() => {
                if (suggestion.type === "tag") {
                  setTag(suggestion.text);
                  setQuery("");
                  navigation.navigate("SearchResults", {
                    query: "",
                    tag: suggestion.text,
                  });
                } else {
                  setQuery(suggestion.text);
                  navigation.navigate("SearchResults", {
                    query: suggestion.text,
                    tag,
                  });
                }
                setShowSuggestions(false);
              }}
            >
              <Ionicons
                name={
                  suggestion.type === "product"
                    ? "bag-outline"
                    : suggestion.type === "category"
                      ? "grid-outline"
                      : "pricetag-outline"
                }
                size={18}
                color={colors.muted}
              />
              <Text style={styles.suggestionText}>{suggestion.text}</Text>
              <Text style={styles.suggestionType}>
                {suggestion.type === "product"
                  ? "Product"
                  : suggestion.type === "category"
                    ? "Category"
                    : "Tag"}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : !query ? (
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
                    onPress={() => {
                      setQuery(search);
                      navigation.navigate("SearchResults", {
                        query: search,
                        tag,
                      });
                    }}
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
                  onPress={() => {
                    setQuery(keyword);
                    navigation.navigate("SearchResults", {
                      query: keyword,
                      tag,
                    });
                  }}
                >
                  <Text style={styles.tagText}>{keyword}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </>
      ) : null}
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
  suggestionsContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  suggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  suggestionText: {
    flex: 1,
    fontSize: 16,
    color: colors.dark,
    marginLeft: 12,
  },
  suggestionType: {
    fontSize: 12,
    color: colors.muted,
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    textTransform: "uppercase",
    fontWeight: "500",
  },
});
