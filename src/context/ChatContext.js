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

const CACHE_KEY = "conversations_cache";
const CACHE_TIMESTAMP_KEY = "conversations_cache_timestamp";
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

const ChatContext = createContext();

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
};

export const ChatProvider = ({ children }) => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [isOnline, setIsOnline] = useState(true);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

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

  // Sync conversations with server
  const syncWithServer = useCallback(async () => {
    if (!user) return;

    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("express_chat_conversations")
        .select(
          `
          id,
          user_id,
          seller_id,
          last_message,
          last_message_at,
          created_at,
          updated_at,
          express_sellers!seller_id(id, name, avatar)
        `,
        )
        .eq("user_id", user.id)
        .order("last_message_at", { ascending: false });

      if (error) throw error;

      // Map the data to have a 'seller' property for consistency
      const conversationsData = (data || []).map(conv => ({
        ...conv,
        seller: conv.express_sellers
      }));

      setConversations(conversationsData);
      await saveToCache(conversationsData);
      setIsOnline(true);
    } catch (error) {
      console.error("Error syncing with server:", error);
      setIsOnline(false);
    } finally {
      setIsLoading(false);
    }
  }, [user, saveToCache]);

  // Setup real-time subscription
  const setupRealtimeSubscription = useCallback(() => {
    if (!user) return;

    const channel = supabase
      .channel(`user-chats-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "express_chat_conversations",
          filter: `user_id=eq.${user.id}`,
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
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          syncWithServer();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, syncWithServer]);

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

  // Refresh conversations (for pull-to-refresh)
  const refreshConversations = useCallback(async () => {
    await syncWithServer();
  }, [syncWithServer]);

  // Get conversation by seller ID
  const getConversationBySeller = useCallback(
    (sellerId) => {
      return conversations.find((conv) => conv.seller_id === sellerId);
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

  const value = {
    conversations,
    isOnline,
    lastSyncTime,
    isLoading,
    refreshConversations,
    getConversationBySeller,
    addConversation,
    updateConversation,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};
