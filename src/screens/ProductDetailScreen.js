import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Alert,
  ActivityIndicator,
  Dimensions,
  Modal,
  TextInput,
} from "react-native";
import { useState, useEffect, useCallback } from "react";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useShop } from "../context/ShopContext";
import { supabase } from "../lib/supabase";
import { colors } from "../theme/colors";

const SELLER_BADGE_CONFIG = {
  verified: {
    label: "Verified Seller",
    icon: "checkmark-circle",
    color: "#10B981",
  },
  top_seller: { label: "Top Seller", icon: "trophy", color: "#F59E0B" },
  fast_shipping: { label: "Fast Shipping", icon: "flash", color: "#3B82F6" },
  eco_friendly: { label: "Eco Friendly", icon: "leaf", color: "#22C55E" },
  local: { label: "Local Business", icon: "location", color: "#8B5CF6" },
  trending: { label: "Trending", icon: "trending-up", color: "#EC4899" },
  premium: { label: "Premium", icon: "star", color: "#EAB308" },
};

const PRODUCT_BADGE_CONFIG = {
  // Exact badge IDs from Express-Seller
  free_shipping: { icon: "rocket", color: "#3B82F6", label: "Free Shipping" },
  flash_deal: { icon: "flash", color: "#EF4444", label: "Flash Deal" },
  new_arrival: {
    icon: "sparkles-outline",
    color: "#8B5CF6",
    label: "New Arrival",
  },
  bestseller: { icon: "trophy", color: "#F59E0B", label: "Bestseller" },
  limited_stock: {
    icon: "alert-circle",
    color: "#DC2626",
    label: "Limited Stock",
  },
  top_rated: { icon: "star", color: "#EAB308", label: "Top Rated" },
  featured: { icon: "star", color: "#22C55E", label: "Featured" },
};

export const ProductDetailScreen = ({ route, navigation }) => {
  const { product: initialProduct } = route.params;
  const { addToCart } = useCart();
  const { user } = useAuth();
  const toast = useToast();
  const { refresh: refreshShop } = useShop();
  const [product, setProduct] = useState(initialProduct);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [wishlistLoading, setWishlistLoading] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [reviewCount, setReviewCount] = useState(0);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [userHasReviewed, setUserHasReviewed] = useState(false);
  const [userReview, setUserReview] = useState(null);
  const [reviewComments, setReviewComments] = useState({});
  const [editingReview, setEditingReview] = useState(false);
  const [commentInputs, setCommentInputs] = useState({});
  const [submittingComment, setSubmittingComment] = useState({});
  const [showVariantModal, setShowVariantModal] = useState(false);
  const [selectedColor, setSelectedColor] = useState(null);
  const [selectedSize, setSelectedSize] = useState(null);

  const screenWidth = Dimensions.get("window").width;

  // Format price as Ghana Cedis
  const formatPrice = (price, discount = 0) => {
    const discountedPrice = discount > 0 ? price * (1 - discount / 100) : price;
    return `GH₵${Number(discountedPrice || 0).toLocaleString()}`;
  };

  // Refresh product data from database
  const refreshProductData = async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from("express_products")
        .select("*, seller_id(id,name,avatar,rating,total_ratings,badges)")
        .eq("id", product.id)
        .single();

      if (error) throw error;
      if (data) {
        // Map the seller_id to seller property
        setProduct({
          ...data,
          seller: data.seller_id,
        });
      }
    } catch (err) {
      console.error("Error refreshing product data:", err);
    }
  };

  // Check if product is wishlisted
  useEffect(() => {
    // Refresh product data to ensure we have seller information
    refreshProductData();
  }, []);

  // Check if product is wishlisted
  useEffect(() => {
    const checkWishlist = async () => {
      if (!user || !supabase) return;
      const { data } = await supabase
        .from("express_wishlists")
        .select("id")
        .eq("user_id", user.id)
        .eq("product_id", product.id)
        .single();
      setIsWishlisted(!!data);
    };
    checkWishlist();
  }, [user, product.id]);

  // Fetch reviews
  useEffect(() => {
    const fetchReviews = async () => {
      if (!supabase) return;

      // First, get approved reviews
      const { data: approvedReviews, count } = await supabase
        .from("express_reviews")
        .select("*", { count: "exact" })
        .eq("product_id", product.id)
        .eq("is_approved", true)
        .order("created_at", { ascending: false })
        .limit(5);

      let allReviews = approvedReviews || [];
      setReviewCount(count || 0);

      // Check if user has already reviewed
      if (user) {
        const userReview = approvedReviews?.find(
          (review) => review.user_id === user.id,
        );
        setUserHasReviewed(!!userReview);
        setUserReview(userReview);
      }

      setReviews(approvedReviews || []);

      // Fetch comments for each review
      if (approvedReviews && approvedReviews.length > 0) {
        const commentsData = {};
        for (const review of approvedReviews) {
          const { data: comments } = await supabase
            .from("express_review_comments")
            .select("*")
            .eq("review_id", review.id)
            .eq("is_approved", true)
            .order("created_at", { ascending: true });
          commentsData[review.id] = comments || [];
        }
        setReviewComments(commentsData);
      }
    };
    fetchReviews();
  }, [product.id, user]);

  // Refresh product data on component mount
  useEffect(() => {
    refreshProductData();
  }, []);

  const toggleWishlist = useCallback(async () => {
    if (!user) {
      Alert.alert(
        "Sign In Required",
        "Please sign in to add items to your wishlist",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Sign In", onPress: () => navigation.navigate("Auth") },
        ],
      );
      return;
    }
    if (!supabase) return;

    setWishlistLoading(true);
    try {
      if (isWishlisted) {
        await supabase
          .from("express_wishlists")
          .delete()
          .eq("user_id", user.id)
          .eq("product_id", product.id);
        setIsWishlisted(false);
      } else {
        await supabase.from("express_wishlists").insert({
          user_id: user.id,
          product_id: product.id,
        });
        setIsWishlisted(true);
      }
    } catch (err) {
      toast.error("Error", err.message);
    } finally {
      setWishlistLoading(false);
    }
  }, [user, isWishlisted, product.id, navigation, toast]);

  const submitReview = async () => {
    if (!user) {
      Alert.alert("Sign In Required", "Please sign in to submit a review", [
        { text: "Cancel", style: "cancel" },
        { text: "Sign In", onPress: () => navigation.navigate("Auth") },
      ]);
      return;
    }
    if (!supabase) return;

    if (!reviewComment.trim()) {
      toast.error("Error", "Please enter a review comment");
      return;
    }

    setSubmittingReview(true);
    try {
      let result;
      if (editingReview && userReview) {
        // Update existing review
        result = await supabase
          .from("express_reviews")
          .update({
            rating: reviewRating,
            comment: reviewComment.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", userReview.id)
          .select()
          .single();
      } else {
        // Create new review
        result = await supabase
          .from("express_reviews")
          .insert({
            product_id: product.id,
            user_id: user.id,
            rating: reviewRating,
            comment: reviewComment.trim(),
            is_approved: true, // Auto-approve reviews
          })
          .select()
          .single();
      }

      const { data, error } = result;
      if (error) throw error;

      toast.success(
        editingReview ? "Review Updated" : "Review Submitted",
        editingReview
          ? "Your review has been updated successfully"
          : "Your review has been published successfully",
      );
      setShowReviewModal(false);
      setReviewComment("");
      setReviewRating(5);
      setEditingReview(false);
      setUserHasReviewed(true);
      setUserReview(data);

      // Refresh reviews
      const { data: newReviews, count } = await supabase
        .from("express_reviews")
        .select("*", { count: "exact" })
        .eq("product_id", product.id)
        .eq("is_approved", true)
        .order("created_at", { ascending: false })
        .limit(5);
      setReviews(newReviews || []);
      setReviewCount(count || 0);

      // Update user review status
      if (user) {
        const userReview = newReviews?.find(
          (review) => review.user_id === user.id,
        );
        setUserHasReviewed(!!userReview);
        setUserReview(userReview);
      }

      // Refresh product data to get updated rating
      await refreshProductData();

      // Refresh shop context to update product lists
      refreshShop();
    } catch (err) {
      toast.error("Error", err.message);
    } finally {
      setSubmittingReview(false);
    }
  };

  const submitComment = async (reviewId) => {
    if (!user) {
      Alert.alert("Sign In Required", "Please sign in to add a comment", [
        { text: "Cancel", style: "cancel" },
        { text: "Sign In", onPress: () => navigation.navigate("Auth") },
      ]);
      return;
    }
    if (!supabase) return;

    const commentText = commentInputs[reviewId]?.trim();
    if (!commentText) {
      toast.error("Error", "Please enter a comment");
      return;
    }

    setSubmittingComment((prev) => ({ ...prev, [reviewId]: true }));
    try {
      const { data, error } = await supabase
        .from("express_review_comments")
        .insert({
          review_id: reviewId,
          user_id: user.id,
          comment: commentText,
          is_approved: true, // Comments can be auto-approved
        })
        .select()
        .single();

      if (error) throw error;

      // Update local state
      setReviewComments((prev) => ({
        ...prev,
        [reviewId]: [...(prev[reviewId] || []), data],
      }));

      // Clear input
      setCommentInputs((prev) => ({ ...prev, [reviewId]: "" }));
    } catch (err) {
      toast.error("Error", err.message);
    } finally {
      setSubmittingComment((prev) => ({ ...prev, [reviewId]: false }));
    }
  };

  const editReview = () => {
    if (!userReview) return;
    setReviewRating(userReview.rating);
    setReviewComment(userReview.comment || "");
    setEditingReview(true);
    setShowReviewModal(true);
  };

  const handleAddToCart = () => {
    const hasMultipleColors = product.colors && product.colors.length > 1;
    const hasMultipleSizes = product.sizes && product.sizes.length > 1;

    if (hasMultipleColors || hasMultipleSizes) {
      // Reset selections and show modal
      setSelectedColor(hasMultipleColors ? null : product.colors?.[0] || null);
      setSelectedSize(hasMultipleSizes ? null : product.sizes?.[0] || null);
      setShowVariantModal(true);
    } else {
      // Add directly with available options
      addToCart(
        product,
        1,
        product.sizes?.[0] || null,
        product.colors?.[0] || null,
      );
      toast.success(
        "Added to Cart",
        `${product.title} has been added to your cart`,
      );
    }
  };

  const handleConfirmAddToCart = () => {
    if (
      (product.colors && product.colors.length > 1 && !selectedColor) ||
      (product.sizes && product.sizes.length > 1 && !selectedSize)
    ) {
      toast.error("Selection Required", "Please select all required options");
      return;
    }

    addToCart(product, 1, selectedSize, selectedColor);
    setShowVariantModal(false);
    toast.success(
      "Added to Cart",
      `${product.title} has been added to your cart`,
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        bounces={false}
        contentInsetAdjustmentBehavior="automatic"
        overScrollMode="never"
      >
        <View style={styles.imageContainer}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={(e) => {
              const index = Math.round(
                e.nativeEvent.contentOffset.x / screenWidth,
              );
              setActiveImageIndex(index);
            }}
            scrollEventThrottle={16}
          >
            {(product.thumbnails && product.thumbnails.length > 0
              ? product.thumbnails
              : [product.thumbnail]
            ).map((imageUri, index) => (
              <Image
                key={index}
                source={{ uri: imageUri }}
                style={[styles.image, { width: screenWidth }]}
              />
            ))}
          </ScrollView>

          {product.thumbnails && product.thumbnails.length > 1 && (
            <View style={styles.pagination}>
              {product.thumbnails.map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.paginationDot,
                    activeImageIndex === index && styles.paginationDotActive,
                  ]}
                />
              ))}
            </View>
          )}
        </View>

        <Pressable
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.dark} />
        </Pressable>
        <Pressable
          style={styles.wishlistButton}
          onPress={toggleWishlist}
          disabled={wishlistLoading}
        >
          {wishlistLoading ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Ionicons
              name={isWishlisted ? "heart" : "heart-outline"}
              size={24}
              color={isWishlisted ? colors.accent : colors.dark}
            />
          )}
        </Pressable>

        <View style={styles.content}>
          <View style={styles.vendorRow}>
            <Text style={styles.vendor}>
              {product.seller?.name || product.vendor}
            </Text>
            {product.seller?.badges && product.seller.badges.length > 0 && (
              <View style={styles.sellerBadgesRow}>
                {product.seller.badges.slice(0, 3).map((badgeId) => {
                  const badge = SELLER_BADGE_CONFIG[badgeId];
                  if (!badge) return null;
                  return (
                    <View
                      key={badgeId}
                      style={[
                        styles.sellerBadge,
                        { backgroundColor: badge.color + "20" },
                      ]}
                    >
                      <Ionicons
                        name={badge.icon}
                        size={14}
                        color={badge.color}
                      />
                      <Text
                        style={[styles.sellerBadgeText, { color: badge.color }]}
                      >
                        {badge.label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
          <Text style={styles.title}>{product.title}</Text>

          {product.badges && product.badges.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.badgeRow}
              contentContainerStyle={styles.badgeRowContent}
            >
              {product.badges.map((label) => {
                // Normalize the badge label to lowercase for lookup
                const normalizedLabel = label.toLowerCase();
                const badgeConfig = PRODUCT_BADGE_CONFIG[normalizedLabel];

                // Use the config label if available, otherwise use the original label
                const displayLabel = badgeConfig?.label || label;

                return (
                  <View
                    key={label}
                    style={[
                      styles.productBadge,
                      {
                        backgroundColor:
                          (badgeConfig?.color || colors.primary) + "20",
                      },
                    ]}
                  >
                    {badgeConfig?.icon && (
                      <Ionicons
                        name={badgeConfig.icon}
                        size={12}
                        color={badgeConfig.color || colors.primary}
                      />
                    )}
                    <Text
                      style={[
                        styles.productBadgeText,
                        { color: badgeConfig?.color || colors.primary },
                      ]}
                    >
                      {displayLabel}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          )}

          <View style={styles.priceSection}>
            <View style={styles.priceRow}>
              <View style={styles.priceContainer}>
                <Text style={styles.price}>
                  {formatPrice(product.price, product.discount)}
                </Text>
                {product.discount > 0 && (
                  <>
                    <Text style={styles.originalPrice}>
                      GH₵{Number(product.price).toLocaleString()}
                    </Text>
                    <View style={styles.discountBadge}>
                      <Text style={styles.discountText}>
                        {product.discount}% OFF
                      </Text>
                    </View>
                  </>
                )}
              </View>
            </View>
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={20} color={colors.secondary} />
              <Text style={styles.ratingText}>
                {reviewCount > 0
                  ? product.rating?.toFixed(1) || "0.0"
                  : "No reviews"}
              </Text>
              {reviewCount > 0 && (
                <Text style={styles.ratingCount}>({reviewCount} reviews)</Text>
              )}
            </View>
          </View>

          {product.stock !== undefined && (
            <View style={styles.stockRow}>
              <Ionicons
                name={product.stock > 0 ? "checkmark-circle" : "close-circle"}
                size={18}
                color={product.stock > 0 ? colors.success : colors.accent}
              />
              <Text
                style={[
                  styles.stockText,
                  { color: product.stock > 0 ? colors.success : colors.accent },
                ]}
              >
                {product.stock > 0
                  ? `${product.stock} in stock`
                  : "Out of stock"}
              </Text>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Product Details</Text>
            <Text style={styles.description}>
              {product.description ||
                `High-quality product from ${product.vendor}. Category: ${product.category}. Perfect for your needs with excellent features and durability.`}
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Specifications</Text>
            <View style={styles.specRow}>
              <Text style={styles.specLabel}>Seller</Text>
              <Text style={styles.specValue}>
                {product.seller?.name || product.vendor}
              </Text>
            </View>
            <View style={styles.specRow}>
              <Text style={styles.specLabel}>Category</Text>
              <Text style={styles.specValue}>{product.category}</Text>
            </View>
            <View style={styles.specRow}>
              <Text style={styles.specLabel}>Rating</Text>
              <Text style={styles.specValue}>
                {product.rating?.toFixed(1) || "N/A"} / 5.0
              </Text>
            </View>

            {product.weight && (
              <View style={styles.specRow}>
                <Text style={styles.specLabel}>Weight</Text>
                <Text style={styles.specValue}>
                  {product.weight} {product.weight_unit || "kg"}
                </Text>
              </View>
            )}

            {product.sku && (
              <View style={styles.specRow}>
                <Text style={styles.specLabel}>SKU</Text>
                <Text style={styles.specValue}>{product.sku}</Text>
              </View>
            )}

            {product.barcode && (
              <View style={styles.specRow}>
                <Text style={styles.specLabel}>Barcode</Text>
                <Text style={styles.specValue}>{product.barcode}</Text>
              </View>
            )}

            {product.colors && product.colors.length > 0 && (
              <View style={styles.specRow}>
                <Text style={styles.specLabel}>Available Colors</Text>
                <View style={styles.colorGrid}>
                  {product.colors.map((colorName, index) => {
                    const COLOR_MAP = {
                      Black: "#000000",
                      White: "#FFFFFF",
                      Red: "#EF4444",
                      Blue: "#3B82F6",
                      Green: "#10B981",
                      Yellow: "#F59E0B",
                      Purple: "#8B5CF6",
                      Pink: "#EC4899",
                      Orange: "#F97316",
                      Brown: "#92400E",
                      Gray: "#6B7280",
                      Navy: "#1E3A8A",
                    };
                    return (
                      <View key={index} style={styles.colorBadge}>
                        <View
                          style={[
                            styles.colorDot,
                            { backgroundColor: COLOR_MAP[colorName] || "#CCC" },
                          ]}
                        />
                        <Text style={styles.colorName}>{colorName}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {product.sizes && product.sizes.length > 0 && (
              <View style={styles.specRow}>
                <Text style={styles.specLabel}>Available Sizes</Text>
                <View style={styles.sizeGrid}>
                  {product.sizes.map((size, index) => (
                    <View key={index} style={styles.sizeBadge}>
                      <Text style={styles.sizeName}>{size}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {product.specifications &&
              typeof product.specifications === "object" &&
              Object.keys(product.specifications).length > 0 && (
                <>
                  <View style={styles.divider} />
                  {Object.entries(product.specifications).map(
                    ([key, value], index) => (
                      <View key={index} style={styles.specRow}>
                        <Text style={styles.specLabel}>{key}</Text>
                        <Text style={styles.specValue}>{value}</Text>
                      </View>
                    ),
                  )}
                </>
              )}
          </View>

          {product.tags && product.tags.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Tags</Text>
              <View style={styles.tagsContainer}>
                {product.tags.map((tag, index) => (
                  <Pressable
                    key={index}
                    style={styles.tagChip}
                    onPress={() => navigation.navigate("Search", { tag })}
                  >
                    <Text style={styles.tagText}>{tag}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          <View style={styles.section}>
            <View style={styles.reviewsHeader}>
              <Text style={styles.sectionTitle}>Reviews ({reviewCount})</Text>
              {user && userHasReviewed ? (
                <Pressable style={styles.editReviewButton} onPress={editReview}>
                  <Ionicons
                    name="create-outline"
                    size={16}
                    color={colors.primary}
                  />
                  <Text style={styles.editReviewText}>Edit Review</Text>
                </Pressable>
              ) : user && !userHasReviewed ? (
                <Pressable
                  style={styles.writeReviewButton}
                  onPress={() => setShowReviewModal(true)}
                >
                  <Ionicons
                    name="create-outline"
                    size={16}
                    color={colors.primary}
                  />
                  <Text style={styles.writeReviewText}>Write Review</Text>
                </Pressable>
              ) : null}
            </View>
            {reviews.length > 0 ? (
              reviews.map((review) => (
                <View key={review.id} style={styles.reviewItem}>
                  <View style={styles.reviewHeader}>
                    <View style={styles.reviewStars}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Ionicons
                          key={star}
                          name={star <= review.rating ? "star" : "star-outline"}
                          size={14}
                          color={colors.secondary}
                        />
                      ))}
                    </View>
                    <Text style={styles.reviewDate}>
                      {new Date(review.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                  {review.comment && (
                    <Text style={styles.reviewText}>{review.comment}</Text>
                  )}

                  {/* Comments section */}
                  {reviewComments[review.id] &&
                    reviewComments[review.id].length > 0 && (
                      <View style={styles.commentsSection}>
                        {reviewComments[review.id].map((comment) => (
                          <View
                            key={comment.id}
                            style={[
                              styles.commentItem,
                              comment.seller_id && styles.sellerReplyItem,
                            ]}
                          >
                            <View style={styles.commentHeader}>
                              <Text style={styles.commentAuthor}>
                                {comment.seller_id ? (
                                  <View style={styles.sellerReplyBadge}>
                                    <Ionicons
                                      name="storefront"
                                      size={12}
                                      color="#fff"
                                    />
                                    <Text style={styles.sellerReplyText}>
                                      Seller Reply
                                    </Text>
                                  </View>
                                ) : comment.user_id === user?.id ? (
                                  "You"
                                ) : (
                                  "User"
                                )}
                              </Text>
                              <Text style={styles.commentDate}>
                                {new Date(
                                  comment.created_at,
                                ).toLocaleDateString()}
                              </Text>
                            </View>
                            <Text style={styles.commentBody}>
                              {comment.comment}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}

                  {/* Add comment input */}
                  {user && (
                    <View style={styles.addCommentSection}>
                      <TextInput
                        style={styles.commentInput}
                        placeholder="Add a comment..."
                        value={commentInputs[review.id] || ""}
                        onChangeText={(text) =>
                          setCommentInputs((prev) => ({
                            ...prev,
                            [review.id]: text,
                          }))
                        }
                        multiline
                        numberOfLines={2}
                      />
                      <Pressable
                        style={[
                          styles.commentButton,
                          submittingComment[review.id] &&
                          styles.commentButtonDisabled,
                        ]}
                        onPress={() => submitComment(review.id)}
                        disabled={submittingComment[review.id]}
                      >
                        {submittingComment[review.id] ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.commentButtonText}>Comment</Text>
                        )}
                      </Pressable>
                    </View>
                  )}
                </View>
              ))
            ) : (
              <View style={styles.noReviews}>
                <Ionicons
                  name="chatbubble-outline"
                  size={48}
                  color={colors.muted}
                />
                <Text style={styles.noReviewsText}>No reviews yet</Text>
                {user && !userHasReviewed && (
                  <Pressable
                    style={styles.writeFirstReviewButton}
                    onPress={() => setShowReviewModal(true)}
                  >
                    <Text style={styles.writeFirstReviewText}>
                      Be the first to review
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.ctaButton, product.stock === 0 && styles.ctaDisabled]}
          onPress={handleAddToCart}
          disabled={product.stock === 0}
        >
          <LinearGradient
            colors={
              product.stock === 0
                ? [colors.muted, colors.muted]
                : [colors.primary, colors.accent]
            }
            style={styles.ctaGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Ionicons name="cart" size={20} color="#fff" />
            <Text style={styles.ctaText}>
              {product.stock === 0
                ? "Out of Stock"
                : `Add to Cart - ${formatPrice(product.price, product.discount)}`}
            </Text>
          </LinearGradient>
        </Pressable>
      </View>

      {/* Review Modal */}
      <Modal
        visible={showReviewModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowReviewModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {editingReview ? "Edit Your Review" : "Write a Review"}
            </Text>
            <Pressable
              onPress={() => {
                setShowReviewModal(false);
                setEditingReview(false);
                setReviewComment("");
                setReviewRating(5);
              }}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={24} color={colors.dark} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.modalContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.productInfo}>
              <Image
                source={{ uri: product.thumbnail }}
                style={styles.productImage}
              />
              <View style={styles.productDetails}>
                <Text style={styles.productTitle} numberOfLines={2}>
                  {product.title}
                </Text>
                <Text style={styles.productVendor}>{product.vendor}</Text>
              </View>
            </View>

            <View style={styles.ratingSection}>
              <Text style={styles.sectionLabel}>Rating</Text>
              <View style={styles.starRating}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Pressable key={star} onPress={() => setReviewRating(star)}>
                    <Ionicons
                      name={star <= reviewRating ? "star" : "star-outline"}
                      size={32}
                      color={
                        star <= reviewRating ? colors.secondary : colors.muted
                      }
                    />
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.commentSection}>
              <Text style={styles.sectionLabel}>Comment</Text>
              <TextInput
                style={styles.commentInput}
                placeholder="Share your experience with this product..."
                value={reviewComment}
                onChangeText={setReviewComment}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <Pressable
              style={styles.cancelButton}
              onPress={() => {
                setShowReviewModal(false);
                setEditingReview(false);
                setReviewComment("");
                setReviewRating(5);
              }}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[
                styles.submitButton,
                submittingReview && styles.submitDisabled,
              ]}
              onPress={submitReview}
              disabled={submittingReview}
            >
              {submittingReview ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitText}>Submit Review</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Variant Selection Modal */}
      <Modal
        visible={showVariantModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowVariantModal(false)}
      >
        <View style={styles.variantOverlay}>
          <View style={styles.variantModal}>
            <View style={styles.variantHeader}>
              <Text style={styles.variantTitle}>Select Options</Text>
              <Pressable onPress={() => setShowVariantModal(false)} hitSlop={8}>
                <Ionicons name="close" size={20} color={colors.dark} />
              </Pressable>
            </View>

            {product.colors && product.colors.length > 1 && (
              <View style={styles.variantSection}>
                <Text style={styles.variantLabel}>Color</Text>
                <View style={styles.variantOptionsRow}>
                  {product.colors.map((colorName, index) => {
                    const COLOR_MAP = {
                      Black: "#000000",
                      White: "#FFFFFF",
                      Red: "#EF4444",
                      Blue: "#3B82F6",
                      Green: "#10B981",
                      Yellow: "#F59E0B",
                      Purple: "#8B5CF6",
                      Pink: "#EC4899",
                      Orange: "#F97316",
                      Brown: "#92400E",
                      Gray: "#6B7280",
                      Navy: "#1E3A8A",
                    };
                    const isSelected = selectedColor === colorName;
                    return (
                      <Pressable
                        key={index}
                        onPress={() => setSelectedColor(colorName)}
                        style={[
                          styles.colorOption,
                          isSelected && styles.colorOptionSelected,
                        ]}
                      >
                        <View
                          style={[
                            styles.smallColorDot,
                            { backgroundColor: COLOR_MAP[colorName] || "#CCC" },
                            isSelected && styles.smallColorDotSelected,
                          ]}
                        />
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {product.sizes && product.sizes.length > 1 && (
              <View style={styles.variantSection}>
                <Text style={styles.variantLabel}>Size</Text>
                <View style={styles.variantOptionsRow}>
                  {product.sizes.map((size, index) => {
                    const isSelected = selectedSize === size;
                    return (
                      <Pressable
                        key={index}
                        onPress={() => setSelectedSize(size)}
                        style={[
                          styles.sizeOption,
                          isSelected && styles.sizeOptionSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.sizeOptionText,
                            isSelected && styles.sizeOptionTextSelected,
                          ]}
                        >
                          {size}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            <Pressable
              style={styles.variantAddButton}
              onPress={handleConfirmAddToCart}
            >
              <LinearGradient
                colors={[colors.primary, colors.accent]}
                style={styles.variantAddGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.variantAddText}>Add to Cart</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light,
  },
  scrollView: {
    flex: 1,
  },
  imageContainer: {
    position: "relative",
  },
  image: {
    height: 400,
    backgroundColor: "#f0f0f0",
  },
  pagination: {
    position: "absolute",
    bottom: 20,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255, 255, 255, 0.5)",
  },
  paginationDotActive: {
    backgroundColor: "#fff",
    width: 24,
  },
  backButton: {
    position: "absolute",
    top: 50,
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  wishlistButton: {
    position: "absolute",
    top: 50,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  content: {
    padding: 20,
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -24,
  },
  vendorRow: {
    flexDirection: "column",
    gap: 8,
    marginBottom: 8,
  },
  vendor: {
    fontSize: 14,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  sellerBadgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  sellerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  sellerBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.dark,
    marginBottom: 12,
  },
  badgeRow: {
    marginBottom: 16,
  },
  badgeRowContent: {
    flexDirection: "row",
    gap: 6,
    paddingVertical: 4,
  },
  productBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.08)",
  },
  productBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  badge: {
    backgroundColor: colors.light,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  badgeText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: "600",
  },
  priceSection: {
    marginBottom: 12,
  },
  priceRow: {
    marginBottom: 8,
  },
  price: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.primary,
  },
  priceContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  originalPrice: {
    fontSize: 18,
    color: colors.muted,
    textDecorationLine: "line-through",
  },
  discountBadge: {
    backgroundColor: colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  discountText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
    textTransform: "uppercase",
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  ratingText: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.dark,
  },
  ratingCount: {
    fontSize: 14,
    color: colors.muted,
  },
  stockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 24,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.light,
  },
  stockText: {
    fontSize: 14,
    fontWeight: "600",
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.dark,
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    color: colors.muted,
    lineHeight: 24,
  },
  specRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.light,
  },
  specLabel: {
    fontSize: 15,
    color: colors.muted,
  },
  specValue: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.dark,
  },
  reviewItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.light,
  },
  reviewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  reviewStars: {
    flexDirection: "row",
    gap: 2,
  },
  reviewDate: {
    fontSize: 12,
    color: colors.muted,
  },
  reviewText: {
    fontSize: 14,
    color: colors.dark,
    lineHeight: 20,
    marginBottom: 8,
  },
  commentsSection: {
    marginTop: 12,
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: colors.light,
    gap: 12,
  },
  commentItem: {
    backgroundColor: colors.light + "40",
    padding: 10,
    borderRadius: 10,
  },
  sellerReplyItem: {
    backgroundColor: colors.primary + "10",
    borderColor: colors.primary + "30",
    borderWidth: 1,
  },
  commentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  commentAuthor: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.dark,
  },
  commentDate: {
    fontSize: 10,
    color: colors.muted,
  },
  commentBody: {
    fontSize: 13,
    color: colors.dark,
    lineHeight: 18,
  },
  sellerReplyBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 4,
  },
  sellerReplyText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
  },
  footer: {
    padding: 16,
    paddingBottom: 24,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: colors.light,
  },
  ctaButton: {
    borderRadius: 16,
    overflow: "hidden",
  },
  ctaDisabled: {
    opacity: 0.6,
  },
  ctaGradient: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  ctaText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  reviewsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  writeReviewButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.light,
    borderRadius: 20,
  },
  writeReviewText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.primary,
  },
  noReviews: {
    alignItems: "center",
    paddingVertical: 40,
  },
  noReviewsText: {
    fontSize: 16,
    color: colors.muted,
    marginTop: 12,
    marginBottom: 16,
  },
  writeFirstReviewButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  writeFirstReviewText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#fff",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.light,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.dark,
  },
  closeButton: {
    padding: 4,
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  productInfo: {
    flexDirection: "row",
    padding: 16,
    backgroundColor: colors.light,
    borderRadius: 12,
    marginBottom: 24,
  },
  productImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
  },
  productDetails: {
    flex: 1,
    marginLeft: 12,
    justifyContent: "center",
  },
  productTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.dark,
    marginBottom: 4,
  },
  productVendor: {
    fontSize: 14,
    color: colors.muted,
  },
  ratingSection: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.dark,
    marginBottom: 12,
  },
  starRating: {
    flexDirection: "row",
    gap: 8,
  },
  commentSection: {
    marginBottom: 24,
  },
  commentInput: {
    borderWidth: 1,
    borderColor: colors.light,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: "top",
  },
  modalFooter: {
    flexDirection: "row",
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.light,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: colors.light,
    borderRadius: 8,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.dark,
  },
  submitButton: {
    flex: 2,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  submitDisabled: {
    opacity: 0.6,
  },
  submitText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  editReviewButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.light,
    borderRadius: 20,
  },
  editReviewText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.primary,
  },
  commentsSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.light,
  },
  commentItem: {
    marginBottom: 8,
    padding: 8,
    backgroundColor: colors.light,
    borderRadius: 8,
  },
  commentText: {
    fontSize: 14,
    color: colors.dark,
    lineHeight: 20,
  },
  commentAuthor: {
    fontWeight: "600",
    color: colors.primary,
  },
  commentDate: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
  },
  addCommentSection: {
    marginTop: 12,
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-end",
  },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.light,
    borderRadius: 8,
    padding: 8,
    fontSize: 14,
    minHeight: 40,
    maxHeight: 80,
  },
  commentButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.primary,
    borderRadius: 8,
    justifyContent: "center",
  },
  commentButtonDisabled: {
    opacity: 0.6,
  },
  commentButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    flex: 1,
  },
  colorBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.light,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
  },
  colorDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.1)",
  },
  colorName: {
    fontSize: 13,
    color: colors.dark,
    fontWeight: "500",
  },
  sizeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    flex: 1,
  },
  sizeBadge: {
    backgroundColor: colors.primary + "15",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.primary + "30",
  },
  sizeName: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: "600",
  },
  divider: {
    height: 1,
    backgroundColor: colors.light,
    marginVertical: 12,
  },
  tagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tagChip: {
    backgroundColor: colors.primary + "15",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.primary + "30",
  },
  tagText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: "500",
  },
  variantOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  variantModal: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
    maxHeight: "50%",
  },
  variantHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  variantTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.dark,
  },
  variantSection: {
    marginBottom: 14,
  },
  variantLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.dark,
    marginBottom: 8,
  },
  variantOptionsRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  colorOption: {
    padding: 2,
  },
  colorOptionSelected: {
    opacity: 1,
  },
  smallColorDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#ddd",
  },
  smallColorDotSelected: {
    borderColor: colors.primary,
    borderWidth: 3,
  },
  sizeOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.light,
    backgroundColor: "#fff",
    minWidth: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  sizeOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + "10",
  },
  sizeOptionText: {
    fontSize: 12,
    color: colors.dark,
    fontWeight: "500",
  },
  sizeOptionTextSelected: {
    color: colors.primary,
    fontWeight: "600",
  },
  variantAddButton: {
    marginTop: 16,
    borderRadius: 8,
    overflow: "hidden",
  },
  variantAddGradient: {
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  variantAddText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  productPrice: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.primary,
    marginTop: 4,
  },
});
