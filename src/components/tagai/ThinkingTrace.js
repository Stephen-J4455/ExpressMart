// ── ThinkingTrace — collapsible "Why I did this" panel ──────────────────────
// Rendered under each assistant message that has a `thinking` array (pushed
// by TagAIAssistantContext as the agent runs). Collapsed by default to keep
// the chat scannable; expanded shows the ordered steps.

import React, { useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";
import { useAppStyles } from "../../hooks/useAppStyles";
import { radius } from "../../theme/colors";

const formatTime = (ts) => {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};

export const ThinkingTrace = ({ steps = [] }) => {
  const { colors } = useTheme();
  const styles = useAppStyles(buildStyles);
  const [open, setOpen] = useState(false);
  const rotate = React.useRef(new Animated.Value(0)).current;

  if (!Array.isArray(steps) || steps.length === 0) return null;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    Animated.timing(rotate, {
      toValue: next ? 1 : 0,
      duration: 160,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  const chevronRotation = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "90deg"],
  });

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={toggle}
        style={({ pressed }) => [styles.header, pressed && { opacity: 0.7 }]}
        hitSlop={6}
      >
        <Ionicons name="bulb-outline" size={12} color={colors.muted} />
        <Text style={[styles.headerText, { color: colors.muted }]}>
          {open ? "Why I did this" : `Why I did this (${steps.length})`}
        </Text>
        <Animated.View style={{ transform: [{ rotate: chevronRotation }] }}>
          <Ionicons name="chevron-forward" size={12} color={colors.muted} />
        </Animated.View>
      </Pressable>
      {open ? (
        <View style={styles.list}>
          {steps.map((s, i) => (
            <View key={`${s.ts || i}-${i}`} style={styles.row}>
              <View style={[styles.dot, { backgroundColor: colors.accent }]} />
              <Text style={[styles.step, { color: colors.dark }]} numberOfLines={3}>
                {s.text}
              </Text>
              {s.ts ? (
                <Text style={[styles.ts, { color: colors.muted }]}>
                  {formatTime(s.ts)}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
};

const buildStyles = (c) =>
  StyleSheet.create({
    wrap: {
      marginTop: 6,
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingTop: 6,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      alignSelf: "flex-start",
      paddingVertical: 2,
      paddingHorizontal: 4,
      borderRadius: radius.sm,
    },
    headerText: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.2,
    },
    list: {
      marginTop: 4,
      gap: 4,
    },
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 6,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      marginTop: 6,
    },
    step: {
      flex: 1,
      fontSize: 11.5,
      lineHeight: 16,
    },
    ts: {
      fontSize: 10,
    },
  });
