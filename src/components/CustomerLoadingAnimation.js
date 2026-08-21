import React from "react";
import { View, StyleSheet, Image } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useAppStyles } from "../hooks/useAppStyles";
import { useTheme } from "../context/ThemeContext";

export const CustomerLoadingAnimation = () => {
  const styles = useAppStyles((c) => buildStyles(c));
  const { isDark } = useTheme();
  return (
    <View style={styles.container}>
      <StatusBar style={isDark ? "light" : "dark-content"} />
      <Image
        source={require("../../assets/express.png")}
        style={styles.logo}
        resizeMode="contain"
      />
    </View>
  );
};

const buildStyles = (c) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.light,
      justifyContent: "center",
      alignItems: "center",
    },
    logo: {
      width: 200,
      height: 200,
    },
  });
