import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

export const FlashSaleBadge = ({ discountPercentage, position = "top-left" }) => {
  const positionStyle =
    position === "top-right"
      ? styles.topRight
      : position === "top-left"
      ? styles.topLeft
      : styles.topLeft;

  return (
    <View style={[styles.container, positionStyle]}>
      <LinearGradient
        colors={["#EF4444", "#DC2626"]}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Ionicons name="flash" size={12} color="#fff" />
        <Text style={styles.text}>{Math.round(discountPercentage)}% OFF</Text>
      </LinearGradient>
      <View style={styles.triangle} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    zIndex: 10,
  },
  topLeft: {
    top: 8,
    left: 8,
  },
  topRight: {
    top: 8,
    right: 8,
  },
  gradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  text: {
    fontSize: 11,
    fontWeight: "900",
    color: "#fff",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  triangle: {
    position: "absolute",
    bottom: -5,
    left: 10,
    width: 0,
    height: 0,
    backgroundColor: "transparent",
    borderStyle: "solid",
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 5,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#DC2626",
  },
});
