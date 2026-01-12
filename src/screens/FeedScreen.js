import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { ProductCard } from "../components/ProductCard";
import { useShop } from "../context/ShopContext";
import { colors } from "../theme/colors";

export const FeedScreen = ({ route, navigation }) => {
  const { products, refresh, loading } = useShop();
  const category = route?.params?.category;

  const filtered = category
    ? products.filter((product) => product.category === category)
    : products;

  return (
    <FlatList
      data={filtered}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={refresh} />
      }
      renderItem={({ item }) => (
        <ProductCard
          product={item}
          variant="list"
          style={styles.card}
          onPress={() =>
            navigation.navigate("ProductDetail", { product: item })
          }
        />
      )}
      ListFooterComponent={<View style={{ height: 32 }} />}
    />
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingTop: 60,
    gap: 0,
    backgroundColor: colors.light,
  },
  card: {
    width: "100%",
  },
});
