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

const CARD_WIDTH = Math.min(Dimensions.get("window").width * 0.65, 260);
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useChat } from "../context/ChatContext";
import { useToast } from "../context/ToastContext";
import { colors } from "../theme/colors";

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

export const ChatScreen = ({ route, navigation, seller }) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { getConversationBySeller, addConversation, updateConversation } =
    useChat();
  const toast = useToast();
  const sellerData = route?.params?.seller || seller;
  const routeProduct = route?.params?.product || null;
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [pendingProduct, setPendingProduct] = useState(routeProduct);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [conversation, setConversation] = useState(null);
  const [sellerOnline, setSellerOnline] = useState(false);
  const [sellerLastSeenAt, setSellerLastSeenAt] = useState(
    sellerData?.last_seen_at || null,
  );
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [inputHeight, setInputHeight] = useState(72);
  // keyboardVisible state removed; not needed for padding logic
  const flatListRef = useRef(null);
  const presenceChannelRef = useRef(null);
  const sellerLastSeenChannelRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const didInitialAutoScrollRef = useRef(false);

  const BOTTOM_AUTO_SCROLL_THRESHOLD = 120;

  const updateNearBottomState = (event) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom =
      contentSize.height - (contentOffset.y + layoutMeasurement.height);
    isNearBottomRef.current =
      distanceFromBottom <= BOTTOM_AUTO_SCROLL_THRESHOLD;
  };

  const scrollToBottom = (animated = true, force = false) => {
    if (!force && !isNearBottomRef.current) return;

    requestAnimationFrame(() => {
      flatListRef.current?.scrollToEnd({ animated });
    });
  };

  const handleMessageImageLoad = () => {
    scrollToBottom(false);
    setTimeout(() => {
      scrollToBottom(false);
    }, 60);
  };

  // keyboard visibility listeners were removed; not required anymore

  const initializeChat = async () => {
    try {
      // Check if conversation already exists in context
      const existingConversation = getConversationBySeller(sellerData.id);

      if (existingConversation) {
        setConversation(existingConversation);
        await fetchMessages(existingConversation.id);
      } else {
        // Create new conversation
        const newConv = await fetchOrCreateConversation();
        if (newConv) {
          await fetchMessages(newConv.id);
        }
      }
    } catch (error) {
      console.error("Error initializing chat:", error);
      toast.error("Failed to load chat");
    }
  };

  useEffect(() => {
    if (user && sellerData) {
      initializeChat();
    }

    return () => {
      if (presenceChannelRef.current) {
        supabase.removeChannel(presenceChannelRef.current);
        presenceChannelRef.current = null;
      }
    };
  }, [user, sellerData]);

  useEffect(() => {
    if (conversation) {
      const cleanup = setupRealtimeSubscription();
      fetchSellerLastSeen();
      setupSellerLastSeenSubscription();
      setupPresence();
      return () => {
        cleanup?.();
        if (sellerLastSeenChannelRef.current) {
          supabase.removeChannel(sellerLastSeenChannelRef.current);
          sellerLastSeenChannelRef.current = null;
        }
      };
    }
  }, [conversation]);

  // Keyboard listeners to track keyboard height and adjust layout
  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = (e) => {
      const height = e?.endCoordinates?.height || 0;
      setKeyboardHeight(height);
    };

    const onHide = () => {
      setKeyboardHeight(0);
    };

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const setupPresence = () => {
    if (!sellerData?.id) return;

    const channel = supabase.channel(`presence:seller:${sellerData.id}`);

    const syncSellerPresence = () => {
      const state = channel.presenceState();
      const isSellerCurrentlyOnline = Object.values(state).some((presences) =>
        presences.some((presence) => presence.actor_type === "seller"),
      );
      setSellerOnline(isSellerCurrentlyOnline);
      if (!isSellerCurrentlyOnline) {
        fetchSellerLastSeen();
      }
    };

    channel
      .on("presence", { event: "sync" }, syncSellerPresence)
      .on("presence", { event: "join" }, syncSellerPresence)
      .on("presence", { event: "leave" }, syncSellerPresence)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          syncSellerPresence();
        }
      });

    presenceChannelRef.current = channel;
  };

  const fetchSellerLastSeen = async () => {
    if (!sellerData?.id) return;

    try {
      const { data, error } = await supabase
        .from("express_sellers")
        .select("last_seen_at")
        .eq("id", sellerData.id)
        .single();

      if (error) throw error;
      setSellerLastSeenAt(data?.last_seen_at || null);
    } catch (error) {
      console.error("Error fetching seller last seen:", error);
    }
  };

  const setupSellerLastSeenSubscription = () => {
    if (!sellerData?.id) return;

    const channel = supabase
      .channel(`seller-last-seen:${sellerData.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "express_sellers",
          filter: `id=eq.${sellerData.id}`,
        },
        (payload) => {
          setSellerLastSeenAt(payload.new.last_seen_at || null);
        },
      )
      .subscribe();

    sellerLastSeenChannelRef.current = channel;
  };

  const fetchOrCreateConversation = async () => {
    try {
      // First try to find existing conversation
      const { data: existingConv, error: fetchError } = await supabase
        .from("express_chat_conversations")
        .select("*")
        .eq("user_id", user.id)
        .eq("seller_id", sellerData.id)
        .single();

      if (existingConv && !fetchError) {
        addConversation(existingConv);
        setConversation(existingConv);
        return existingConv;
      }

      // Create new conversation if none exists
      const { data: newConv, error: createError } = await supabase
        .from("express_chat_conversations")
        .insert({
          user_id: user.id,
          seller_id: sellerData.id,
        })
        .select()
        .single();

      if (createError) throw createError;

      addConversation(newConv);
      setConversation(newConv);
      return newConv;
    } catch (error) {
      console.error("Error fetching/creating conversation:", error);
      toast.error("Failed to start conversation");
      return null;
    }
  };

  const fetchMessages = async (conversationId) => {
    if (!conversationId) return;

    try {
      const { data, error } = await supabase
        .from("express_chat_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setMessages(data || []);

      // Auto scroll to bottom after messages are loaded
      setTimeout(() => {
        scrollToBottom(false, true);
      }, 100);
    } catch (error) {
      console.error("Error fetching messages:", error);
    } finally {
      setLoading(false);
    }
  };

  const setupRealtimeSubscription = () => {
    if (!conversation) return;

    const channel = supabase
      .channel(`chat-${conversation.id}`)
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
            // Avoid duplicates
            if (prev.some((m) => m.id === payload.new.id)) return prev;
            // Check if this message was already added optimistically
            const existingIndex = prev.findIndex(
              (msg) =>
                msg.isTemporary &&
                msg.sender_id === payload.new.sender_id &&
                msg.message === payload.new.message &&
                msg.sender_type === payload.new.sender_type,
            );

            if (existingIndex >= 0) {
              // Replace the temporary message with the real one
              const updated = [...prev];
              updated[existingIndex] = payload.new;
              return updated;
            } else {
              if (payload.new.sender_id !== user.id) {
                markAsRead(); // Mark incoming message as read if we are viewing the chat
              }
              return [...prev, payload.new];
            }
          });

          // Update conversation in context with new last message
          const updatedConv = {
            ...conversation,
            last_message: payload.new.message,
            last_message_at: payload.new.created_at,
          };
          updateConversation(updatedConv);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  useEffect(() => {
    if (messages.length > 0) {
      markAsRead();
    }
  }, [messages]);

  const markAsRead = async () => {
    if (!conversation || !user) return;

    try {
      const { error } = await supabase
        .from("express_chat_messages")
        .update({ is_read: true })
        .eq("conversation_id", conversation.id)
        .neq("sender_id", user.id)
        .eq("is_read", false);

      if (error) throw error;
    } catch (error) {
      console.error("Error marking messages as read:", error);
    }
  };

  const sendMessage = async () => {
    const hasText = newMessage.trim();
    if (!hasText && !pendingProduct) return;
    if (!conversation || sending) return;

    setSending(true);
    const messageText = hasText || "";

    const messagesToInsert = [];
    if (pendingProduct) {
      messagesToInsert.push(
        `PRODUCT_CARD:${JSON.stringify({
          id: pendingProduct.id,
          title: pendingProduct.title,
          price: pendingProduct.price,
          discount: pendingProduct.discount,
          image: pendingProduct.image,
        })}`,
      );
    }
    if (messageText) messagesToInsert.push(messageText);

    // Optimistically add messages
    const tempMessages = messagesToInsert.map((msg, idx) => ({
      id: `temp-${Date.now()}-${idx}`,
      conversation_id: conversation.id,
      sender_id: user.id,
      sender_type: "user",
      message: msg,
      created_at: new Date().toISOString(),
      isTemporary: true,
    }));

    setMessages((prev) => [...prev, ...tempMessages]);
    setNewMessage("");
    setPendingProduct(null);

    try {
      const { error } = await supabase.from("express_chat_messages").insert(
        messagesToInsert.map((msg) => ({
          conversation_id: conversation.id,
          sender_id: user.id,
          sender_type: "user",
          message: msg,
        })),
      );

      if (error) throw error;

      updateConversation({
        ...conversation,
        last_message: messageText || "Shared a product",
        last_message_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error sending message:", error);
      toast.error("Failed to send message");
      setMessages((prev) =>
        prev.filter((msg) => !tempMessages.some((t) => t.id === msg.id)),
      );
      setNewMessage(messageText);
      if (pendingProduct === null && routeProduct)
        setPendingProduct(routeProduct);
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
        result.push({
          id: `divider-${dateKey}`,
          type: "date_divider",
          date: msg.created_at,
        });
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

    const isUser = item.sender_type === "user";
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
        <View
          style={[
            styles.messageWrapper,
            isUser ? styles.userWrapper : styles.sellerWrapper,
          ]}
        >
          <View
            style={[
              styles.productCardBubble,
              isUser
                ? styles.productCardBubbleUser
                : styles.productCardBubbleSeller,
            ]}
          >
            {productData?.image && (
              <Image
                source={{ uri: productData.image }}
                style={styles.productCardImage}
                resizeMode="cover"
                onLoadEnd={handleMessageImageLoad}
                onError={handleMessageImageLoad}
              />
            )}
            <View style={styles.productCardBody}>
              <Text
                style={[
                  styles.productCardTitle,
                  isUser && styles.productCardTitleUser,
                ]}
                numberOfLines={2}
              >
                {productData?.title || "Product"}
              </Text>
              <Text
                style={[
                  styles.productCardPrice,
                  isUser && styles.productCardPriceUser,
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
      <View
        style={[
          styles.messageWrapper,
          isUser ? styles.userWrapper : styles.sellerWrapper,
        ]}
      >
        <View
          style={[
            styles.messageContainer,
            isUser ? styles.userMessage : styles.sellerMessage,
          ]}
        >
          <Text style={[styles.messageText, isUser && styles.userMessageText]}>
            {item.message}
          </Text>
        </View>
        <Text style={styles.messageTime}>
          {new Date(item.created_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading chat...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={insets.top + 70}
    >
      <View
        style={[
          styles.header,
          { paddingTop: navigation ? insets.top + 10 : 16 },
        ]}
      >
        <View style={styles.headerContent}>
          {navigation && (
            <Pressable
              style={styles.backButton}
              onPress={() => navigation.goBack()}
            >
              <Ionicons name="arrow-back" size={24} color={colors.dark} />
            </Pressable>
          )}
          <View style={styles.headerInfo}>
            <View style={styles.sellerAvatar}>
              {sellerData?.avatar ? (
                <Image
                  source={{ uri: sellerData.avatar }}
                  style={styles.avatarImage}
                />
              ) : (
                <Ionicons name="storefront" size={20} color={colors.primary} />
              )}
            </View>
            <View>
              <Text style={styles.headerTitle}>
                {sellerData?.name || "Seller"}
              </Text>
              <View style={styles.statusRow}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: sellerOnline ? "#10B981" : "#9CA3AF" },
                  ]}
                />
                <Text style={styles.headerSubtitle}>
                  {getPresenceSubtitle(sellerOnline, sellerLastSeenAt)}
                </Text>
              </View>
            </View>
          </View>
          <Pressable style={styles.headerAction}>
            <Ionicons name="ellipsis-vertical" size={20} color={colors.muted} />
          </Pressable>
        </View>
      </View>

      <View style={styles.chatContainer}>
        <FlatList
          ref={flatListRef}
          data={enrichedMessages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.messagesList,
            {
              paddingBottom: inputHeight + insets.bottom + keyboardHeight + 16,
            },
          ]}
          onContentSizeChange={() => scrollToBottom(true)}
          onLayout={() => {
            if (!didInitialAutoScrollRef.current) {
              didInitialAutoScrollRef.current = true;
              scrollToBottom(false, true);
            }
          }}
          onScroll={updateNearBottomState}
          scrollEventThrottle={16}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <View style={styles.emptyChatIcon}>
                <Ionicons
                  name="chatbubbles-outline"
                  size={40}
                  color={colors.primary}
                />
              </View>
              <Text style={styles.emptyChatText}>No messages yet</Text>
              <Text style={styles.emptyChatSubtext}>
                Send a message to start the conversation
              </Text>
            </View>
          }
        />
      </View>

      <View
        onLayout={(e) => setInputHeight(e.nativeEvent.layout.height)}
        style={[
          styles.inputContainer,
          { marginBottom: keyboardHeight + insets.bottom },
        ]}
      >
        {pendingProduct && (
          <View style={styles.productAttachment}>
            {pendingProduct.image ? (
              <Image
                source={{ uri: pendingProduct.image }}
                style={styles.productAttachmentImage}
              />
            ) : (
              <View style={styles.productAttachmentImagePlaceholder}>
                <Ionicons
                  name="cube-outline"
                  size={22}
                  color={colors.primary}
                />
              </View>
            )}
            <View style={styles.productAttachmentInfo}>
              <Text style={styles.productAttachmentLabel}>Sharing product</Text>
              <Text style={styles.productAttachmentTitle} numberOfLines={1}>
                {pendingProduct.title}
              </Text>
            </View>
            <Pressable
              style={styles.productAttachmentRemove}
              onPress={() => setPendingProduct(null)}
            >
              <Ionicons name="close" size={18} color={colors.muted} />
            </Pressable>
          </View>
        )}
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
            style={[
              styles.sendButton,
              (!newMessage.trim() || sending) && styles.sendButtonDisabled,
            ]}
            onPress={sendMessage}
            disabled={(!newMessage.trim() && !pendingProduct) || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={20} color="#fff" />
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    padding: 8,
    marginRight: 8,
    borderRadius: 20,
    backgroundColor: colors.light,
  },
  headerInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  sellerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: colors.light,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.dark,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.muted,
  },
  headerAction: {
    padding: 8,
  },
  chatContainer: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.light,
    gap: 12,
  },
  loadingText: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "500",
  },
  messagesList: {
    padding: 16,
    paddingBottom: 32,
  },
  messageWrapper: {
    marginBottom: 16,
    maxWidth: "85%",
  },
  userWrapper: {
    alignSelf: "flex-end",
    alignItems: "flex-end",
  },
  sellerWrapper: {
    alignSelf: "flex-start",
  },
  messageContainer: {
    padding: 12,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  userMessage: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  sellerMessage: {
    backgroundColor: "#fff",
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
    color: colors.dark,
  },
  userMessageText: {
    color: "#fff",
  },
  messageTime: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 4,
    marginHorizontal: 4,
  },
  emptyChat: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyChatIcon: {
    width: 80,
    height: 80,
    borderRadius: 25,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    shadowColor: colors.primary,
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  emptyChatText: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.dark,
    marginBottom: 4,
  },
  emptyChatSubtext: {
    fontSize: 14,
    color: colors.muted,
  },
  inputContainer: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
    // keep input in normal layout flow to avoid overflow
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: colors.light,
    borderRadius: 25,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    // elevate the input container for visual separation
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    maxHeight: 120,
    paddingTop: 8,
    paddingBottom: 8,
    color: colors.dark,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  sendButtonDisabled: {
    backgroundColor: colors.muted,
    opacity: 0.5,
  },
  productAttachment: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.light,
    borderRadius: 14,
    marginBottom: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.primary + "30",
  },
  productAttachmentImage: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
  },
  productAttachmentImagePlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: colors.light,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.primary + "30",
  },
  productAttachmentInfo: {
    flex: 1,
  },
  productAttachmentLabel: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  productAttachmentTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.dark,
  },
  productAttachmentRemove: {
    padding: 4,
  },
  productCardBubble: {
    borderRadius: 16,
    overflow: "hidden",
    width: CARD_WIDTH,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  productCardBubbleUser: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  productCardBubbleSeller: {
    backgroundColor: "#fff",
    borderBottomLeftRadius: 4,
  },
  productCardImage: {
    width: CARD_WIDTH,
    height: 160,
    backgroundColor: "#F3F4F6",
  },
  productCardBody: {
    padding: 12,
  },
  productCardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.dark,
    marginBottom: 4,
    lineHeight: 20,
  },
  productCardTitleUser: {
    color: "#fff",
  },
  productCardPrice: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.primary,
  },
  productCardPriceUser: {
    color: "rgba(255,255,255,0.9)",
  },
  dateDivider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 12,
    paddingHorizontal: 8,
  },
  dateDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#E5E9F0",
  },
  dateDividerText: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: "600",
    marginHorizontal: 10,
    letterSpacing: 0.3,
  },
});
