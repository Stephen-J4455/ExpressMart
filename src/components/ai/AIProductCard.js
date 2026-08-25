// ── AIProductCard — generative UI product card for the AI chat stream ────────
// Rendered inside assistant messages when the search_products / filter_catalog
// tools return structured product arrays.
//
// Features:
//   • Rich media (thumbnail via LazyImage), title, category, rating.
//   • Pricing tags: effective price (discount applied), struck-through
//     compare-at price, discount % badge.
//   • Primary "Add" action wired to the GLOBAL cart (CartContext) with inline
//     feedback: idle → adding → "Added ✓" (auto-reverts after a moment).

import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import { useCart } from "../../context/CartContext";
import { useTheme } from "../../context/ThemeContext";
import { useAppStyles } from "../../hooks/useAppStyles";
import { radius } from "../../theme/colors";
import { LazyImage } from "../LazyImage";

const ADDED_FEEDBACK_MS = 2200;

export const effectivePrice = (product) => {
  const price = Number(product?.price) || 0;
  const discount = Number(product?.discount) || 0;
  return discount > 0 ? price * (1 - discount / 100) : price;
};

export const AIProductCard = ({ product }) => {
  const navigation = useNavigation();
  const { addToCart } = useCart();
  const { colors } = useTheme();
  const styles = useAppStyles(buildStyles);

  // Button state machine: idle → adding → added → idle
  const [phase, setPhase] = useState("idle");
  const checkScale = useRef(new Animated.Value(0)).current;
  const revertTimer = useRef(null);

  useEffect(
    () => () => {
      if (revertTimer.current) clearTimeout(revertTimer.current);
    },
    [],
  );

  const handleAdd = async () => {
    if (phase !== "idle") return;
    setPhase("adding");
    try {
      await addToCart(product, 1);
      setPhase("added");
      Animated.spring(checkScale, {
        toValue: 1,
        useNativeDriver: true,
        friction: 4,
        tension: 120,
      }).start();
      revertTimer.current = setTimeout(() => {
        setPhase("idle");
        checkScale.setValue(0);
      }, ADDED_FEEDBACK_MS);
    } catch (e) {
      console.warn("[AIProductCard] add to cart failed:", e);
      setPhase("idle");
    }
  };

  const openDetail = () => {
    navigation.navigate("ProductDetail", { product });
  };

  const price = effectivePrice(product);
  const compareAt = Number(product?.compare_at_price) || 0;
  const discount = Number(product?.discount) || 0;
  const thumbnail =
    product?.thumbnail ||
    (Array.isArray(product?.thumbnails) ? product.thumbnails[0] : null);
  const outOfStock =
    product?.track_inventory !== false &&
    Number(product?.quantity) <= 0 &&
    !product?.allow_backorder;

  const thumbSource = thumbnail
    ? typeof thumbnail === "string"
      ? { uri: thumbnail }
      : thumbnail
    : null;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}
      onPress={openDetail}
    >
      {/* Thumbnail */}
      <View style={[styles.thumbWrap, { backgroundColor: colors.surfaceAlpha }]}>
        {thumbSource ? (
          <LazyImage source={thumbSource} style={styles.thumb} />
        ) : (
          <Image
            source={require("../../../assets/placeholder/placeholder.png")}
            style={styles.thumb}
          />
        )}
        {discount > 0 && (
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.discountBadge}
          >
            <Text style={styles.discountText}>-{Math.round(discount)}%</Text>
          </LinearGradient>
        )}
      </View>

      {/* Info */}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {product?.title}
        </Text>

        <View style={styles.metaRow}>
          {product?.category ? (
            <Text style={styles.category} numberOfLines={1}>
              {product.category}
            </Text>
          ) : null}
          {Number(product?.rating) > 0 && (
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={11} color="#F59E0B" />
              <Text style={styles.ratingText}>
                {Number(product.rating).toFixed(1)}
              </Text>
            </View>
          )}
        </View>

        {/* Pricing tags */}
        <View style={styles.priceRow}>
          <Text style={styles.price}>
            GH₵
            {price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </Text>
          {(compareAt > price || (discount > 0 && product?.price > price)) && (
            <Text style={styles.compareAt}>
              GH₵
              {Number(compareAt || product?.price).toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}
            </Text>
          )}
        </View>
      </View>

      {/* Primary action — global cart mutation + inline feedback */}
      <Pressable
        onPress={handleAdd}
        disabled={phase !== "idle" || outOfStock}
        style={[
          styles.actionBtn,
          phase === "added" && styles.actionBtnAdded,
          outOfStock && styles.actionBtnDisabled,
        ]}
        hitSlop={6}
      >
        {phase === "adding" ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : phase === "added" ? (
          <Animated.View
            style={[styles.addedRow, { transform: [{ scale: checkScale }] }]}
          >
            <Ionicons name="checkmark" size={15} color="#FFFFFF" />
            <Text style={styles.actionTextAdded}>Added</Text>
          </Animated.View>
        ) : (
          <>
            <Ionicons
              name="cart-outline"
              size={14}
              color={outOfStock ? colors.muted : "#FFFFFF"}
            />
            <Text
              style={[styles.actionText, outOfStock && { color: colors.muted }]}
            >
              {outOfStock ? "Sold out" : "Add"}
            </Text>
          </>
        )}
      </Pressable>
    </Pressable>
  );
};

/** Vertical stack of product cards — used inside assistant messages. */
export const AIProductCardRow = ({ products }) => {
  const styles = useAppStyles(buildStyles);
  if (!products?.length) return null;
  return (
    <View style={styles.rowWrap}>
      {products.map((p) => (
        <AIProductCard key={`${p.id}-${p.title}`} product={p} />
      ))}
    </View>
  );
};

const buildStyles = (c) =>
  StyleSheet.create({
    rowWrap: {
      marginTop: 10,
      gap: 8,
    },
    card: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      padding: 10,
      gap: 10,
    },
    thumbWrap: {
      width: 64,
      height: 64,
      borderRadius: radius.sm,
      overflow: "hidden",
    },
    thumb: {
      width: "100%",
      height: "100%",
    },
    discountBadge: {
      position: "absolute",
      top: 0,
      left: 0,
      borderTopLeftRadius: radius.sm,
      borderBottomRightRadius: radius.sm,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    discountText: {
      color: "#FFFFFF",
      fontSize: 10,
      fontWeight: "700",
    },
    info: {
      flex: 1,
      gap: 3,
    },
    title: {
      fontSize: 13.5,
      fontWeight: "600",
      color: c.dark,
      lineHeight: 17,
    },
    metaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    category: {
      fontSize: 11,
      color: c.muted,
      flexShrink: 1,
    },
    ratingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
    },
    ratingText: {
      fontSize: 11,
      fontWeight: "600",
      color: c.dark,
    },
    priceRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    price: {
      fontSize: 14,
      fontWeight: "800",
      color: c.primary,
    },
    compareAt: {
      fontSize: 11,
      color: c.muted,
      textDecorationLine: "line-through",
    },
    actionBtn: {
      backgroundColor: c.primary,
      borderRadius: radius.full,
      paddingHorizontal: 14,
      paddingVertical: 8,
      minWidth: 74,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 4,
    },
    actionBtnAdded: {
      backgroundColor: c.success,
    },
    actionBtnDisabled: {
      backgroundColor: c.surfaceAlpha,
    },
    actionText: {
      color: "#FFFFFF",
      fontSize: 12.5,
      fontWeight: "700",
    },
    actionTextAdded: {
      color: "#FFFFFF",
      fontSize: 12.5,
      fontWeight: "700",
    },
    addedRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
    },
  });
