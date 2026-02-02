import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from "react-native";
import { useState, useEffect, useCallback } from "react";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useToast } from "../context/ToastContext";
import { supabase } from "../lib/supabase";
import { colors } from "../theme/colors";

export const WishlistScreen = ({ navigation }) => {
  const { user } = useAuth();
  const { addToCart } = useCart();
  const toast = useToast();
  const [wishlist, setWishlist] = useState([]);
  const [loading, setLoading] = useState(true);

  const formatPrice = (price) => `GH₵${Number(price || 0).toLocaleString()}`;

  const fetchWishlist = useCallback(async () => {
    if (!user || !supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("express_wishlists")
        .select("id,created_at,product_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch product details for each wishlist item
      if (data && data.length > 0) {
        const productIds = data.map((w) => w.product_id);
        const { data: productsData, error: productsError } = await supabase
          .from("express_products")
          .select("id,title,price,discount,thumbnail,vendor,rating,quantity")
          .in("id", productIds);

        if (productsError) throw productsError;

        const wishlistWithProducts = data.map((item) => ({
          ...item,
          product: productsData?.find((p) => p.id === item.product_id),
        }));

        setWishlist(wishlistWithProducts);
      } else {
        setWishlist(data || []);
      }
    } catch (err) {
      console.error("Wishlist fetch error:", err);
      setWishlist([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchWishlist();
  }, [fetchWishlist]);

  const removeFromWishlist = async (wishlistId) => {
    if (!supabase) return;
    try {
      await supabase.from("express_wishlists").delete().eq("id", wishlistId);
      setWishlist((prev) => prev.filter((item) => item.id !== wishlistId));
    } catch (err) {
      console.error("Remove wishlist error:", err);
    }
  };

  const handleAddToCart = (item) => {
    if (!item.product) return;
    addToCart(item.product, 1);
    toast.success(
      "Added to Cart",
      `${item.product.title} has been added to your cart`,
    );
  };

  const renderItem = ({ item }) => {
    const product = item.product;
    if (!product) return null;

    return (
      <View style={styles.card}>
        <Pressable
          style={styles.cardContent}
          onPress={() => navigation.navigate("ProductDetail", { product })}
        >
          <Image source={{ uri: product.thumbnail }} style={styles.image} />
          <View style={styles.info}>
            <Text style={styles.vendor}>{product.vendor || "Unknown"}</Text>
            <Text style={styles.title} numberOfLines={2}>
              {product.title || "Product"}
            </Text>
            <View style={styles.priceRow}>
              <Text style={styles.price}>{formatPrice(product.price)}</Text>
              {product.rating && (
                <View style={styles.ratingRow}>
                  <Ionicons name="star" size={14} color={colors.secondary} />
                  <Text style={styles.rating}>{product.rating.toFixed(1)}</Text>
                </View>
              )}
            </View>
            <Text
              style={[
                styles.stock,
                {
                  color: product.quantity > 0 ? colors.success : colors.accent,
                },
              ]}
            >
              {product.quantity > 0 ? "In Stock" : "Out of Stock"}
            </Text>
          </View>
        </Pressable>
        <View style={styles.actions}>
          <Pressable
            style={styles.addButton}
            onPress={() => handleAddToCart(item)}
            disabled={product.quantity === 0}
          >
            <Ionicons name="cart-outline" size={20} color={colors.primary} />
          </Pressable>
          <Pressable
            style={styles.removeButton}
            onPress={() => removeFromWishlist(item.id)}
          >
            <Ionicons name="trash-outline" size={20} color={colors.accent} />
          </Pressable>
        </View>
      </View>
    );
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={colors.dark} />
          </Pressable>
          <Text style={styles.headerTitle}>My Wishlist</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.emptyContainer}>
          <Ionicons name="heart-outline" size={80} color={colors.muted} />
          <Text style={styles.emptyTitle}>Sign in to view your wishlist</Text>
          <Pressable
            style={styles.signInButton}
            onPress={() => navigation.navigate("Auth")}
          >
            <LinearGradient
              colors={[colors.primary, colors.accent]}
              style={styles.signInGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.signInText}>Sign In</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.dark} />
        </Pressable>
        <Text style={styles.headerTitle}>My Wishlist</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : wishlist.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="heart-outline" size={80} color={colors.muted} />
          <Text style={styles.emptyTitle}>Your wishlist is empty</Text>
          <Text style={styles.emptySubtitle}>
            Save items you love by tapping the heart icon
          </Text>
          <Pressable
            style={styles.browseButton}
            onPress={() => navigation.navigate("Main")}
          >
            <Text style={styles.browseText}>Browse Products</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={wishlist}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
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
  signInButton: {
    borderRadius: 12,
    overflow: "hidden",
    marginTop: 16,
  },
  signInGradient: {
    paddingHorizontal: 40,
    paddingVertical: 14,
  },
  signInText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  list: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    flexDirection: "row",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardContent: {
    flex: 1,
    flexDirection: "row",
  },
  image: {
    width: 100,
    height: 100,
    backgroundColor: colors.light,
  },
  info: {
    flex: 1,
    padding: 12,
  },
  vendor: {
    fontSize: 11,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.dark,
    marginBottom: 6,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  price: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.primary,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  rating: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.dark,
  },
  stock: {
    fontSize: 12,
    fontWeight: "500",
  },
  actions: {
    padding: 8,
    gap: 8,
    justifyContent: "center",
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.light,
    alignItems: "center",
    justifyContent: "center",
  },
  removeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
  },
});
