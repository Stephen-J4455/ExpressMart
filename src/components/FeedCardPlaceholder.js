// FeedCardPlaceholder
// ---------------------------------------------------------------------------
// Skeleton loading card that mirrors the FeedProductCard layout (header row,
// title/description lines, media block, price + engagement bar). Uses the same
// shared global shimmer animation as ProductCardPlaceholder.
// ---------------------------------------------------------------------------

import { StyleSheet, View, Animated } from "react-native";
import { radius } from "../theme/colors";
import { useTheme } from "../context/ThemeContext";
import { useAppStyles } from "../hooks/useAppStyles";

// Global shimmer animation context to share a single animation across all
// skeleton cards (same pattern as ProductCardPlaceholder).
let globalShimmerValue = null;

const getGlobalShimmerValue = () => {
  if (!globalShimmerValue) {
    globalShimmerValue = new Animated.Value(0);
    Animated.loop(
      Animated.sequence([
        Animated.timing(globalShimmerValue, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(globalShimmerValue, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }
  return globalShimmerValue;
};

const Skeleton = ({ style }) => {
  const shimmerValue = getGlobalShimmerValue();
  const opacity = shimmerValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 1],
  });

  return (
    <Animated.View style={[style, { backgroundColor: "#e0e0e0", opacity }]} />
  );
};

export const FeedCardPlaceholder = () => {
  const { colors: c } = useTheme();
  const styles = useAppStyles(buildStyles);

  return (
    <View style={styles.card}>
      {/* Header row: avatar + seller name/time lines + overflow menu —
          mirrors FeedProductCard's header (avatar, name, timestamp, ⋯). */}
      <View style={styles.headerRow}>
        <Skeleton style={styles.avatar} />
        <View style={styles.headerLines}>
          <Skeleton style={styles.nameLine} />
          <Skeleton style={styles.timestampLine} />
        </View>
        <Skeleton style={styles.overflowButton} />
      </View>

      {/* Title + description lines (title, two desc lines like the truncated
          description in the real card) */}
      <View style={styles.bodyLines}>
        <Skeleton style={styles.titleLine} />
        <Skeleton style={styles.descLine} />
        <Skeleton style={styles.descShortLine} />
      </View>

      {/* Media band — same 220pt full-bleed block as the card's image grid */}
      <Skeleton style={styles.media} />

      {/* Price row — price line left, rating pill right (matches the real
          priceRow sitting between media and the engagement bar) */}
      <View style={styles.priceRow}>
        <Skeleton style={styles.priceLine} />
        <Skeleton style={styles.ratingPill} />
      </View>

      {/* Engagement bar — like + Q&A items on the left, Add to Cart pill on
          the right, separated by a hairline top border (same as the card) */}
      <View style={styles.engagementBar}>
        <View style={styles.engagementItem}>
          <Skeleton style={styles.engagementIcon} />
          <Skeleton style={styles.engagementLabel} />
        </View>
        <View style={styles.engagementItem}>
          <Skeleton style={styles.engagementIcon} />
          <Skeleton style={styles.engagementLabelWide} />
        </View>
        <Skeleton style={styles.addToCartPill} />
      </View>
    </View>
  );
};

const buildStyles = (c) =>
  StyleSheet.create({
    // Mirrors FeedProductCard's card: bordered surface, soft shadow, NO
    // corner radius, and NO bottom margin (cards stack flush, same as the
    // real feed).
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
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 8,
    },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: radius.full,
    },
    headerLines: {
      flex: 1,
      gap: 6,
    },
    nameLine: {
      width: "45%",
      height: 10,
      borderRadius: radius.full,
    },
    timestampLine: {
      width: "30%",
      height: 8,
      borderRadius: radius.full,
    },
    // Overflow "⋯" menu button on the header's right edge
    overflowButton: {
      width: 28,
      height: 28,
      borderRadius: radius.full,
    },
    bodyLines: {
      paddingHorizontal: 14,
      gap: 6,
      marginBottom: 10,
    },
    titleLine: {
      width: "70%",
      height: 13,
      borderRadius: radius.full,
    },
    descLine: {
      width: "90%",
      height: 10,
      borderRadius: radius.full,
    },
    descShortLine: {
      width: "55%",
      height: 10,
      borderRadius: radius.full,
    },
    // Full-bleed media band, same 220pt height as the card's mediaGrid
    media: {
      width: "100%",
      height: 220,
      backgroundColor: c.border,
    },
    // Price row: tinted strip between media and engagement bar (same as the
    // card's priceRow which uses surfaceAlpha)
    priceRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: c.surfaceAlpha,
    },
    priceLine: {
      width: 80,
      height: 16,
      borderRadius: radius.full,
    },
    ratingPill: {
      width: 64,
      height: 18,
      borderRadius: radius.full,
    },
    // Engagement bar: hairline top border + tinted strip, like the card
    engagementBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderTopWidth: 1,
      borderTopColor: c.borderAlpha,
      backgroundColor: c.surfaceAlpha,
    },
    engagementItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    engagementIcon: {
      width: 20,
      height: 20,
      borderRadius: radius.full,
    },
    engagementLabel: {
      width: 22,
      height: 10,
      borderRadius: radius.full,
    },
    engagementLabelWide: {
      width: 30,
      height: 10,
      borderRadius: radius.full,
    },
    addToCartPill: {
      marginLeft: "auto",
      width: 120,
      height: 32,
      borderRadius: radius.full,
    },
  });
