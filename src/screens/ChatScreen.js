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
  Image,
  Keyboard,
  ActivityIndicator,
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
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [conversation, setConversation] = useState(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const flatListRef = useRef(null);

  // Handle keyboard visibility
  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => setKeyboardVisible(true)
    );
    const keyboardDidHideListener = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardVisible(false)
    );

    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, []);

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
        flatListRef.current?.scrollToEnd({ animated: false });
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
                msg.sender_type === payload.new.sender_type
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
        }
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
    if (!newMessage.trim() || !conversation || sending) return;

    const messageText = newMessage.trim();
    setSending(true);

    // Optimistically add message to local state
    const tempMessage = {
      id: `temp-${Date.now()}`,
      conversation_id: conversation.id,
      sender_id: user.id,
      sender_type: "user",
      message: messageText,
      created_at: new Date().toISOString(),
      isTemporary: true,
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
    } catch (error) {
      console.error("Error sending message:", error);
      toast.error("Failed to send message");

      // Remove the temporary message on error
      setMessages((prev) => prev.filter((msg) => msg.id !== tempMessage.id));
      setNewMessage(messageText);
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }) => {
    const isUser = item.sender_type === "user";

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
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
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
              <View style={styles.statusRow}>
                <View style={styles.statusDot} />
                <Text style={styles.headerSubtitle}>Store</Text>
              </View>
            </View>
          </View>
          <Pressable style={styles.headerAction}>
            <Ionicons name="ellipsis-vertical" size={20} color={colors.muted} />
          </Pressable>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.chatContainer}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={[
            styles.messagesList,
            { paddingBottom: 100 + insets.bottom },
          ]}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: true })
          }
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
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
      </KeyboardAvoidingView>

      <View
        style={[
          styles.inputContainer,
          { paddingBottom: Math.max(insets.bottom, 16) },
        ]}
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
            style={[
              styles.sendButton,
              (!newMessage.trim() || sending) && styles.sendButtonDisabled,
            ]}
            onPress={sendMessage}
            disabled={!newMessage.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={20} color="#fff" />
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light,
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
    backgroundColor: "#10B981",
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
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: colors.light,
    borderRadius: 25,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
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
});
