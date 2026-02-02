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

        {/* Badge */}
        <Skeleton style={styles.badge} />

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
    height: 320,
    backgroundColor: "#fff",
    borderRadius: 16,
    marginBottom: 16,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: 160,
  },
  content: {
    padding: 12,
    paddingTop: 10,
    flex: 1,
    justifyContent: "space-between",
  },
  vendor: {
    height: 10,
    width: 60,
    borderRadius: 4,
  },
  title: {
    height: 14,
    borderRadius: 4,
  },
  badge: {
    height: 18,
    width: 70,
    borderRadius: 4,
    marginTop: 8,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  price: {
    height: 18,
    width: 60,
    borderRadius: 4,
  },
  rating: {
    height: 12,
    width: 50,
    borderRadius: 4,
  },
  button: {
    height: 36,
    width: "100%",
    borderRadius: 10,
    marginTop: 8,
  },
});
