// ── TagAI global state ────────────────────────────────────────────────
// Owns:
//   1. Chat state — messages (with generative-UI payloads), thinking state,
//      persistence to AsyncStorage.
//   2. The agent loop — plan → execute tools → append a rich assistant message.
//   3. Screen grounding — a registry of element refs (registered by screens via
//      useGrounding) plus the active overlay target consumed by
//      ScreenPointerOverlay mounted at the app root.

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
  const [groundingTarget, setGroundingTarget] = useState(null); // { key, nonce }
  // Registry of element refs by grounding key. Refs are stable React ref
  // objects registered by useGrounding(key) on the owning screens.
  const groundingRefs = useRef(new Map());

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

  /** Trigger the pointer overlay. `extra` may carry { label, hint } for
   * generic targets that have no registered ref / registry metadata — the
   * overlay then highlights the middle of the current screen instead. */
  const pointTo = useCallback((key, extra = {}) => {
    setGroundingTarget((prev) => {
      // Re-trigger even if the same key is targeted twice in a row.
      if (prev?.key === key) {
        return {
          ...prev,
          nonce: (prev.nonce || 0) + 1,
          label: extra.label ?? prev.label,
          hint: extra.hint ?? prev.hint,
        };
      }
      return { key, nonce: 0, label: extra.label, hint: extra.hint };
    });
  }, []);

  const clearGrounding = useCallback(() => setGroundingTarget(null), []);

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

      try {
        // Small delay so the thinking indicator is perceivable even when the
        // planner resolves instantly (local rules).
        await new Promise((r) => setTimeout(r, 420));

        const { reply, toolCalls, products: remoteProducts = [] } =
          await planTurn(trimmed, messages);

        // Execute tool calls sequentially (order matters: navigate before
        // point_to_element, search before add_to_cart, etc.)
        const toolResults = [];
        // Server-side catalog searches (OpenRouter agent) already produced
        // their results in the response — seed the card list with them.
        const products = [...remoteProducts];
        for (const call of toolCalls || []) {
          const result = await executeToolCall(call, {
            navigateTo: nav.navigateTo || (() => {}),
            pointTo,
            addProductToCart: nav.addProductToCart,
            resolveProduct: nav.resolveProduct,
          });
          toolResults.push(result);
          if (Array.isArray(result.products) && result.products.length) {
            products.push(...result.products);
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
          ts: Date.now(),
        });
      } catch (e) {
        console.warn("[TagAI] turn failed:", e);
        appendMessage({
          id: makeId(),
          role: "assistant",
          text: "Something went wrong on my side — mind trying that again?",
          tools: [],
          products: [],
          ts: Date.now(),
        });
      } finally {
        setIsThinking(false);
      }
    },
    [appendMessage, isThinking, pointTo],
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
    ],
  );

  return (
    <TagAIAssistantContext.Provider value={value}>
      {children}
    </TagAIAssistantContext.Provider>
  );
};
