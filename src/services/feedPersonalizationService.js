// feedPersonalizationService
// ----------------------------------------------------------------------------
// Client-side wrapper around the `track-user-event` edge function. Batches
// events in memory and flushes them every 5s (or on app background) so the
// per-event call cost is amortized. Anonymous users are no-ops — the
// server enforces this too, but skipping the call on the client saves a
// network round-trip and keeps the log clean.
//
// Wire-in points (one trackEvent call each):
//   - view:                ProductDetailScreen mount
//   - like / unlike:       FeedProductCard / FeedScreen toggle, ProductDetail toggle
//   - cart_add:            CartContext.addToCart success
//   - search:              SearchScreen / SearchResultsScreen submit
//   - tag_click:           SearchResultsScreen opened with { tag }
//   - category_view:       CategoryProductsScreen mount
//   - follow / unfollow:   ShopContext.followSeller / unfollowSeller
//
// All payloads pass through `normalizePayload` to drop null/undefined and
// clamp string lengths, matching the server's validation.
// ----------------------------------------------------------------------------

import { AppState } from "react-native";
import { supabase } from "../lib/supabase";

const FLUSH_INTERVAL_MS = 5_000;
const MAX_QUEUE_SIZE = 100; // cap so a misbehaving caller can't blow memory
const EDGE_FUNCTION_NAME = "track-user-event";

// In-memory queue. Module-singleton so it survives screen navigation.
const queue = [];
let flushTimer = null;
let isFlushing = false;
let hasUnsubscribeAuth = false;

const ALLOWED_EVENT_TYPES = new Set([
  "view",
  "like",
  "unlike",
  "cart_add",
  "search",
  "tag_click",
  "category_view",
  "follow",
  "unfollow",
  "purchase",
]);

const trimString = (value, max) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
};

const asPositiveInt = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  return i > 0 ? i : null;
};

// Public: enqueue an event. Safe to call from anywhere; failures are silent
// because tracking should never break the user-facing app. Returns true if
// the event was queued, false if it was dropped (no user, bad type, etc).
export const trackEvent = (type, payload = {}) => {
  if (typeof type !== "string") return false;
  const eventType = type.trim();
  if (!ALLOWED_EVENT_TYPES.has(eventType)) return false;
  if (queue.length >= MAX_QUEUE_SIZE) {
    // Drop the oldest event to make room — better than dropping the new
    // one, which is the more recent signal.
    queue.shift();
  }

  // Strip unknown / nullish fields, clamp strings to the server's limits.
  const clean = {
    event_type: eventType,
    product_id: asPositiveInt(payload.productId ?? payload.product_id),
    category_id: asPositiveInt(payload.categoryId ?? payload.category_id),
    category: trimString(payload.category, 64),
    seller_id: asPositiveInt(payload.sellerId ?? payload.seller_id),
    tag: trimString(payload.tag, 64),
    query: trimString(payload.query, 200),
    weight: typeof payload.weight === "number" ? payload.weight : undefined,
    metadata:
      payload.metadata && typeof payload.metadata === "object"
        ? payload.metadata
        : undefined,
  };
  // Drop undefined keys so the wire payload stays small.
  for (const key of Object.keys(clean)) {
    if (clean[key] === undefined) delete clean[key];
  }

  // Need at least one signal field, or the server will reject it.
  const hasSignal =
    clean.product_id ||
    clean.category_id ||
    clean.category ||
    clean.seller_id ||
    clean.tag ||
    clean.query;
  if (!hasSignal) return false;

  queue.push(clean);
  return true;
};

// Flush the queue. Safe to call concurrently — the in-flight guard makes
// the second call a no-op. Errors are swallowed so a failed flush doesn't
// cascade into user-facing failures.
const flush = async () => {
  if (isFlushing) return;
  if (queue.length === 0) return;
  if (!supabase) return;

  isFlushing = true;
  const batch = queue.splice(0, queue.length);
  try {
    const { error } = await supabase.functions.invoke(EDGE_FUNCTION_NAME, {
      body: { events: batch },
    });
    if (error) {
      // Re-queue the batch at the head so we retry next flush.
      // Cap to MAX_QUEUE_SIZE so we don't grow unbounded.
      const requeue = batch.slice(-MAX_QUEUE_SIZE);
      queue.unshift(...requeue);
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn("[feedPersonalization] flush failed:", error.message);
      }
    }
  } catch (e) {
    const requeue = batch.slice(-MAX_QUEUE_SIZE);
    queue.unshift(...requeue);
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn("[feedPersonalization] flush threw:", e?.message);
    }
  } finally {
    isFlushing = false;
  }
};

const startFlushTimer = () => {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    flush();
  }, FLUSH_INTERVAL_MS);
};

const stopFlushTimer = () => {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
};

// Public: drop everything in the queue without sending. Used on sign-out
// so we don't carry events across user sessions.
export const clearQueue = () => {
  queue.length = 0;
};

// Public: bootstrap the service. Wires the auth listener, the periodic
// flush, and the AppState background flush. Idempotent — safe to call
// from a React effect on every mount.
export const initFeedPersonalization = () => {
  if (hasUnsubscribeAuth) return;
  hasUnsubscribeAuth = true;

  // Flush on app background so we don't lose the tail of the queue when
  // the user closes the app. AppState "background" fires on iOS just
  // before the OS suspends the JS thread, so this is the last reliable
  // hook to send pending events.
  const sub = AppState.addEventListener("change", (state) => {
    if (state === "background" || state === "inactive") {
      flush();
    }
  });

  // Listen for auth changes. The cached-products edge function uses the
  // JWT to attribute events, so a stale userId from a previous session
  // would land in the wrong user's row. Drop queued events on any change
  // and let new events accumulate under the new session.
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, _session) => {
    clearQueue();
  });

  startFlushTimer();

  // Cleanup isn't strictly needed (this runs once for the app's lifetime)
  // but it's there so test suites that import this module don't leak.
  return () => {
    sub?.remove?.();
    subscription?.unsubscribe?.();
    stopFlushTimer();
    hasUnsubscribeAuth = false;
  };
};

export default {
  trackEvent,
  clearQueue,
  initFeedPersonalization,
};
