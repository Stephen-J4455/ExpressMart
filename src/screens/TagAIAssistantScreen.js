// ── TagAIAssistantScreen — ExpressMart TagAI chat page ─────────────────────────────
// The conversational home of the assistant. Renders:
//   • A soft gradient hero (greeting + capability suggestion cards) when the
//     chat is empty — inspired by the ExpressMart voice-assistant concept.
//   • The chat stream with tool-call chips and GENERATIVE UI: product cards
//     returned by search_products / filter_catalog render inline as rich,
//     interactive TagAIProductCards (image, price tags, add-to-cart).
//   • A grounded input bar (registered as "tagAI.inputBar") so the assistant can
//     point at its own chat box.

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Image, Modal, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { compressProductImage } from "../utils/compressImage";
import {
  Animated,
  ActivityIndicator,
  Easing,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Markdown from "react-native-markdown-display";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useTheme } from "../context/ThemeContext";
import { useAppStyles } from "../hooks/useAppStyles";
import { useGrounding } from "../hooks/useGrounding";
import { useUserProfile } from "../hooks/useUserProfile";
import { useTagAIAssistant } from "../context/TagAIAssistantContext";
import { useToast } from "../context/ToastContext";
import { radius } from "../theme/colors";
import { TagAIProductCardRow } from "../components/tagai/TagAIProductCard";
import { ThinkingTrace } from "../components/tagai/ThinkingTrace";
import { ThinkingOrb } from "@mhaadi/thinking-orbs-native";

const ORB_STATES = [
  { value: "working", label: "Working" },
  { value: "searching", label: "Searching" },
  { value: "solving", label: "Solving" },
  { value: "listening", label: "Listening" },
  { value: "connecting", label: "Connecting" },
  { value: "weaving", label: "Weaving" },
  { value: "composing", label: "Composing" },
  { value: "breathing", label: "Breathing" },
  { value: "shaping", label: "Shaping" },
];

const ORB_THEMES = [
  { value: "auto", label: "Auto" },
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
];

const TOOL_META = {
  search_products: { icon: "search", label: "Searching products" },
  filter_catalog: { icon: "options", label: "Filtering catalog" },
  add_to_cart: { icon: "cart", label: "Adding to cart" },
  navigate_to_page: { icon: "navigate", label: "Navigating" },
  navigate_to_store: { icon: "storefront", label: "Opening store" },
  navigate_to_product: { icon: "pricetag", label: "Opening product" },
  point_to_element: { icon: "location", label: "Pointing" },
  read_screen: { icon: "eye", label: "Reading screen" },
  find_on_screen: { icon: "search", label: "Finding on screen" },
  scroll: { icon: "swap-vertical", label: "Scrolling" },
  scroll_to: { icon: "locate", label: "Scrolling to item" },
  wait_for: { icon: "time", label: "Waiting for screen" },
  tap_element: { icon: "hand-left", label: "Tapping control" },
  get_app_state: { icon: "information-circle", label: "Checking app state" },
  dismiss_overlay: { icon: "close-circle", label: "Dismissing overlay" },
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

const sanitizeAssistantText = (rawText) => {
  if (rawText == null) return "";
  return String(rawText)
    .replace(/<\s*\/\s*mm:think\s*>/gi, "")
    .replace(/<\s*mm:think\s*>/gi, "")
    .replace(/<\s*\/\s*think\s*>/gi, "")
    .replace(/<\s*think\s*>/gi, "")
    .replace(/<\s*\/\s*reasoning\s*>/gi, "")
    .replace(/<\s*reasoning\s*>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

/** Map TagAI tool names / phases to ThinkingOrb states. */
const TOOL_ORB_STATE = {
  // Image / vision
  imagine: "imagining",
  vision: "imagining",
  // Search / discovery
  search_products: "searching",
  filter_catalog: "searching",
  find_on_screen: "searching",
  get_store_products: "searching",
  // Reasoning / matching
  get_product_details: "solving",
  get_store_details: "solving",
  get_product_reviews: "solving",
  get_store_reviews: "solving",
  // Navigation / movement
  navigate_to_page: "working",
  navigate_to_store: "working",
  navigate_to_product: "working",
  navigate_to_route: "working",
  navigate_to_previous: "working",
  go_back: "working",
  scroll: "working",
  scroll_to: "working",
  tap_element: "working",
  // UI focus
  point_to_element: "focusing",
  read_screen: "focusing",
  // Waiting / listening
  wait_for: "listening",
  get_app_state: "listening",
  get_user_profile: "working",
  list_navigation_history: "working",
  dismiss_overlay: "working",
  list_screens: "working",
  get_screen_info: "working",
  // Default
  default: "working",
};

/** Resolve a ThinkingOrb state from the latest thinking trail entry. */
const resolveOrbState = (trail, isImage) => {
  if (isImage) return "imagining";
  const latest = trail[trail.length - 1]?.text || "";
  const toolName = latest.replace("Running ", "").replace("…", "");
  return TOOL_ORB_STATE[toolName] || TOOL_ORB_STATE.default;
};

/** Animated thinking indicator. */
const TypingDots = ({ state = "working", theme = "auto", speed = 1, colors, styles }) => {
  return (
    <View style={styles.typingWrap}>
      {Platform.OS === "web" ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <ThinkingOrb state={state} theme={theme} speed={speed} size={64} />
      )}
    </View>
  );
};

const PROCESS_DEBUG_TEXTS = [
  "Understanding your request…",
  "Finding products…",
  "Planning request…",
  "Checking the best matches…",
  "Preparing results…",
  "Reading the screen…",
  "Waiting for screen…",
];

const IMAGE_PROCESS_TEXTS = [
  "Checking image…",
  "Finding products…",
  "Looking for similar items…",
  "Comparing product matches…",
  "Preparing results…",
  "Reading the screen…",
  "Waiting for screen…",
];

// Map tool names to human-readable status text so the ticker shows what the
// AI is actually doing instead of cycling through generic phrases.
const TOOL_STATUS_TEXT = {
  search_products: "Searching products",
  filter_catalog: "Filtering catalog",
  add_to_cart: "Adding to cart",
  navigate_to_page: "Navigating",
  navigate_to_store: "Opening store",
  navigate_to_product: "Opening product",
  navigate_to_route: "Navigating",
  navigate_to_previous: "Going back",
  go_back: "Going back",
  point_to_element: "Pointing at UI",
  read_screen: "Reading screen",
  find_on_screen: "Finding on screen",
  scroll: "Scrolling",
  scroll_to: "Scrolling to item",
  wait_for: "Waiting for screen",
  tap_element: "Tapping control",
  get_product_details: "Reading product details",
  get_store_details: "Reading store details",
  get_store_products: "Browsing store catalog",
  get_product_reviews: "Reading reviews",
  get_store_reviews: "Reading store reviews",
  get_user_profile: "Reading your profile",
  list_navigation_history: "Checking history",
  dismiss_overlay: "Dismissing overlay",
  list_screens: "Listing screens",
  get_screen_info: "Getting screen info",
  get_app_state: "Checking app state",
};

const ThinkingStatusTicker = ({ items = [], hasImage = false }) => {
  const { colors } = useTheme();
  const styles = useAppStyles(buildStyles);
  const [visibleText, setVisibleText] = useState("");
  const translateY = useRef(new Animated.Value(16)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  // Determine what status to show based on the latest thinking item.
  const latestText = items[items.length - 1]?.text;
  const targetText = useMemo(() => {
    if (!latestText) return "Understanding your request…";
    if (latestText.startsWith("Running ")) {
      const toolName = latestText.replace("Running ", "").replace("…", "");
      return TOOL_STATUS_TEXT[toolName] || toolName;
    }
    return latestText;
  }, [latestText]);

  useEffect(() => {
    // When the target changes, animate the transition.
    if (targetText === visibleText) return;
    Animated.sequence([
      Animated.timing(translateY, {
        toValue: -16,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setVisibleText(targetText);
      translateY.setValue(16);
      opacity.setValue(1);
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, [targetText, visibleText, translateY, opacity]);

  // Only cycle through generic statuses when there's no specific tool
  // running and no image being processed.
  useEffect(() => {
    if (!latestText && !hasImage) {
      const cycleIndex = setInterval(() => {
        setVisibleText((prev) => {
          const currentIndex = PROCESS_DEBUG_TEXTS.indexOf(prev);
          const nextIndex =
            currentIndex >= 0
              ? (currentIndex + 1) % PROCESS_DEBUG_TEXTS.length
              : 0;
          return PROCESS_DEBUG_TEXTS[nextIndex];
        });
      }, 1200);
      return () => clearInterval(cycleIndex);
    }
  }, [latestText, hasImage]);

  return (
    <View style={styles.statusTickerWrap}>
      <Animated.Text
        style={[
          styles.statusTickerText,
          {
            color: colors.muted,
            opacity,
            transform: [{ translateY }],
          },
        ]}
      >
        {visibleText}
      </Animated.Text>
    </View>
  );
};

/** Tool-call chip row rendered above an assistant reply. */
const ToolChips = ({ tools }) => {
  const { colors } = useTheme();
  const styles = useAppStyles(buildStyles);
  if (!tools?.length) return null;
  return (
    <View style={styles.toolRow}>
      {tools.map((tool, i) => {
        const meta = TOOL_META[tool.name] || {
          icon: "flash",
          label: tool.name,
        };
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

export const TagAIAssistantScreen = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const styles = useAppStyles(buildStyles);
  // Markdown theme for assistant replies (same pattern as ProductDetailScreen)
  const markdownStyles = useAppStyles(buildTagAIMarkdownStyles);
  const { user, profile: authProfile } = useAuth();
  const { addToCart } = useCart();
  const toast = useToast();
  const {
    messages,
    isThinking,
    thinkingTrail,
    sendMessage,
    clearChat,
    cancelRequest,
  } = useTagAIAssistant();
  const { profile: algoProfile } = useUserProfile();

  const [input, setInput] = useState("");
  const [visionImage, setVisionImage] = useState(null);
  const [imageSourceModalVisible, setImageSourceModalVisible] = useState(false);
  const [processingImage, setProcessingImage] = useState(false);
  const [orbSettingsVisible, setOrbSettingsVisible] = useState(false);
  const [orbState, setOrbState] = useState("working");
  const [orbTheme, setOrbTheme] = useState("auto");
  const [orbSpeed, setOrbSpeed] = useState(1);
  const listRef = useRef(null);
  // Register the input bar so the assistant can point at its own chat box.
  const inputBarRef = useGrounding("tagAI.inputBar");

  const firstName = useMemo(() => {
    const name =
      authProfile?.full_name || user?.email?.split("@")[0] || "there";
    return String(name).split(" ")[0];
  }, [authProfile?.full_name, user?.email]);

  /** Send a message through the agent loop, wiring navigation + cart. */
  const handleSend = useCallback(
    (text) => {
      const trimmed = (text ?? input).trim();
      if ((!trimmed && !visionImage) || isThinking || processingImage) return;
      setInput("");
      sendMessage(trimmed, {
        image: visionImage,
        navigateTo: (route, params) => navigation.navigate(route, params),
        addProductToCart: async (product, qty) => {
          await addToCart(product, qty);
        },
        // Pass the user's algorithmic profile so the AI assistant can
        // personalize recommendations (price band, preferred tags, etc.).
        userProfile: algoProfile || null,
        // No local cache needed — the service resolves product ids straight
        // from the catalog via resolveProductById when this is omitted.
      });
      setVisionImage(null);
    },
    [
      input,
      isThinking,
      navigation,
      addToCart,
      sendMessage,
      visionImage,
      processingImage,
      algoProfile,
    ],
  );

  const pickVisionImage = useCallback(
    async (source) => {
      setImageSourceModalVisible(false);
      setProcessingImage(true);
      try {
        if (source === "camera") {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (permission.status !== "granted") {
            toast.error("Camera permission is required");
            return;
          }
        } else {
          const permission =
            await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (permission.status !== "granted") {
            toast.error("Photo library permission is required");
            return;
          }
        }

        const pickerOptions = {
          mediaTypes: ["images"],
          allowsEditing: true,
          quality: 1,
        };
        const result =
          source === "camera"
            ? await ImagePicker.launchCameraAsync(pickerOptions)
            : await ImagePicker.launchImageLibraryAsync(pickerOptions);
        if (result.canceled || !result.assets?.[0]) return;

        const asset = result.assets[0];
        const compressed = await compressProductImage(
          asset.uri,
          Platform.OS === "web" ? asset.file || null : null,
        );
        if (Platform.OS === "web" && compressed.pickedFile) {
          const buffer = await compressed.pickedFile.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = "";
          for (let index = 0; index < bytes.length; index += 1) {
            binary += String.fromCharCode(bytes[index]);
          }
          setVisionImage(`data:image/jpeg;base64,${btoa(binary)}`);
          return;
        }
        const base64 = await FileSystem.readAsStringAsync(compressed.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        setVisionImage(`data:image/jpeg;base64,${base64}`);
      } catch (error) {
        console.error("[TagAIAssistantScreen] image selection failed:", error);
        toast.error(
          "Could not attach image",
          error?.message || "Please try again.",
        );
      } finally {
        setProcessingImage(false);
      }
    },
    [toast],
  );

  // Inverted list: newest message at the bottom. The live status row sits
  // outside the list so it stays visible above the input bar instead of being
  // pushed down to the very end of the chat.
  const listData = useMemo(() => {
    return [...messages].reverse();
  }, [messages]);

  const renderItem = useCallback(
    ({ item }) => {
      if (item.role === "user") {
        return (
          <View style={styles.userRow}>
            <LinearGradient
              colors={[colors.gradientStart, colors.gradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.userBubble}
            >
              {item.image ? (
                <Image
                  source={{ uri: item.image }}
                  style={styles.sentVisionImage}
                />
              ) : null}
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
              style={[
                styles.assistantBubble,
                { backgroundColor: colors.surface },
              ]}
            >
              {/* Assistant replies arrive as markdown — render rich text
                  (bold, lists, code, links) instead of raw characters. */}
              <Markdown style={markdownStyles} onLinkPress={() => {}}>
                {sanitizeAssistantText(item.text)}
              </Markdown>
            </View>
            {/* Generative UI — interactive product cards from tool results */}
            <TagAIProductCardRow products={item.products} />
          </View>
        </View>
      );
    },
    [colors, styles, markdownStyles, thinkingTrail],
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
            <Image
              source={
                isDark
                  ? require("../../assets/tagit_ai_dark.png")
                  : require("../../assets/tagit_ai_light.png")
              }
              style={styles.headerAvatarIcon}
              resizeMode="contain"
            />
          </LinearGradient>
          <View>
            <Text style={[styles.headerTitle, { color: colors.dark }]}>
              TagAI
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

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
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
                  <Text
                    style={[styles.suggestionTitle, { color: colors.dark }]}
                  >
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
            contentContainerStyle={[
              styles.listContent,
              { paddingHorizontal: 14 },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        )}

        {isThinking ? (
          <View style={styles.thinkingStatusRow}>
            <TypingDots
              state={resolveOrbState(thinkingTrail, Boolean(visionImage))}
              theme={orbTheme}
              speed={orbSpeed}
              colors={colors}
              styles={styles}
            />
            <ThinkingStatusTicker
              items={thinkingTrail}
              hasImage={Boolean(messages[messages.length - 1]?.image)}
            />
          </View>
        ) : null}

        {/* Input bar (grounded as "tagAI.inputBar") */}
        <View
          ref={inputBarRef}
          style={[
            styles.inputBar,
            {
              marginBottom: insets.bottom + 10,
            },
          ]}
        >
          <LinearGradient
            colors={[colors.gradientStart, colors.accent]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.inputBarFrame}
          >
            <View
              style={[
                styles.inputBarInner,
                { backgroundColor: colors.surface },
              ]}
            >
              {visionImage ? (
                <View style={styles.visionPreviewWrap}>
                  <Image
                    source={{ uri: visionImage }}
                    style={styles.visionPreview}
                  />
                  <Pressable
                    onPress={() => setVisionImage(null)}
                    style={styles.visionRemove}
                  >
                    <Ionicons name="close" size={12} color="#FFFFFF" />
                  </Pressable>
                </View>
              ) : null}
              <View style={styles.inputIdentity}>
                <Image
                  source={
                    isDark
                      ? require("../../assets/tagit_ai_dark.png")
                      : require("../../assets/tagit_ai_light.png")
                  }
                  style={styles.inputIdentityIcon}
                  resizeMode="contain"
                />
              </View>
              <TextInput
                style={[styles.input, { color: colors.dark }]}
                placeholder="Ask TagAI anything..."
                placeholderTextColor={colors.muted}
                value={input}
                onChangeText={setInput}
                onSubmitEditing={() => handleSend()}
                returnKeyType="send"
                editable={!isThinking}
              />
              <Pressable
                onPress={() => setImageSourceModalVisible(true)}
                disabled={isThinking || processingImage}
                style={({ pressed }) => [
                  styles.attachButton,
                  (isThinking || processingImage) && { opacity: 0.4 },
                  pressed && { transform: [{ scale: 0.94 }] },
                ]}
                accessibilityLabel="Attach image for TagAI vision"
              >
                {processingImage ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons
                    name="image-outline"
                    size={19}
                    color={colors.primary}
                  />
                )}
              </Pressable>
              <Pressable
                onPress={isThinking ? cancelRequest : () => handleSend()}
                disabled={!input.trim() && !visionImage && !isThinking}
                style={({ pressed }) => [
                  styles.sendButton,
                  isThinking && styles.stopButton,
                  ((!input.trim() && !visionImage) ||
                    isThinking ||
                    processingImage) && { opacity: 0.4 },
                  pressed && { transform: [{ scale: 0.94 }] },
                ]}
                accessibilityLabel={
                  isThinking ? "Stop AI request" : "Send message"
                }
              >
                {isThinking ? (
                  <Ionicons name="close" size={17} color="#FFFFFF" />
                ) : (
                  <LinearGradient
                    colors={[colors.gradientStart, colors.gradientEnd]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.sendGradient}
                  >
                    <Ionicons name="arrow-up" size={17} color="#FFFFFF" />
                  </LinearGradient>
                )}
              </Pressable>
            </View>
          </LinearGradient>
        </View>
      </KeyboardAvoidingView>
      <Modal
        visible={imageSourceModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setImageSourceModalVisible(false)}
      >
        <Pressable
          style={styles.imageSourceBackdrop}
          onPress={() => setImageSourceModalVisible(false)}
        >
          <Pressable
            style={[
              styles.imageSourceSheet,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                marginBottom: insets.bottom + 12,
              },
            ]}
            onPress={(event) => event.stopPropagation()}
          >
            <View
              style={[
                styles.imageSourceHandle,
                { backgroundColor: colors.border },
              ]}
            />
            <Text style={[styles.imageSourceTitle, { color: colors.dark }]}>
              Add a photo
            </Text>
            <Text style={[styles.imageSourceSubtitle, { color: colors.muted }]}>
              Choose an image for TagAI to inspect.
            </Text>
            <Pressable
              onPress={() => pickVisionImage("library")}
              style={({ pressed }) => [
                styles.imageSourceOption,
                { borderColor: colors.border },
                pressed && { backgroundColor: colors.surfaceAlpha },
              ]}
              accessibilityRole="button"
            >
              <View
                style={[
                  styles.imageSourceIcon,
                  { backgroundColor: colors.surfaceAlpha },
                ]}
              >
                <Ionicons
                  name="images-outline"
                  size={20}
                  color={colors.primary}
                />
              </View>
              <View style={styles.imageSourceText}>
                <Text
                  style={[
                    styles.imageSourceOptionTitle,
                    { color: colors.dark },
                  ]}
                >
                  Choose from device
                </Text>
                <Text
                  style={[
                    styles.imageSourceOptionSubtitle,
                    { color: colors.muted },
                  ]}
                >
                  Select a photo from your library
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
            <Pressable
              onPress={() => pickVisionImage("camera")}
              style={({ pressed }) => [
                styles.imageSourceOption,
                { borderColor: colors.border },
                pressed && { backgroundColor: colors.surfaceAlpha },
              ]}
              accessibilityRole="button"
            >
              <View
                style={[
                  styles.imageSourceIcon,
                  { backgroundColor: colors.surfaceAlpha },
                ]}
              >
                <Ionicons
                  name="camera-outline"
                  size={20}
                  color={colors.primary}
                />
              </View>
              <View style={styles.imageSourceText}>
                <Text
                  style={[
                    styles.imageSourceOptionTitle,
                    { color: colors.dark },
                  ]}
                >
                  Take a photo
                </Text>
                <Text
                  style={[
                    styles.imageSourceOptionSubtitle,
                    { color: colors.muted },
                  ]}
                >
                  Open your camera
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
            <Pressable
              onPress={() => setImageSourceModalVisible(false)}
              style={styles.imageSourceCancel}
              accessibilityRole="button"
            >
              <Text
                style={[styles.imageSourceCancelText, { color: colors.muted }]}
              >
                Cancel
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Orb settings modal */}
      <Modal
        visible={orbSettingsVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setOrbSettingsVisible(false)}
      >
        <View style={styles.orbSettingsOverlay}>
          <View style={styles.orbSettingsContainer}>
            <View style={styles.orbSettingsHeader}>
              <Pressable
                style={styles.orbSettingsCloseBtn}
                onPress={() => setOrbSettingsVisible(false)}
              >
                <Ionicons name="close" size={22} color={colors.muted} />
              </Pressable>
              <Text style={styles.orbSettingsTitle}>Thinking Orbs</Text>
              <Pressable
                style={styles.orbSettingsCloseBtn}
                onPress={() => setOrbSettingsVisible(false)}
              >
                <Ionicons name="checkmark" size={22} color={colors.primary} />
              </Pressable>
            </View>
            <View style={styles.orbSettingsBody}>
              <View style={styles.orbSettingRow}>
                <Text style={styles.orbSettingLabel}>State</Text>
                <View style={styles.orbSettingSelect}>
                  {ORB_STATES.map((o) => (
                    <Pressable
                      key={o.value}
                      style={[
                        styles.orbOption,
                        orbState === o.value && styles.orbOptionActive,
                      ]}
                      onPress={() => setOrbState(o.value)}
                    >
                      <Text style={styles.orbOptionText}>{o.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={styles.orbSettingRow}>
                <Text style={styles.orbSettingLabel}>Theme</Text>
                <View style={styles.orbSettingSelect}>
                  {ORB_THEMES.map((t) => (
                    <Pressable
                      key={t.value}
                      style={[
                        styles.orbOption,
                        orbTheme === t.value && styles.orbOptionActive,
                      ]}
                      onPress={() => setOrbTheme(t.value)}
                    >
                      <Text style={styles.orbOptionText}>{t.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={styles.orbSettingRow}>
                <Text style={styles.orbSettingLabel}>Speed</Text>
                <View style={styles.orbSpeedRow}>
                  <Text style={styles.orbSpeedLabel}>0.5x</Text>
                  <Pressable
                    style={styles.orbSpeedMinus}
                    onPress={() => setOrbSpeed((s) => Math.max(0.5, s - 0.5))}
                  >
                    <Ionicons name="remove" size={18} color={colors.muted} />
                  </Pressable>
                  <Text style={styles.orbSpeedValue}>{orbSpeed}x</Text>
                  <Pressable
                    style={styles.orbSpeedPlus}
                    onPress={() => setOrbSpeed((s) => Math.min(2, s + 0.5))}
                  >
                    <Ionicons name="add" size={18} color={colors.muted} />
                  </Pressable>
                  <Text style={styles.orbSpeedLabel}>2x</Text>
                </View>
              </View>
              <View style={styles.orbPreviewRow}>
                <Text style={styles.orbPreviewLabel}>Preview</Text>
                <View style={styles.orbPreview}>
                  <ThinkingOrb
                    state={orbState}
                    theme={orbTheme}
                    speed={orbSpeed}
                    size={64}
                  />
                </View>
              </View>
            </View>
          </View>
        </View>
      </Modal>
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
    headerAvatarIcon: {
      width: 24,
      height: 24,
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
    activeToolPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 10,
      backgroundColor: c.primaryAlpha || "rgba(99, 102, 241, 0.12)",
      borderWidth: 1,
      borderColor: c.primaryAlphaBorder || "rgba(99, 102, 241, 0.32)",
      marginLeft: 6,
    },
    activeToolText: {
      fontSize: 9.5,
      fontWeight: "600",
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
    sentVisionImage: {
      width: 180,
      height: 180,
      borderRadius: radius.md,
      marginBottom: 8,
      backgroundColor: c.surfaceAlpha,
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
      borderRadius: radius.lg,
      borderBottomLeftRadius: radius.xs,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 14,
      marginLeft: 0,
    },
    thinkingStatusRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      alignSelf: "stretch",
      gap: 8,
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 6,
      marginBottom: 4,
      marginLeft: 0,
      width: "100%",
    },
    stopButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.badgeDanger,
    },
    statusTickerWrap: {
      flex: 1,
      minWidth: 0,
      justifyContent: "flex-end",
      alignItems: "center",
      paddingRight: 4,
      marginTop: -8,
      marginLeft: -150,
    },
    statusTickerText: {
      fontSize: 11.5,
      lineHeight: 16,
      fontWeight: "600",
      letterSpacing: 0.15,
      flexShrink: 1,
      textAlign: "left",
      includeFontPadding: false,
      textAlignVertical: "center",
    },
    inputBar: {
      marginHorizontal: 14,
      marginTop: 6,
      borderRadius: radius.full,
      shadowColor: "#000",
      shadowOpacity: 0.12,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 5 },
      elevation: 6,
    },
    inputBarFrame: {
      borderRadius: radius.full,
      padding: 1.5,
    },
    inputBarInner: {
      minHeight: 52,
      flexDirection: "row",
      alignItems: "center",
      borderRadius: radius.full,
      paddingHorizontal: 7,
      gap: 7,
    },
    inputIdentity: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.surfaceAlpha,
    },
    inputIdentityIcon: {
      width: 25,
      height: 25,
    },
    attachButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: c.surfaceAlpha,
      alignItems: "center",
      justifyContent: "center",
    },
    imageSourceBackdrop: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "rgba(8, 15, 25, 0.48)",
      paddingHorizontal: 12,
    },
    imageSourceSheet: {
      borderWidth: 1,
      borderRadius: radius.xl,
      paddingHorizontal: 18,
      paddingTop: 10,
      paddingBottom: 10,
      shadowColor: "#000",
      shadowOpacity: 0.16,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: -8 },
      elevation: 12,
    },
    imageSourceHandle: {
      alignSelf: "center",
      width: 38,
      height: 4,
      borderRadius: radius.full,
      marginBottom: 18,
    },
    imageSourceTitle: {
      fontSize: 19,
      fontWeight: "800",
      letterSpacing: -0.3,
    },
    imageSourceSubtitle: {
      fontSize: 13,
      lineHeight: 18,
      marginTop: 4,
      marginBottom: 16,
    },
    imageSourceOption: {
      minHeight: 68,
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: radius.lg,
      paddingHorizontal: 10,
      marginBottom: 9,
      gap: 12,
    },
    imageSourceIcon: {
      width: 42,
      height: 42,
      borderRadius: radius.md,
      alignItems: "center",
      justifyContent: "center",
    },
    imageSourceText: {
      flex: 1,
      gap: 3,
    },
    imageSourceOptionTitle: {
      fontSize: 14,
      fontWeight: "700",
    },
    imageSourceOptionSubtitle: {
      fontSize: 12,
    },
    imageSourceCancel: {
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 2,
    },
    imageSourceCancelText: {
      fontSize: 14,
      fontWeight: "700",
    },
    // ── Orb settings modal ──────────────────────────────────────────────
    orbSettingsOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.4)",
      justifyContent: "center",
      alignItems: "center",
    },
    orbSettingsContainer: {
      width: "88%",
      maxWidth: 340,
      backgroundColor: c.light,
      borderRadius: radius.lg,
      overflow: "hidden",
    },
    orbSettingsHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.background,
    },
    orbSettingsCloseBtn: {
      width: 36,
      height: 36,
      borderRadius: radius.full,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.surfaceAlpha,
    },
    orbSettingsTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: c.dark,
    },
    orbSettingsBody: {
      padding: 16,
    },
    orbSettingRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 16,
    },
    orbSettingLabel: {
      fontSize: 13,
      fontWeight: "700",
      color: c.dark,
    },
    orbSettingSelect: {
      flexDirection: "row",
      gap: 6,
      flexWrap: "wrap",
    },
    orbOption: {
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.background,
    },
    orbOptionActive: {
      borderColor: c.primary,
      backgroundColor: c.surfaceAlpha,
    },
    orbOptionText: {
      fontSize: 12,
      fontWeight: "700",
      color: c.dark,
    },
    orbSpeedRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    orbSpeedLabel: {
      fontSize: 11,
      color: c.muted,
    },
    orbSpeedMinus: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.surfaceAlpha,
    },
    orbSpeedPlus: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.surfaceAlpha,
    },
    orbSpeedValue: {
      fontSize: 13,
      fontWeight: "800",
      color: c.primary,
      minWidth: 24,
      textAlign: "center",
    },
    orbPreviewRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginTop: 16,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    orbPreviewLabel: {
      fontSize: 13,
      fontWeight: "700",
      color: c.dark,
    },
    orbPreview: {
      alignItems: "center",
      justifyContent: "center",
    },
    visionPreviewWrap: {
      position: "absolute",
      left: 8,
      bottom: 50,
      padding: 3,
      borderRadius: radius.sm,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    visionPreview: { width: 48, height: 48, borderRadius: radius.xs },
    visionRemove: {
      position: "absolute",
      top: -7,
      right: -7,
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.dark,
    },
    input: {
      flex: 1,
      fontSize: 14,
      minHeight: 40,
      paddingVertical: 8,
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

// Markdown theme for TagAI assistant replies — compact chat-bubble sizing
// (same react-native-markdown-display pattern as ProductDetailScreen's
// buildProductDetailMarkdownStyles, but tuned for 14pt chat text).
const buildTagAIMarkdownStyles = (c) =>
  StyleSheet.create({
    body: {
      fontSize: 14,
      color: c.dark,
      lineHeight: 19.5,
    },
    text: {
      fontSize: 14,
      color: c.dark,
      lineHeight: 19.5,
    },
    // Keep paragraphs tight so single-line replies don't grow the bubble
    paragraph: {
      marginTop: 0,
      marginBottom: 0,
    },
    strong: {
      fontWeight: "700",
      color: c.dark,
    },
    em: {
      fontStyle: "italic",
    },
    heading1: {
      fontSize: 17,
      fontWeight: "800",
      color: c.dark,
      marginTop: 6,
      marginBottom: 2,
    },
    heading2: {
      fontSize: 16,
      fontWeight: "800",
      color: c.dark,
      marginTop: 6,
      marginBottom: 2,
    },
    heading3: {
      fontSize: 14.5,
      fontWeight: "700",
      color: c.dark,
      marginTop: 4,
      marginBottom: 2,
    },
    bullet_list: {
      marginTop: 2,
      marginBottom: 2,
    },
    ordered_list: {
      marginTop: 2,
      marginBottom: 2,
    },
    list_item: {
      marginVertical: 2,
    },
    code_inline: {
      backgroundColor: c.surfaceAlpha,
      color: c.primary,
      paddingHorizontal: 4,
      borderRadius: 4,
      fontFamily: "monospace",
      fontSize: 13,
    },
    code_block: {
      backgroundColor: c.surfaceAlpha,
      color: c.dark,
      padding: 8,
      borderRadius: 8,
      marginVertical: 4,
      fontFamily: "monospace",
      fontSize: 12.5,
    },
    fence: {
      backgroundColor: c.surfaceAlpha,
      color: c.dark,
      padding: 8,
      borderRadius: 8,
      marginVertical: 4,
      fontFamily: "monospace",
      fontSize: 12.5,
    },
    blockquote: {
      backgroundColor: c.surfaceAlpha,
      borderLeftWidth: 3,
      borderLeftColor: c.border,
      paddingHorizontal: 10,
      paddingVertical: 4,
      marginVertical: 4,
    },
    link: {
      color: c.primary,
      textDecorationLine: "underline",
    },
    hr: {
      backgroundColor: c.border,
      height: 1,
      marginVertical: 6,
    },
  });
