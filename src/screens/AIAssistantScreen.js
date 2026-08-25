// ── AIAssistantScreen — ExpressMart AI chat page ─────────────────────────────
// The conversational home of the assistant. Renders:
//   • A soft gradient hero (greeting + capability suggestion cards) when the
//     chat is empty — inspired by the ExpressMart voice-assistant concept.
//   • The chat stream with tool-call chips and GENERATIVE UI: product cards
//     returned by search_products / filter_catalog render inline as rich,
//     interactive AIProductCards (image, price tags, add-to-cart).
//   • A grounded input bar (registered as "ai.inputBar") so the assistant can
//     point at its own chat box.

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useTheme } from "../context/ThemeContext";
import { useAppStyles } from "../hooks/useAppStyles";
import { useGrounding } from "../hooks/useGrounding";
import { useAIAssistant } from "../context/AIAssistantContext";
import { radius } from "../theme/colors";
import {
  AIProductCardRow,
} from "../components/ai/AIProductCard";

const TOOL_META = {
  search_products: { icon: "search", label: "Searching products" },
  filter_catalog: { icon: "options", label: "Filtering catalog" },
  add_to_cart: { icon: "cart", label: "Adding to cart" },
  navigate_to_page: { icon: "navigate", label: "Navigating" },
  point_to_element: { icon: "location", label: "Pointing" },
};

const SUGGESTIONS = [
  {
    icon: "search",
    title: "Find products",
    subtitle: "“wireless earbuds under 200”",
    prompt: "Find me wireless earbuds under 200",
  },
  {
    icon: "navigate",
    title: "Go somewhere",
    subtitle: "“take me to my checkout”",
    prompt: "Take me to my checkout",
  },
  {
    icon: "location",
    title: "Point at the UI",
    subtitle: "“where is my coupon code box?”",
    prompt: "Where is my coupon code box?",
  },
  {
    icon: "pricetag",
    title: "Hunt deals",
    subtitle: "“show me today's deals”",
    prompt: "Show me today's deals",
  },
];

/** Animated three-dot thinking indicator. */
const TypingDots = () => {
  const { colors } = useTheme();
  const styles = useAppStyles(buildStyles);
  return (
    <View style={styles.typingWrap}>
      {[0, 1, 2].map((i) => (
        <BouncingDot key={i} delay={i * 180} color={colors.primary} />
      ))}
    </View>
  );
};

const BouncingDot = ({ delay, color }) => {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 420,
          delay,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 420,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, delay]);
  return (
    <Animated.View style={[dotStyle.dot, { opacity, backgroundColor: color }]} />
  );
};

const dotStyle = StyleSheet.create({
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginHorizontal: 2.5,
  },
});

/** Tool-call chip row rendered above an assistant reply. */
const ToolChips = ({ tools }) => {
  const { colors } = useTheme();
  const styles = useAppStyles(buildStyles);
  if (!tools?.length) return null;
  return (
    <View style={styles.toolRow}>
      {tools.map((tool, i) => {
        const meta = TOOL_META[tool.name] || { icon: "flash", label: tool.name };
        const isError = tool.status === "error";
        return (
          <View
            key={`${tool.name}-${i}`}
            style={[
              styles.toolChip,
              { borderColor: isError ? colors.badgeDanger : colors.border },
            ]}
          >
            <Ionicons
              name={isError ? "alert-circle" : meta.icon}
              size={11}
              color={isError ? colors.badgeDanger : colors.primary}
            />
            <Text
              style={[
                styles.toolChipText,
                { color: isError ? colors.badgeDanger : colors.muted },
              ]}
              numberOfLines={1}
            >
              {tool.label || meta.label}
            </Text>
            {!isError && (
              <Ionicons name="checkmark" size={11} color={colors.success} />
            )}
          </View>
        );
      })}
    </View>
  );
};

export const AIAssistantScreen = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const styles = useAppStyles(buildStyles);
  const { user, profile } = useAuth();
  const { addToCart } = useCart();
  const { messages, isThinking, sendMessage, clearChat } = useAIAssistant();

  const [input, setInput] = useState("");
  const listRef = useRef(null);
  // Register the input bar so the assistant can point at its own chat box.
  const inputBarRef = useGrounding("ai.inputBar");

  const firstName = useMemo(() => {
    const name = profile?.full_name || user?.email?.split("@")[0] || "there";
    return String(name).split(" ")[0];
  }, [profile?.full_name, user?.email]);

  /** Send a message through the agent loop, wiring navigation + cart. */
  const handleSend = useCallback(
    (text) => {
      const trimmed = (text ?? input).trim();
      if (!trimmed || isThinking) return;
      setInput("");
      sendMessage(trimmed, {
        navigateTo: (route, params) => navigation.navigate(route, params),
        addProductToCart: async (product, qty) => {
          await addToCart(product, qty);
        },
        resolveProduct: () => null,
      });
    },
    [input, isThinking, navigation, addToCart, sendMessage],
  );

  // Inverted list: newest message at the bottom. The typing indicator is a
  // synthetic item so it appears right where the reply will land.
  const listData = useMemo(() => {
    const data = [...messages].reverse();
    if (isThinking) data.unshift({ id: "__typing__", role: "typing" });
    return data;
  }, [messages, isThinking]);

  const renderItem = useCallback(
    ({ item }) => {
      if (item.role === "typing") return <TypingDots />;
      if (item.role === "user") {
        return (
          <View style={styles.userRow}>
            <LinearGradient
              colors={[colors.gradientStart, colors.gradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.userBubble}
            >
              <Text style={styles.userText}>{item.text}</Text>
            </LinearGradient>
          </View>
        );
      }
      return (
        <View style={styles.assistantRow}>
          <View style={styles.aiAvatar}>
            <LinearGradient
              colors={[colors.gradientStart, colors.accent]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.aiAvatarGradient}
            >
              <Ionicons name="sparkles" size={13} color="#FFFFFF" />
            </LinearGradient>
          </View>
          <View style={styles.assistantContent}>
            <ToolChips tools={item.tools} />
            <View
              style={[styles.assistantBubble, { backgroundColor: colors.surface }]}
            >
              <Text style={[styles.assistantText, { color: colors.dark }]}>
                {item.text}
              </Text>
            </View>
            {/* Generative UI — interactive product cards from tool results */}
            <AIProductCardRow products={item.products} />
          </View>
        </View>
      );
    },
    [colors, styles],
  );

  const keyExtractor = useCallback((item) => item.id, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Soft pastel gradient backdrop (light mode), subtle in dark mode */}
      <LinearGradient
        colors={
          isDark
            ? ["#0B1220", colors.background, colors.background]
            : ["#FDEFF2", "#EFFAF9", colors.background]
        }
        style={StyleSheet.absoluteFill}
      />

      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 6, borderBottomColor: colors.border },
        ]}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.headerButton}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={24} color={colors.dark} />
        </Pressable>
        <View style={styles.headerCenter}>
          <LinearGradient
            colors={[colors.gradientStart, colors.accent]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerAvatar}
          >
            <Ionicons name="sparkles" size={16} color="#FFFFFF" />
          </LinearGradient>
          <View>
            <Text style={[styles.headerTitle, { color: colors.dark }]}>
              ExpressMart AI
            </Text>
            <View style={styles.headerStatusRow}>
              <View style={styles.onlineDot} />
              <Text style={[styles.headerStatus, { color: colors.muted }]}>
                Shops · Navigates · Points
              </Text>
            </View>
          </View>
        </View>
        <Pressable
          onPress={clearChat}
          style={styles.headerButton}
          hitSlop={8}
          disabled={!messages.length}
        >
          <Ionicons
            name="refresh"
            size={20}
            color={messages.length ? colors.muted : colors.border}
          />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        {messages.length === 0 && !isThinking ? (
          /* Empty-state hero — greeting + suggestion cards */
          <View style={styles.hero}>
            <Text style={[styles.heroGreeting, { color: colors.dark }]}>
              Hey, {firstName}! 👋
            </Text>
            <Text style={[styles.heroSubtitle, { color: colors.muted }]}>
              Start searching by product, or tap a suggestion to see what I can
              do.
            </Text>
            <View style={styles.suggestionGrid}>
              {SUGGESTIONS.map((s) => (
                <Pressable
                  key={s.title}
                  style={[
                    styles.suggestionCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() => handleSend(s.prompt)}
                >
                  <View
                    style={[
                      styles.suggestionIcon,
                      { backgroundColor: colors.surfaceAlpha },
                    ]}
                  >
                    <Ionicons name={s.icon} size={18} color={colors.primary} />
                  </View>
                  <Text style={[styles.suggestionTitle, { color: colors.dark }]}>
                    {s.title}
                  </Text>
                  <Text
                    style={[styles.suggestionSubtitle, { color: colors.muted }]}
                    numberOfLines={2}
                  >
                    {s.subtitle}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={listData}
            inverted
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            contentContainerStyle={[styles.listContent, { paddingHorizontal: 14 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        )}

        {/* Input bar (grounded as "ai.inputBar") */}
        <View
          ref={inputBarRef}
          style={[
            styles.inputBar,
            {
              borderColor: colors.border,
              backgroundColor: colors.surface,
              marginBottom: insets.bottom + 10,
            },
          ]}
        >
          <View style={styles.aiBadgeSmall}>
            <Ionicons name="sparkles" size={12} color={colors.primary} />
          </View>
          <TextInput
            style={[styles.input, { color: colors.dark }]}
            placeholder="Message ExpressMart AI…"
            placeholderTextColor={colors.muted}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => handleSend()}
            returnKeyType="send"
            editable={!isThinking}
          />
          <Pressable
            onPress={() => handleSend()}
            disabled={!input.trim() || isThinking}
            style={({ pressed }) => [
              styles.sendButton,
              (!input.trim() || isThinking) && { opacity: 0.4 },
              pressed && { transform: [{ scale: 0.94 }] },
            ]}
          >
            <LinearGradient
              colors={[colors.gradientStart, colors.gradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.sendGradient}
            >
              <Ionicons name="arrow-up" size={17} color="#FFFFFF" />
            </LinearGradient>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

const buildStyles = (c) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 12,
      paddingBottom: 10,
      borderBottomWidth: 1,
      gap: 8,
    },
    headerButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
    },
    headerCenter: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
    },
    headerAvatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: {
      fontSize: 15,
      fontWeight: "700",
    },
    headerStatusRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    onlineDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: c.success,
    },
    headerStatus: {
      fontSize: 10.5,
      fontWeight: "500",
    },
    hero: {
      flex: 1,
      justifyContent: "center",
      paddingHorizontal: 22,
      paddingBottom: 40,
    },
    heroGreeting: {
      fontSize: 28,
      fontWeight: "800",
      marginBottom: 8,
    },
    heroSubtitle: {
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 26,
    },
    suggestionGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    suggestionCard: {
      width: "47.5%",
      borderRadius: radius.lg,
      borderWidth: 1,
      borderStyle: "solid",
      padding: 14,
      gap: 7,
    },
    suggestionIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
    },
    suggestionTitle: {
      fontSize: 13.5,
      fontWeight: "700",
    },
    suggestionSubtitle: {
      fontSize: 11.5,
      lineHeight: 15,
    },
    listContent: {
      paddingTop: 14,
      paddingBottom: 10,
    },
    userRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginBottom: 12,
    },
    userBubble: {
      maxWidth: "80%",
      borderRadius: radius.lg,
      borderBottomRightRadius: radius.xs,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    userText: {
      color: "#FFFFFF",
      fontSize: 14,
      lineHeight: 19,
      fontWeight: "500",
    },
    assistantRow: {
      flexDirection: "row",
      marginBottom: 14,
      gap: 8,
    },
    aiAvatar: {
      width: 26,
      height: 26,
      borderRadius: 13,
      overflow: "hidden",
      marginTop: 2,
    },
    aiAvatarGradient: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    assistantContent: {
      flex: 1,
    },
    assistantBubble: {
      maxWidth: "92%",
      borderRadius: radius.lg,
      borderBottomLeftRadius: radius.xs,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    assistantText: {
      fontSize: 14,
      lineHeight: 19.5,
    },
    toolRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginBottom: 6,
    },
    toolChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderWidth: 1,
      borderStyle: "solid",
      borderRadius: radius.full,
      paddingHorizontal: 8,
      paddingVertical: 3,
      backgroundColor: c.surfaceAlpha,
    },
    toolChipText: {
      fontSize: 10.5,
      fontWeight: "600",
      maxWidth: 160,
    },
    typingWrap: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      borderBottomLeftRadius: radius.xs,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 14,
      marginLeft: 34,
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: c.border,
    },
    inputBar: {
      flexDirection: "row",
      alignItems: "center",
      marginHorizontal: 14,
      marginTop: 6,
      borderRadius: radius.full,
      borderWidth: 1,
      borderStyle: "solid",
      paddingHorizontal: 6,
      paddingVertical: 5,
      gap: 6,
    },
    aiBadgeSmall: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.surfaceAlpha,
    },
    input: {
      flex: 1,
      fontSize: 14,
      paddingVertical: 6,
    },
    sendButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      overflow: "hidden",
    },
    sendGradient: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
  });
