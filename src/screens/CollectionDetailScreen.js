// CollectionDetailScreen
// ---------------------------------------------------------------------------
// Shows the products inside a single collection. Receives `collectionId` and
// `collectionName` as route params. Mirrors the look-and-feel of the old
// WishlistScreen (product card grid, add-to-cart, remove) but reads from the
// collections tables instead of express_wishlists.
// ---------------------------------------------------------------------------

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
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useToast } from "../context/ToastContext";
import { useTheme } from "../context/ThemeContext";
import { useAppStyles } from "../hooks/useAppStyles";
import { useResponsive } from "../hooks/useResponsive";
import {
  getCollectionItems,
  removeProductFromCollection,
} from "../services/collectionsService";
import { supabase } from "../lib/supabase";
import { radius } from "../theme/colors";

export const CollectionDetailScreen = ({ navigation, route }) => {
  const { colors: themeColors } = useTheme();
  const styles = useAppStyles((c) => buildCollectionDetailStyles(c));
  const { user } = useAuth();
  const { addToCart } = useCart();
  const toast = useToast();
  const { gridColumns, getItemWidth } = useResponsive();
  const itemWidth = getItemWidth(gridColumns, 16);

  const collectionId = route?.params?.collectionId;
  const collectionName = route?.params?.collectionName || "Collection";

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    if (!user || !collectionId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await getCollectionItems(user, collectionId);
      setItems(rows);
    } catch (e) {
      console.warn("[CollectionDetailScreen] fetch failed:", e?.message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [user, collectionId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Live updates: re-fetch when items are added/removed for this collection.
  useEffect(() => {
    if (!user || !collectionId || !supabase) return;
    const ch = supabase
      .channel(`collection-items-${collectionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "express_collection_items",
          filter: `collection_id=eq.${collectionId}`,
        },
        () => fetchItems(),
      )
      .subscribe();
    return () => {
      Promise.resolve(ch.unsubscribe?.()).catch(() => {});
    };
  }, [user, collectionId, fetchItems]);

  // Hide the default stack header — we render our own so the title can be the
  // collection name.
  useEffect(() => {
    navigation.setOptions?.({
      title: collectionName,
      headerShown: false,
    });
  }, [navigation, collectionName]);

  const removeItem = async (item) => {
    if (!user || !collectionId) return;
    const result = await removeProductFromCollection(
      user,
      collectionId,
      item.productId,
    );
    if (!result.success) {
      toast.error("Could not remove", result.error || "Unknown error");
      return;
    }
    setItems((prev) => prev.filter((row) => row.id !== item.id));
    toast.info("Removed", `Removed from "${collectionName}".`);
  };

  const handleAddToCart = (item) => {
    if (!item.product) return;
    addToCart(item.product, 1);
    toast.success(
      "Added to Cart",
      `${item.product.title} has been added to your cart`,
    );
  };

  const formatPrice = (price) => `GH₵${Number(price || 0).toLocaleString()}`;

  const renderItem = ({ item }) => {
    const product = item.product;
    if (!product) return null;
    return (
      <View style={[styles.card, { width: itemWidth }]}>
        <Pressable
          onPress={() =>
            navigation.navigate("ProductDetail", { product })
          }
        >
          <Image
            source={{ uri: product.thumbnail }}
            style={styles.image}
          />
        </Pressable>
        <Pressable
          style={styles.info}
          onPress={() =>
            navigation.navigate("ProductDetail", { product })
          }
        >
          <Text style={styles.vendor}>{product.vendor || "Unknown"}</Text>
          <Text style={styles.title} numberOfLines={2}>
            {product.title || "Product"}
          </Text>
          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatPrice(product.price)}</Text>
            {!!product.rating && (
              <View style={styles.ratingRow}>
                <Ionicons
                  name="star"
                  size={14}
                  color={themeColors.secondary}
                />
                <Text style={styles.rating}>
                  {product.rating.toFixed(1)}
                </Text>
              </View>
            )}
          </View>
          <Text
            style={[
              styles.stock,
              {
                color:
                  product.quantity > 0
                    ? themeColors.success
                    : themeColors.accent,
              },
            ]}
          >
            {product.quantity > 0 ? "In Stock" : "Out of Stock"}
          </Text>
        </Pressable>
        <View style={styles.actions}>
          <Pressable
            style={styles.addButton}
            onPress={() => handleAddToCart(item)}
            disabled={product.quantity === 0}
          >
            <Ionicons
              name="cart-outline"
              size={18}
              color={themeColors.primary}
            />
          </Pressable>
          <Pressable
            style={styles.removeButton}
            onPress={() => removeItem(item)}
          >
            <Ionicons
              name="trash-outline"
              size={18}
              color={themeColors.accent}
            />
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
            <Ionicons
              name="arrow-back"
              size={24}
              color={themeColors.dark}
            />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {collectionName}
          </Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.emptyContainer}>
          <Ionicons
            name="bookmark-outline"
            size={80}
            color={themeColors.muted}
          />
          <Text style={styles.emptyTitle}>Sign in to view this collection</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={themeColors.dark} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {collectionName}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={themeColors.primary} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons
            name="bookmark-outline"
            size={80}
            color={themeColors.muted}
          />
          <Text style={styles.emptyTitle}>
            This collection is empty
          </Text>
          <Text style={styles.emptySubtitle}>
            Tap the bookmark on any product to add it here.
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
          data={items}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          numColumns={gridColumns}
          key={`collection-${gridColumns}`}
          columnWrapperStyle={
            gridColumns > 1
              ? { gap: 12, paddingHorizontal: 16, marginBottom: 12 }
              : undefined
          }
          contentContainerStyle={
            gridColumns > 1 ? { paddingVertical: 16 } : styles.list
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
};

const buildCollectionDetailStyles = (c) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: 16,
      backgroundColor: c.light,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    headerTitle: {
      flex: 1,
      fontSize: 18,
      fontWeight: "700",
      color: c.dark,
      textAlign: "center",
      marginHorizontal: 8,
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
      color: c.dark,
      marginTop: 20,
      marginBottom: 8,
      textAlign: "center",
    },
    emptySubtitle: {
      fontSize: 16,
      color: c.muted,
      textAlign: "center",
      marginBottom: 24,
    },
    browseButton: {
      paddingHorizontal: 32,
      paddingVertical: 14,
      backgroundColor: c.primary,
      borderRadius: radius.xl,
    },
    browseText: {
      color: c.light,
      fontSize: 16,
      fontWeight: "700",
    },
    list: {
      padding: 16,
      gap: 12,
    },
    card: {
      backgroundColor: c.surface,
      borderRadius: 16,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOpacity: 0.05,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    image: {
      width: "100%",
      height: 150,
      backgroundColor: c.light,
      resizeMode: "cover",
    },
    info: {
      padding: 10,
    },
    actions: {
      flexDirection: "row",
      paddingHorizontal: 10,
      paddingBottom: 10,
      gap: 8,
    },
    vendor: {
      fontSize: 11,
      color: c.muted,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    title: {
      fontSize: 14,
      fontWeight: "600",
      color: c.dark,
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
      color: c.primary,
    },
    ratingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    rating: {
      fontSize: 12,
      fontWeight: "600",
      color: c.dark,
    },
    stock: {
      fontSize: 12,
      fontWeight: "500",
    },
    addButton: {
      width: 40,
      height: 40,
      borderRadius: radius.full,
      backgroundColor: c.background,
      alignItems: "center",
      justifyContent: "center",
    },
    removeButton: {
      width: 40,
      height: 40,
      borderRadius: radius.full,
      backgroundColor: "#FEE2E2",
      alignItems: "center",
      justifyContent: "center",
    },
  });