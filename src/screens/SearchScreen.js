import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SearchBar } from "../components/SearchBar";
import { ProductCard } from "../components/ProductCard";
import { useShop } from "../context/ShopContext";
import { supabase } from "../lib/supabase";
import { colors } from "../theme/colors";

const trending = [
  "smart watch",
  "gaming laptop",
  "home decor",
  "wireless earbuds",
];

export const SearchScreen = ({ navigation }) => {
  const { products } = useShop();
  const [query, setQuery] = useState("");
  const [remoteResults, setRemoteResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const localResults = useMemo(() => {
    if (!query) return [];
    const normalized = query.toLowerCase();
    return products.filter(
      (product) =>
        product.title.toLowerCase().includes(normalized) ||
        product.category?.toLowerCase().includes(normalized)
    );
  }, [products, query]);

  const triggerRemoteSearch = useCallback(async (text) => {
    if (!supabase || !text) {
      setRemoteResults([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("express_products")
        .select("id,title,vendor,price,rating,badges,thumbnails,category")
        .eq("status", "active")
        .ilike("title", `%${text}%`)
        .limit(20);
      if (error) throw error;
      setRemoteResults(data);
    } catch (error) {
      console.warn("Search failed", error.message);
      setRemoteResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => triggerRemoteSearch(query), 400);
    return () => clearTimeout(handle);
  }, [query, triggerRemoteSearch]);

  const results = remoteResults.length ? remoteResults : localResults;

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
          onChangeText={setQuery}
          autoFocus
          placeholder="Search everything"
        />
      </View>
      {!query && (
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
      )}
      {loading && (
        <ActivityIndicator
          style={{ marginVertical: 12 }}
          color={colors.primary}
        />
      )}
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <ProductCard
            product={item}
            variant="list"
            style={{ width: "100%" }}
            onPress={() =>
              navigation.navigate("ProductDetail", { product: item })
            }
          />
        )}
        ListEmptyComponent={
          query ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No products found</Text>
              <Text style={styles.emptySub}>Try a different keyword</Text>
            </View>
          ) : null
        }
      />
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
    padding: 16,
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
});
