// Offline-first local message store for a single conversation.
//
// Messages are persisted per-conversation in AsyncStorage so a chat can be
// rendered instantly on open (no spinner, no network). The store also tracks
// `last_synced_at` so background sync only pulls deltas.
//
// A message shape used here is the Supabase `express_chat_messages` row, plus
// optional client-only fields:
//   - id: real row id, OR a temporary client id ("temp-...") while sending
//   - client_temp_id: stable id used to reconcile an optimistic message with
//     its real server row (set only on locally-created messages)
//   - sync_status: "sending" | "sent" | "failed" (client-only, for temp msgs)
//   - isTemporary: true while the message has not been confirmed by the server

import AsyncStorage from "@react-native-async-storage/async-storage";

const messagesKey = (conversationId) => `chat_messages:${conversationId}`;
const syncKey = (conversationId) => `chat_messages_sync:${conversationId}`;

// Read cached messages synchronously-ish (returns a Promise). Returns [] if
// nothing is cached yet. This is what makes "instant load" possible.
export const loadCachedMessages = async (conversationId) => {
  try {
    const raw = await AsyncStorage.getItem(messagesKey(conversationId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn("loadCachedMessages failed:", e);
    return [];
  }
};

export const getLastSyncedAt = async (conversationId) => {
  try {
    return (await AsyncStorage.getItem(syncKey(conversationId))) || null;
  } catch (e) {
    return null;
  }
};

// Advance the sync cursor without rewriting the message array (used when a
// delta sync returns nothing new, so we don't re-query the whole table later).
export const bumpSyncCursor = async (conversationId, createdAt) => {
  try {
    if (createdAt)
      await AsyncStorage.setItem(syncKey(conversationId), createdAt);
  } catch (e) {
    console.warn("bumpSyncCursor failed:", e);
  }
};

// Persist the full message array + bump last_synced_at. We store the newest
// message's created_at as the sync cursor so the next delta sync starts there.
export const saveCachedMessages = async (conversationId, messages) => {
  try {
    const sorted = [...messages].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at),
    );
    await AsyncStorage.setItem(
      messagesKey(conversationId),
      JSON.stringify(sorted),
    );
    const newest = sorted[sorted.length - 1];
    if (newest?.created_at) {
      await AsyncStorage.setItem(syncKey(conversationId), newest.created_at);
    }
  } catch (e) {
    console.warn("saveCachedMessages failed:", e);
  }
};

// Merge an incoming batch (realtime payload or delta sync) into the cache.
// Reconciliation rules:
//   - match by real `id` first
//   - else match a temp message by `client_temp_id` (server row carries it)
//   - else it's genuinely new → append
// Returns the merged array (caller persists it).
export const mergeMessages = (existing, incoming) => {
  const byId = new Map();
  for (const m of existing) byId.set(m.id, m);

  for (const inc of incoming) {
    // Replace a matching optimistic temp message with the real row.
    const tempMatch = existing.find(
      (m) => m.client_temp_id && m.client_temp_id === inc.client_temp_id,
    );
    if (tempMatch) {
      byId.delete(tempMatch.id);
      byId.set(inc.id, { ...inc, sync_status: "sent", isTemporary: false });
      continue;
    }
    if (inc.id && byId.has(inc.id)) {
      byId.set(inc.id, { ...byId.get(inc.id), ...inc });
    } else if (inc.id) {
      byId.set(inc.id, inc);
    }
  }
  return Array.from(byId.values());
};

// Update the sync_status of a locally-created message (sending → sent/failed)
// keyed by its client_temp_id.
export const patchTempMessage = (messages, clientTempId, patch) =>
  messages.map((m) =>
    m.client_temp_id === clientTempId ? { ...m, ...patch } : m,
  );

export const removeTempMessage = (messages, clientTempId) =>
  messages.filter((m) => m.client_temp_id !== clientTempId);
