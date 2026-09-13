// ── OrderSuccessScreen ───────────────────────────────────────────────────────
// Celebratory landing page shown right after an order is placed successfully.
// Pure React Native Animated choreography (no extra dependencies):
//   • Confetti burst — staggered falling pieces in brand colors
//   • Success badge — spring-scaled green disc with a two-stroke drawn check
//   • Expanding pulse rings behind the badge
//   • Staggered copy reveal ("Order Placed!" + payment reference)
//   • CTAs: track the order or keep shopping (both reset the stack so
//     checkout can never be navigated back into)

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";
import { useAppStyles } from "../hooks/useAppStyles";
import { radius } from "../theme/colors";

const CONFETTI_COLORS = [
  "#F59E0B",
  "#10B981",
  "#3B82F6",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#22D3EE",
];
const CONFETTI_COUNT = 38;
const CHECK_DELAY_MS = 350;
const CONFETTI_START_MS = 450;
const COPY_DELAY_MS = 650;
const CTA_DELAY_MS = 950;

export const OrderSuccessScreen = ({ route, navigation }) => {
  const { colors } = useTheme();
  const styles = useAppStyles(buildStyles);
  const insets = useSafeAreaInsets();
  const { reference, total } = route.params || {};

  // ── Animation values ──────────────────────────────────────────────────────
  const badgeScale = useRef(new Animated.Value(0)).current;
  const checkStroke1 = useRef(new Animated.Value(0)).current;
  const checkStroke2 = useRef(new Animated.Value(0)).current;
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const titleAnim = useRef(new Animated.Value(0)).current;
  const subtitleAnim = useRef(new Animated.Value(0)).current;
  const ctaAnim = useRef(new Animated.Value(0)).current;
  const confettiValues = useMemo(
    () => Array.from({ length: CONFETTI_COUNT }, () => new Animated.Value(0)),
    [],
  );

  // Per-piece random configs so pieces fan out across the full width
  const confettiConfigs = useMemo(
    () =>
      Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
        left: Math.random() * 100,
        size: 6 + Math.random() * 7,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        delay: CONFETTI_START_MS + Math.random() * 900,
        duration: 2600 + Math.random() * 1800,
        rotate: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 540),
        sway: (Math.random() - 0.5) * 60,
        round: Math.random() > 0.7,
      })),
    [],
  );

  // ── Choreography ──────────────────────────────────────────────────────────
  useEffect(() => {
    // Badge pops in immediately…
    Animated.spring(badgeScale, {
      toValue: 1,
      friction: 5,
      tension: 120,
      useNativeDriver: true,
    }).start();

    // …the check draws itself right after…
    Animated.sequence([
      Animated.delay(CHECK_DELAY_MS),
      Animated.timing(checkStroke1, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(checkStroke2, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();

    // …pulse rings ripple outward on a loop…
    [ring1, ring2].forEach((ring, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 500),
          Animated.timing(ring, {
            toValue: 1,
            duration: 1600,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(ring, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      ).start();
    });

    // …confetti rains down…
    confettiValues.forEach((value, i) => {
      const { delay, duration } = confettiConfigs[i];
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, {
            toValue: 1,
            duration,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(value, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.delay(600),
        ]),
      ).start();
    });

    // …and the copy + CTAs slide up last.
    Animated.stagger(220, [
      Animated.timing(titleAnim, {
        toValue: 1,
        delay: COPY_DELAY_MS,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(subtitleAnim, {
        toValue: 1,
        delay: COPY_DELAY_MS,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(ctaAnim, {
        toValue: 1,
        delay: CTA_DELAY_MS,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTrackOrder = useCallback(() => {
    // Same stack-reset pattern as checkout: back never returns to checkout.
    navigation.reset({
      index: 1,
      routes: [
        { name: "Main" },
        { name: "Orders", params: { refreshOnce: Date.now() } },
      ],
    });
  }, [navigation]);

  const handleKeepShopping = useCallback(() => {
    navigation.reset({ index: 0, routes: [{ name: "Main" }] });
  }, [navigation]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Confetti layer ── */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {confettiValues.map((value, i) => {
          const cfg = confettiConfigs[i];
          const translateY = value.interpolate({
            inputRange: [0, 1],
            outputRange: [-60, 900],
          });
          const translateX = value.interpolate({
            inputRange: [0, 0.5, 1],
            outputRange: [0, cfg.sway, 0],
          });
          const rotate = value.interpolate({
            inputRange: [0, 1],
            outputRange: ["0deg", `${cfg.rotate}deg`],
          });
          const opacity = value.interpolate({
            inputRange: [0, 0.05, 0.85, 1],
            outputRange: [0, 1, 1, 0],
          });
          return (
            <Animated.View
              key={i}
              pointerEvents="none"
              style={{
                position: "absolute",
                left: `${cfg.left}%`,
                top: -20,
                width: cfg.size,
                height: cfg.round ? cfg.size : cfg.size * 0.45,
                borderRadius: cfg.round ? cfg.size / 2 : 2,
                backgroundColor: cfg.color,
                opacity,
                transform: [{ translateY }, { translateX }, { rotate }],
              }}
            />
          );
        })}
      </View>

      {/* ── Center content ── */}
      <View
        style={[
          styles.centerWrap,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20 },
        ]}
      >
        {/* Pulse rings + badge */}
        <View style={styles.badgeWrap}>
          {[ring1, ring2].map((ring, i) => {
            const scale = ring.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 1.9],
            });
            const ringOpacity = ring.interpolate({
              inputRange: [0, 0.7, 1],
              outputRange: [0.5, 0.12, 0],
            });
            return (
              <Animated.View
                key={i}
                pointerEvents="none"
                style={[
                  styles.pulseRing,
                  {
                    borderColor: colors.success ?? "#10B981",
                    transform: [{ scale }],
                    opacity: ringOpacity,
                  },
                ]}
              />
            );
          })}

          <Animated.View
            style={[styles.badge, { transform: [{ scale: badgeScale }] }]}
          >
            <LinearGradient
              colors={[colors.success ?? "#10B981", "#059669"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.badgeGradient}
            >
              {/* Check drawn from two strokes */}
              <View style={styles.checkWrap}>
                <Animated.View
                  style={[
                    styles.checkStroke,
                    styles.checkStroke1,
                    {
                      transform: [
                        { rotate: "45deg" },
                        { scaleX: checkStroke1 },
                      ],
                    },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.checkStroke,
                    styles.checkStroke2,
                    {
                      transform: [
                        { rotate: "-38deg" },
                        { scaleX: checkStroke2 },
                      ],
                    },
                  ]}
                />
              </View>
            </LinearGradient>
          </Animated.View>
        </View>

        {/* Copy */}
        <Animated.Text
          style={[
            styles.title,
            { color: colors.dark },
            {
              opacity: titleAnim,
              transform: [
                {
                  translateY: titleAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [18, 0],
                  }),
                },
              ],
            },
          ]}
        >
          Order Placed! 🎉
        </Animated.Text>

        <Animated.Text
          style={[
            styles.subtitle,
            { color: colors.muted },
            {
              opacity: subtitleAnim,
              transform: [
                {
                  translateY: subtitleAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [14, 0],
                  }),
                },
              ],
            },
          ]}
        >
          Thank you for shopping with us. Your order has been received and is
          being prepared.
        </Animated.Text>

        {!!reference && (
          <Animated.View
            style={[
              styles.refCard,
              { borderColor: colors.border, backgroundColor: colors.surface },
              { opacity: subtitleAnim },
            ]}
          >
            <View style={styles.refRow}>
              <Ionicons name="receipt-outline" size={15} color={colors.primary} />
              <Text style={[styles.refLabel, { color: colors.muted }]}>
                Payment reference
              </Text>
            </View>
            <Text
              style={[styles.refValue, { color: colors.dark }]}
              numberOfLines={1}
            >
              {reference}
            </Text>
          </Animated.View>
        )}

        {/* CTAs */}
        <Animated.View
          style={[
            styles.ctaWrap,
            {
              opacity: ctaAnim,
              transform: [
                {
                  translateY: ctaAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [16, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Pressable
            onPress={handleTrackOrder}
            style={({ pressed }) => [
              styles.ctaPrimary,
              pressed && { opacity: 0.85 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Track my order"
          >
            <LinearGradient
              colors={[
                colors.gradientStart ?? colors.primary,
                colors.gradientEnd ?? colors.primary,
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaPrimaryGradient}
            >
              <Ionicons name="cube-outline" size={17} color="#FFFFFF" />
              <Text style={styles.ctaPrimaryText}>Track My Order</Text>
            </LinearGradient>
          </Pressable>

          <Pressable
            onPress={handleKeepShopping}
            style={({ pressed }) => [
              styles.ctaSecondary,
              { borderColor: colors.border },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Continue shopping"
          >
            <Ionicons
              name="storefront-outline"
              size={16}
              color={colors.primary}
            />
            <Text style={[styles.ctaSecondaryText, { color: colors.primary }]}>
              Continue Shopping
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
};

const buildStyles = (c) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    centerWrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 28,
    },
    badgeWrap: {
      alignItems: "center",
      justifyContent: "center",
      width: 160,
      height: 160,
      marginBottom: 26,
    },
    pulseRing: {
      position: "absolute",
      width: 110,
      height: 110,
      borderRadius: radius.full,
      borderWidth: 2,
      borderStyle: "solid",
    },
    badge: {
      width: 108,
      height: 108,
      borderRadius: radius.full,
      overflow: "hidden",
      shadowColor: "#10B981",
      shadowOpacity: 0.35,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 10,
    },
    badgeGradient: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    checkWrap: {
      width: 46,
      height: 40,
      marginTop: -4,
    },
    checkStroke: {
      position: "absolute",
      backgroundColor: "#FFFFFF",
      borderRadius: 3,
    },
    // Long down-stroke of the check (drawn first)
    checkStroke1: {
      width: 13,
      height: 26,
      left: 6,
      top: 8,
    },
    // Short up-stroke of the check (drawn second)
    checkStroke2: {
      width: 34,
      height: 12,
      left: 12,
      top: 21,
    },
    title: {
      fontSize: 25,
      fontWeight: "900",
      letterSpacing: -0.4,
      textAlign: "center",
    },
    subtitle: {
      fontSize: 14,
      lineHeight: 20,
      textAlign: "center",
      marginTop: 10,
      maxWidth: 320,
    },
    refCard: {
      alignSelf: "stretch",
      marginTop: 18,
      borderRadius: radius.md,
      borderWidth: 1,
      borderStyle: "solid",
      paddingHorizontal: 14,
      paddingVertical: 11,
      gap: 4,
    },
    refRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    refLabel: {
      fontSize: 11,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    refValue: {
      fontSize: 12.5,
      fontFamily: "monospace",
    },
    ctaWrap: {
      alignSelf: "stretch",
      marginTop: 26,
      gap: 12,
    },
    ctaPrimary: {
      borderRadius: radius.full,
      overflow: "hidden",
    },
    ctaPrimaryGradient: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 15,
    },
    ctaPrimaryText: {
      color: "#FFFFFF",
      fontSize: 15,
      fontWeight: "800",
    },
    ctaSecondary: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      borderRadius: radius.full,
      borderWidth: 1.5,
      borderStyle: "solid",
      paddingVertical: 13,
    },
    ctaSecondaryText: {
      fontSize: 14,
      fontWeight: "700",
    },
  });

