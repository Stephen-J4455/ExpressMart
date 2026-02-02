import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useState, useEffect, useCallback } from "react";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { useCart } from "../context/CartContext";
import { useToast } from "../context/ToastContext";
import { ProductCard } from "../components/ProductCard";
import { ProductCardPlaceholder } from "../components/ProductCardPlaceholder";
import { colors } from "../theme/colors";

export const CategoryProductsScreen = ({ navigation, route }) => {
  const { category } = route.params;
  const { addToCart } = useCart();
  const toast = useToast();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchCategoryProducts = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("express_products")
        .select("*, seller_id(id,name,avatar,rating,total_ratings,badges)")
        .eq("category", category.name || category)
        .eq("status", "active")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setProducts(
        (data || []).map((product) => ({
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
        })),
      );
    } catch (err) {
      console.error("Category products fetch error:", err);
      toast.error("Error", "Failed to load products");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [category, toast]);

  useEffect(() => {
    fetchCategoryProducts();
  }, [fetchCategoryProducts]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchCategoryProducts();
    setRefreshing(false);
  }, [fetchCategoryProducts]);

  const handleProductPress = (product) => {
    navigation.navigate("ProductDetail", { product });
  };

  const categoryName = typeof category === "string" ? category : category.name;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.dark} />
        </Pressable>
        <Text style={styles.headerTitle}>{categoryName}</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading && products.length === 0 ? (
        <FlatList
          data={[1, 2, 3, 4]}
          renderItem={() => (
            <View style={styles.gridItem}>
              <ProductCardPlaceholder />
            </View>
          )}
          keyExtractor={(_, index) => `placeholder-${index}`}
          contentContainerStyle={styles.list}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
          scrollEnabled={false}
        />
      ) : products.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="bag-outline" size={80} color={colors.muted} />
          <Text style={styles.emptyTitle}>No products found</Text>
          <Text style={styles.emptySubtitle}>
            This category doesn't have any products yet
          </Text>
          <Pressable
            style={styles.browseButton}
            onPress={() => navigation.navigate("Main")}
          >
            <Text style={styles.browseText}>Browse All Products</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={products}
          renderItem={({ item }) => (
            <View style={styles.gridItem}>
              <ProductCard
                product={item}
                onPress={() => handleProductPress(item)}
              />
            </View>
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}
    </SafeAreaView>
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
    justifyContent: "space-between",
    padding: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: colors.light,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.dark,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.dark,
    marginTop: 20,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: colors.muted,
    textAlign: "center",
    marginBottom: 24,
  },
  browseButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    backgroundColor: colors.primary,
    borderRadius: 12,
  },
  browseText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  list: {
    paddingHorizontal: 5,
    paddingVertical: 8,
  },
  columnWrapper: {
    justifyContent: "space-between",
    paddingHorizontal: 0,
  },
  gridItem: {
    width: "49%",
  },
});
