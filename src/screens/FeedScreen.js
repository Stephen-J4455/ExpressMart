import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { ProductCard } from "../components/ProductCard";
import { ProductCardPlaceholder } from "../components/ProductCardPlaceholder";
import { useShop } from "../context/ShopContext";
import { colors } from "../theme/colors";

export const FeedScreen = ({ route, navigation }) => {
  const { products, refresh, loading } = useShop();
  const category = route?.params?.category;

  const filtered = category
    ? products.filter((product) => product.category === category)
    : products;

  // Show placeholders while loading
  const displayData =
    loading && filtered.length === 0 ? Array(4).fill(null) : filtered;

  return (
    <FlatList
      data={displayData}
      keyExtractor={(item, index) => item?.id || `placeholder-${index}`}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={refresh} />
      }
      renderItem={({ item }) => (
        <View style={styles.gridItem}>
          {item ? (
            <ProductCard
              product={item}
              onPress={() =>
                navigation.navigate("ProductDetail", { product: item })
              }
            />
          ) : (
            <ProductCardPlaceholder />
          )}
        </View>
      )}
      numColumns={2}
      columnWrapperStyle={styles.columnWrapper}
      ListFooterComponent={<View style={{ height: 32 }} />}
    />
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 5,
    paddingVertical: 8,
    paddingTop: 60,
    backgroundColor: colors.light,
  },
  columnWrapper: {
    justifyContent: "space-between",
    paddingHorizontal: 0,
  },
  gridItem: {
    width: "49%",
  },
});
