import { useState, useEffect, useMemo } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  Platform,
  StatusBar
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useShop } from "../context/ShopContext";
import { ProductCard } from "../components/ProductCard";
import { colors } from "../theme/colors";

export const CategoriesScreen = ({ navigation }) => {
  const { categories, products, loading, refresh } = useShop();
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);

  // Initialize selection
  useEffect(() => {
    if (categories.length > 0 && !selectedCategoryId) {
      setSelectedCategoryId(categories[0].id);
    }
  }, [categories]);

  const filteredProducts = useMemo(() => {
    if (!selectedCategoryId) return [];

    // Get selected category name for fallback matching
    const selectedCategory = categories.find(c => c.id === selectedCategoryId);
    const categoryName = selectedCategory ? selectedCategory.name : "";

    return products.filter(p =>
      p.category === selectedCategoryId ||
      // Some implementations store category name string instead of ID
      (typeof p.category === 'string' && p.category.toLowerCase() === categoryName.toLowerCase())
    );
  }, [products, selectedCategoryId, categories]);

  const renderCategoryItem = ({ item }) => {
    const isSelected = item.id === selectedCategoryId;
    return (
      <Pressable
        style={[styles.sidebarItem, isSelected && styles.sidebarItemSelected]}
        onPress={() => setSelectedCategoryId(item.id)}
      >
        <View
          style={[
            styles.iconWrap,
            { backgroundColor: isSelected ? colors.primary : (item.color || "#f0f0f0") }
          ]}
        >
          <Ionicons
            name={item.icon || "apps"}
            size={20}
            color={isSelected ? "#fff" : colors.dark}
          />
        </View>
        <Text
          style={[styles.sidebarText, isSelected && styles.sidebarTextSelected]}
          numberOfLines={2}
        >
          {item.name}
        </Text>
        {isSelected && <View style={styles.activeIndicator} />}
      </Pressable>
    );
  };

  const renderProductItem = ({ item }) => (
    <View style={styles.productWrapper}>
      <ProductCard
        product={item}
        onPress={() => navigation.navigate("ProductDetail", { product: item })}
        style={styles.productCard}
        hideCta={true}
        compact={true}
      />
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Sidebar */}
      <View style={styles.sidebar}>
        <View style={styles.sidebarHeader} />
        <FlatList
          data={categories}
          renderItem={renderCategoryItem}
          keyExtractor={(item) => item.id.toString()}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.sidebarContent}
        />
      </View>

      {/* Main Content */}
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            {categories.find(c => c.id === selectedCategoryId)?.name || "Category"}
          </Text>
          <Text style={styles.headerSubtitle}>
            {filteredProducts.length} items
          </Text>
        </View>

        <FlatList
          data={filteredProducts}
          renderItem={renderProductItem}
          keyExtractor={(item) => item.id.toString()}
          numColumns={2}
          columnWrapperStyle={styles.productsRow}
          contentContainerStyle={styles.productsGrid}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={refresh} colors={[colors.primary]} />
          }
          ListEmptyComponent={
            !loading && (
              <View style={styles.emptyState}>
                <Ionicons name="cube-outline" size={48} color={colors.muted} />
                <Text style={styles.emptyText}>No products found</Text>
              </View>
            )
          }
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#fff",
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 50, // Safe Area fallback
  },
  sidebar: {
    width: 90,
    backgroundColor: "#F8F9FA",
    borderRightWidth: 1,
    borderRightColor: "#eee",
  },
  sidebarHeader: {
    height: 20,
  },
  sidebarContent: {
    paddingBottom: 20,
  },
  sidebarItem: {
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 8,
    position: 'relative',
  },
  sidebarItemSelected: {
    backgroundColor: "#fff",
  },
  activeIndicator: {
    position: 'absolute',
    left: 0,
    top: 16,
    bottom: 16,
    width: 3,
    backgroundColor: colors.primary,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  sidebarText: {
    fontSize: 11,
    textAlign: "center",
    color: colors.muted,
    fontWeight: "500",
  },
  sidebarTextSelected: {
    color: colors.primary,
    fontWeight: "700",
  },

  content: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.dark,
  },
  headerSubtitle: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 4,
  },
  productsGrid: {
    paddingHorizontal: 12,
    paddingBottom: 80,
  },
  productsRow: {
    justifyContent: 'space-between',
    gap: 12,
  },
  productWrapper: {
    width: '48.5%',
  },
  productCard: {
    width: '100%',
    minWidth: 0,
    height: 190,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    opacity: 0.6,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
    color: colors.muted,
  }
});
