import { ImageBackground, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

export const PromoBanner = ({ deal }) => {
  return (
    <ImageBackground
      source={{ uri: deal.image }}
      style={styles.background}
      imageStyle={styles.image}
    >
      <LinearGradient
        colors={["rgba(0,0,0,0.6)", "transparent"]}
        style={styles.overlay}
      >
        <Text style={styles.label}>{deal.label}</Text>
      </LinearGradient>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  background: {
    height: 120,
    borderRadius: 20,
    overflow: "hidden",
    marginHorizontal: 16,
  },
  image: {
    borderRadius: 20,
  },
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 16,
  },
  label: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
});
