import { StyleSheet, View, Image, Animated } from "react-native";
import { radius } from "../theme/colors";

// Global shimmer animation context to share single animation across all skeletons
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
    <Animated.View
      style={[
        style,
        {
          backgroundColor: "#e0e0e0",
          opacity,
        },
      ]}
    />
  );
};

// Placeholder card that mirrors the ProductCard layout, using placeholder.png
// for the image section so the loading state matches the real card form.
export const ProductCardPlaceholder = () => {
  return (
    <View style={styles.card}>
      <View style={styles.imageContainer}>
        <Image
          source={require("../../assets/placeholder/placeholder.png")}
          style={styles.image}
          resizeMode="cover"
        />
        <View style={styles.ratingPill}>
          <Skeleton style={styles.ratingPillText} />
        </View>
      </View>
      <View style={styles.content}>
        <View style={styles.vendorRow}>
          <Skeleton style={styles.vendor} />
        </View>
        <Skeleton style={[styles.title, { marginTop: 6 }]} />
        <View style={styles.metaRow}>
          <Skeleton style={styles.price} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: "#EAF0F7",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  imageContainer: {
    position: "relative",
    width: "100%",
    height: 140,
    backgroundColor: "#F1F5F9",
  },
  image: {
    width: "100%",
    height: 140,
  },
  ratingPill: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 44,
    height: 20,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.94)",
    alignItems: "center",
    justifyContent: "center",
  },
  ratingPillText: {
    width: 24,
    height: 10,
    borderRadius: 999,
  },
  content: {
    padding: 14,
    paddingTop: 12,
    flex: 1,
  },
  vendorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  vendor: {
    height: 9,
    width: 68,
    borderRadius: 999,
  },
  title: {
    height: 14,
    width: "90%",
    borderRadius: 8,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  price: {
    height: 20,
    width: 76,
    borderRadius: 8,
  },
});