import { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
  Keyboard,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useChat } from "../context/ChatContext";
import { useToast } from "../context/ToastContext";
import { colors } from "../theme/colors";

export const ChatScreen = ({ route, navigation, seller }) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { getConversationBySeller, addConversation, updateConversation } =
    useChat();
  const toast = useToast();
  const sellerData = route?.params?.seller || seller;
  const [messages, setMessages] = useState([]);
  const [groupedMessages, setGroupedMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [conversation, setConversation] = useState(null);
  const flatListRef = useRef(null);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  // Opening animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  // Format date for display
  const formatDate = (date) => {
    const messageDate = new Date(date);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (messageDate.toDateString() === today.toDateString()) {
      return "Today";
    } else if (messageDate.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    } else {
      return messageDate.toLocaleDateString([], {
        weekday: "long",
        month: "short",
        day: "numeric",
      });
    }
  };

  // Group messages by date with separators
  const groupMessagesByDate = (messages) => {
    const grouped = [];
    let currentDate = null;

    messages.forEach((message) => {
      const messageDate = new Date(message.created_at).toDateString();

      if (messageDate !== currentDate) {
        grouped.push({
          id: `date-${messageDate}`,
          type: "date",
          date: message.created_at,
        });
        currentDate = messageDate;
      }

      grouped.push({
        ...message,
        type: "message",
      });
    });

    return grouped;
  };

  useEffect(() => {
    setGroupedMessages(groupMessagesByDate(messages));
  }, [messages]);

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
      supabase.removeAllChannels();
    };
  }, [user, sellerData]);

  useEffect(() => {
    if (conversation) {
      const cleanup = setupRealtimeSubscription();
      return cleanup;
    }
  }, [conversation]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (flatListRef.current && groupedMessages.length > 0) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  }, [groupedMessages]);

  // Scroll to bottom when keyboard is dismissed
  useEffect(() => {
    const keyboardDidHideListener = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => {
        // Delay to ensure layout has settled after keyboard dismissal
        setTimeout(() => {
          if (flatListRef.current && groupedMessages.length > 0) {
            flatListRef.current.scrollToEnd({ animated: true });
          }
        }, 100);
      },
    );

    return () => {
      keyboardDidHideListener.remove();
    };
  }, [groupedMessages]);

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
    } catch (error) {
      console.error("Error fetching messages:", error);
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
              // Add new message
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

  const sendMessage = async () => {
    if (!newMessage.trim() || !conversation || sending) return;

    const messageText = newMessage.trim();
    setSending(true);

    // Optimistically add message to local state
    const tempMessage = {
      id: `temp-${Date.now()}`, // Temporary ID
      conversation_id: conversation.id,
      sender_id: user.id,
      sender_type: "user",
      message: messageText,
      created_at: new Date().toISOString(),
      isTemporary: true, // Flag to identify temporary messages
    };

    setMessages((prev) => [...prev, tempMessage]);
    setNewMessage("");

    try {
      const { error } = await supabase.from("express_chat_messages").insert({
        conversation_id: conversation.id,
        sender_id: user.id,
        sender_type: "user",
        message: messageText,
      });

      if (error) throw error;

      // Update conversation in context with new last message
      const updatedConv = {
        ...conversation,
        last_message: messageText,
        last_message_at: new Date().toISOString(),
      };
      updateConversation(updatedConv);

      // Note: The realtime subscription will replace the temporary message with the real one
      // No need to manually replace here as the database trigger will send the update
    } catch (error) {
      console.error("Error sending message:", error);
      toast.error("Failed to send message");

      // Remove the temporary message on error
      setMessages((prev) => prev.filter((msg) => msg.id !== tempMessage.id));
      setNewMessage(messageText); // Restore the message text
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }) => {
    const isUser = item.sender_type === "user";

    return (
      <View style={styles.messageWrapper}>
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
        <View style={styles.messageTimeContainer}>
          <Text
            style={[
              styles.messageTimeExternal,
              isUser
                ? styles.userMessageTimeExternal
                : styles.sellerMessageTimeExternal,
            ]}
          >
            {new Date(item.created_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
          {isUser && (
            <Ionicons
              name="checkmark"
              size={12}
              color={colors.primary}
              style={styles.messageTick}
            />
          )}
        </View>
      </View>
    );
  };

  const renderDateSeparator = ({ item }) => (
    <View style={styles.dateSeparator}>
      <Text style={styles.dateSeparatorText}>{formatDate(item.date)}</Text>
    </View>
  );

  const renderItem = ({ item }) => {
    if (item.type === "date") {
      return renderDateSeparator({ item });
    }
    return renderMessage({ item });
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <View style={styles.headerContent}>
          <Pressable
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color={colors.dark} />
          </Pressable>
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
              <Text style={styles.headerSubtitle}>Online</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <Pressable style={styles.headerButton}>
              <Ionicons name="call-outline" size={20} color={colors.dark} />
            </Pressable>
            <Pressable style={styles.headerButton}>
              <Ionicons
                name="ellipsis-vertical"
                size={20}
                color={colors.dark}
              />
            </Pressable>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.chatContainer}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={groupedMessages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.messagesList}
          style={styles.flatList}
        />
      </KeyboardAvoidingView>

      <View style={[styles.inputContainer, { bottom: insets.bottom }]}>
        <View style={styles.inputWrapper}>
          <Pressable style={styles.attachButton}>
            <Ionicons
              name="add-circle-outline"
              size={24}
              color={colors.muted}
            />
          </Pressable>
          <TextInput
            style={styles.textInput}
            value={newMessage}
            onChangeText={setNewMessage}
            placeholder="Type a message..."
            placeholderTextColor={colors.muted}
            multiline
            maxLength={500}
          />
          <Pressable style={styles.emojiButton}>
            <Ionicons name="happy-outline" size={20} color={colors.muted} />
          </Pressable>
        </View>
        <Pressable
          style={[
            styles.sendButton,
            (!newMessage.trim() || sending) && styles.sendButtonDisabled,
          ]}
          onPress={sendMessage}
          disabled={!newMessage.trim() || sending}
        >
          <Ionicons name="send" size={20} color="#fff" />
        </Pressable>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e1e1e1",
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.light,
    alignItems: "center",
    justifyContent: "center",
  },
  headerInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginLeft: 12,
  },
  sellerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.light,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.dark,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.muted,
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.light,
    alignItems: "center",
    justifyContent: "center",
  },
  chatContainer: {
    flex: 1,
  },
  messagesList: {
    padding: 16,
    paddingBottom: 20,
  },
  messageWrapper: {
    marginBottom: 16,
  },
  messageContainer: {
    maxWidth: "75%",
    padding: 12,
    borderRadius: 18,
    shadowColor: "#aaa9a91e",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  userMessage: {
    alignSelf: "flex-end",
    backgroundColor: "#eeededa1",
    borderBottomRightRadius: 4,
  },
  sellerMessage: {
    alignSelf: "flex-start",
    backgroundColor: "#f0f0f0",
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
    color: "#333",
  },
  userMessageText: {
    color: "#333",
  },
  messageTime: {
    fontSize: 11,
    color: "#666",
    marginTop: 6,
    alignSelf: "flex-end",
  },
  userMessageTime: {
    color: "#666",
  },
  messageTimeExternal: {
    fontSize: 10,
    color: "#999",
    marginTop: 4,
    textAlign: "right",
  },
  userMessageTimeExternal: {
    textAlign: "right",
  },
  sellerMessageTimeExternal: {
    textAlign: "left",
  },
  dateSeparator: {
    alignItems: "center",
    marginVertical: 16,
    paddingHorizontal: 16,
  },
  dateSeparatorText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    overflow: "hidden",
  },
  inputContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 16,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e1e1e1",
    gap: 12,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: "#f8f9fa",
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  attachButton: {
    padding: 4,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    maxHeight: 100,
    color: colors.dark,
  },
  emojiButton: {
    padding: 4,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  flatList: {
    flex: 1,
  },
  messageTimeContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  messageTick: {
    marginLeft: 4,
  },
});
