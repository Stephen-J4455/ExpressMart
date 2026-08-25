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
