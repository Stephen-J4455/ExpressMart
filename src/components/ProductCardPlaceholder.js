import { StyleSheet, View, Animated } from "react-native";
import { useContext } from "react";
import { colors } from "../theme/colors";

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

export const ProductCardPlaceholder = () => {
  return (
    <View style={styles.card}>
      {/* Image placeholder */}
      <Skeleton style={styles.image} />

      {/* Content section */}
      <View style={styles.content}>
        {/* Vendor name */}
        <Skeleton style={styles.vendor} />

        {/* Title lines */}
        <Skeleton style={[styles.title, { marginTop: 8 }]} />
        <Skeleton style={[styles.title, { marginTop: 6, width: "80%" }]} />

        {/* Price and rating row */}
        <View style={styles.metaRow}>
          <Skeleton style={styles.price} />
          <Skeleton style={styles.rating} />
        </View>

        {/* CTA Button */}
        <Skeleton style={styles.button} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    minWidth: 160,
    height: 296,
    backgroundColor: "#fff",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#EAF0F7",
    marginBottom: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  image: {
    width: "100%",
    height: 140,
  },
  content: {
    padding: 14,
    paddingTop: 12,
    flex: 1,
    justifyContent: "space-between",
  },
  vendor: {
    height: 9,
    width: 68,
    borderRadius: 999,
  },
  title: {
    height: 14,
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
  rating: {
    height: 22,
    width: 70,
    borderRadius: 999,
  },
  button: {
    height: 40,
    width: "100%",
    borderRadius: 14,
    marginTop: 10,
  },
});
