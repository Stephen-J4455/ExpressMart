import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  Animated,
} from "react-native";
import * as Linking from "expo-linking";
import { AppHeader } from "../components/AppHeader";
import { CategoryScroller } from "../components/CategoryScroller";
import { ProductCard } from "../components/ProductCard";
import { ProductCardPlaceholder } from "../components/ProductCardPlaceholder";
import { PromoBanner } from "../components/PromoBanner";
import { SectionHeader } from "../components/SectionHeader";
import { SellerScroller } from "../components/SellerScroller";
import { AdRenderer } from "../components/AdBanner";
import { StatusRow } from "../components/StatusRow";
import { useShop } from "../context/ShopContext";
import { useAds } from "../context/AdsContext";
import { colors } from "../theme/colors";



export const HomeScreen = ({ navigation }) => {
  const { products, categories, sellers, loading, refresh } = useShop();
  const { fetchAdsByPlacement } = useAds();
  const [currentAdIndex, setCurrentAdIndex] = useState(0);
  const [homeAds, setHomeAds] = useState([]);
  const [featuredAds, setFeaturedAds] = useState([]);
  const adScrollRef = useRef(null);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  // Opening animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  // Load ads
  useEffect(() => {
    const loadAds = async () => {
      const homeAdsData = await fetchAdsByPlacement("home");
      setHomeAds(homeAdsData);

      const featuredAdsData = await fetchAdsByPlacement("feed");
      setFeaturedAds(featuredAdsData);
    };

    loadAds();
  }, [fetchAdsByPlacement]);

  const featured = useMemo(
    () =>
      products
        .slice()
        .sort(() => Math.random() - 0.5)
        .slice(0, 12),
    [products],
  );

  const mostPopular = useMemo(
    () =>
      products
        .slice()
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 12),
    [products],
  );

  // Auto-scroll ads
  useEffect(() => {
    if (homeAds.length === 0) return;

    const interval = setInterval(() => {
      setCurrentAdIndex((prevIndex) => {
        const nextIndex = (prevIndex + 1) % homeAds.length;
        adScrollRef.current?.scrollToIndex({
          index: nextIndex,
          animated: true,
        });
        return nextIndex;
      });
    }, 3000); // Change ad every 3 seconds

    return () => clearInterval(interval);
  }, [homeAds]);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        overScrollMode="never"
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} />
        }
      >
        <AppHeader
          onSearchPress={() => navigation.navigate("Search")}
          onStoresPress={() => navigation.navigate("Stores")}
          onChatPress={() => navigation.navigate("Chats")}
        />

        {homeAds.length > 0 && (
          <View style={styles.adContainer}>
            <FlatList
              ref={adScrollRef}
              horizontal
              data={homeAds}
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
              snapToInterval={320 + 16} // Card width + separator
              decelerationRate="fast"
              renderItem={({ item }) => (
                <PromoBanner
                  deal={{
                    ...item,
                    label: item.title,
                    discount: item.discount_badge,
                    subtitle: item.description,
                    image: item.image_url,
                  }}
                  onPress={async () => {
                    if (item.cta_url) {
                      try {
                        await Linking.openURL(item.cta_url);
                      } catch (err) {
                        console.log("Error opening link", err);
                        navigation.navigate("Search", { query: item.title });
                      }
                    } else {
                      navigation.navigate("Search", { query: item.title });
                    }
                  }}
                />
              )}
              ItemSeparatorComponent={() => <View style={{ width: 16 }} />}
              contentContainerStyle={{ paddingHorizontal: 16 }}
              onScrollToIndexFailed={() => {
                // Handle scroll failure silently
              }}
            />
          </View>
        )}

        <StatusRow
          onSelectStatus={(status) => {
            if (status) {
              navigation.navigate("StatusViewer", { status });
            }
          }}
        />

        <SectionHeader
          title="Stores"
          actionLabel="All"
          onActionPress={() => navigation.navigate("Stores")}
        />
        <SellerScroller
          sellers={sellers}
          onSelect={(seller) => navigation.navigate("Store", { seller })}
        />

        <View style={styles.sectionSpacer} />
        <SectionHeader title="ForYou" />
        <View style={styles.grid}>
          {loading
            ? Array(4)
              .fill(null)
              .map((_, index) => (
                <View key={`placeholder-${index}`} style={styles.gridItem}>
                  <ProductCardPlaceholder />
                </View>
              ))
            : featured.map((product) => (
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
        <SectionHeader title="Most Popular" />
        <View style={styles.grid}>
          {loading
            ? Array(4)
              .fill(null)
              .map((_, index) => (
                <View key={`placeholder-${index}`} style={styles.gridItem}>
                  <ProductCardPlaceholder />
                </View>
              ))
            : mostPopular.map((product) => (
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
        {featuredAds.length > 0 && (
          <View style={styles.adContainer}>
            <AdRenderer ads={featuredAds} />
          </View>
        )}
      </ScrollView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light,
  },
  sectionSpacer: {
    gap: 8,
    marginTop: 8,
  },
  adContainer: {
    gap: 8,
    marginTop: 8,
    paddingVertical: 12,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingHorizontal: 5,
    paddingVertical: 4,
  },
  gridItem: {
    width: "49%",
  },
});
