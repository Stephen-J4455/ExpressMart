import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { AppHeader } from "../components/AppHeader";
import { CategoryScroller } from "../components/CategoryScroller";
import { ProductCard } from "../components/ProductCard";
import { PromoBanner } from "../components/PromoBanner";
import { SectionHeader } from "../components/SectionHeader";
import { useShop } from "../context/ShopContext";
import { colors } from "../theme/colors";

const flashDeals = [
  {
    id: "flash-1",
    label: "Smartphones from GH₵999",
    gradient: ["#0B6EFE", "#4DA3FF"],
    image:
      "https://images.unsplash.com/photo-1510552776732-01acc9a4c88b?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "flash-2",
    label: "Home Essentials 30% Off",
    gradient: ["#0BD3F9", "#1F7AE0"],
    image:
      "https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=800&q=80",
  },
];

export const HomeScreen = ({ navigation }) => {
  const { products, categories, loading } = useShop();
  const featured = products.slice(0, 4);

  return (
    <ScrollView
      style={styles.container}
      contentInsetAdjustmentBehavior="automatic"
      overScrollMode="never"
    >
      <AppHeader onSearchPress={() => navigation.navigate("Search")} />
      <View style={styles.sectionSpacer}>
        {flashDeals.map((deal) => (
          <PromoBanner key={deal.id} deal={deal} />
        ))}
      </View>
      <SectionHeader
        title="Featured Categories"
        actionLabel="All"
        onActionPress={() => navigation.navigate("Categories")}
      />
      <CategoryScroller
        categories={categories}
        onSelect={(category) =>
          navigation.navigate("Feed", { category: category.name })
        }
      />
      <SectionHeader title="Top Picks for You" />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 16 }} color={colors.primary} />
      ) : (
        <View style={styles.grid}>
          {featured.map((product) => (
            <View key={product.id} style={styles.gridItem}>
              <ProductCard
                product={product}
                onPress={() =>
                  navigation.navigate("ProductDetail", { product })
                }
              />
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light,
  },
  sectionSpacer: {
    gap: 16,
    marginTop: 16,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  gridItem: {
    width: "48%",
    marginBottom: 16,
  },
});
