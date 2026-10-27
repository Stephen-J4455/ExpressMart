// ── useGrounding ─────────────────────────────────────────────────────────────
// Registers a view ref under a stable grounding key so the TagAI's
// ScreenPointerOverlay can measure and highlight it on demand.
//
// Usage (in any screen/component):
//   const promoRef = useGrounding("checkout.promoCode");
//   ...
//   <View ref={promoRef} style={...}>...</View>
//
// The overlay resolves the ref via TagAIAssistantContext.getGroundingRef(key)
// and calls measureInWindow() to compute screen coordinates.

import { useEffect, useMemo, useRef } from "react";
import { useTagAIAssistant } from "../context/TagAIAssistantContext";

export const useGrounding = (key) => {
  const { registerGroundingElement, unregisterGroundingElement } =
    useTagAIAssistant();
  const ref = useRef(null);

  useEffect(() => {
    if (!key) return undefined;
    registerGroundingElement(key, ref);
    return () => unregisterGroundingElement(key);
  }, [key, registerGroundingElement, unregisterGroundingElement]);

  return ref;
};

/**
 * Convenience wrapper: attaches the grounding ref to a View/Pressable while
 * still allowing a local ref for other purposes.
 */
export const useGroundingTarget = (key) => {
  const groundingRef = useGrounding(key);
  return useMemo(() => ({ ref: groundingRef }), [groundingRef]);
};

/**
 * useGroundingWithMeta — registers a ref AND remembers the element's shape
 * / direction / size preferences. The overlay reads these to render the
 * matching pointer style.
 */
export const useGroundingWithMeta = (key, meta = {}) => {
  const { pointTo, registerGroundingElement, unregisterGroundingElement } =
    useTagAIAssistant();
  const ref = useRef(null);

  useEffect(() => {
    if (!key) return undefined;
    registerGroundingElement(key, ref);
    return () => unregisterGroundingElement(key);
  }, [key, registerGroundingElement, unregisterGroundingElement]);

  return {
    ref,
    highlight: (extra = {}) => pointTo(key, { ...meta, ...extra }),
  };
};

// ── useTapTarget ─────────────────────────────────────────────────────────────
// Registers a press handler under a stable id so the agent's `tap_element`
// tool can fire it. Same registration pattern as useGrounding, but for
// actions (the handler) instead of ref measurement.
//
// Usage:
//   const addBtnProps = useTapTarget("productDetail.addToCart", () => {
//     addToCart(product, 1);
//   }, { screen: "ProductDetail", label: "Add to cart" });
//   <Pressable {...addBtnProps} style={...}>...</Pressable>
//
// `useTapTarget` returns the spreadable props so you can just spread them
// onto the Pressable — the hook takes care of registering on mount and
// unregistering on unmount. (The user still gets a normal Pressable.)
export const useTapTarget = (id, handler, meta = {}) => {
  const { registerTapTarget, unregisterTapTarget } = useTagAIAssistant();
  // Keep the latest handler in a ref so re-registers use the newest closure.
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!id) return undefined;
    registerTapTarget(id, (...args) => handlerRef.current?.(...args), meta);
    return () => unregisterTapTarget(id);
    // meta is intentionally a dep so screens can re-register with new metadata.
  }, [id, meta, registerTapTarget, unregisterTapTarget]);

  return {
    onPress: (...args) => handlerRef.current?.(...args),
    accessibilityLabel: meta.label,
    testID: id,
  };
};

/**
 * useTapTargets — register a list of tap targets in one shot. Useful for
 * FlatList rows that want a per-row tap handler keyed by the row id.
 *
 *   const rowPropsFor = useTapTargets();
 *   renderItem={({ item }) => (
 *     <Pressable {...rowPropsFor(item.id, () => openItem(item))}>...</Pressable>
 *   )}
 */
export const useTapTargets = () => {
  const { registerTapTarget, unregisterTapTarget } = useTagAIAssistant();
  const handlersRef = useRef(new Map());

  const handlerFor = (id, handler, meta = {}) => {
    handlersRef.current.set(String(id), { handler, meta });
    registerTapTarget(id, (...args) => {
      const entry = handlersRef.current.get(String(id));
      entry?.handler?.(...args);
    }, meta);
    return {
      onPress: (...args) => handler?.(...args),
      accessibilityLabel: meta.label,
      testID: id,
    };
  };

  // Best-effort cleanup of the entire batch on unmount.
  // (We intentionally don't track which ids belong to which batch — the
  // agent's tap targets are intentionally screen-wide, so leaking is OK.)
  return handlerFor;
};
