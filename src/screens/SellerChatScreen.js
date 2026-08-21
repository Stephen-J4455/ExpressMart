import { useEffect, useState, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  Platform,
  Image,
  ActivityIndicator,
  Keyboard,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  KeyboardAwareScrollView,
  KeyboardStickyView,
} from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { getTheme, radius } from "../theme/colors";
import { useTheme } from "../context/ThemeContext";
import { useAppStyles } from "../hooks/useAppStyles";

const CARD_WIDTH = Math.min(Dimensions.get("window").width * 0.65, 260);

const getDateLabel = (dateStr) => {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== today.getFullYear() && { year: "numeric" }),
  });
};

const getPresenceSubtitle = (isOnline, lastSeenAt) => {
  if (isOnline) return "Online";
  if (!lastSeenAt) return "Offline";
  const diffMs = Date.now() - new Date(lastSeenAt).getTime();
  if (Number.isNaN(diffMs) || diffMs < 0) return "Offline";
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return "Last seen just now";
  if (diffMinutes < 60) return `Last seen ${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `Last seen ${diffHours}h ago`;
  if (diffHours < 48) return "Last seen yesterday";
  return `Last seen ${new Date(lastSeenAt).toLocaleDateString()}`;
};

export const SellerChatScreen = ({
  route,
  navigation,
  embedded = false,
  conversation: embeddedConversation,
  conversationId: embeddedConversationId,
  customer: embeddedCustomer,
}) => {
  const insets = useSafeAreaInsets();
  const { colors: themeColors } = useTheme();
  const styles = useAppStyles((c) => buildSellerChatStyles(c));
  const { user } = useAuth();
  const toast = useToast();
  const routeParams = route?.params || {};
  const conversationId = embeddedConversationId || routeParams.conversationId;
  const customer = embeddedCustomer || routeParams.customer;

  // Normalize the conversation object from the id + customer that callers pass.
  const conversation =
    embeddedConversation ||
    (conversationId
      ? {
          id: conversationId,
          user: {
            id: customer?.id,
            full_name: customer?.name,
            email: customer?.email,
            avatar_url: customer?.avatar,
            last_seen_at: customer?.last_seen_at,
          },
        }
      : null);

  const sellerId = routeParams.sellerId || user?.id;
  const seller = routeParams.seller;

  const theme = getTheme(seller?.theme_color || themeColors.primary);

  const userName =
    conversation?.user?.full_name ||
    conversation?.user?.email ||
    customer?.name ||
    "Customer";

  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [customerOnline, setCustomerOnline] = useState(false);
  const [customerLastSeenAt, setCustomerLastSeenAt] = useState(
    conversation?.user?.last_seen_at || null,
  );
  const flatListRef = useRef(null);
  const customerLastSeenChannelRef = useRef(null);
  const presenceChannelRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const didInitialAutoScrollRef = useRef(false);
  const instanceIdRef = useRef(
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`,
  );
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [inputHeight, setInputHeight] = useState(72);

  const BOTTOM_AUTO_SCROLL_THRESHOLD = 120;

  const updateNearBottomState = (event) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom =
      contentSize.height - (contentOffset.y + layoutMeasurement.height);
    isNearBottomRef.current = distanceFromBottom <= BOTTOM_AUTO_SCROLL_THRESHOLD;
  };

  const scrollToBottom = (animated = true, force = false) => {
    if (!force && !isNearBottomRef.current) return;
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToEnd({ animated });
    });
  };

  useEffect(() => {
    if (conversationId) {
      fetchMessages();
      fetchCustomerLastSeen();
      setupCustomerLastSeenSubscription();
      setupPresence();
      return () => {
        if (customerLastSeenChannelRef.current) {
          supabase.removeChannel(customerLastSeenChannelRef.current);
          customerLastSeenChannelRef.current = null;
        }
        if (presenceChannelRef.current) {
          supabase.removeChannel(presenceChannelRef.current);
          presenceChannelRef.current = null;
        }
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = (e) => setKeyboardHeight(e?.endCoordinates?.height || 0);
    const onHide = () => setKeyboardHeight(0);
    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const fetchMessages = async () => {
    if (!conversation) return;
    try {
      const { data, error } = await supabase
        .from("express_chat_messages")
        .select("*")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      setMessages(data || []);
      // Only force-scroll on the very first load; afterwards respect the
      // user's scroll position so we don't yank them down while reading.
      setTimeout(() => {
        if (!didInitialAutoScrollRef.current) {
          didInitialAutoScrollRef.current = true;
          scrollToBottom(false, true);
        } else {
          scrollToBottom(false);
        }
      }, 100);
    } catch (error) {
      console.error("Error fetching messages:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomerLastSeen = async () => {
    const customerId = conversation?.user?.id || conversation?.user_id;
    if (!customerId) return;
    try {
      const { data, error } = await supabase
        .from("express_profiles")
        .select("last_seen_at")
        .eq("id", customerId)
        .single();
      if (error) throw error;
      setCustomerLastSeenAt(data?.last_seen_at || null);
    } catch (error) {
      console.error("Error fetching customer last seen:", error);
    }
  };

  const setupCustomerLastSeenSubscription = () => {
    const customerId = conversation?.user?.id || conversation?.user_id;
    if (!customerId) return;
    const channel = supabase
      .channel(`customer-last-seen:${customerId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "express_profiles",
          filter: `id=eq.${customerId}`,
        },
        (payload) => setCustomerLastSeenAt(payload.new.last_seen_at || null),
      )
      .subscribe();
    customerLastSeenChannelRef.current = channel;
  };

  const setupPresence = () => {
    const customerId = conversation?.user?.id || conversation?.user_id;
    if (!customerId) return;
    // Use a unique channel name per component instance so we always get a
    // fresh, unsubscribed channel. Reusing a channel name that is already
    // subscribed throws "cannot add presence callbacks ... after subscribe()".
    const channel = supabase.channel(
      `presence:user:${customerId}:${instanceIdRef.current}`,
    );
    const syncCustomerPresence = () => {
      const state = channel.presenceState();
      const isCustomerCurrentlyOnline = Object.values(state).some((presences) =>
        presences.some((presence) => presence.actor_type === "user"),
      );
      setCustomerOnline(isCustomerCurrentlyOnline);
      if (!isCustomerCurrentlyOnline) fetchCustomerLastSeen();
    };
    channel
      .on("presence", { event: "sync" }, syncCustomerPresence)
      .on("presence", { event: "join" }, syncCustomerPresence)
      .on("presence", { event: "leave" }, syncCustomerPresence)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") syncCustomerPresence();
      });
    presenceChannelRef.current = channel;
  };

  const setupRealtimeSubscription = () => {
    if (!conversation) return;
    return supabase
      .channel(`seller-chat-${conversation.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "express_chat_messages",
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          setMessages((prev) => {
            if (prev.some((m) => m.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
          // Only auto-scroll if the user is already near the bottom.
          setTimeout(() => scrollToBottom(false), 50);
        },
      )
      .subscribe();
  };

  useEffect(() => {
    const ch = setupRealtimeSubscription();
    return () => {
      if (ch) supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    if (messages.length > 0) markAsRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  const markAsRead = async () => {
    if (!conversation || !user) return;
    try {
      await supabase
        .from("express_chat_messages")
        .update({ is_read: true })
        .eq("conversation_id", conversation.id)
        .neq("sender_id", user.id)
        .eq("is_read", false);
    } catch (error) {
      console.error("Error marking messages as read:", error);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !conversation || sending || !user) return;
    const messageText = newMessage.trim();
    setSending(true);
    setNewMessage("");
    try {
      const { error } = await supabase.from("express_chat_messages").insert({
        conversation_id: conversation.id,
        sender_id: user.id,
        sender_type: "seller",
        message: messageText,
      });
      if (error) throw error;
    } catch (error) {
      console.error("Error sending message:", error);
      setNewMessage(messageText);
      toast.error("Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const enrichedMessages = useMemo(() => {
    const result = [];
    let lastDate = null;
    for (const msg of messages) {
      const dateKey = new Date(msg.created_at).toDateString();
      if (dateKey !== lastDate) {
        result.push({ id: `divider-${dateKey}`, type: "date_divider", date: msg.created_at });
        lastDate = dateKey;
      }
      result.push(msg);
    }
    return result;
  }, [messages]);

  const renderMessage = ({ item }) => {
    if (item.type === "date_divider") {
      return (
        <View style={styles.dateDivider}>
          <View style={styles.dateDividerLine} />
          <Text style={styles.dateDividerText}>{getDateLabel(item.date)}</Text>
          <View style={styles.dateDividerLine} />
        </View>
      );
    }
    const isSeller = item.sender_type === "seller";
    const isProductCard = item.message?.startsWith("PRODUCT_CARD:");

    if (isProductCard) {
      let productData = null;
      try {
        productData = JSON.parse(item.message.slice("PRODUCT_CARD:".length));
      } catch (e) {}
      const finalPrice =
        productData?.discount > 0
          ? productData.price * (1 - productData.discount / 100)
          : productData?.price || 0;

      return (
        <View style={[styles.messageWrapper, isSeller ? styles.sellerWrapper : styles.userWrapper]}>
          <View
            style={[
              styles.productCardBubble,
              isSeller
                ? styles.productCardBubbleSeller
                : styles.productCardBubbleUser,
            ]}
          >
            {productData?.image && (
              <Image
                source={{ uri: productData.image }}
                style={styles.productCardImage}
                resizeMode="cover"
              />
            )}
            <View style={styles.productCardBody}>
              <Text
                style={[
                  styles.productCardTitle,
                  isSeller
                    ? styles.productCardTitleSeller
                    : styles.productCardTitleUser,
                ]}
                numberOfLines={2}
              >
                {productData?.title || "Product"}
              </Text>
              <Text
                style={[
                  styles.productCardPrice,
                  isSeller
                    ? styles.productCardPriceSeller
                    : styles.productCardPriceUser,
                ]}
              >
                GH₵{Number(finalPrice).toLocaleString()}
              </Text>
            </View>
          </View>
          <Text style={styles.messageTime}>
            {new Date(item.created_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </View>
      );
    }

    return (
      <View style={[styles.messageWrapper, isSeller ? styles.sellerWrapper : styles.userWrapper]}>
        <View
          style={[
            styles.messageContainer,
            isSeller ? [styles.sellerMessage, { backgroundColor: theme.primary }] : styles.userMessage,
          ]}
        >
          <Text style={[styles.messageText, isSeller && styles.sellerMessageText]}>
            {item.message}
          </Text>
        </View>
        <Text style={styles.messageTime}>
          {new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={theme.primary} />
        <Text style={styles.loadingText}>Loading chat...</Text>
      </View>
    );
  }

  const inputPaddingBottom = insets.bottom;
  const headerPaddingTop = embedded ? 10 : insets.top + 10;

  const content = (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: headerPaddingTop }]}>
        <View style={styles.headerContent}>
          {!embedded && (
            <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={24} color={theme.primary} />
            </Pressable>
          )}
          <View style={styles.headerInfo}>
            <View style={styles.userAvatar}>
              {conversation?.user?.avatar_url ? (
                <Image source={{ uri: conversation.user.avatar_url }} style={styles.avatarImg} />
              ) : (
                <Ionicons name="person" size={20} color={theme.accent} />
              )}
            </View>
            <View>
              <Text style={styles.headerTitle}>{userName}</Text>
              <View style={styles.statusRow}>
                <View
                  style={[styles.statusDot, { backgroundColor: customerOnline ? "#10B981" : "#9CA3AF" }]}
                />
                <Text style={styles.headerSubtitle}>
                  {getPresenceSubtitle(customerOnline, customerLastSeenAt)}
                </Text>
              </View>
            </View>
          </View>
          <Pressable style={styles.headerAction}>
            <Ionicons name="ellipsis-vertical" size={20} color={theme.primary} />
          </Pressable>
        </View>
      </View>

      <KeyboardAwareScrollView
        ref={flatListRef}
        style={[styles.chatContainer]}
        contentContainerStyle={styles.messagesList}
        onLayout={() => {
          if (!didInitialAutoScrollRef.current) {
            didInitialAutoScrollRef.current = true;
            scrollToBottom(false, true);
          }
        }}
        onScroll={updateNearBottomState}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bottomOffset={8}
      >
        {enrichedMessages.map((item) => renderMessage({ item }))}
      </KeyboardAwareScrollView>

      <KeyboardStickyView style={styles.inputSticky}>
        <View style={styles.inputWrapper}>
          <View style={styles.inputField}>
            <TextInput
              style={styles.textInput}
              value={newMessage}
              onChangeText={setNewMessage}
              placeholder="Type a message..."
              placeholderTextColor={themeColors.muted}
              multiline
              maxLength={1000}
            />
          </View>
          <Pressable
            style={[styles.sendButton, { backgroundColor: theme.primary }, (!newMessage.trim() || sending) && styles.sendButtonDisabled]}
            onPress={sendMessage}
            disabled={!newMessage.trim() || sending}
          >
            {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={20} color="#fff" />}
          </Pressable>
        </View>
      </KeyboardStickyView>
    </View>
  );

  return embedded ? content : <View style={{ flex: 1 }}>{content}</View>;
};

const buildSellerChatStyles = (c) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  header: { backgroundColor: c.background, paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: c.border, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3, zIndex: 2 },
  headerContent: { flexDirection: "row", alignItems: "center" },
  backButton: { width: 36, height: 36, marginRight: 8, borderRadius: radius.pill, backgroundColor: c.surface, justifyContent: "center", alignItems: "center" },
  headerInfo: { flex: 1, flexDirection: "row", alignItems: "center" },
  userAvatar: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: c.surface, justifyContent: "center", alignItems: "center", marginRight: 12, overflow: "hidden", borderWidth: 1, borderColor: c.border },
  avatarImg: { width: "100%", height: "100%" },
  headerTitle: { fontSize: 17, fontWeight: "700", color: c.dark },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusDot: { width: 6, height: 6, borderRadius: radius.pill },
  headerSubtitle: { fontSize: 12, color: c.muted },
  headerAction: { padding: 8 },
  chatContainer: { flex: 1, backgroundColor: c.background },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: c.background, gap: 8 },
  loadingText: { color: c.muted, fontSize: 15 },
  messagesList: { padding: 16, paddingBottom: 16, flexGrow: 1, justifyContent: "flex-end" },
  messageWrapper: { marginBottom: 16, maxWidth: "85%" },
  userWrapper: { alignSelf: "flex-start" },
  sellerWrapper: { alignSelf: "flex-end", alignItems: "flex-end" },
  messageContainer: { padding: 12, borderRadius: radius.lg, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  userMessage: { backgroundColor: c.light, borderBottomLeftRadius: 4 },
  sellerMessage: { borderBottomRightRadius: 4 },
  messageText: { fontSize: 16, lineHeight: 22, color: c.dark },
  sellerMessageText: { color: "#fff" },
  messageTime: { fontSize: 11, color: c.muted, marginTop: 4, marginHorizontal: 4 },
  productCardBubble: {
    borderRadius: radius.lg,
    overflow: "hidden",
    width: CARD_WIDTH,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  productCardBubbleUser: {
    backgroundColor: c.primary,
    borderBottomRightRadius: 4,
  },
  productCardBubbleSeller: {
    backgroundColor: c.light,
    borderBottomLeftRadius: 4,
  },
  productCardImage: {
    width: CARD_WIDTH,
    height: 160,
    backgroundColor: c.surface,
  },
  productCardBody: {
    padding: 12,
  },
  productCardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: c.dark,
    marginBottom: 4,
    lineHeight: 20,
  },
  productCardTitleUser: {
    color: "#fff",
  },
  productCardPrice: {
    fontSize: 15,
    fontWeight: "700",
    color: c.primary,
  },
  productCardPriceUser: {
    color: "rgba(255,255,255,0.9)",
  },
  dateDivider: { flexDirection: "row", alignItems: "center", marginVertical: 12, paddingHorizontal: 4 },
  dateDividerLine: { flex: 1, height: 1, backgroundColor: c.border },
  dateDividerText: { fontSize: 12, color: c.muted, marginHorizontal: 10, fontWeight: "600", backgroundColor: c.background, paddingHorizontal: 4 },
  inputSticky: { backgroundColor: c.background, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10, borderTopWidth: 1, borderTopColor: c.border, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: -3 }, elevation: 6 },
  inputWrapper: { flexDirection: "row", alignItems: "flex-end", gap: 8, justifyContent: "space-between" },
  inputField: { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: c.surface, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 4, borderWidth: 1, borderColor: c.border, minHeight: 44 },
  textInput: { flex: 1, fontSize: 16, maxHeight: 120, paddingTop: 8, paddingBottom: 8, color: c.dark, ...(Platform.OS === "web" ? { outlineStyle: "none", outlineWidth: 0 } : {}) },
  sendButton: { width: 44, height: 44, borderRadius: radius.pill, justifyContent: "center", alignItems: "center" },
  sendButtonDisabled: { backgroundColor: c.muted, opacity: 0.5 },
});