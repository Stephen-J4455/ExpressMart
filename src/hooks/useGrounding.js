// ── useGrounding ─────────────────────────────────────────────────────────────
// Registers a view ref under a stable grounding key so the AI assistant's
// ScreenPointerOverlay can measure and highlight it on demand.
//
// Usage (in any screen/component):
//   const promoRef = useGrounding("checkout.promoCode");
//   ...
//   <View ref={promoRef} style={...}>...</View>
//
// The overlay resolves the ref via AIAssistantContext.getGroundingRef(key)
// and calls measureInWindow() to compute screen coordinates.

import { useEffect, useMemo, useRef } from "react";
import { useAIAssistant } from "../context/AIAssistantContext";

export const useGrounding = (key) => {
  const { registerGroundingElement, unregisterGroundingElement } =
    useAIAssistant();
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
