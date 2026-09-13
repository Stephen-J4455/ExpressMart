// useOfflineMessages — offline-first message controller for a single chat.
//
// Responsibilities (matching the requested strategy):
//   1. Instant load: render cached messages immediately, no spinner.
//   2. Background delta sync: after render, fetch only messages newer than the
//      local `last_synced_at` and merge them in.
//   3. Real-time injection: subscribe to INSERTs on express_chat_messages and
//      write them to local storage first (UI updates instantly).
//   4. Optimistic send: write the message locally with a temp id + "sending"
//      status, push to the backend, then flip to "sent"/"failed".
//
// It intentionally mirrors the conventions already used in ChatScreen
// (isTemporary, temp- ids) so the screen's render logic barely changes.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  loadCachedMessages,
  getLastSyncedAt,
  saveCachedMessages,
  bumpSyncCursor,
  mergeMessages,
  patchTempMessage,
  removeTempMessage,
} from "../lib/messageCache";

export const useOfflineMessages = ({
  conversationId,
  user,
  senderType = "user",
  onIncoming,
  onSyncStatusChange,
}) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false); // only true once a conv exists
  const [syncing, setSyncing] = useState(false);
  const channelRef = useRef(null);
  const mountedRef = useRef(true);

  // ── 1. Instant load from local storage ────────────────────────────────────
  useEffect(() => {
    if (!conversationId) return;
    mountedRef.current = true;
    setLoading(true);

    (async () => {
      const cached = await loadCachedMessages(conversationId);
      if (mountedRef.current) {
        setMessages(cached);
        setLoading(false); // cached data shows immediately, no spinner
      }
      // ── 2. Background delta sync (runs right after render) ────────────────
      syncDelta();
    })();

    return () => {
      mountedRef.current = false;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // ── 2. Background delta sync ──────────────────────────────────────────────
  const syncDelta = useCallback(async () => {
    if (!conversationId) return;
    setSyncing(true);
    try {
      const cursor = await getLastSyncedAt(conversationId);
      let query = supabase
        .from("express_chat_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      if (cursor) {
        // Pull only rows strictly newer than our local cursor.
        query = query.gt("created_at", cursor);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (data && data.length) {
        setMessages((prev) => {
          const merged = mergeMessages(prev, data);
          saveCachedMessages(conversationId, merged);
          return merged;
        });
      } else {
        // No new rows: bump the cursor to the newest existing row so the next
        // delta sync starts from there instead of re-querying everything.
        const { data: newest } = await supabase
          .from("express_chat_messages")
          .select("created_at")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: false })
          .limit(1);
        if (newest?.[0]?.created_at) {
          await bumpSyncCursor(conversationId, newest[0].created_at);
        }
      }
    } catch (e) {
      console.warn("syncDelta failed:", e);
    } finally {
      setSyncing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // ── 3. Real-time subscription & injection ─────────────────────────────────
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`offline-chat-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "express_chat_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const incoming = payload.new;
          setMessages((prev) => {
            const merged = mergeMessages(prev, [incoming]);
            saveCachedMessages(conversationId, merged);
            return merged;
          });
          // Notify the screen (e.g. mark-as-read, scroll) for incoming msgs.
          if (incoming.sender_id !== user?.id) onIncoming?.(incoming);
        },
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [conversationId, user?.id, onIncoming]);

  // ── 4. Optimistic send ────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text) => {
      if (!conversationId || !user || !text?.trim()) return null;
      const clientTempId = `temp-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const optimistic = {
        id: clientTempId,
        client_temp_id: clientTempId,
        conversation_id: conversationId,
        sender_id: user.id,
        sender_type: senderType,
        message: text,
        created_at: new Date().toISOString(),
        isTemporary: true,
        sync_status: "sending",
      };

      // Write to local storage first → instant UI.
      setMessages((prev) => {
        const next = [...prev, optimistic];
        saveCachedMessages(conversationId, next);
        return next;
      });
      onSyncStatusChange?.(optimistic);

      try {
        const { data, error } = await supabase
          .from("express_chat_messages")
          .insert({
            conversation_id: conversationId,
            sender_id: user.id,
            sender_type: senderType,
            message: text,
            client_temp_id: clientTempId, // echoed back so we can reconcile
          })
          .select()
          .single();

        if (error) throw error;

        // Reconcile: replace temp with the real row (mergeMessages handles it).
        setMessages((prev) => {
          const merged = mergeMessages(prev, [data]);
          saveCachedMessages(conversationId, merged);
          return merged;
        });
        onSyncStatusChange?.(data);
        return data;
      } catch (e) {
        console.warn("sendMessage failed:", e);
        setMessages((prev) => {
          const patched = patchTempMessage(prev, clientTempId, {
            sync_status: "failed",
          });
          saveCachedMessages(conversationId, patched);
          return patched;
        });
        onSyncStatusChange?.({
          ...optimistic,
          sync_status: "failed",
        });
        return null;
      }
    },
    [conversationId, user?.id, senderType, onSyncStatusChange],
  );

  // Retry a previously-failed optimistic message.
  const retryMessage = useCallback(
    async (clientTempId) => {
      const target = messages.find((m) => m.client_temp_id === clientTempId);
      if (!target) return;
      setMessages((prev) => {
        const patched = patchTempMessage(prev, clientTempId, {
          sync_status: "sending",
        });
        saveCachedMessages(conversationId, patched);
        return patched;
      });
      try {
        const { data, error } = await supabase
          .from("express_chat_messages")
          .insert({
            conversation_id: conversationId,
            sender_id: user.id,
            sender_type: senderType,
            message: target.message,
            client_temp_id: clientTempId,
          })
          .select()
          .single();
        if (error) throw error;
        setMessages((prev) => {
          const merged = mergeMessages(prev, [data]);
          saveCachedMessages(conversationId, merged);
          return merged;
        });
      } catch (e) {
        setMessages((prev) => {
          const patched = patchTempMessage(prev, clientTempId, {
            sync_status: "failed",
          });
          saveCachedMessages(conversationId, patched);
          return patched;
        });
      }
    },
    [conversationId, messages, senderType, user?.id],
  );

  // Append a locally-built message (e.g. a product-card share) to both state
  // and the cache. Used by the screen for non-text sends that keep their own
  // optimistic flow.
  const addLocalMessage = useCallback(
    (msg) => {
      setMessages((prev) => {
        const next = [...prev, msg];
        saveCachedMessages(conversationId, next);
        return next;
      });
    },
    [conversationId],
  );

  const removeLocalMessage = useCallback(
    (id) => {
      setMessages((prev) => {
        const next = prev.filter((m) => m.id !== id);
        saveCachedMessages(conversationId, next);
        return next;
      });
    },
    [conversationId],
  );

  return {
    messages,
    loading, // only true until the cache is read — no spinner for cached data
    syncing,
    sendMessage,
    retryMessage,
    syncDelta,
    addLocalMessage,
    removeLocalMessage,
  };
};
