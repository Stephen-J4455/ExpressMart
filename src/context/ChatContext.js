import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";

const CACHE_KEY = "conversations_cache";
const CACHE_TIMESTAMP_KEY = "conversations_cache_timestamp";
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// ── Unread message counts ────────────────────────────────────────────────────
// `express_chat_conversations` has no unread column, so the per-conversation
// badge is derived from `express_chat_messages` — rows that are still unread
// AND were sent by the other party. The conversation ids are resolved first so
// the message query stays narrow and index-friendly (`conversation_id` is
// indexed), and the sender filter is applied in memory afterwards.
//
// `direction` is "customer" for the buyer's own conversations and "seller" for
// the store's side of the same table — the "other party" flips with it.
const fetchUnreadCounts = async (userId, direction) => {
  if (!userId) return {};
  const otherParty = direction === "seller" ? "user" : "seller";

  const convoQuery =
    direction === "seller"
      ? supabase.from("express_chat_conversations").select("id").eq("seller_id", userId)
      : supabase.from("express_chat_conversations").select("id").eq("user_id", userId);

  const { data: convos, error: convoError } = await convoQuery;
  if (convoError) throw convoError;

  const ids = (convos || []).map((c) => c.id);
  if (ids.length === 0) return {};

  const { data: msgs, error: msgError } = await supabase
    .from("express_chat_messages")
    .select("conversation_id, sender_type")
    .in("conversation_id", ids)
    .eq("is_read", false);
  if (msgError) throw msgError;

  const counts = {};
  (msgs || []).forEach((row) => {
    // Only the other party's messages are unread from this user's side; our
    // own rows stay is_read = false until the recipient opens the chat.
    if (row.sender_type !== otherParty) return;
    const id = row.conversation_id;
    counts[id] = (counts[id] || 0) + 1;
  });
  return counts;
};

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
  // Unread message count per conversation id, e.g. { "<convId>": 3 }.
  // Drives the Messages tab badge and the per-row badges on the chats list.
  const [unreadCounts, setUnreadCounts] = useState({});
  // Total unread across every conversation — the number on the tab badge.
  const unreadTotal = useMemo(
    () => Object.values(unreadCounts).reduce((sum, n) => sum + n, 0),
    [unreadCounts],
  );

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

  // Persist conversations to local storage whenever they change so the list
  // opens instantly from cache on the next launch (before any server sync).
  useEffect(() => {
    if (conversations.length > 0) {
      saveToCache(conversations);
    }
  }, [conversations, saveToCache]);

  // Sync conversations with server
  const syncWithServer = useCallback(async () => {
    if (!user) return;

    try {
      setIsLoading(true);
      // A user can be a buyer (user_id) in some conversations and the seller
      // (seller_id) in others — fetch both so the store side sees its chats too.
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
        .or(`user_id.eq.${user.id},seller_id.eq.${user.id}`)
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
          event: "INSERT",
          schema: "public",
          table: "express_chat_conversations",
          filter: `seller_id=eq.${user.id}`,
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
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "express_chat_conversations",
          filter: `seller_id=eq.${user.id}`,
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

  // ── Unread counts ────────────────────────────────────────────────────────
  // Recomputed whenever the conversation list changes (a new message updates
  // `last_message_at`, which re-renders here) and whenever the window regains
  // focus, so the badge reflects messages that arrived while the app was
  // backgrounded.
  const refreshUnreadCounts = useCallback(async () => {
    if (!user?.id) {
      setUnreadCounts({});
      return;
    }
    try {
      // A user can be a buyer in some conversations and the seller in others,
      // so both directions are tallied and merged by conversation id. Use
      // allSettled so one direction failing (e.g. RLS) doesn't wipe the other.
      const results = await Promise.allSettled([
        fetchUnreadCounts(user.id, "customer"),
        fetchUnreadCounts(user.id, "seller"),
      ]);
      const counts: Record<string, number> = {};
      for (const result of results) {
        if (result.status === "fulfilled") {
          Object.assign(counts, result.value);
        }
      }
      setUnreadCounts(counts);
    } catch (error) {
      console.warn("Failed to refresh unread counts:", error?.message);
    }
  }, [user?.id]);

  useEffect(() => {
    refreshUnreadCounts();
  }, [refreshUnreadCounts]);

  // Mark every message the other party sent in this conversation as read.
  // The local tally is cleared immediately so the row badge and tab badge
  // disappear the moment the chat is opened, without waiting for a refetch.
  const markConversationRead = useCallback(
    async (conversationId) => {
      if (!user?.id || !conversationId) return;

      setUnreadCounts((prev) => {
        if (!prev[conversationId]) return prev;
        const next = { ...prev };
        delete next[conversationId];
        return next;
      });

      try {
        const { error } = await supabase
          .from("express_chat_messages")
          .update({ is_read: true })
          .eq("conversation_id", conversationId)
          .neq("sender_id", user.id)
          .eq("is_read", false);
        if (error) throw error;
        // Reconcile with the server so the badge reflects the write.
        refreshUnreadCounts();
      } catch (error) {
        console.warn("Failed to mark conversation as read:", error?.message);
        // Re-derive from the server so a failed write doesn't hide the badge.
        refreshUnreadCounts();
      }
    },
    [user?.id, refreshUnreadCounts],
  );

  // Realtime: a new message arrives — increment the unread badge for that
  // conversation without marking anything read. The badge only clears when
  // the chat is opened via markConversationRead.
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`user-unread-badge-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "express_chat_messages",
        },
        (payload) => {
          const incoming = payload.new;
          if (!incoming?.conversation_id) return;
          // Don't bump the sender's own badge.
          if (incoming.sender_id === user.id) return;
          setUnreadCounts((prev) => {
            const count = prev[incoming.conversation_id] || 0;
            return { ...prev, [incoming.conversation_id]: count + 1 };
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Recompute unread counts when the app regains focus — covers messages that
  // arrived while backgrounded. New messages arriving in the background no
  // longer bump the badge; the status only changes when a chat is opened.
  useEffect(() => {
    if (!user?.id) return;

    const handleFocus = () => {
      refreshUnreadCounts();
    };

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") handleFocus();
    });

    return () => {
      subscription?.remove();
    };
  }, [user?.id, refreshUnreadCounts]);

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
    unreadCounts,
    unreadTotal,
    refreshUnreadCounts,
    markConversationRead,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};
