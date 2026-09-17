import { useMemo, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { NativeViewGestureHandler } from "react-native-gesture-handler";
import { ProductCard } from "../components/ProductCard";
import { useShop } from "../context/ShopContext";
import { useTheme } from "../context/ThemeContext";
import { useAppStyles } from "../hooks/useAppStyles";
import { resolveMediaUrl } from "../services/r2Storage";

const MAX_ROW_ITEMS = 8;
const CATEGORY_COLORS = ["#F97316", "#0EA5E9", "#10B981", "#E11D48", "#8B5CF6"];

const matchesCategory = (product, category) => {
  const value = String(product.category || "").trim().toLowerCase();
  return (
    (category.id != null &&
      (String(product.category_id) === String(category.id) ||
        value === String(category.id).toLowerCase())) ||
    value === String(category.name || "").trim().toLowerCase()
  );
};

const StorefrontSection = ({
  title,
  eyebrow,
  products,
  onProductPress,
  onSeeAll,
  styles,
  accentColor,
  onHorizontalTouchStart,
  onHorizontalTouchEnd,
}) => (
  <View style={styles.section}>
    <View style={styles.sectionHeading}>
      <View>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {onSeeAll ? (
        <Pressable onPress={onSeeAll} hitSlop={8} style={styles.seeAllButton}>
          <Text style={styles.seeAllText}>See all</Text>
          <Ionicons name="arrow-forward" size={15} color={accentColor} />
        </Pressable>
      ) : null}
    </View>
    <NativeViewGestureHandler>
      <ScrollView
        horizontal
        directionalLockEnabled
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.productRow}
        onTouchStart={onHorizontalTouchStart}
        onTouchMove={onHorizontalTouchStart}
        onTouchEnd={onHorizontalTouchEnd}
        onTouchCancel={onHorizontalTouchEnd}
      >
        {products.map((product) => (
          <View key={product.id} style={styles.productItem}>
            <View
              onTouchStart={onHorizontalTouchStart}
              onTouchMove={onHorizontalTouchStart}
              onTouchEnd={onHorizontalTouchEnd}
              onTouchCancel={onHorizontalTouchEnd}
            >
              <ProductCard
                product={product}
                compact
                hideCta
                onPress={() => onProductPress(product)}
              />
            </View>
          </View>
        ))}
      </ScrollView>
    </NativeViewGestureHandler>
  </View>
);

export const StorefrontHomeScreen = ({
  navigation,
  width,
  topInset,
  onScroll,
  onHorizontalTouchStart,
  onHorizontalTouchEnd,
}) => {
  const { colors: c } = useTheme();
  const styles = useAppStyles((colors) => buildStorefrontStyles(colors));
  const { products, categories, loading } = useShop();
  const insets = useSafeAreaInsets();
  const [failedCategoryImages, setFailedCategoryImages] = useState({});
  // The navigation overlays the page; do not reserve a blank bar-height footer.
  const bottomPadding = Math.max(insets.bottom, 12);

  const openProduct = (product) => {
    navigation.navigate("ProductDetail", { product });
  };

  const availableProducts = useMemo(
    () => (products || []).filter((product) => product?.id),
    [products],
  );
  const deals = useMemo(
    () =>
      availableProducts
        .filter((product) => Number(product.discount) > 0)
        .sort((a, b) => Number(b.discount) - Number(a.discount))
        .slice(0, MAX_ROW_ITEMS),
    [availableProducts],
  );
  const popular = useMemo(
    () =>
      [...availableProducts]
        .sort(
          (a, b) =>
            Number(b.rating || 0) - Number(a.rating || 0) ||
            Number(b.likes_count || 0) - Number(a.likes_count || 0),
        )
        .slice(0, MAX_ROW_ITEMS),
    [availableProducts],
  );
  const newArrivals = useMemo(
    () => availableProducts.slice(-MAX_ROW_ITEMS).reverse(),
    [availableProducts],
  );
  const curatedCategories = useMemo(
    () => (categories || []).filter((category) => category?.name).slice(0, 6),
    [categories],
  );

  const budgetPicks = useMemo(
    () =>
      availableProducts
        .filter((product) => Number(product.price) > 0)
        .sort((a, b) => Number(a.price) - Number(b.price))
        .slice(0, MAX_ROW_ITEMS),
    [availableProducts],
  );
  // One shelf per category that actually has products, richest first.
  const categorySections = useMemo(
    () =>
      (categories || [])
        .filter((category) => category?.name)
        .map((category) => ({
          category,
          products: availableProducts
            .filter((product) => matchesCategory(product, category))
            .slice(0, MAX_ROW_ITEMS),
        }))
        .filter((section) => section.products.length > 0)
        .sort((a, b) => b.products.length - a.products.length),
    [availableProducts, categories],
  );

  const openCategory = (category) => {
    navigation.navigate("CategoryProducts", {
      category,
    });
  };

  const renderCategory = (category, index) => {
    const categoryProducts = availableProducts.filter((product) =>
      matchesCategory(product, category),
    );
    const image = resolveMediaUrl(category.image_url);
    const showImage = image && !failedCategoryImages[image];
    return (
      <Pressable
        key={category.id || category.name}
        style={styles.categoryTile}
        onPress={() => openCategory(category)}
        onTouchStart={onHorizontalTouchStart}
        onTouchMove={onHorizontalTouchStart}
        onTouchEnd={onHorizontalTouchEnd}
        onTouchCancel={onHorizontalTouchEnd}
      >
        <View
          style={[
            styles.categoryArt,
            {
              backgroundColor:
                category.color ||
                CATEGORY_COLORS[index % CATEGORY_COLORS.length],
            },
          ]}
        >
          {showImage ? (
            <Image
              source={{ uri: image }}
              style={styles.categoryImage}
              accessibilityLabel={category.name}
              onError={() =>
                setFailedCategoryImages((previous) => ({
                  ...previous,
                  [image]: true,
                }))
              }
            />
          ) : (
            <Ionicons
              name={category.icon || "grid-outline"}
              size={30}
              color="#fff"
            />
          )}
        </View>
        <Text style={styles.categoryName} numberOfLines={1}>
          {category.name}
        </Text>
        <Text style={styles.categoryMeta}>
          {categoryProducts.length
            ? `${categoryProducts.length} picks`
            : "Explore now"}
        </Text>
      </Pressable>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: topInset, paddingBottom: bottomPadding }}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
      nestedScrollEnabled
      onScroll={onScroll}
      onTouchEnd={onHorizontalTouchEnd}
      onTouchCancel={onHorizontalTouchEnd}
    >
      <View style={styles.pageIntro}>
        <Text style={styles.pageKicker}>THE EVERYDAY EDIT</Text>
        <Text style={styles.pageTitle}>Shop better. Live lighter.</Text>
        <Text style={styles.pageSubtitle}>
          Thoughtful finds from trusted sellers, gathered in one easy place.
        </Text>
      </View>

      <LinearGradient
        colors={[c.primary, c.primaryDark || c.primary, "#172554"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroCopy}>
          <Text style={styles.heroEyebrow}>WEEKEND PICKS</Text>
          <Text style={styles.heroTitle}>Good things, ready to go.</Text>
          <Text style={styles.heroDescription}>
            Fresh drops, useful upgrades, and small luxuries for every kind of
            day.
          </Text>
          <Pressable
            style={styles.heroButton}
            onPress={() => navigation.navigate("Stores")}
          >
            <Text style={styles.heroButtonText}>Browse stores</Text>
            <Ionicons name="arrow-forward" size={16} color={c.primary} />
          </Pressable>
        </View>
        <View style={styles.heroBadge}>
          <Ionicons name="sparkles" size={24} color="#fff" />
          <Text style={styles.heroBadgeText}>Curated{`\n`}for you</Text>
        </View>
      </LinearGradient>

      <View style={styles.serviceStrip}>
        {[
          ["flash-outline", "Fast delivery", "Across Ghana"],
          [
            "shield-checkmark-outline",
            "Secure checkout",
            "Pay with confidence",
          ],
          ["refresh-outline", "Easy returns", "Simple and fair"],
        ].map(([icon, title, detail]) => (
          <View key={title} style={styles.serviceItem}>
            <Ionicons name={icon} size={20} color={c.primary} />
            <View style={styles.serviceCopy}>
              <Text style={styles.serviceTitle}>{title}</Text>
              <Text style={styles.serviceDetail}>{detail}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <View>
            <Text style={styles.eyebrow}>FIND YOUR NEXT</Text>
            <Text style={styles.sectionTitle}>Shop by category</Text>
          </View>
          <Pressable
            onPress={() => navigation.navigate("Categories")}
            hitSlop={8}
          >
            <Ionicons name="grid-outline" size={21} color={c.primary} />
          </Pressable>
        </View>
        {curatedCategories.length ? (
          <NativeViewGestureHandler>
            <ScrollView
              horizontal
              directionalLockEnabled
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryRow}
              onTouchStart={onHorizontalTouchStart}
              onTouchMove={onHorizontalTouchStart}
              onTouchEnd={onHorizontalTouchEnd}
              onTouchCancel={onHorizontalTouchEnd}
            >
              {curatedCategories.map(renderCategory)}
            </ScrollView>
          </NativeViewGestureHandler>
        ) : (
          <Text style={styles.emptyText}>
            {loading
              ? "Loading collections..."
              : "Collections are coming soon."}
          </Text>
        )}
      </View>

      {deals.length ? (
        <StorefrontSection
          title="Deals worth grabbing"
          eyebrow="LIMITED-TIME VALUE"
          products={deals}
          onProductPress={openProduct}
          styles={styles}
          accentColor={c.primary}
          onSeeAll={() => navigation.navigate("Categories")}
          onHorizontalTouchStart={onHorizontalTouchStart}
          onHorizontalTouchEnd={onHorizontalTouchEnd}
        />
      ) : null}

      {popular.length ? (
        <StorefrontSection
          title="Popular right now"
          eyebrow="CUSTOMER FAVOURITES"
          products={popular}
          onProductPress={openProduct}
          styles={styles}
          accentColor={c.primary}
          onSeeAll={() => navigation.navigate("Categories")}
          onHorizontalTouchStart={onHorizontalTouchStart}
          onHorizontalTouchEnd={onHorizontalTouchEnd}
        />
      ) : null}

      <Pressable
        style={styles.collectionBanner}
        accessibilityRole="button"
        accessibilityLabel="Open your collections"
        onPress={() => navigation.navigate("Collections")}
      >
        <View style={styles.collectionIcon}>
          <Ionicons name="bag-handle-outline" size={24} color={c.primary} />
        </View>
        <View style={styles.collectionCopy}>
          <Text style={styles.collectionEyebrow}>MAKE IT YOURS</Text>
          <Text style={styles.collectionTitle}>Save finds for later</Text>
          <Text style={styles.collectionDetail}>
            Build a collection as you browse.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={c.muted} />
      </Pressable>

      {newArrivals.length ? (
        <StorefrontSection
          title="New to the marketplace"
          eyebrow="JUST LANDED"
          products={newArrivals}
          onProductPress={openProduct}
          styles={styles}
          accentColor={c.primary}
          onSeeAll={() => navigation.navigate("Categories")}
          onHorizontalTouchStart={onHorizontalTouchStart}
          onHorizontalTouchEnd={onHorizontalTouchEnd}
        />
      ) : null}

      {budgetPicks.length ? (
        <StorefrontSection
          title="Small prices, great finds"
          eyebrow="LOWEST-PRICE PICKS"
          products={budgetPicks}
          onProductPress={openProduct}
          styles={styles}
          accentColor={c.primary}
          onHorizontalTouchStart={onHorizontalTouchStart}
          onHorizontalTouchEnd={onHorizontalTouchEnd}
        />
      ) : null}

      {categorySections.map(({ category, products: categoryProducts }) => (
        <StorefrontSection
          key={category.id || category.name}
          title={category.name}
          eyebrow="EXPLORE THE COLLECTION"
          products={categoryProducts}
          onProductPress={openProduct}
          styles={styles}
          accentColor={c.primary}
          onSeeAll={() => openCategory(category)}
          onHorizontalTouchStart={onHorizontalTouchStart}
          onHorizontalTouchEnd={onHorizontalTouchEnd}
        />
      ))}

      <View style={styles.bottomNote}>
        <Ionicons name="location-outline" size={18} color={c.primary} />
        <Text style={styles.bottomNoteText}>
          Local sellers. Better finds. Delivered to you.
        </Text>
      </View>
    </ScrollView>
  );
};

const buildStorefrontStyles = (c) => {
  const cardWidth = 176;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    pageIntro: { paddingHorizontal: 18, paddingBottom: 16 },
    pageKicker: {
      color: c.primary,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1.4,
    },
    pageTitle: { color: c.text, fontSize: 27, fontWeight: "900", marginTop: 5 },
    pageSubtitle: {
      color: c.muted,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 5,
      maxWidth: 340,
    },
    hero: {
      minHeight: 214,
      marginHorizontal: 14,
      borderRadius: 18,
      padding: 20,
      overflow: "hidden",
      flexDirection: "row",
    },
    heroCopy: { flex: 1, maxWidth: 285 },
    heroEyebrow: {
      color: "#BFDBFE",
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1.3,
    },
    heroTitle: {
      color: "#fff",
      fontSize: 28,
      fontWeight: "900",
      lineHeight: 32,
      marginTop: 8,
    },
    heroDescription: {
      color: "#DBEAFE",
      fontSize: 13,
      lineHeight: 19,
      marginTop: 8,
    },
    heroButton: {
      alignSelf: "flex-start",
      backgroundColor: "#fff",
      borderRadius: 9,
      paddingHorizontal: 13,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 16,
    },
    heroButtonText: { color: c.primary, fontSize: 12, fontWeight: "800" },
    heroBadge: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: "rgba(255,255,255,0.16)",
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "flex-end",
      marginBottom: 4,
    },
    heroBadgeText: {
      color: "#fff",
      fontSize: 11,
      fontWeight: "800",
      textAlign: "center",
      marginTop: 5,
      lineHeight: 14,
    },
    serviceStrip: {
      marginHorizontal: 14,
      marginTop: 14,
      paddingVertical: 13,
      paddingHorizontal: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      flexDirection: "row",
      justifyContent: "space-between",
    },
    serviceItem: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      paddingHorizontal: 3,
    },
    serviceCopy: { flex: 1 },
    serviceTitle: { color: c.text, fontSize: 10, fontWeight: "800" },
    serviceDetail: { color: c.muted, fontSize: 9, marginTop: 2 },
    section: { marginTop: 25 },
    sectionHeading: {
      paddingHorizontal: 18,
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
      marginBottom: 12,
    },
    eyebrow: {
      color: c.primary,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 1.2,
      marginBottom: 3,
    },
    sectionTitle: { color: c.text, fontSize: 21, fontWeight: "900" },
    seeAllButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingBottom: 2,
    },
    seeAllText: { color: c.primary, fontSize: 12, fontWeight: "800" },
    categoryRow: { paddingHorizontal: 18, gap: 12 },
    categoryTile: { width: 112 },
    categoryArt: {
      width: 112,
      height: 92,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    categoryImage: { width: "100%", height: "100%", resizeMode: "cover" },
    categoryName: {
      color: c.text,
      fontSize: 13,
      fontWeight: "800",
      marginTop: 8,
    },
    categoryMeta: { color: c.muted, fontSize: 10, marginTop: 2 },
    productRow: { paddingHorizontal: 14, gap: 10 },
    productItem: { width: cardWidth },
    collectionBanner: {
      marginHorizontal: 14,
      marginTop: 27,
      padding: 16,
      borderRadius: 14,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      flexDirection: "row",
      alignItems: "center",
    },
    collectionIcon: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: c.primaryTint,
      alignItems: "center",
      justifyContent: "center",
    },
    collectionCopy: { flex: 1, marginHorizontal: 12 },
    collectionEyebrow: {
      color: c.primary,
      fontSize: 9,
      fontWeight: "800",
      letterSpacing: 1.1,
    },
    collectionTitle: {
      color: c.text,
      fontSize: 16,
      fontWeight: "900",
      marginTop: 3,
    },
    collectionDetail: { color: c.muted, fontSize: 11, marginTop: 2 },
    emptyText: { color: c.muted, paddingHorizontal: 18, fontSize: 13 },
    bottomNote: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: 7,
      marginTop: 30,
    },
    bottomNoteText: { color: c.muted, fontSize: 12, fontWeight: "700" },
  });
};
