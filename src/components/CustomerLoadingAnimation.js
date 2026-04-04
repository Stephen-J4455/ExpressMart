import React, { useEffect, useRef } from "react";
import { View, Text, Animated, StyleSheet, Image } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/colors";

export const CustomerLoadingAnimation = () => {
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Initial entrance
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 100,
        useNativeDriver: true,
      }),
    ]).start();

    // Gentle pulse animation
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
    );

    // Progress bar animation
    const progressAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(progressAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(progressAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    pulseAnimation.start();
    progressAnimation.start();

    return () => {
      pulseAnimation.stop();
      progressAnimation.stop();
    };
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="light" />

      {/* Main Loading Content */}
      <Animated.View
        style={[
          styles.loadingContent,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        {/* Express Logo */}
        <Animated.View
          style={{
            transform: [{ scale: pulseAnim }],
          }}
        >
          <Image
            source={require("../../assets/express.png")}
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>

        {/* App Title */}
        <Text style={styles.appTitle}>ExpressMart</Text>
        <Text style={styles.subtitle}>Your shopping destination</Text>

        {/* Loading Progress */}
        <View style={styles.progressContainer}>
          <Animated.View
            style={[
              styles.progressDot,
              {
                opacity: fadeAnim,
                transform: [
                  {
                    translateX: progressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 40], // 60 (container width) - 20 (dot width)
                    }),
                  },
                ],
              },
            ]}
          />
        </View>

        <Text style={styles.loadingText}>Preparing your marketplace...</Text>
      </Animated.View>

      <View style={[styles.bottomBranding, { bottom: 24 + insets.bottom }]}>
        <Image
          source={require("../../assets/olives.jpg")}
          style={styles.bottomImage}
        />
        <Text style={styles.bottomText}>with olives import</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingContent: {
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  logo: {
    width: 150,
    height: 150,
    marginBottom: 32,
  },
  appTitle: {
    fontSize: 34,
    fontWeight: "800",
    color: colors.dark,
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: colors.muted,
    marginBottom: 40,
    textAlign: "center",
    fontWeight: "500",
  },
  progressContainer: {
    width: 60,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    marginBottom: 24,
    overflow: "hidden",
    position: "relative",
  },
  progressDot: {
    width: 20,
    height: 4,
    backgroundColor: colors.primary,
    borderRadius: 2,
    position: "absolute",
  },
  loadingText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    fontWeight: "500",
  },
  bottomBranding: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  bottomImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginBottom: 8,
  },
  bottomText: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
});
