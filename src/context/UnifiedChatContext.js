// Unified Chat Context for both Customers and Sellers
// This context handles chat functionality for both user roles

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";

const CACHE_KEY = "unified_conversations_cache";
const CACHE_TIMESTAMP_KEY = "unified_conversations_cache_timestamp";
const CACHE_DURATION = 5 *23 * 1000; // 5 minutes

const UnifiedChatContext = createContext();

export const useUnifiedChat = () => {
  const context = useContext(UnifiedChatContext);
  if (!context) {
    throw new Error("useUnifiedChat must be used within a UnifiedChatProvider");
  }
  return context;
};

export const UnifiedChatProvider = ({ children }) => {
  const { user, role } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [isOnline, setIsOnline] = useState(true);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeRole, setActiveRole] = useState(role || 'customer'); // 'customer' or 'seller'

  // Load conversations from cache
  const loadFromCache = useCallback(async () => {
    try {
      const cachedData = await AsyncStorage.getItem(CACHE_KEY);
      const cachedTimestamp = await AsyncStorage.getItem(CACHE_TIMESTAMP_KEY);

      if (cachedData && cachedTimestamp) {
        const cacheTime = parseInt(cachedTimestamp);
        const now = Date.now();

        // Use cache if it's less than CACHE_DURATION old
        if (now - cacheTime < CACHE_DURATION) {
          const parsedConversations = JSON.parse(cachedData);
          setConversations(parsedConversations);
          setLastSyncTime(new Date(cacheTime));
          return true;
        }
      }
    } catch (error) {
      console.error("Error loading from cache:", error);
    }
    return false;
  }, []);

  // Save conversations to cache
  const saveToCache = useCallback(async (conversationsData) => {
    try {
      const timestamp = Date.now().toString();
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(conversationsData));
      await AsyncStorage.setItem(CACHE_TIMESTAMP_KEY, timestamp);
      setLastSyncTime(new Date());
    } catch (error) {
      console.error("Error saving to cache:", error);
    }
  }, []);

  // Sync conversations with server based on user role
  const syncWithServer = useCallback(async () => {
    if (!user) return;

    try {
      setIsLoading(true);
      
      let query;
      
      if (activeRole === 'seller') {
        // For sellers: fetch conversations where they are the seller
        query = supabase
          .from("express_chat_conversations")
          .select(`
            id,
            user_id,
            seller_id,
            last_message,
            last_message_at,
            created_at,
            updated_at,
            express_profiles!user_id(id, email, full_name, avatar_url),
            express_sellers!seller_id(id, name, avatar)
          `)
          .eq("seller_id", user.id)
          .order("last_message_at", { ascending: false });
      } else {
        // For customers: fetch conversations where they are the user
        query = supabase
          .from("express_chat_conversations")
          .select(`
            id,
            user_id,
            seller_id,
            last_message,
            last_message_at,
            created_at,
            updated_at,
            express_sellers!seller_id(id, name, avatar),
            express_profiles!user_id(id, email, full_name, avatar_url)
          `)
          .eq("user_id", user.id)
          .order("last_message_at", { ascending: false });
      }

      const { data, error } = await query;

      if (error) throw error;

      // Format conversations based on role
      const conversationsData = (data || []).map(conv => {
        if (activeRole === 'seller') {
          // For sellers, the other party is the customer (user)
          return {
            ...conv,
            customer: conv.express_profiles,
            seller: conv.express_sellers,
            otherParty: conv.express_profiles // alias for unified interface
          };
        } else {
          // For customers, the other party is the seller
          return {
            ...conv,
            seller: conv.express_sellers,
            customer: conv.express_profiles,
            otherParty: conv.express_sellers // alias for unified interface
          };
        }
      });

      setConversations(conversationsData);
      await saveToCache(conversationsData);
      setIsOnline(true);
    } catch (error) {
      console.error("Error syncing with server:", error);
      setIsOnline(false);
    } finally {
      setIsLoading(false);
    }
  }, [user, activeRole, saveToCache]);

  // Setup real-time subscription for new messages
  const setupRealtimeSubscription = useCallback(() => {
    if (!user) return;

    const channel = supabase
      .channel(`unified-chats-${user.id}-${activeRole}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "express_chat_conversations",
          filter: activeRole === 'seller' 
            ? `seller_id=eq.${user.id}`
            : `user_id=eq.${user.id}`,
        },
        () => {
          syncWithServer();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "express_chat_conversations",
          filter: activeRole === 'seller'
            ? `seller_id=eq.${user.id}`
            : `user_id=eq.${user.id}`,
        },
        () => {
          syncWithServer();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, activeRole, syncWithServer]);

  // Initialize chat data when user changes
  useEffect(() => {
    if (!user) {
      setConversations([]);
      setLastSyncTime(null);
      return;
    }

    const initializeChat = async () => {
      // Load from cache first
      await loadFromCache();

      // Then sync with server
      await syncWithServer();

      // Setup real-time subscription
      const cleanup = setupRealtimeSubscription();

      return cleanup;
    };

    const cleanup = initializeChat();

    return () => {
      cleanup?.then?.((fn) => fn?.());
    };
  }, [user, loadFromCache, syncWithServer, setupRealtimeSubscription]);

  // Switch between customer and seller views
  const switchRole = useCallback((newRole) => {
    if (newRole !== 'customer' && newRole !== 'seller') return;
    setActiveRole(newRole);
    setConversations([]); // Clear conversations when switching role
    syncWithServer(); // Fetch new conversations for the role
  }, [syncWithServer]);

  // Refresh conversations (for pull-to-refresh)
  const refreshConversations = useCallback(async () => {
    await syncWithServer();
  }, [syncWithServer]);

  // Get conversation by other party ID
  const getConversationByOtherParty = useCallback(
    (otherPartyId) => {
      return conversations.find((conv) => 
        activeRole === 'seller' 
          ? conv.user_id === otherPartyId
          : conv.seller_id === otherPartyId
      );
    },
    [conversations, activeRole],
  );

  // Get conversation by ID
  const getConversationById = useCallback(
    (conversationId) => {
      return conversations.find((conv) => conv.id === conversationId);
    },
    [conversations],
  );

  // Add new conversation (when starting a new chat)
  const addConversation = useCallback((newConversation) => {
    setConversations((prev) => {
      const filtered = prev.filter((conv) => conv.id !== newConversation.id);
      return [newConversation, ...filtered];
    });
  }, []);

  // Update conversation (when new message is sent/received)
  const updateConversation = useCallback((updatedConversation) => {
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === updatedConversation.id ? updatedConversation : conv,
      ),
    );
  }, []);

  // Create or find conversation
  const findOrCreateConversation = useCallback(async (otherPartyId) => {
    if (!user) return null;

    try {
      let query;
      
      if (activeRole === 'seller') {
        // Seller initiating chat with customer
        query = supabase
          .from("express_chat_conversations")
          .select("*")
          .eq("seller_id", user.id)
          .eq("user_id", otherPartyId)
          .single();
      } else {
        // Customer initiating chat with seller
        query = supabase
          .from("express_chat_conversations")
          .select("*")
          .eq("user_id", user.id)
          .eq("seller_id", otherPartyId)
          .single();
      }

      const { data: existingConv, error: fetchError } = await query;

      if (existingConv && !fetchError) {
        return existingConv;
      }

      // Create new conversation if none exists
      let insertData;
      if (activeRole === 'seller') {
        insertData = {
          seller_id: user.id,
          user_id: otherPartyId,
        };
      } else {
        insertData = {
          user_id: user.id,
          seller_id: otherPartyId,
        };
      }

      const { data: newConv, error: createError } = await supabase
        .from("express_chat_conversations")
        .insert(insertData)
        .select()
        .single();

      if (createError) throw createError;

      addConversation(newConv);
      return newConv;
    } catch (error) {
      console.error("Error finding/creating conversation:", error);
      return null;
    }
  }, [user, activeRole, addConversation]);

  // Send message
  const sendMessage = useCallback(async (conversationId, message, messageType = 'text') => {
    if (!user || !conversationId) return null;

    try {
      const senderType = activeRole === 'seller' ? 'seller' : 'user';
      
      const { data, error } = await supabase
        .from("express_chat_messages")
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          sender_type: senderType,
          message,
          message_type: messageType,
        })
        .select()
        .single();

      if (error) throw error;

      // Update conversation's last message
      await supabase
        .from("express_chat_conversations")
        .update({
          last_message: message,
          last_message_at: new Date().toISOString(),
        })
        .eq("id", conversationId);

      return data;
    } catch (error) {
      console.error("Error sending message:", error);
      return null;
    }
  }, [user, activeRole]);

  // Fetch messages for a conversation
  const fetchMessages = useCallback(async (conversationId) => {
    if (!conversationId) return [];

    try {
      const { data, error } = await supabase
        .from("express_chat_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("Error fetching messages:", error);
      return [];
    }
  }, []);

  // Mark messages as read
  const markAsRead = useCallback(async (conversationId) => {
    if (!user || !conversationId) return;

    try {
      await supabase
        .from("express_chat_messages")
        .update({ is_read: true })
        .eq("conversation_id", conversationId)
        .neq("sender_id", user.id)
        .eq("is_read", false);
    } catch (error) {
      console.error("Error marking messages as read:", error);
    }
  }, [user]);

  const value = {
    conversations,
    isOnline,
    lastSyncTime,
    isLoading,
    activeRole,
    refreshConversations,
    getConversationByOtherParty,
    getConversationById,
    addConversation,
    updateConversation,
    findOrCreateConversation,
    sendMessage,
    fetchMessages,
    markAsRead,
    switchRole,
  };

  return <UnifiedChatContext.Provider value={value}>{children}</UnifiedChatContext.Provider>;
};