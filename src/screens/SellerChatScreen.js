import { useEffect, useState, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
  Keyboard,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { colors, getTheme } from "../theme/colors";

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
}) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const toast = useToast();
  const conversation = embeddedConversation || route?.params?.conversation;
  const sellerId = route?.params?.sellerId || user?.id;
  const seller = route?.params?.seller;

  const theme = getTheme(seller?.theme_color || colors.primary);

  const userName =
    conversation?.user?.full_name || conversation?.user?.email || "Customer";

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
    if (conversation) {
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
  }, [conversation]);

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
      setTimeout(() => scrollToBottom(false, true), 100);
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
  }, [conversation]);

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

      <KeyboardAvoidingView
        style={[styles.chatContainer]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={insets.top + 70}
      >
        <FlatList
          ref={flatListRef}
          data={enrichedMessages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={[styles.messagesList, { paddingBottom: inputHeight + insets.bottom + keyboardHeight + 16 }]}
          onContentSizeChange={() => scrollToBottom(true)}
          onLayout={() => {
            if (!didInitialAutoScrollRef.current) {
              didInitialAutoScrollRef.current = true;
              scrollToBottom(false, true);
            }
          }}
          onScroll={updateNearBottomState}
          scrollEventThrottle={16}
        />

        <View
          onLayout={(e) => setInputHeight(e.nativeEvent.layout.height)}
          style={[styles.inputContainer, { marginBottom: keyboardHeight + insets.bottom }]}
        >
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.textInput}
              value={newMessage}
              onChangeText={setNewMessage}
              placeholder="Type a message..."
              placeholderTextColor={colors.muted}
              multiline
              maxLength={1000}
            />
            <Pressable
              style={[styles.sendButton, { backgroundColor: theme.primary }, (!newMessage.trim() || sending) && styles.sendButtonDisabled]}
              onPress={sendMessage}
              disabled={!newMessage.trim() || sending}
            >
              {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={20} color="#fff" />}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );

  return embedded ? content : <View style={{ flex: 1 }}>{content}</View>;
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: "#fff", paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  headerContent: { flexDirection: "row", alignItems: "center" },
  backButton: { padding: 8, marginRight: 8, borderRadius: 20, backgroundColor: colors.light },
  headerInfo: { flex: 1, flexDirection: "row", alignItems: "center" },
  userAvatar: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.light, justifyContent: "center", alignItems: "center", marginRight: 12, overflow: "hidden" },
  avatarImg: { width: "100%", height: "100%" },
  headerTitle: { fontSize: 17, fontWeight: "700", color: colors.dark },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  headerSubtitle: { fontSize: 12, color: colors.muted },
  headerAction: { padding: 8 },
  chatContainer: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.light, gap: 8 },
  loadingText: { color: colors.muted, fontSize: 15 },
  messagesList: { padding: 16, paddingBottom: 32 },
  messageWrapper: { marginBottom: 16, maxWidth: "85%" },
  userWrapper: { alignSelf: "flex-start" },
  sellerWrapper: { alignSelf: "flex-end", alignItems: "flex-end" },
  messageContainer: { padding: 12, borderRadius: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  userMessage: { backgroundColor: "#fff", borderBottomLeftRadius: 4 },
  sellerMessage: { borderBottomRightRadius: 4 },
  messageText: { fontSize: 16, lineHeight: 22, color: colors.dark },
  sellerMessageText: { color: "#fff" },
  messageTime: { fontSize: 11, color: colors.muted, marginTop: 4, marginHorizontal: 4 },
  dateDivider: { flexDirection: "row", alignItems: "center", marginVertical: 12, paddingHorizontal: 4 },
  dateDividerLine: { flex: 1, height: 1, backgroundColor: "#E5E7EB" },
  dateDividerText: { fontSize: 12, color: colors.muted, marginHorizontal: 10, fontWeight: "600", backgroundColor: colors.background, paddingHorizontal: 4 },
  inputContainer: { backgroundColor: "#fff", paddingHorizontal: 16, padding: 16, borderTopWidth: 1, borderTopColor: "#f0f0f0" },
  inputWrapper: { flexDirection: "row", alignItems: "flex-end", backgroundColor: colors.light, borderRadius: 25, paddingHorizontal: 16, paddingVertical: 8, gap: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 3 },
  textInput: { flex: 1, fontSize: 16, maxHeight: 120, paddingTop: 8, paddingBottom: 8, color: colors.dark, ...(Platform.OS === "web" ? { outlineStyle: "none", outlineWidth: 0 } : {}) },
  sendButton: { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center" },
  sendButtonDisabled: { backgroundColor: colors.muted, opacity: 0.5 },
});