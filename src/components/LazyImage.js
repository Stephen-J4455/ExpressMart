import { View, Image, StyleSheet } from "react-native";
import { useContext, useEffect, useRef, useState, useCallback } from "react";
import { LazyScrollContext, lazyScroll } from "../context/LazyScrollContext";

// Local placeholder asset — renders instantly with no network request.
const PLACEHOLDER = require("../../assets/placeholder/placeholder.png");

// The local placeholder is always shown immediately. The real product image
// (a network request) is lazy: it is only mounted once the element scrolls
// near the viewport. When no LazyScrollContext is provided, the product image
// is shown eagerly (no lazy behavior).
export const LazyImage = ({
  source,
  style,
  resizeMode = "cover",
  placeholderColor = "#F1F5F9",
}) => {
  const ctx = useContext(LazyScrollContext);
  const ref = useRef(null);
  const topRef = useRef(null);
  const [visible, setVisible] = useState(false);

  const updateVisibility = useCallback((scrollY) => {
    if (topRef.current == null) return;
    const vh = lazyScroll.viewportHeight || 800;
    const offset = 300;
    const next =
      topRef.current < scrollY + vh + offset &&
      topRef.current + 400 > scrollY - offset;
    setVisible((prev) => (prev === next ? prev : next));
  }, []);

  const measure = useCallback(() => {
    if (
      !ctx ||
      !ctx.scrollContentRef ||
      !ctx.scrollContentRef.current ||
      !ref.current
    ) {
      return;
    }
    try {
      ref.current.measureLayout(
        ctx.scrollContentRef.current,
        (x, y) => {
          topRef.current = y;
          updateVisibility(lazyScroll.lastScrollY);
        },
        () => {},
      );
    } catch (e) {
      // measureLayout can throw if nodes aren't ready; ignore
    }
  }, [ctx, updateVisibility]);

  useEffect(() => {
    if (!ctx) {
      setVisible(true);
      return;
    }
    const cb = (scrollY) => updateVisibility(scrollY);
    lazyScroll.register(cb);
    measure();
    // Re-measure shortly after mount in case layout wasn't ready yet
    const t = setTimeout(measure, 200);
    return () => {
      lazyScroll.unregister(cb);
      clearTimeout(t);
    };
  }, [ctx, measure, updateVisibility]);

  return (
    <View ref={ref} style={[style, { backgroundColor: placeholderColor }]}>
      {/* Local placeholder asset — always rendered, never lazy-loaded */}
      <Image
        source={PLACEHOLDER}
        style={[style, StyleSheet.absoluteFill]}
        resizeMode={resizeMode}
      />
      {/* Real product image — lazy: only mounted when near the viewport */}
      {visible && (
        <Image
          source={source}
          style={[style, StyleSheet.absoluteFill]}
          resizeMode={resizeMode}
        />
      )}
    </View>
  );
};