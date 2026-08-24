// FeedCardPlaceholder
// ---------------------------------------------------------------------------
// Skeleton loading card that mirrors the FeedProductCard layout (header row,
// title/description lines, media block, price + engagement bar). Uses the same
// shared global shimmer animation as ProductCardPlaceholder.
// ---------------------------------------------------------------------------

import { StyleSheet, View, Image, Animated } from "react-native";
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
      {/* Header row: avatar + name lines */}
      <View style={styles.headerRow}>
        <Skeleton style={styles.avatar} />
        <View style={styles.headerLines}>
          <Skeleton style={styles.nameLine} />
          <Skeleton style={styles.timestampLine} />
        </View>
      </View>

      {/* Title + description lines */}
      <View style={styles.bodyLines}>
        <Skeleton style={styles.titleLine} />
        <Skeleton style={styles.descLine} />
      </View>

      {/* Media block */}
      <View style={styles.mediaWrap}>
        <Image
          source={require("../../assets/placeholder/placeholder.png")}
          style={styles.media}
          resizeMode="cover"
        />
      </View>

      {/* Price + engagement bar */}
      <View style={styles.footerRow}>
        <Skeleton style={styles.priceLine} />
        <Skeleton style={styles.actionPill} />
      </View>

      {/* Add to Cart skeleton */}
      <View style={styles.ctaRow}>
        <Skeleton style={styles.cta} />
      </View>
    </View>
  );
};

const buildStyles = (c) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 16,
      overflow: "hidden",
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
    mediaWrap: {
      height: 220,
      backgroundColor: c.border,
    },
    media: {
      width: "100%",
      height: "100%",
    },
    footerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    priceLine: {
      width: 80,
      height: 14,
      borderRadius: radius.full,
    },
    actionPill: {
      width: 110,
      height: 28,
      borderRadius: radius.full,
    },
    ctaRow: {
      paddingHorizontal: 14,
      paddingBottom: 14,
    },
    cta: {
      height: 40,
      width: "100%",
      borderRadius: 14,
    },
  });
