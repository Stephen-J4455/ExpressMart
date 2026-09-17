import { Animated, View, Image, StyleSheet } from "react-native";
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
  placeholderSource = PLACEHOLDER,
  style,
  resizeMode = "cover",
  placeholderResizeMode = "contain",
  placeholderColor = "#F1F5F9",
  eager = false,
}) => {
  const ctx = useContext(LazyScrollContext);
  const ref = useRef(null);
  const topRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const imageOpacity = useRef(new Animated.Value(0)).current;
  const placeholderOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    imageOpacity.setValue(0);
    placeholderOpacity.setValue(1);
  }, [imageOpacity, placeholderOpacity, source?.uri]);

  useEffect(() => {
    if (!eager || !source?.uri) return;
    setVisible(true);
    Image.prefetch(source.uri).catch(() => {});
  }, [eager, source?.uri]);

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
    if (eager || !ctx) {
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
  }, [ctx, eager, measure, updateVisibility]);

  return (
    <View
      ref={ref}
      style={[style, { backgroundColor: placeholderColor, overflow: "hidden" }]}
    >
      {/* Real product image — lazy: only mounted when near the viewport */}
      {visible && (
        <Animated.Image
          source={source}
          style={[styles.imageLayer, { opacity: imageOpacity }]}
          resizeMode={resizeMode}
          onLoad={() => {
            Animated.parallel([
              Animated.timing(imageOpacity, {
                toValue: 1,
                duration: 260,
                useNativeDriver: true,
              }),
              Animated.timing(placeholderOpacity, {
                toValue: 0,
                duration: 260,
                useNativeDriver: true,
              }),
            ]).start();
          }}
        />
      )}
      <Animated.Image
        source={placeholderSource}
        style={[styles.imageLayer, { opacity: placeholderOpacity }]}
        resizeMode={placeholderResizeMode}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  imageLayer: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
});
