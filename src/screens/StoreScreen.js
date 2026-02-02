import { useEffect, useState, useRef } from "react";
import { supabase } from "../lib/supabase";
import {
  ScrollView,
  View,
  Text,
  Image,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  Dimensions,
  Linking,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useShop } from "../context/ShopContext";
import { colors } from "../theme/colors";
import { ProductCard } from "../components/ProductCard";
import { ProductCardPlaceholder } from "../components/ProductCardPlaceholder";
import { SectionHeader } from "../components/SectionHeader";

const BADGE_CONFIG = {
  verified: { label: "Verified", icon: "checkmark-circle", color: "#10B981" },
  top_seller: { label: "Top Seller", icon: "trophy", color: "#F59E0B" },
  fast_shipping: { label: "Fast Shipping", icon: "flash", color: "#3B82F6" },
  eco_friendly: { label: "Eco Friendly", icon: "leaf", color: "#22C55E" },
  local: { label: "Local", icon: "location", color: "#8B5CF6" },
  trending: { label: "Trending", icon: "trending-up", color: "#EC4899" },
  premium: { label: "Premium", icon: "star", color: "#EAB308" },
};

export const StoreScreen = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const { products, loading, refresh } = useShop();
  const seller = route?.params?.seller;
  const sellerId = seller?.id;
  const [storeProducts, setStoreProducts] = useState([]);
  const [activeTab, setActiveTab] = useState("products");
  const tabScrollRef = useRef(null);
  const screenWidth = Dimensions.get("window").width;
  const TABS = ["products", "profile", "reviews"];
  const [storeReviews, setStoreReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [userProfiles, setUserProfiles] = useState({});

  // Calculate average rating from store reviews
  const averageRating =
    storeReviews.length > 0
      ? (
          storeReviews.reduce((sum, review) => sum + review.rating, 0) /
          storeReviews.length
        ).toFixed(1)
      : "0.0";
  useEffect(() => {
    const fetchStoreReviews = async () => {
      if (!supabase || !sellerId) {
        setStoreReviews([]);
        setUserProfiles({});
        setReviewsLoading(false);
        return;
      }
      setReviewsLoading(true);
      try {
        // Fetch all products for this seller first
        const { data: sellerProducts, error: productsError } = await supabase
          .from("express_products")
          .select("id")
          .eq("seller_id", sellerId)
          .eq("status", "active");

        if (productsError) throw productsError;

        const productIds = (sellerProducts || []).map((p) => p.id);
        if (productIds.length === 0) {
          setStoreReviews([]);
          setUserProfiles({});
          setReviewsLoading(false);
          return;
        }

        // Fetch all reviews for these product IDs
        const { data: reviewsData, error: reviewsError } = await supabase
          .from("express_reviews")
          .select("*")
          .in("product_id", productIds)
          .eq("is_approved", true)
          .order("created_at", { ascending: false });

        if (reviewsError) throw reviewsError;

        setStoreReviews(reviewsData || []);

        // Fetch user profiles for the reviewers
        const userIds = [...new Set((reviewsData || []).map((r) => r.user_id))];
        if (userIds.length > 0) {
          const { data: profilesData, error: profilesError } = await supabase
            .from("express_profiles")
            .select("id, full_name")
            .in("id", userIds);
          if (!profilesError && profilesData) {
            const profilesMap = {};
            profilesData.forEach((profile) => {
              profilesMap[profile.id] = profile;
            });
            setUserProfiles(profilesMap);
          }
        } else {
          setUserProfiles({});
        }
      } catch (err) {
        console.error("Error fetching store reviews:", err);
        setStoreReviews([]);
        setUserProfiles({});
      } finally {
        setReviewsLoading(false);
      }
    };
    fetchStoreReviews();
  }, [sellerId]);

  const handleTabPress = (tab) => {
    setActiveTab(tab);
    const index = TABS.indexOf(tab);
    tabScrollRef.current?.scrollTo({ x: index * screenWidth, animated: true });
  };

  const handleScroll = (event) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / screenWidth);
    if (TABS[index] && TABS[index] !== activeTab) {
      setActiveTab(TABS[index]);
    }
  };

  useEffect(() => {
    if (products && sellerId) {
      const filtered = products.filter((p) => {
        // Support both object and string/uuid for seller
        if (!p.seller) return false;
        if (typeof p.seller === "object" && p.seller.id) {
          return p.seller.id === sellerId;
        }
        // If seller is just an ID (string/uuid)
        return p.seller === sellerId;
      });
      setStoreProducts(filtered);
    }
  }, [products, sellerId]);

  const storeInfo = storeProducts.length > 0 ? storeProducts[0] : null;

  // Show placeholders while loading
  const displayData =
    loading && storeProducts.length === 0 ? Array(4).fill(null) : storeProducts;

  return (
    <FlatList
      data={displayData}
      keyExtractor={(item, index) => item?.id || `placeholder-${index}`}
      bounces={true}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={refresh} />
      }
      ListHeaderComponent={
        <View>
          {/* Store Hero Section - extends into status bar */}
          <View style={[styles.hero, { marginTop: -insets.top }]}>
            {seller?.avatar ? (
              <Image
                source={{ uri: seller.avatar }}
                style={styles.heroBackground}
                blurRadius={5}
              />
            ) : null}
            <LinearGradient
              colors={["rgba(0,0,0,0.4)", "rgba(0,0,0,0.6)"]}
              style={styles.heroOverlay}
            >
              <View style={styles.storeHeader}>
                {seller?.avatar ? (
                  <Image
                    source={{ uri: seller.avatar }}
                    style={styles.storeAvatar}
                  />
                ) : (
                  <View style={[styles.storeAvatar, styles.avatarPlaceholder]}>
                    <Ionicons name="storefront" size={48} color="#fff" />
                  </View>
                )}
                <View style={styles.storeInfo}>
                  <Text style={styles.storeName}>{seller?.name}</Text>
                  <View style={styles.ratingRow}>
                    <Ionicons name="star" size={16} color="#FCD34D" />
                    <Text style={styles.rating}>
                      {averageRating} ({storeReviews.length})
                    </Text>
                  </View>
                  <Text style={styles.storeSubtitle}>
                    {storeProducts.length} Products
                  </Text>
                </View>
              </View>

              {/* Badges Section */}
              {seller?.badges && seller.badges.length > 0 && (
                <View style={styles.badgesRow}>
                  {seller.badges.map((badgeId) => {
                    const badgeConfig = BADGE_CONFIG[badgeId];
                    if (!badgeConfig) return null;
                    return (
                      <View
                        key={badgeId}
                        style={[
                          styles.badge,
                          {
                            backgroundColor: badgeConfig.color + "20",
                          },
                        ]}
                      >
                        <Ionicons
                          name={badgeConfig.icon}
                          size={14}
                          color={badgeConfig.color}
                        />
                        <Text
                          style={[
                            styles.badgeText,
                            { color: badgeConfig.color },
                          ]}
                        >
                          {badgeConfig.label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Store Stats */}
              <View style={styles.statsContainer}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{storeProducts.length}</Text>
                  <Text style={styles.statLabel}>Products</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{storeReviews.length}</Text>
                  <Text style={styles.statLabel}>Reviews</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.statItem}>
                  <Ionicons name="checkmark-circle" size={20} color="#FCD34D" />
                  <Text style={styles.statLabel}>Verified</Text>
                </View>
              </View>
            </LinearGradient>
          </View>

          {/* Tab Navigation */}
          <View style={styles.tabContainer}>
            <Pressable
              style={[styles.tab, activeTab === "products" && styles.tabActive]}
              onPress={() => handleTabPress("products")}
            >
              <Ionicons
                name="storefront-outline"
                size={20}
                color={activeTab === "products" ? colors.primary : colors.muted}
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === "products" && styles.tabTextActive,
                ]}
              >
                Products ({storeProducts.length})
              </Text>
            </Pressable>
            <Pressable
              style={[styles.tab, activeTab === "profile" && styles.tabActive]}
              onPress={() => handleTabPress("profile")}
            >
              <Ionicons
                name="person-outline"
                size={20}
                color={activeTab === "profile" ? colors.primary : colors.muted}
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === "profile" && styles.tabTextActive,
                ]}
              >
                Profile
              </Text>
            </Pressable>
            <Pressable
              style={[styles.tab, activeTab === "reviews" && styles.tabActive]}
              onPress={() => handleTabPress("reviews")}
            >
              <Ionicons
                name="star-outline"
                size={20}
                color={activeTab === "reviews" ? colors.primary : colors.muted}
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === "reviews" && styles.tabTextActive,
                ]}
              >
                Reviews ({storeReviews.length})
              </Text>
            </Pressable>
          </View>

          {/* Swipeable Tab Content */}
          <ScrollView
            ref={tabScrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={handleScroll}
            scrollEventThrottle={16}
            style={styles.tabScrollView}
          >
            {/* Products Tab */}
            <View style={[styles.tabPage, { width: screenWidth }]}>
              {displayData.length > 0 ? (
                <View style={styles.productsGrid}>
                  {displayData.map((item, index) => (
                    <View
                      key={item?.id || `placeholder-${index}`}
                      style={styles.gridItem}
                    >
                      {item ? (
                        <ProductCard
                          product={item}
                          onPress={() =>
                            navigation.navigate("ProductDetail", {
                              product: item,
                            })
                          }
                        />
                      ) : (
                        <ProductCardPlaceholder />
                      )}
                    </View>
                  ))}
                </View>
              ) : !loading ? (
                <View style={styles.emptyState}>
                  <Ionicons
                    name="cube-outline"
                    size={64}
                    color={colors.muted}
                  />
                  <Text style={styles.emptyText}>No products</Text>
                  <Text style={styles.emptySubtext}>
                    This store has no products available
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Profile Tab */}
            <View style={[styles.tabPage, { width: screenWidth }]}>
              <View style={styles.tabContent}>
                <View style={styles.profileSection}>
                  <Text style={styles.sectionTitle}>About {seller?.name}</Text>
                  <Text style={styles.profileText}>
                    Welcome to {seller?.name}! We are committed to providing
                    high-quality products and excellent customer service. Our
                    store specializes in a wide range of products to meet your
                    needs.
                  </Text>
                </View>

                {/* Chat Button */}
                <View style={styles.profileSection}>
                  <Pressable
                    style={styles.chatButton}
                    onPress={() => navigation.navigate("Chat", { seller })}
                  >
                    <Ionicons
                      name="chatbubble-outline"
                      size={20}
                      color="#fff"
                    />
                    <Text style={styles.chatButtonText}>Chat with Seller</Text>
                  </Pressable>
                </View>

                {/* Social Media Links */}
                {(seller?.social_facebook ||
                  seller?.social_instagram ||
                  seller?.social_twitter ||
                  seller?.social_whatsapp ||
                  seller?.social_website) && (
                  <View style={styles.profileSection}>
                    <Text style={styles.sectionTitle}>Connect with Us</Text>
                    <View style={styles.socialLinks}>
                      {seller?.social_facebook && (
                        <Pressable
                          style={styles.socialButton}
                          onPress={() =>
                            Linking.openURL(seller.social_facebook)
                          }
                        >
                          <Ionicons
                            name="logo-facebook"
                            size={20}
                            color="#1877F2"
                          />
                          <Text style={styles.socialText}>Facebook</Text>
                        </Pressable>
                      )}
                      {seller?.social_instagram && (
                        <Pressable
                          style={styles.socialButton}
                          onPress={() =>
                            Linking.openURL(seller.social_instagram)
                          }
                        >
                          <Ionicons
                            name="logo-instagram"
                            size={20}
                            color="#E4405F"
                          />
                          <Text style={styles.socialText}>Instagram</Text>
                        </Pressable>
                      )}
                      {seller?.social_twitter && (
                        <Pressable
                          style={styles.socialButton}
                          onPress={() => Linking.openURL(seller.social_twitter)}
                        >
                          <Ionicons
                            name="logo-twitter"
                            size={20}
                            color="#1DA1F2"
                          />
                          <Text style={styles.socialText}>Twitter</Text>
                        </Pressable>
                      )}
                      {seller?.social_whatsapp && (
                        <Pressable
                          style={styles.socialButton}
                          onPress={() =>
                            Linking.openURL(
                              `https://wa.me/${seller.social_whatsapp.replace(/[^0-9]/g, "")}`,
                            )
                          }
                        >
                          <Ionicons
                            name="logo-whatsapp"
                            size={20}
                            color="#25D366"
                          />
                          <Text style={styles.socialText}>WhatsApp</Text>
                        </Pressable>
                      )}
                      {seller?.social_website && (
                        <Pressable
                          style={styles.socialButton}
                          onPress={() => Linking.openURL(seller.social_website)}
                        >
                          <Ionicons
                            name="globe-outline"
                            size={20}
                            color={colors.primary}
                          />
                          <Text style={styles.socialText}>Website</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                )}

                <View style={styles.profileSection}>
                  <Text style={styles.sectionTitle}>Store Statistics</Text>
                  <View style={styles.statsGrid}>
                    <View style={styles.statBox}>
                      <Text style={styles.statNumber}>
                        {storeProducts.length}
                      </Text>
                      <Text style={styles.statLabelSmall}>Products</Text>
                    </View>
                    <View style={styles.statBox}>
                      <Text style={styles.statNumber}>
                        {storeReviews.length}
                      </Text>
                      <Text style={styles.statLabelSmall}>Reviews</Text>
                    </View>
                    <View style={styles.statBox}>
                      <Text style={styles.statNumber}>{averageRating}</Text>
                      <Text style={styles.statLabelSmall}>Rating</Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>

            {/* Reviews Tab */}
            <View style={[styles.tabPage, { width: screenWidth }]}>
              <View style={styles.tabContent}>
                <View style={styles.reviewsHeader}>
                  <Text style={styles.sectionTitle}>Customer Reviews</Text>
                  <View style={styles.ratingSummary}>
                    <Ionicons name="star" size={24} color="#F59E0B" />
                    <Text style={styles.ratingNumber}>{averageRating}</Text>
                    <Text style={styles.ratingCount}>
                      ({storeReviews.length} reviews)
                    </Text>
                  </View>
                </View>
                <View style={styles.reviewsList}>
                  {reviewsLoading ? (
                    <View style={{ alignItems: "center", padding: 24 }}>
                      <Text>Loading reviews...</Text>
                    </View>
                  ) : storeReviews.length > 0 ? (
                    storeReviews.map((review) => {
                      const product = storeProducts.find(
                        (p) => p.id === review.product_id,
                      );
                      return (
                        <View key={review.id} style={styles.reviewItem}>
                          <View style={styles.reviewHeader}>
                            <View style={styles.reviewerAvatar}>
                              <Ionicons
                                name="person"
                                size={20}
                                color={colors.muted}
                              />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.reviewerName}>
                                {userProfiles[review.user_id]?.full_name ||
                                  "Customer"}
                              </Text>
                              <Text style={styles.productName}>
                                on {product?.title || "Unknown Product"}
                              </Text>
                              <View style={styles.reviewStars}>
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <Ionicons
                                    key={star}
                                    name={
                                      star <= review.rating
                                        ? "star"
                                        : "star-outline"
                                    }
                                    size={14}
                                    color="#F59E0B"
                                  />
                                ))}
                              </View>
                            </View>
                          </View>
                          {review.comment && (
                            <Text style={styles.reviewText}>
                              {review.comment}
                            </Text>
                          )}
                          <Text style={styles.reviewDate}>
                            {new Date(review.created_at).toLocaleDateString()}
                          </Text>
                        </View>
                      );
                    })
                  ) : (
                    <View style={{ alignItems: "center", padding: 24 }}>
                      <Ionicons
                        name="chatbubble-outline"
                        size={48}
                        color={colors.muted}
                      />
                      <Text style={styles.emptyText}>No reviews yet</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          </ScrollView>
        </View>
      }
      renderItem={() => null}
      contentContainerStyle={styles.listContainer}
      scrollEnabled={true}
      scrollIndicatorInsets={{ top: 0 }}
      overScrollMode="never"
    />
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
  },
  listContainer: {
    flexGrow: 1,
    paddingBottom: 140,
  },
  hero: {
    minHeight: 400,
  },
  heroBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    resizeMode: "cover",
  },
  heroOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 80,
    paddingHorizontal: 20,
    justifyContent: "flex-start",
  },
  storeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  storeAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: "#fff",
  },
  avatarPlaceholder: {
    backgroundColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  storeInfo: {
    flex: 1,
    gap: 6,
  },
  storeName: {
    fontSize: 24,
    fontWeight: "800",
    color: "#fff",
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  rating: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  storeSubtitle: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 13,
    fontWeight: "500",
  },
  badgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 32,
    marginBottom: 24,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  badgeText: {
    fontSize: 13,
    fontWeight: "700",
  },
  statsContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: 16,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#fff",
  },
  statLabel: {
    fontSize: 12,
    color: "rgba(255,255,255,0.8)",
    fontWeight: "500",
  },
  divider: {
    width: 1,
    height: 40,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  productItem: {
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  columnWrapper: {
    justifyContent: "space-between",
    paddingHorizontal: 5,
  },
  gridItem: {
    width: "49%",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.dark,
  },
  emptySubtext: {
    fontSize: 13,
    color: colors.muted,
  },
  tabScrollView: {
    flexGrow: 0,
  },
  tabPage: {
    minHeight: 300,
  },
  productsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingHorizontal: 5,
    paddingTop: 8,
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 4,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: colors.primary + "10",
  },
  tabText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
  },
  tabTextActive: {
    color: colors.primary,
  },
  tabContent: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.dark,
    marginBottom: 12,
  },
  profileSection: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  profileText: {
    fontSize: 14,
    color: colors.dark,
    lineHeight: 20,
  },
  statsGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 8,
  },
  statBox: {
    alignItems: "center",
    gap: 4,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.primary,
  },
  statLabelSmall: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: "500",
  },
  reviewsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  ratingSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  ratingNumber: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.dark,
  },
  ratingCount: {
    fontSize: 14,
    color: colors.muted,
  },
  reviewsList: {
    gap: 16,
  },
  reviewItem: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  reviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  reviewerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.light,
    alignItems: "center",
    justifyContent: "center",
  },
  reviewerName: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.dark,
    marginBottom: 2,
  },
  productName: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 4,
  },
  reviewStars: {
    flexDirection: "row",
    gap: 2,
  },
  reviewText: {
    fontSize: 14,
    color: colors.dark,
    lineHeight: 20,
    marginBottom: 8,
  },
  reviewDate: {
    fontSize: 12,
    color: colors.muted,
  },
  chatButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    gap: 8,
  },
  chatButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  socialLinks: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  socialButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.light,
    minWidth: 100,
    justifyContent: "center",
  },
  socialText: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.dark,
  },
});
