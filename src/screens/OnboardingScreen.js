import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";

// ── Onboarding ──────────────────────────────────────────────────────────────
// A swipeable, animated intro shown once before the main app. Four slides map
// 1:1 to the artwork in assets/onboarding. Completion is persisted by the
// caller (App.js) via AsyncStorage — this component is purely presentational
// and reports back through onComplete().

const SLIDES = [
  {
    key: "multi-store",
    image: require("../../assets/onboarding/multi_store_model.jpg"),
    icon: "storefront",
    title: "Every store,\none app",
    subtitle:
      "Browse and shop from all your favourite local stores without juggling a dozen apps.",
    accent: "#8B5CF6",
  },
  {
    key: "personalized",
    image: require("../../assets/onboarding/personalized_feeds.png"),
    icon: "sparkles",
    title: "A feed made\nfor you",
    subtitle:
      "A video feed that learns what you love — discover products and sellers that match your vibe.",
    accent: "#FF5A79",
  },
  {
    key: "delivery",
    image: require("../../assets/onboarding/fast_delivery.png"),
    icon: "bicycle",
    title: "Fast delivery",
    subtitle:
      "Track your orders live as they make their way from the store to your doorstep.",
    accent: "#00E2C8",
  },
  {
    key: "checkout",
    image: require("../../assets/onboarding/fast_checkout.png"),
    icon: "flash",
    title: "Checkout in\nseconds",
    subtitle:
      "Save your details once and breeze through checkout with one-tap payments.",
    accent: "#F59E0B",
  },
];

export const OnboardingScreen = ({ onComplete }) => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef(null);
  const indexRef = useRef(0);
  const [windowWidth, setWindowWidth] = useState(
    Dimensions.get("window").width,
  );

  // Entrance fade so the first paint feels soft rather than abrupt.
  const enterAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enterAnim, {
      toValue: 1,
      duration: 450,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [enterAnim]);

  const isLast = index === SLIDES.length - 1;

  const goTo = useCallback(
    (i) => {
      scrollRef.current?.scrollTo({
        x: i * windowWidth,
        animated: true,
      });
    },
    [windowWidth],
  );

  const handleNext = useCallback(() => {
    if (indexRef.current < SLIDES.length - 1) {
      goTo(indexRef.current + 1);
    } else {
      onComplete?.();
    }
  }, [goTo, onComplete]);

  const handleScroll = useCallback(
    (e) => {
      const x = e.nativeEvent.contentOffset.x;
      scrollX.setValue(x);
      const next = Math.min(
        SLIDES.length - 1,
        Math.max(0, Math.round(x / Math.max(windowWidth, 1))),
      );
      if (next !== indexRef.current) {
        indexRef.current = next;
        setIndex(next);
      }
    },
    [windowWidth],
  );

  const styles = useMemo(() => makeStyles(colors), [colors]);
  const contentMaxWidth = Math.min(windowWidth, 520);

  return (
    <Animated.View
      style={[styles.root, { opacity: enterAnim, paddingTop: insets.top }]}
    >
      {/* Swipeable slides */}
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: true, listener: handleScroll },
        )}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
      >
        {SLIDES.map((slide, i) => (
          <View
            key={slide.key}
            style={[styles.slide, { width: windowWidth }]}
            accessibilityRole="pager"
          >
            <View style={[styles.slideInner, { maxWidth: contentMaxWidth }]}>
              <SlideArt slide={slide} i={i} scrollX={scrollX} styles={styles} />
              <SlideCopy
                slide={slide}
                i={i}
                scrollX={scrollX}
                styles={styles}
              />
            </View>
          </View>
        ))}
      </Animated.ScrollView>

      {/* Footer: dots + actions */}
      <View
        style={[
          styles.footer,
          {
            paddingBottom:
              Math.max(insets.bottom, Platform.OS === "web" ? 24 : 20) + 8,
            maxWidth: contentMaxWidth,
          },
        ]}
      >
        <View style={styles.dotsRow}>
          {SLIDES.map((slide, i) => (
            <Dot
              key={slide.key}
              active={i === index}
              color={slide.accent}
              onPress={() => goTo(i)}
              styles={styles}
            />
          ))}
        </View>

        <View style={styles.actionsRow}>
          {!isLast ? (
            <Pressable
              onPress={() => goTo(SLIDES.length - 1)}
              hitSlop={12}
              style={({ pressed }) => [
                styles.skipButton,
                pressed && { opacity: 0.6 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Skip onboarding"
            >
              <Text style={styles.skipText}>Skip</Text>
            </Pressable>
          ) : (
            <View style={styles.skipPlaceholder} />
          )}

          <Pressable
            onPress={handleNext}
            style={({ pressed }) => [
              styles.ctaWrap,
              pressed && { transform: [{ scale: 0.97 }] },
            ]}
            accessibilityRole="button"
            accessibilityLabel={isLast ? "Get started" : "Next slide"}
          >
            <LinearGradient
              colors={[colors.gradientStart, colors.gradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cta}
            >
              <Text style={styles.ctaText}>
                {isLast ? "Get Started" : "Next"}
              </Text>
              <Ionicons
                name={isLast ? "arrow-forward" : "chevron-forward"}
                size={18}
                color="#FFFFFF"
                style={{ marginLeft: 6 }}
              />
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
};

// ── Slide artwork ───────────────────────────────────────────────────────────
// The illustration scales up slightly and drifts as the user swipes, giving
// each slide a gentle parallax feel.
const SlideArt = ({ slide, i, scrollX, styles }) => {
  const inputRange = [(i - 1) * 1, i * 1, (i + 1) * 1].map(
    (v) => v * Dimensions.get("window").width,
  );

  const scale = scrollX.interpolate({
    inputRange,
    outputRange: [0.88, 1, 0.88],
    extrapolate: "clamp",
  });
  const translateX = scrollX.interpolate({
    inputRange,
    outputRange: [36, 0, -36],
    extrapolate: "clamp",
  });

  return (
    <Animated.View
      style={[styles.artWrap, { transform: [{ scale }, { translateX }] }]}
    >
      <View
        style={[
          styles.artFrame,
          { shadowColor: slide.accent, borderColor: slide.accent + "33" },
        ]}
      >
        <Image
          source={slide.image}
          style={styles.artImage}
          resizeMode="cover"
          accessible
          accessibilityRole="image"
          accessibilityLabel={slide.title.replace("\n", " ")}
        />
        {/* Soft brand-tinted scrim so any white edges of the PNGs blend in */}
        <LinearGradient
          colors={["transparent", "rgba(255,255,255,0.06)"]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      </View>

      {/* Floating icon chip overlapping the frame */}
      <View style={[styles.iconChip, { backgroundColor: slide.accent }]}>
        <Ionicons name={slide.icon} size={22} color="#FFFFFF" />
      </View>
    </Animated.View>
  );
};

// ── Slide copy ──────────────────────────────────────────────────────────────
// Title/subtitle fade + rise into place as their slide becomes active.
const SlideCopy = ({ slide, i, scrollX, styles }) => {
  const inputRange = [(i - 1) * 1, i * 1, (i + 1) * 1].map(
    (v) => v * Dimensions.get("window").width,
  );

  const opacity = scrollX.interpolate({
    inputRange,
    outputRange: [0, 1, 0],
    extrapolate: "clamp",
  });
  const translateY = scrollX.interpolate({
    inputRange,
    outputRange: [24, 0, -24],
    extrapolate: "clamp",
  });

  return (
    <Animated.View
      style={[styles.copyWrap, { opacity, transform: [{ translateY }] }]}
      pointerEvents="none"
    >
      <Text style={styles.title}>{slide.title}</Text>
      <Text style={styles.subtitle}>{slide.subtitle}</Text>
    </Animated.View>
  );
};

const Dot = ({ active, color, onPress, styles }) => (
  <Pressable
    onPress={onPress}
    hitSlop={10}
    accessibilityRole="button"
    accessibilityState={{ selected: active }}
  >
    <Animated.View
      style={[
        styles.dotBase,
        active && { ...styles.dotActive, backgroundColor: color },
      ]}
    />
  </Pressable>
);

// ── Styles ──────────────────────────────────────────────────────────────────
const makeStyles = (colors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    slide: {
      flexGrow: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 28,
    },
    slideInner: {
      width: "100%",
      alignItems: "center",
    },
    artWrap: {
      width: "100%",
      alignItems: "center",
      marginBottom: 32,
    },
    artFrame: {
      width: "100%",
      aspectRatio: 4 / 5,
      borderRadius: 28,
      overflow: "hidden",
      borderWidth: 1,
      backgroundColor: colors.surfaceAlpha || colors.surface,
      // iOS shadow
      shadowOpacity: 0.25,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
      // Android elevation
      elevation: 8,
    },
    artImage: {
      width: "100%",
      height: "100%",
    },
    iconChip: {
      position: "absolute",
      bottom: -18,
      width: 48,
      height: 48,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 3,
      borderColor: colors.background,
      shadowColor: "#000",
      shadowOpacity: 0.2,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 5,
    },
    copyWrap: {
      width: "100%",
      alignItems: "center",
    },
    title: {
      fontSize: 30,
      lineHeight: 38,
      fontWeight: "800",
      color: colors.dark,
      textAlign: "center",
      letterSpacing: -0.5,
    },
    subtitle: {
      marginTop: 14,
      fontSize: 15,
      lineHeight: 23,
      color: colors.muted,
      textAlign: "center",
      paddingHorizontal: 12,
    },
    footer: {
      alignSelf: "center",
      width: "100%",
      paddingHorizontal: 28,
    },
    dotsRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginBottom: 20,
    },
    dotBase: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.borderAlpha || colors.border,
    },
    dotActive: {
      width: 26,
      height: 8,
      borderRadius: 4,
    },
    actionsRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    skipButton: {
      paddingVertical: 10,
      paddingHorizontal: 4,
    },
    skipText: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.muted,
    },
    skipPlaceholder: {
      minWidth: 60,
    },
    ctaWrap: {
      flex: 1,
      alignItems: "flex-end",
    },
    cta: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 15,
      paddingHorizontal: 30,
      borderRadius: 999,
      shadowColor: colors.primaryDark,
      shadowOpacity: 0.35,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    ctaText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "700",
      letterSpacing: 0.2,
    },
  });
