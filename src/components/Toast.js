// Toast
// ---------------------------------------------------------------------------
// Redesigned in-app popup notification. A floating surface card (theme-aware,
// dark-mode safe) with a colored accent edge, tinted icon chip, title/message,
// and an auto-dismiss progress bar. Slides down from the top with a spring.
//
// Public API is unchanged: toast.success/error/warning/info(title, message).
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";
import { useAppStyles } from "../hooks/useAppStyles";
import { radius } from "../theme/colors";

const TOAST_DURATION = 3200;

// Per-type accent color + icon. Accent colors are brand-independent semantic
// tokens resolved through the theme palette; the card itself uses the active
// neutrals so it looks right in light AND dark mode.
const toastConfig = {
  success: { icon: "checkmark-circle", accentKey: "success" },
  error: { icon: "close-circle", accentKey: "badgeDanger" },
  warning: { icon: "warning", accentKey: "accentYellow" },
  info: { icon: "information-circle", accentKey: "accentBlue" },
};

export const Toast = ({
  visible,
  type = "success",
  title,
  message,
  onDismiss,
  duration = TOAST_DURATION,
}) => {
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const styles = useAppStyles(buildStyles);

  const config = toastConfig[type] || toastConfig.info;
  const accent = c[config.accentKey] || c.primary;

  // Slide + fade in from the top.
  const slideAnim = useRef(new Animated.Value(-120)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  // Auto-dismiss progress bar (1 → 0 over `duration`).
  const progressAnim = useRef(new Animated.Value(1)).current;

  const handleDismiss = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -120,
        duration: 220,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(() => onDismiss?.());
  };

  useEffect(() => {
    if (!visible) return;

    // Restart cleanly from the hidden position each time.
    slideAnim.setValue(-120);
    opacityAnim.setValue(0);
    progressAnim.setValue(1);

    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 60,
        friction: 9,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(progressAnim, {
        toValue: 0,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(handleDismiss, duration);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, type, title, message]);

  // NOTE: the toast stays MOUNTED even when hidden (opacity 0 + translated
  // off-screen). Mounting/unmounting the elevated view was causing a whole-
  // screen flash on Android; animating in place avoids that entirely.

  const safeTitle = typeof title === "string" ? title.trim() : "";
  const safeMessage = typeof message === "string" ? message.trim() : "";

  return (
    <Animated.View
      pointerEvents={visible ? "box-none" : "none"}
      style={[
        styles.container,
        {
          top: insets.top + 10,
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.92}
        onPress={handleDismiss}
        style={[styles.toast, { backgroundColor: c.surface }]}
      >
        {/* Colored accent edge on the left */}
        <View style={[styles.accentBar, { backgroundColor: accent }]} />

        {/* Tinted icon chip */}
        <View style={[styles.iconChip, { backgroundColor: accent + "1A" }]}>
          <Ionicons name={config.icon} size={20} color={accent} />
        </View>

        <View style={styles.content}>
          {safeTitle.length > 0 ? (
            <Text numberOfLines={1} style={[styles.title, { color: c.dark }]}>
              {safeTitle}
            </Text>
          ) : null}
          {safeMessage.length > 0 ? (
            <Text
              numberOfLines={2}
              style={[styles.message, { color: c.muted }]}
            >
              {safeMessage}
            </Text>
          ) : null}
        </View>

        <TouchableOpacity
          onPress={handleDismiss}
          style={styles.closeBtn}
          hitSlop={8}
        >
          <Ionicons name="close" size={16} color={c.muted} />
        </TouchableOpacity>

        {/* Auto-dismiss progress bar along the bottom */}
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressBar,
              {
                backgroundColor: accent,
                transform: [
                  {
                    scaleX: progressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.001, 1],
                    }),
                  },
                ],
              },
            ]}
          />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const buildStyles = (c) =>
  StyleSheet.create({
    container: {
      position: "absolute",
      left: 16,
      right: 16,
      zIndex: 9999,
      elevation: 9999,
    },
    toast: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 16,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.18,
      shadowRadius: 20,
      elevation: 10,
    },
    accentBar: {
      width: 4,
      alignSelf: "stretch",
    },
    iconChip: {
      width: 38,
      height: 38,
      borderRadius: radius.xl,
      alignItems: "center",
      justifyContent: "center",
      marginLeft: 12,
    },
    content: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 10,
    },
    title: {
      fontSize: 14,
      fontWeight: "800",
      letterSpacing: -0.2,
    },
    message: {
      fontSize: 13,
      lineHeight: 17,
      marginTop: 2,
    },
    closeBtn: {
      padding: 6,
      marginRight: 6,
    },
    progressTrack: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      height: 3,
      backgroundColor: c.borderAlpha,
    },
    progressBar: {
      flex: 1,
      height: "100%",
    },
  });
