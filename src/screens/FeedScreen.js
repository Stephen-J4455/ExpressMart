import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
  ScrollView,
} from "react-native";
import { useCallback } from "react";
import { ProductCard } from "../components/ProductCard";
import { ProductCardPlaceholder } from "../components/ProductCardPlaceholder";
import { useShop } from "../context/ShopContext";
import { colors } from "../theme/colors";
import { useResponsive } from "../hooks/useResponsive";

export const FeedScreen = ({ route, navigation }) => {
  const { products, refresh, loading, loadMore, hasMore, loadingMore } =
    useShop();
  const { gridColumns, getItemWidth } = useResponsive();
  const itemWidth = getItemWidth(gridColumns, 12, 12);
  const category = route?.params?.category;

  const filtered = category
    ? products.filter((product) => product.category === category)
    : products;

  const displayData =
    loading && filtered.length === 0
      ? Array(gridColumns * 2).fill(null)
      : filtered;

  const handleScroll = useCallback(
    ({ nativeEvent }) => {
      const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
      const distanceFromBottom =
        contentSize.height - contentOffset.y - layoutMeasurement.height;
      if (
        distanceFromBottom < 400 &&
        hasMore &&
        !loadingMore &&
        !loading &&
        !category
      ) {
        loadMore();
      }
    },
    [hasMore, loadingMore, loading, loadMore, category],
  );

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={200}
      onScroll={handleScroll}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={refresh} />
      }
    >
      <FlatList
        key={String(gridColumns)}
        data={displayData}
        keyExtractor={(item, index) => item?.id || `placeholder-${index}`}
        numColumns={gridColumns}
        columnWrapperStyle={{
          gap: 12,
          paddingHorizontal: 12,
          justifyContent: "flex-start",
        }}
        contentContainerStyle={{ paddingTop: 8, gap: 12 }}
        renderItem={({ item }) => (
          <View style={{ flex: 1, maxWidth: itemWidth }}>
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
        scrollEnabled={false}
      />
      {loadingMore && (
        <View style={styles.loadMoreIndicator}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      )}
      <View style={{ height: 32 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingTop: 60,
    paddingBottom: 8,
    backgroundColor: colors.background,
  },
  loadMoreIndicator: {
    paddingVertical: 20,
    alignItems: "center",
  },
});
