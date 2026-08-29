// FeedProductCard
// ---------------------------------------------------------------------------
// Social-feed style product card for the Explore/Feed screen. Reuses the exact
// visual language of the existing ProductCard (seller badges, discount badge,
// "New" pill, dark tag pill) — every color resolves through the theme palette,
// no hardcoded hex values.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState, memo, useCallback } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { FlashSaleBadge } from "./FlashSaleBadge";
import { LazyImage } from "./LazyImage";
import { radius } from "../theme/colors";
import { useTheme } from "../context/ThemeContext";
import { useAppStyles } from "../hooks/useAppStyles";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { supabase } from "../lib/supabase";
import { formatTimeAgo } from "../utils/timeAgo";
import { shareProduct } from "../utils/shareUtils";
import { playLikeSound } from "../lib/sounds";
import { trackEvent } from "../services/feedPersonalizationService";

const REVIEW_STAR_COLOR = "#F97316";

const SELLER_BADGE_CONFIG = {
  verified: { icon: "checkmark-circle", color: "success" },
  top_seller: { icon: "trophy", color: "accentYellow" },
};

const SELLER_BADGE_PRIORITY = ["verified", "top_seller"];

// Memoized so the FlatList only re-renders a card when its `product` or
// `onPress` identity changes (VirtualizedList performance best practice).
export const FeedProductCard = memo(function FeedProductCard({
  product,
  onPress,
}) {
  const { colors: c } = useTheme();
  const styles = useAppStyles(buildFeedCardStyles);
  const navigation = useNavigation();
  const route = useRoute();
  const toast = useToast();
  const { isAuthenticated, user } = useAuth();
  const { addToCart } = useCart();

  // --- Derived product data -------------------------------------------------
  const images = useMemo(() => {
    if (product.thumbnails?.length > 0) return product.thumbnails;
    return product.thumbnail ? [product.thumbnail] : [];
  }, [product.thumbnails, product.thumbnail]);

  const seller = product.seller || product.seller_id || null;
  const sellerName = seller?.name || product.vendor || "Store";
  const sellerBadgeIds = seller?.badges || [];
  const listedAt = formatTimeAgo(product.created_at);
  const restockedAt =
    product.restocked_at && product.restocked_at !== product.created_at
      ? formatTimeAgo(product.restocked_at)
      : null;

  const hasDiscount = Number(product.discount) > 0;

  // Average rating (from product.rating) and total review count
  // (product.total_ratings). Falls back to 0 when not yet rated.
  const avgRating = Number(product.rating || 0);
  const reviewCount = Number(product.total_ratings || 0);

  const priceText = `GH₵${Number(
    hasDiscount
      ? product.price * (1 - product.discount / 100)
      : product.price || 0,
  ).toLocaleString()}`;

  const tags = Array.isArray(product.tags)
    ? product.tags.filter(Boolean).slice(0, 4)
    : [];

  // --- Local state ----------------------------------------------------------
  const [expanded, setExpanded] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [galleryVisible, setGalleryVisible] = useState(false);
  const [variantVisible, setVariantVisible] = useState(false);
  const [selectedColor, setSelectedColor] = useState(null);
  const [selectedSize, setSelectedSize] = useState(null);

  // --- Comments (product reviews with a comment) ---
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentCount, setCommentCount] = useState(
    Number(product.comments_count || 0),
  );
  // Keep the counter in sync when the feed refetches and hands us a fresh
  // product object (useState above only reads the value on first mount).
  useEffect(() => {
    setCommentCount(Number(product.comments_count || 0));
  }, [product.comments_count]);
  const [commentText, setCommentText] = useState("");
  const [commentRating, setCommentRating] = useState(5);
  const [commentPosting, setCommentPosting] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);

  const openProduct = () => {
    if (onPress) return onPress();
    navigation.navigate("ProductDetail", { product });
  };

  const openStore = () => {
    if (seller?.id) {
      navigation.navigate("Store", { sellerId: seller.id, seller });
    }
  };

  const handleShare = async () => {
    setMenuVisible(false);
    try {
      const result = await shareProduct(product.id, product.title);
      if (result.success) {
        toast.success("Listing shared!", "Share link copied to clipboard");
      } else {
        toast.error("Failed to share", result.error || "Please try again");
      }
    } catch {
      toast.error("Error", "Failed to share listing");
    }
  };

  const handleAddToCart = () => {
    if (!isAuthenticated) {
      toast.info("Login required", "Please sign in to add items to your cart");
      navigation.navigate("Auth", {
        redirectTo: route?.name,
        redirectParams: route?.params,
      });
      return;
    }

    const hasColors = product.colors && product.colors.length > 0;
    const hasSizes = product.sizes && product.sizes.length > 0;

    // Show the variant picker when the product has colors or sizes, so the
    // user can choose before adding to cart.
    if (hasColors || hasSizes) {
      setSelectedColor(
        hasColors && product.colors.length > 1
          ? null
          : product.colors?.[0] || null,
      );
      setSelectedSize(
        hasSizes && product.sizes.length > 1
          ? null
          : product.sizes?.[0] || null,
      );
      setVariantVisible(true);
      return;
    }

    addToCart(product, 1, null, null);
    toast.success(
      "Added to Cart",
      `${product.title} has been added to your cart`,
    );
  };

  const handleConfirmVariant = () => {
    // Only require a selection when there are multiple options.
    if (
      (product.colors && product.colors.length > 1 && !selectedColor) ||
      (product.sizes && product.sizes.length > 1 && !selectedSize)
    ) {
      toast.error("Selection Required", "Please select all required options");
      return;
    }
    addToCart(product, 1, selectedSize, selectedColor);
    setVariantVisible(false);
    toast.success(
      "Added to Cart",
      `${product.title} has been added to your cart`,
    );
  };

  const loadComments = useCallback(async () => {
    if (!product.id || !supabase) return;
    setCommentsLoading(true);
    try {
      // Pull approved product reviews that have a comment, newest first.
      const { data: reviews } = await supabase
        .from("express_reviews")
        .select(
          "id, product_id, user_id, rating, comment, created_at, express_profiles!express_reviews_user_id_fkey(full_name, avatar_url)",
        )
        .eq("product_id", product.id)
        .eq("is_approved", true)
        .not("comment", "is", null)
        .order("created_at", { ascending: false })
        .limit(50);

      const rows = (reviews ?? [])
        .filter((r) => String(r.comment || "").trim())
        .map((r) => {
          const profile = Array.isArray(r.express_profiles)
            ? r.express_profiles[0]
            : r.express_profiles;
          return {
            id: r.id,
            review_id: r.id,
            user_id: r.user_id,
            rating: r.rating,
            comment: r.comment,
            created_at: r.created_at,
            author_name: profile?.full_name || "Customer",
            author_avatar: profile?.avatar_url || null,
          };
        });
      setComments(rows);
      setCommentCount(rows.length);
    } catch (e) {
      console.warn("loadComments error:", e);
    } finally {
      setCommentsLoading(false);
    }
  }, [product.id]);

  // ── Realtime comment count ────────────────────────────────────────────────
  // Keeps the header comment counter live as OTHER users post/delete reviews.
  // The current user's own posts already update state optimistically in
  // submitComment, so those events are ignored to avoid double-counting.
  const currentUserId = user?.id ?? null;
  useEffect(() => {
    if (!supabase || !product.id) return;

    // UNIQUE channel name per subscription instance. Reusing a static name
    // collides with an in-flight async removeChannel() when the effect
    // re-runs (StrictMode double-mount / list recycling), producing
    // "cannot add postgres_changes callbacks ... after subscribe()".
    const channelName = `reviews-${product.id}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "express_reviews",
          filter: `product_id=eq.${product.id}`,
        },
        (payload) => {
          const eventType = payload.eventType || payload.type;
          const newRow = payload.new || {};
          const oldRow = payload.old || {};
          if (
            (newRow.user_id && newRow.user_id === currentUserId) ||
            (oldRow.user_id && oldRow.user_id === currentUserId)
          ) {
            return;
          }

          const countsAsComment = (row) =>
            Boolean(row.is_approved) && String(row.comment || "").trim();

          if (eventType === "INSERT") {
            if (countsAsComment(newRow)) {
              setCommentCount((c) => c + 1);
              setComments((prev) => [
                {
                  id: newRow.id,
                  review_id: newRow.id,
                  user_id: newRow.user_id,
                  rating: newRow.rating,
                  comment: newRow.comment,
                  created_at: newRow.created_at,
                  author_name: "Customer",
                  author_avatar: null,
                },
                ...prev.filter((cm) => cm.id !== newRow.id),
              ]);
            }
          } else if (eventType === "DELETE") {
            setCommentCount((c) => Math.max(0, c - 1));
            setComments((prev) => prev.filter((cm) => cm.id !== oldRow.id));
          } else if (eventType === "UPDATE") {
            // Approval flips / comment edits — adjust by comparing states.
            if (countsAsComment(newRow) && !countsAsComment(oldRow)) {
              setCommentCount((c) => c + 1);
            } else if (!countsAsComment(newRow) && countsAsComment(oldRow)) {
              setCommentCount((c) => Math.max(0, c - 1));
            }
            if (!countsAsComment(newRow)) {
              setComments((prev) => prev.filter((cm) => cm.id !== newRow.id));
            }
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [product.id, currentUserId]);

  const openCommentModal = useCallback(() => {
    setCommentModalVisible(true);
    loadComments();
  }, [loadComments]);

  const submitComment = useCallback(async () => {
    const trimmed = String(commentText).trim();
    if (!trimmed) return;
    if (!isAuthenticated) {
      toast.info("Sign in required", "Please sign in to comment");
      navigation.navigate("Auth", {
        redirectTo: route?.name,
        redirectParams: route?.params,
      });
      return;
    }
    if (!product.id || !supabase) return;
    setCommentPosting(true);
    try {
      // Users may post MULTIPLE comments, so always INSERT a new review row
      // with the star rating they selected for this comment.
      const { data, error } = await supabase
        .from("express_reviews")
        .insert({
          product_id: product.id,
          user_id: user?.id,
          rating: commentRating,
          comment: trimmed,
          is_approved: true,
        })
        .select(
          "id, product_id, user_id, rating, comment, created_at, express_profiles!express_reviews_user_id_fkey(full_name, avatar_url)",
        )
        .single();
      if (error) throw error;
      const saved = data;
      const profile = Array.isArray(saved.express_profiles)
        ? saved.express_profiles[0]
        : saved.express_profiles;
      const newComment = {
        id: saved.id,
        review_id: saved.id,
        user_id: saved.user_id,
        rating: saved.rating,
        comment: saved.comment,
        created_at: saved.created_at,
        author_name: profile?.full_name || "You",
        author_avatar: profile?.avatar_url || null,
      };
      setComments((prev) => [newComment, ...prev]);
      setCommentCount((c) => c + 1);
      setCommentText("");
      setCommentRating(5);
      toast.success("Comment posted", "Your comment was added to the product");
    } catch (err) {
      toast.error("Error", err.message);
    } finally {
      setCommentPosting(false);
    }
  }, [
    commentText,
    isAuthenticated,
    product.id,
    user,
    navigation,
    route,
    toast,
  ]);

  const description = String(product.description || "").trim();

  return (
    <View style={styles.card}>
      {/* ── Header row: avatar, name + badges, timestamp, overflow menu ── */}
      <View style={styles.headerRow}>
        <Pressable style={styles.sellerRow} onPress={openStore}>
          <View style={styles.avatarWrap}>
            {seller?.avatar ? (
              <Image source={{ uri: seller.avatar }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Ionicons
                  name="storefront-outline"
                  size={14}
                  color={c.primary}
                />
              </View>
            )}
          </View>
          <View style={styles.sellerMeta}>
            <View style={styles.sellerNameRow}>
              <Text style={styles.sellerName} numberOfLines={1}>
                {String(sellerName).toUpperCase()}
              </Text>
              {SELLER_BADGE_PRIORITY.filter((id) =>
                sellerBadgeIds.includes(id),
              ).map((id) => {
                const b = SELLER_BADGE_CONFIG[id];
                return (
                  <Ionicons
                    key={id}
                    name={b.icon}
                    size={12}
                    color={c[b.color]}
                  />
                );
              })}
            </View>
            <Text style={styles.timestamp}>
              {restockedAt ? `Restocked ${restockedAt}` : `Listed ${listedAt}`}
            </Text>
          </View>
        </Pressable>

        <Pressable
          style={styles.overflowButton}
          onPress={() => setMenuVisible(true)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="More options"
        >
          <Ionicons name="ellipsis-horizontal" size={18} color={c.muted} />
        </Pressable>
      </View>

      {/* ── Body: title, truncated description, clickable tags ── */}
      <Pressable onPress={openProduct}>
        <Text style={styles.title}>{product.title}</Text>
        {description ? (
          <>
            <Text
              style={styles.description}
              numberOfLines={expanded ? undefined : 2}
            >
              {description}
            </Text>
            {description.length > 90 && (
              <Pressable onPress={() => setExpanded((p) => !p)} hitSlop={6}>
                <Text style={styles.seeMore}>
                  {expanded ? "see less" : "...see more"}
                </Text>
              </Pressable>
            )}
          </>
        ) : null}
        {tags.length > 0 && (
          <View style={styles.tagsRow}>
            {tags.map((tag, i) => (
              <Pressable
                key={`${tag}-${i}`}
                onPress={() =>
                  navigation.navigate("SearchResults", {
                    tag: String(tag),
                    query: "",
                  })
                }
              >
                <Text style={styles.tag}>#{String(tag).replace(/^#/, "")}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </Pressable>

      {/* ── Media block: 1 / 2 / 2+N image grid with badges & label pill ── */}
      {images.length > 0 && (
        <Pressable onPress={openProduct} style={styles.mediaWrap}>
          <View style={styles.mediaGrid}>
            {images.length === 1 ? (
              <LazyImage
                source={{ uri: images[0] }}
                style={styles.mediaSingle}
                resizeMode="cover"
              />
            ) : (
              <>
                <LazyImage
                  source={{ uri: images[0] }}
                  style={styles.mediaTile}
                  resizeMode="cover"
                />
                <Pressable
                  style={styles.mediaTile}
                  onPress={() => {
                    setGalleryIndex(1);
                    setGalleryVisible(true);
                  }}
                >
                  <LazyImage
                    source={{ uri: images[1] }}
                    style={StyleSheet.absoluteFill}
                  />
                  {images.length > 2 && (
                    <View style={styles.moreOverlay}>
                      <Text style={styles.moreOverlayText}>
                        +{images.length - 2}
                      </Text>
                    </View>
                  )}
                </Pressable>
              </>
            )}
          </View>

          {/* Discount badge — top-left (same position as ProductCard) */}
          {hasDiscount && (
            <View style={styles.discountBadge}>
              <Ionicons name="flash" size={11} color={c.onPrimary} />
              <Text style={styles.discountText}>{product.discount}% OFF</Text>
            </View>
          )}

          {/* Dark label pill — bottom of image (same as ProductCard tagPill) */}
          {(product.tags?.[0] || product.category) && (
            <View style={styles.labelPill}>
              <Text style={styles.labelPillText} numberOfLines={1}>
                {product.tags?.[0] || product.category}
              </Text>
            </View>
          )}
        </Pressable>
      )}

      {/* ── Price row beneath media ── */}
      <View style={styles.priceRow}>
        <Text style={styles.price}>{priceText}</Text>
        {hasDiscount && (
          <Text style={styles.originalPrice}>
            GH₵{Number(product.price || 0).toLocaleString()}
          </Text>
        )}
        {/* Star rating — right-aligned on the price row */}
        {avgRating > 0 && (
          <View style={[styles.ratingPill, styles.ratingPillInline]}>
            <View style={styles.ratingPillStars}>
              {[1, 2, 3, 4, 5].map((s) => (
                <Ionicons
                  key={s}
                  name={s <= Math.round(avgRating) ? "star" : "star-outline"}
                  size={9}
                  color={REVIEW_STAR_COLOR}
                />
              ))}
            </View>
            <Text style={styles.ratingPillText}>{avgRating.toFixed(1)}</Text>
          </View>
        )}
      </View>

      {/* ── Engagement bar ── */}
      <View style={styles.engagementBar}>
        <FeedWishlistButton
          productId={product.id}
          initialCount={product.likes_count ?? null}
          styles={styles}
          productMeta={{
            categoryId: product.category_id,
            category: product.category,
            seller: product.seller || product.seller_id,
          }}
        />
        <Pressable
          style={styles.engagementItem}
          onPress={openCommentModal}
          accessibilityRole="button"
          accessibilityLabel="Comments"
        >
          <Ionicons
            name="chatbubble-ellipses-outline"
            size={20}
            color={c.muted}
          />
          <Text style={styles.engagementLabel}>
            {commentCount > 0 ? `${commentCount}` : "Q&A"}
          </Text>
        </Pressable>
        <Pressable
          style={styles.engagementAddToCart}
          onPress={handleAddToCart}
          accessibilityRole="button"
          accessibilityLabel="Add to cart"
        >
          <Ionicons name="cart-outline" size={20} color={c.primary} />
          <Text style={[styles.engagementLabel, { color: c.primary }]}>
            Add to Cart
          </Text>
        </Pressable>
        <Pressable
          style={styles.engagementItem}
          onPress={handleShare}
          accessibilityRole="button"
          accessibilityLabel="Share"
        >
          <Ionicons name="pricetags-outline" size={20} color={c.muted} />
          <Text style={styles.engagementLabel}>tag</Text>
        </Pressable>
      </View>

      {/* ── Overflow menu ── */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable
          style={styles.menuBackdrop}
          onPress={() => setMenuVisible(false)}
        >
          <View style={styles.menuSheet}>
            {[
              {
                icon: "flag-outline",
                label: "Report listing",
                action: () => {
                  setMenuVisible(false);
                  toast.info(
                    "Report received",
                    "Thanks — our team will review this listing.",
                  );
                },
              },
              {
                icon: "share-social-outline",
                label: "Share",
                action: handleShare,
              },
              {
                icon: "eye-off-outline",
                label: "Hide seller",
                action: () => {
                  setMenuVisible(false);
                  toast.info(
                    "Seller hidden",
                    "You'll see fewer listings from this seller.",
                  );
                },
              },
              {
                icon: "folder-open-outline",
                label: "Add to collection",
                action: () => {
                  setMenuVisible(false);
                  toast.info(
                    "Coming soon",
                    "Collections are coming to Tagit soon.",
                  );
                },
              },
            ].map(({ icon, label, action }) => (
              <Pressable key={label} style={styles.menuItem} onPress={action}>
                <Ionicons name={icon} size={18} color={c.dark} />
                <Text style={styles.menuItemText}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* ── Variant selection modal (products with colors/sizes) ── */}
      <Modal
        visible={variantVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setVariantVisible(false)}
      >
        <Pressable
          style={styles.variantOverlay}
          onPress={() => setVariantVisible(false)}
        >
          <View style={styles.variantModal}>
            <View style={styles.variantHeader}>
              <Text style={styles.variantTitle}>Select Options</Text>
              <Pressable
                onPress={() => setVariantVisible(false)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={20} color={c.dark} />
              </Pressable>
            </View>

            {product.colors && product.colors.length > 0 && (
              <View style={styles.variantSection}>
                <Text style={styles.variantLabel}>
                  {product.colors.length > 1 ? "Color *" : "Color"}
                </Text>
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
                            {
                              backgroundColor: COLOR_MAP[colorName] || "#CCC",
                            },
                            isSelected && {
                              borderColor: c.primary,
                              borderWidth: 3,
                            },
                          ]}
                        />
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {product.sizes && product.sizes.length > 0 && (
              <View style={styles.variantSection}>
                <Text style={styles.variantLabel}>
                  {product.sizes.length > 1 ? "Size *" : "Size"}
                </Text>
                <View style={styles.variantOptionsRow}>
                  {product.sizes.map((size, index) => {
                    const isSelected = selectedSize === size;
                    return (
                      <Pressable
                        key={index}
                        onPress={() => setSelectedSize(size)}
                        style={[
                          styles.sizeOption,
                          isSelected && {
                            borderColor: c.primary,
                            backgroundColor: c.surface,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.sizeOptionText,
                            isSelected && {
                              color: c.primary,
                              fontWeight: "700",
                            },
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
              onPress={handleConfirmVariant}
            >
              <View
                style={[
                  styles.variantAddGradient,
                  { backgroundColor: c.primary },
                ]}
              >
                <Text style={styles.variantAddText}>Add to Cart</Text>
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* ── Comments modal (product reviews with comments) ── */}
      <Modal
        visible={commentModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCommentModalVisible(false)}
      >
        <View style={styles.commentModalBackdrop}>
          <Pressable
            style={styles.commentModalBackdrop}
            onPress={() => setCommentModalVisible(false)}
          />
          <View style={styles.commentModalSheet}>
            <View style={styles.commentModalHandle} />
            <View style={styles.commentModalHeader}>
              <Text style={styles.commentModalTitle}>
                Comments ({commentCount})
              </Text>
              <Pressable
                onPress={() => setCommentModalVisible(false)}
                hitSlop={8}
              >
                <Ionicons name="close" size={22} color={c.dark} />
              </Pressable>
            </View>

            {commentsLoading ? (
              <View style={styles.commentModalLoading}>
                <ActivityIndicator color={c.primary} />
              </View>
            ) : (
              <ScrollView
                style={styles.commentList}
                contentContainerStyle={styles.commentListContent}
                keyboardShouldPersistTaps="handled"
              >
                {comments.length === 0 ? (
                  <Text style={styles.commentEmpty}>
                    No comments yet. Be the first!
                  </Text>
                ) : (
                  comments.map((cm) => (
                    <View key={cm.id} style={styles.commentItem}>
                      <View style={styles.commentAvatarWrap}>
                        {cm.author_avatar ? (
                          <Image
                            source={{ uri: cm.author_avatar }}
                            style={styles.commentAvatar}
                          />
                        ) : (
                          <View style={styles.commentAvatarFallback}>
                            <Ionicons
                              name="person"
                              size={14}
                              color={c.primary}
                            />
                          </View>
                        )}
                      </View>
                      <View style={styles.commentBody}>
                        <View style={styles.commentAuthorRow}>
                          <Text style={styles.commentAuthor}>
                            {cm.author_name}
                          </Text>
                          {cm.rating ? (
                            <View style={styles.commentStars}>
                              {[1, 2, 3, 4, 5].map((s) => (
                                <Ionicons
                                  key={s}
                                  name={
                                    s <= cm.rating ? "star" : "star-outline"
                                  }
                                  size={11}
                                  color={REVIEW_STAR_COLOR}
                                />
                              ))}
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.commentText}>{cm.comment}</Text>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            )}

            {/* Star rating selector for the new comment */}
            <View style={styles.commentRatingRow}>
              <Text style={styles.commentRatingLabel}>Your rating</Text>
              <View style={styles.commentRatingStars}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => setCommentRating(s)}
                    hitSlop={4}
                    accessibilityRole="button"
                    accessibilityLabel={`${s} star${s > 1 ? "s" : ""}`}
                  >
                    <Ionicons
                      name={s <= commentRating ? "star" : "star-outline"}
                      size={24}
                      color={REVIEW_STAR_COLOR}
                    />
                  </Pressable>
                ))}
              </View>
            </View>

            <KeyboardStickyView style={styles.commentInputRow}>
              <TextInput
                style={styles.commentInput}
                placeholder="Add a comment…"
                placeholderTextColor={c.muted}
                value={commentText}
                onChangeText={setCommentText}
                multiline
                editable={!commentPosting}
              />
              <Pressable
                style={[
                  styles.commentSendBtn,
                  (!commentText.trim() || commentPosting) &&
                    styles.commentSendBtnDisabled,
                ]}
                onPress={submitComment}
                disabled={!commentText.trim() || commentPosting}
              >
                {commentPosting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="send" size={18} color="#fff" />
                )}
              </Pressable>
            </KeyboardStickyView>
          </View>
        </View>
      </Modal>

      {/* ── Swipeable gallery modal (3+ images) ── */}
      <Modal
        visible={galleryVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setGalleryVisible(false)}
      >
        <View style={styles.galleryBackdrop}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={(e) =>
              setGalleryIndex(
                Math.round(e.nativeEvent.contentOffset.x / PAGE_WIDTH),
              )
            }
            scrollEventThrottle={16}
            ref={(ref) => {
              if (ref && galleryIndex > 0) {
                ref.scrollTo({
                  x: galleryIndex * PAGE_WIDTH,
                  animated: false,
                });
              }
            }}
          >
            {images.map((uri, i) => (
              <Pressable
                key={i}
                onPress={() => setGalleryVisible(false)}
                style={styles.galleryPage}
              >
                <Image source={{ uri }} style={styles.galleryImage} />
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.galleryCounter}>
            <Text style={styles.galleryCounterText}>
              {galleryIndex + 1} / {images.length}
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
});

// Approximate page width for the gallery pager.
const PAGE_WIDTH = Dimensions.get("window").width;
const galleryPageWidth = () => PAGE_WIDTH;

// Wishlist heart with optimistic count, backed by express_wishlists — same
// behavior as the reels feed's like button.
const FeedWishlistButton = ({
  productId,
  styles,
  initialCount = null,
  productMeta = null,
}) => {
  const { colors: c } = useTheme();
  const { user } = useAuth();
  const [wishlisted, setWishlisted] = useState(false);
  const [count, setCount] = useState(initialCount);
  const [animating, setAnimating] = useState(false);

  // Seed from the fresh likes_count the feed attached at fetch time, so the
  // heart never renders blank before its own query resolves.
  useEffect(() => {
    if (initialCount != null) setCount((n) => (n == null ? initialCount : n));
  }, [initialCount]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!supabase || !productId) return;
      try {
        const { count: wishCount } = await supabase
          .from("express_wishlists")
          .select("*", { count: "exact", head: true })
          .eq("product_id", productId);
        if (mounted) setCount(wishCount ?? 0);
        if (user) {
          const { data } = await supabase
            .from("express_wishlists")
            .select("id")
            .eq("user_id", user.id)
            .eq("product_id", productId)
            .maybeSingle();
          if (mounted) setWishlisted(!!data);
        }
      } catch {
        /* non-critical */
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [productId, user]);

  // ── Realtime like count ───────────────────────────────────────────────────
  // Keeps the heart counter live as OTHER users wishlist/unwishlist. The
  // current user's own toggles are applied optimistically in `toggle`, so
  // their realtime events are ignored to avoid double-counting.
  const currentUserId = user?.id ?? null;
  useEffect(() => {
    if (!supabase || !productId) return;

    // UNIQUE channel name per subscription instance (see comments effect —
    // static names collide with in-flight removeChannel() calls).
    const channelName = `wishlists-${productId}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "express_wishlists",
          filter: `product_id=eq.${productId}`,
        },
        (payload) => {
          const eventType = payload.eventType || payload.type;
          const newRow = payload.new || {};
          const oldRow = payload.old || {};
          if (
            (newRow.user_id && newRow.user_id === currentUserId) ||
            (oldRow.user_id && oldRow.user_id === currentUserId)
          ) {
            return;
          }

          if (eventType === "INSERT") {
            setCount((n) => (n ?? 0) + 1);
          } else if (eventType === "DELETE") {
            setCount((n) => Math.max(0, (n ?? 0) - 1));
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [productId, currentUserId]);

  const toggle = async () => {
    if (!user) return;
    const willLike = !wishlisted;
    setWishlisted(willLike);
    setCount((n) => Math.max(0, (n ?? 0) + (willLike ? 1 : -1)));
    setAnimating(true);
    setTimeout(() => setAnimating(false), 300);
    if (willLike) playLikeSound();
    if (willLike) playLikeSound();
    try {
      if (willLike) {
        await supabase
          .from("express_wishlists")
          .insert({ user_id: user.id, product_id: productId });
      } else {
        await supabase
          .from("express_wishlists")
          .delete()
          .eq("user_id", user.id)
          .eq("product_id", productId);
      }
      // Personalization signal: like/unlike. We forward whatever product
      // metadata the card has on hand so the scorer can attribute the
      // signal to the right category/seller without an extra round-trip.
      const meta = productMeta || {};
      const sellerId =
        meta.sellerId ||
        (meta.seller && (meta.seller.id || meta.seller)) ||
        undefined;
      trackEvent(willLike ? "like" : "unlike", {
        productId,
        categoryId: meta.categoryId,
        category: meta.category,
        sellerId,
      });
    } catch {
      setWishlisted(!willLike);
      setCount((n) => Math.max(0, (n ?? 0) + (willLike ? -1 : 1)));
    }
  };

  return (
    <Pressable style={styles.engagementItem} onPress={toggle}>
      <Ionicons
        name={wishlisted ? "heart" : "heart-outline"}
        size={20}
        color={wishlisted ? c.primary : c.muted}
        style={animating ? { transform: [{ scale: 1.25 }] } : null}
      />
      <Text style={styles.engagementLabel}>{count ?? ""}</Text>
    </Pressable>
  );
};

const buildFeedCardStyles = (c) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,

      overflow: "hidden",
      shadowColor: "#000",
      shadowOpacity: 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 5,
    },

    /* Header */
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 8,
    },
    sellerRow: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
      minWidth: 0,
    },
    avatarWrap: {
      width: 36,
      height: 36,
      borderRadius: radius.full,
      overflow: "hidden",
      backgroundColor: c.borderAlpha,
      borderWidth: 1,
      borderColor: c.border,
      marginRight: 10,
    },
    avatar: { width: "100%", height: "100%" },
    avatarFallback: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    sellerMeta: { flex: 1, minWidth: 0 },
    sellerNameRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    sellerName: {
      fontSize: 11,
      fontWeight: "800",
      color: c.muted,
      letterSpacing: 0.6,
      flexShrink: 1,
    },
    timestamp: {
      fontSize: 10,
      color: c.muted,
      marginTop: 2,
    },
    overflowButton: {
      padding: 6,
      borderRadius: radius.full,
    },

    /* Body text */
    title: {
      fontSize: 15,
      fontWeight: "800",
      color: c.dark,
      paddingHorizontal: 14,
      letterSpacing: -0.25,
    },
    description: {
      fontSize: 13,
      color: c.muted,
      lineHeight: 18,
      paddingHorizontal: 14,
      marginTop: 4,
    },
    seeMore: {
      fontSize: 13,
      fontWeight: "600",
      color: c.accentBlue,
      paddingHorizontal: 14,
      marginTop: 2,
    },
    tagsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      paddingHorizontal: 14,
      marginTop: 6,
      marginBottom: 10,
    },
    tag: {
      fontSize: 13,
      fontWeight: "600",
      color: c.accentBlue,
    },

    /* Media grid */
    mediaWrap: { position: "relative" },
    mediaGrid: {
      flexDirection: "row",
      gap: 4,
      height: 220,
    },
    // Single-image layout: full product visible (no crop), centered on a
    // neutral surface instead of being zoomed/cropped by "cover".
    mediaSingle: {
      flex: 1,
      backgroundColor: c.surfaceAlpha,
    },
    mediaTile: { flex: 1, backgroundColor: c.border },
    moreOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: c.overlay,
      alignItems: "center",
      justifyContent: "center",
    },
    moreOverlayText: {
      color: c.light,
      fontSize: 22,
      fontWeight: "900",
    },
    discountBadge: {
      position: "absolute",
      top: 10,
      left: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: c.badgeDanger,
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: radius.xs,
    },
    discountText: {
      fontSize: 10,
      fontWeight: "900",
      color: c.onPrimary,
      letterSpacing: 0.4,
      textTransform: "uppercase",
    },
    ratingPill: {
      position: "absolute",
      top: 10,
      right: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: c.whiteAlpha,
      borderRadius: radius.full,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    ratingPillStars: {
      flexDirection: "row",
      gap: 1,
    },
    ratingPillText: {
      fontSize: 10,
      fontWeight: "800",
      color: c.dark,
    },
    // Inline variant: sits at the right edge of the price row instead of
    // floating over the product image.
    ratingPillInline: {
      position: "static",
      top: "auto",
      right: "auto",
      marginLeft: "auto",
      alignSelf: "center",
    },
    labelPill: {
      position: "absolute",
      bottom: 8,
      left: 8,
      maxWidth: "70%",
      backgroundColor: c.scrim,
      borderRadius: radius.full,
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    labelPillText: {
      fontSize: 10,
      fontWeight: "700",
      color: c.light,
    },

    /* Price */
    priceRow: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: 12,
      paddingHorizontal: 14,
      paddingTop: 10,
      backgroundColor: c.surfaceAlpha,
    },
    price: {
      fontSize: 17,
      fontWeight: "800",
      color: c.dark,
      letterSpacing: -0.3,
    },
    originalPrice: {
      fontSize: 12,
      fontWeight: "600",
      color: c.muted,
      textDecorationLine: "line-through",
    },

    /* Engagement bar */
    engagementBar: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderTopWidth: 1,
      borderTopColor: c.borderAlpha,
      backgroundColor: c.surfaceAlpha,

      gap: 4,
    },
    engagementItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingVertical: 6,
      paddingHorizontal: 8,
    },
    engagementLabel: {
      fontSize: 12,
      fontWeight: "700",
      color: c.muted,
    },
    engagementAddToCart: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      marginLeft: "auto",
      backgroundColor: c.primary + "15",
      borderColor: c.primary + "30",
      borderWidth: 1,
      borderRadius: radius.full,
      paddingVertical: 6,
      paddingHorizontal: 12,
    },

    /* Overflow menu */
    menuBackdrop: {
      flex: 1,
      backgroundColor: c.overlay,
      justifyContent: "flex-end",
    },
    menuSheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      paddingTop: 10,
      paddingBottom: 28,
    },
    menuItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: 20,
    },
    menuItemText: {
      fontSize: 15,
      fontWeight: "600",
      color: c.dark,
    },

    /* Gallery modal */
    galleryBackdrop: {
      flex: 1,
      backgroundColor: "#000000",
    },
    galleryPage: {
      width: galleryPageWidth(),
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    galleryImage: {
      width: "100%",
      height: "100%",
      resizeMode: "contain",
    },
    galleryCounter: {
      position: "absolute",
      bottom: 40,
      alignSelf: "center",
      backgroundColor: c.scrim,
      borderRadius: radius.full,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    galleryCounterText: {
      color: c.light,
      fontSize: 12,
      fontWeight: "700",
    },

    /* Variant selection modal */
    variantOverlay: {
      flex: 1,
      backgroundColor: c.overlay,
      justifyContent: "flex-end",
    },
    variantModal: {
      backgroundColor: c.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 28,
      maxHeight: "55%",
    },
    variantHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 20,
    },
    variantTitle: {
      fontSize: 18,
      fontWeight: "800",
      color: c.dark,
    },
    variantSection: {
      marginBottom: 18,
    },
    variantLabel: {
      fontSize: 14,
      fontWeight: "700",
      color: c.dark,
      marginBottom: 10,
    },
    variantOptionsRow: {
      flexDirection: "row",
      gap: 10,
      flexWrap: "wrap",
    },
    colorOption: {
      padding: 3,
    },
    colorOptionSelected: {
      opacity: 1,
    },
    smallColorDot: {
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: 2,
      borderColor: c.border,
    },
    sizeOption: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: c.border,
      backgroundColor: c.surface,
      minWidth: 48,
      alignItems: "center",
      justifyContent: "center",
    },
    sizeOptionText: {
      fontSize: 13,
      color: c.dark,
      fontWeight: "600",
    },
    variantAddButton: {
      marginTop: 20,
      borderRadius: radius.xl,
      overflow: "hidden",
    },
    variantAddGradient: {
      paddingVertical: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    variantAddText: {
      fontSize: 16,
      fontWeight: "700",
      color: "#FFFFFF",
    },

    /* Comments modal */
    commentModalBackdrop: {
      flex: 1,
      backgroundColor: c.overlay,
      justifyContent: "flex-end",
    },
    commentModalSheet: {
      backgroundColor: c.light,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      maxHeight: "75%",
      paddingBottom: 12,
    },
    commentModalHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.border,
      alignSelf: "center",
      marginTop: 8,
      marginBottom: 8,
    },
    commentModalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    commentModalTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: c.dark,
    },
    commentModalLoading: {
      paddingVertical: 40,
      alignItems: "center",
    },
    commentList: {
      maxHeight: 320,
    },
    commentListContent: {
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    commentEmpty: {
      textAlign: "center",
      color: c.muted,
      paddingVertical: 24,
    },
    commentItem: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 14,
    },
    commentAvatarWrap: {
      width: 32,
      height: 32,
      borderRadius: 16,
      overflow: "hidden",
      backgroundColor: c.border,
    },
    commentAvatar: {
      width: 32,
      height: 32,
    },
    commentAvatarFallback: {
      width: 32,
      height: 32,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.border,
    },
    commentBody: {
      flex: 1,
    },
    commentAuthorRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 2,
    },
    commentStars: {
      flexDirection: "row",
      gap: 1,
    },
    commentAuthor: {
      fontSize: 13,
      fontWeight: "700",
      color: c.dark,
      marginBottom: 2,
    },
    commentText: {
      fontSize: 14,
      color: c.dark,
      lineHeight: 19,
    },
    commentInputRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 8,
      paddingHorizontal: 16,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    commentRatingRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    commentRatingLabel: {
      fontSize: 13,
      fontWeight: "700",
      color: c.dark,
    },
    commentRatingStars: {
      flexDirection: "row",
      gap: 4,
    },
    commentInput: {
      flex: 1,
      minHeight: 40,
      maxHeight: 100,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.full,
      paddingHorizontal: 14,
      paddingVertical: 9,
      fontSize: 14,
      color: c.dark,
    },
    commentSendBtn: {
      width: 40,
      height: 40,
      borderRadius: radius.full,
      backgroundColor: c.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    commentSendBtnDisabled: {
      opacity: 0.4,
    },
  });
