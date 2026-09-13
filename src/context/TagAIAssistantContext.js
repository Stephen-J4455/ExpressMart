// ── TagAI global state ────────────────────────────────────────────────
// Owns:
//   1. Chat state — messages (with generative-UI payloads), thinking state,
//      persistence to AsyncStorage.
//   2. The agent loop — plan → execute tools → append a rich assistant message.
//   3. Screen grounding — a registry of element refs (registered by screens via
//      useGrounding) plus the active overlay target consumed by
//      ScreenPointerOverlay mounted at the app root.
//   4. Screen index — a registry of on-screen items & scrollable surfaces so
//      the agent can `read_screen`, `find_on_screen`, `scroll`, and `scroll_to`
//      on demand (the "agent has eyes" capability).
//   5. Thinking trace — emits ordered thinking events that the chat UI
//      surfaces as a collapsible "Why I did this" panel.

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { executeToolCall, planTurn } from "../services/tagAIAssistantService";
import {
  takeScreenSnapshot,
  findItemsOnScreen,
} from "../services/screenScanner";
import { goBack as navigationGoBack } from "../utils/navigationRef";

const CHAT_STORAGE_KEY = "expressmart.tagai.chat";
const MAX_PERSISTED_MESSAGES = 60;

const TagAIAssistantContext = createContext();

export const useTagAIAssistant = () => {
  const ctx = useContext(TagAIAssistantContext);
  if (!ctx) {
    throw new Error("useTagAIAssistant must be used within an TagAIAssistantProvider");
  }
  return ctx;
};

const makeId = () => `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const TagAIAssistantProvider = ({ children }) => {
  const [messages, setMessages] = useState([]);
  const [isThinking, setIsThinking] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // ── Grounding state ──
  const [groundingTarget, setGroundingTarget] = useState(null); // { key, nonce, ... }
  // Registry of element refs by grounding key. Refs are stable React ref
  // objects registered by useGrounding(key) on the owning screens.
  const groundingRefs = useRef(new Map());

  // ── Screen index (the "agent has eyes" capability) ──
  // Map<itemId, { id, route, text, role, ref, meta }>
  const screenIndex = useRef(new Map());
  // Map<surfaceKey, surface API { scrollTo, scrollToOffset, scrollToIndex }>
  const scrollSurfaces = useRef(new Map());
  // Active route — screens call setActiveRoute('Home') on mount.
  const activeRouteRef = useRef(null);
  // App-state provider — set by App.js with helpers like getCartCount().
  const appStateProviderRef = useRef(null);
  // Tap-target registry. Screens register a callback under a stable item id
  // via useTapTarget. The agent's `tap_element` tool looks up the id and
  // fires the callback — same pattern as useGrounding, but for actions
  // (onPress) instead of ref measurement.
  // Map<itemId, { handler: () => void, screen?: string, label?: string }>
  const tapTargets = useRef(new Map());
  // Pending updates — buffered to be flushed into tapTargets in a useEffect
  // on the consumer side. We store them here as the latest version of
  // each handler and copy on register, so the latest closure is used.
  const tapTargetHandlers = useRef(new Map());

  // Load persisted chat once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(CHAT_STORAGE_KEY);
        if (!cancelled && raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setMessages(parsed);
        }
      } catch (e) {
        console.warn("[TagAI] failed to load chat:", e);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist chat on change (after initial load).
  useEffect(() => {
    if (!loaded) return;
    (async () => {
      try {
        await AsyncStorage.setItem(
          CHAT_STORAGE_KEY,
          JSON.stringify(messages.slice(-MAX_PERSISTED_MESSAGES)),
        );
      } catch (e) {
        console.warn("[TagAI] failed to persist chat:", e);
      }
    })();
  }, [messages, loaded]);

  // ── Grounding registry API ──

  const registerGroundingElement = useCallback((key, ref) => {
    groundingRefs.current.set(key, ref);
  }, []);

  const unregisterGroundingElement = useCallback((key) => {
    groundingRefs.current.delete(key);
  }, []);

  const getGroundingRef = useCallback((key) => groundingRefs.current.get(key), []);

  /** Trigger the pointer overlay. `extra` may carry { label, hint, shape,
   * direction, size, coords } for free-form targets. `coords` lets the agent
   * point at an arbitrary {x, y, w, h} rectangle on screen — even with no
   * registered ref. */
  const pointTo = useCallback((key, extra = {}) => {
    setGroundingTarget((prev) => {
      // Re-trigger even if the same key is targeted twice in a row.
      if (prev?.key === key) {
        return {
          ...prev,
          nonce: (prev.nonce || 0) + 1,
          ...extra,
          label: extra.label ?? prev.label,
          hint: extra.hint ?? prev.hint,
        };
      }
      return { key, nonce: 0, ...extra };
    });
  }, []);

  const clearGrounding = useCallback(() => setGroundingTarget(null), []);

  // ── Screen-index API ──

  const registerScreenItem = useCallback((id, entry) => {
    if (!id) return;
    screenIndex.current.set(String(id), { id: String(id), ...(entry || {}) });
  }, []);

  const updateScreenItem = useCallback((id, patch) => {
    const k = String(id);
    const cur = screenIndex.current.get(k);
    if (!cur) return;
    screenIndex.current.set(k, { ...cur, ...(patch || {}) });
  }, []);

  const unregisterScreenItem = useCallback((id) => {
    if (!id) return;
    screenIndex.current.delete(String(id));
  }, []);

  const registerScrollSurface = useCallback((key, surface) => {
    if (!key) return;
    scrollSurfaces.current.set(String(key), surface);
  }, []);

  const unregisterScrollSurface = useCallback((key) => {
    if (!key) return;
    scrollSurfaces.current.delete(String(key));
  }, []);

  const getScrollSurface = useCallback(
    (key) => scrollSurfaces.current.get(key || activeRouteRef.current),
    [],
  );

  // ── Tap-target registry ──
  // The agent's `tap_element` tool calls into this. We keep the latest
  // handler closure in `tapTargetHandlers` (so the consumer's re-render
  // doesn't lose it) and the `tapTargets` Map stays in sync via a useEffect
  // inside the useTapTarget hook.
  const registerTapTarget = useCallback((id, handler, meta = {}) => {
    if (!id) return;
    const k = String(id);
    tapTargetHandlers.current.set(k, {
      handler: typeof handler === "function" ? handler : null,
      meta,
    });
    // Write-through so a tool call immediately after register works.
    tapTargets.current.set(k, {
      handler: typeof handler === "function" ? handler : null,
      meta,
      ...meta,
    });
  }, []);

  const unregisterTapTarget = useCallback((id) => {
    if (!id) return;
    const k = String(id);
    tapTargets.current.delete(k);
    tapTargetHandlers.current.delete(k);
  }, []);

  /**
   * Synchronously look up a tap target by id and invoke its handler.
   * Returns `{ ok, status, message }` so the tool caller can surface a
   * useful error if the id is unknown.
   */
  const invokeTapTarget = useCallback((id) => {
    if (!id) {
      return { ok: false, status: "error", message: "item_id is required." };
    }
    const k = String(id);
    const entry = tapTargets.current.get(k) || tapTargetHandlers.current.get(k);
    if (!entry || typeof entry.handler !== "function") {
      return {
        ok: false,
        status: "not_found",
        message: `No registered tap target with id "${id}".`,
      };
    }
    try {
      const result = entry.handler();
      // Allow async handlers.
      if (result && typeof result.then === "function") {
        return result
          .then((r) => ({ ok: true, status: "done", value: r }))
          .catch((e) => ({
            ok: false,
            status: "error",
            message: e?.message || String(e),
          }));
      }
      return { ok: true, status: "done" };
    } catch (e) {
      return {
        ok: false,
        status: "error",
        message: e?.message || String(e),
      };
    }
  }, []);

  /** Read-only introspection — for the model. */
  const listTapTargets = useCallback(() => {
    const out = [];
    for (const [id, entry] of tapTargets.current.entries()) {
      out.push({
        id,
        screen: entry?.meta?.screen || null,
        label: entry?.meta?.label || null,
      });
    }
    return out;
  }, []);

  const setActiveRoute = useCallback((route) => {
    activeRouteRef.current = route || null;
  }, []);

  const setAppStateProvider = useCallback((provider) => {
    appStateProviderRef.current = typeof provider === "function" ? provider : null;
  }, []);

  /** Synchronous snapshot of what's currently visible on the active route.
   * Used by the `read_screen` and `find_on_screen` tools. */
  const snapshotScreen = useCallback((opts = {}) => {
    return takeScreenSnapshot(screenIndex.current, {
      route: activeRouteRef.current,
      ...opts,
    });
  }, []);

  const findOnScreen = useCallback((query, opts = {}) => {
    return findItemsOnScreen(screenIndex.current, query, {
      route: activeRouteRef.current,
      ...opts,
    });
  }, []);

  const getAppState = useCallback(() => {
    const fn = appStateProviderRef.current;
    if (typeof fn === "function") {
      try {
        return { ok: true, route: activeRouteRef.current, ...fn() };
      } catch (e) {
        return { ok: false, error: e?.message || String(e) };
      }
    }
    return { ok: true, route: activeRouteRef.current };
  }, []);

  // ── Thinking trace ──
  // Each turn pushes ordered events into a ref-backed buffer; the chat
  // surface renders them after the assistant message lands. Cheap, doesn't
  // cause re-renders during the loop.
  const thinkingBuffer = useRef([]);
  const pushThinking = useCallback((text) => {
    if (!text) return;
    thinkingBuffer.current.push({ ts: Date.now(), text: String(text) });
  }, []);
  const drainThinking = useCallback(() => {
    const out = thinkingBuffer.current.slice();
    thinkingBuffer.current = [];
    return out;
  }, []);

  // ── Chat / agent loop ──

  const appendMessage = useCallback((msg) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  /**
   * Send a user message and run the full agent loop:
   *   plan → execute tool calls sequentially → rich assistant message.
   *
   * `nav` is supplied by the assistant screen:
   *   { navigateTo(route, params), addProductToCart, resolveProduct }
   */
  const sendMessage = useCallback(
    async (text, nav = {}) => {
      const trimmed = (text || "").trim();
      if (!trimmed || isThinking) return;

      appendMessage({ id: makeId(), role: "user", text: trimmed, ts: Date.now() });
      setIsThinking(true);
      // Reset thinking buffer for this turn.
      thinkingBuffer.current = [];

      try {
        // Small delay so the thinking indicator is perceivable even when the
        // planner resolves instantly (local rules).
        await new Promise((r) => setTimeout(r, 420));
        pushThinking("Planning the next step…");

        const { reply, toolCalls, products: remoteProducts = [] } =
          await planTurn(trimmed, messages);

        // Execute tool calls sequentially (order matters: navigate before
        // point_to_element, search before add_to_cart, etc.)
        const toolResults = [];
        // Server-side catalog searches (OpenRouter agent) already produced
        // their results in the response — seed the card list with them.
        const products = [...remoteProducts];
        for (const call of toolCalls || []) {
          if (call?.name) pushThinking(`Running ${call.name}…`);
          const result = await executeToolCall(call, {
            navigateTo: nav.navigateTo || (() => {}),
            pointTo,
            addProductToCart: nav.addProductToCart,
            resolveProduct: nav.resolveProduct,
            snapshotScreen,
            findOnScreen,
            getAppState,
            // Tap + screen-map support.
            invokeTapTarget,
            listTapTargets,
            goBack: navigationGoBack,
          });
          toolResults.push(result);
          if (Array.isArray(result.products) && result.products.length) {
            // De-dupe by id so a single message never carries the same product
            // twice (avoids React duplicate-key warnings downstream).
            const seen = new Set(products.map((p) => p?.id).filter(Boolean));
            for (const rp of result.products) {
              if (rp?.id != null && seen.has(rp.id)) continue;
              if (rp?.id != null) seen.add(rp.id);
              products.push(rp);
            }
          } else if (result.product && result.product.id) {
            // Single-product tool (e.g. get_product_details) — also surface
            // it as a card so the chat stays consistent.
            const seen = new Set(products.map((p) => p?.id).filter(Boolean));
            if (!seen.has(result.product.id)) {
              const cardShape = {
                id: result.product.id,
                title: result.product.title,
                price: Number(result.product.price || 0),
                discount: Number(result.product.discount || 0),
                thumbnail: result.product.thumbnail || null,
                thumbnails: result.product.thumbnails || null,
                category: result.product.category || null,
                rating: Number(result.product.rating || 0),
                total_ratings: result.product.total_ratings ?? 0,
                sold_count: result.product.sold_count ?? 0,
                seller_id: result.product.seller_id || null,
              };
              products.push(cardShape);
            }
          }
        }

        // If a search ran but produced nothing, adjust the reply so the empty
        // state reads naturally.
        let finalReply = reply;
        const searchRan = toolResults.some(
          (r) =>
            (r.name === "search_products" || r.name === "filter_catalog") &&
            r.status === "done",
        );
        if (searchRan && products.length === 0) {
          finalReply =
            "I searched the catalog but couldn't find anything matching that. Try a different word or a broader budget?";
        }

        appendMessage({
          id: makeId(),
          role: "assistant",
          text: finalReply,
          tools: toolResults,
          products,
          thinking: drainThinking(),
          ts: Date.now(),
        });
      } catch (e) {
        console.warn("[TagAI] turn failed:", e);
        pushThinking("Hit a snag while planning — falling back to a safe reply.");
        appendMessage({
          id: makeId(),
          role: "assistant",
          text: "Something went wrong on my side — mind trying that again?",
          tools: [],
          products: [],
          thinking: drainThinking(),
          ts: Date.now(),
        });
      } finally {
        setIsThinking(false);
      }
    },
    [
      appendMessage,
      isThinking,
      pointTo,
      pushThinking,
      drainThinking,
      snapshotScreen,
      findOnScreen,
      getAppState,
    ],
  );

  const clearChat = useCallback(() => setMessages([]), []);

  const value = useMemo(
    () => ({
      messages,
      isThinking,
      sendMessage,
      clearChat,
      groundingTarget,
      pointTo,
      clearGrounding,
      registerGroundingElement,
      unregisterGroundingElement,
      getGroundingRef,
      // Screen index + scroll surface APIs (the "agent has eyes" capability)
      registerScreenItem,
      updateScreenItem,
      unregisterScreenItem,
      registerScrollSurface,
      unregisterScrollSurface,
      getScrollSurface,
      setActiveRoute,
      setAppStateProvider,
      snapshotScreen,
      findOnScreen,
      getAppState,
      goBack: navigationGoBack,
      // Tap-target registry (the agent's `tap_element` tool)
      registerTapTarget,
      unregisterTapTarget,
      invokeTapTarget,
      listTapTargets,
      // Thinking trace
      pushThinking,
    }),
    [
      messages,
      isThinking,
      sendMessage,
      clearChat,
      groundingTarget,
      pointTo,
      clearGrounding,
      registerGroundingElement,
      unregisterGroundingElement,
      getGroundingRef,
      registerScreenItem,
      updateScreenItem,
      unregisterScreenItem,
      registerScrollSurface,
      unregisterScrollSurface,
      getScrollSurface,
      setActiveRoute,
      setAppStateProvider,
      snapshotScreen,
      findOnScreen,
      getAppState,
      registerTapTarget,
      unregisterTapTarget,
      invokeTapTarget,
      listTapTargets,
      pushThinking,
    ],
  );

  return (
    <TagAIAssistantContext.Provider value={value}>
      {children}
    </TagAIAssistantContext.Provider>
  );
};
