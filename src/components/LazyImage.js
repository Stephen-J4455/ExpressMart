import { View, Image, Platform, StyleSheet } from "react-native";
import { useContext, useEffect, useRef, useState, useCallback } from "react";
import { LazyScrollContext, lazyScroll } from "../context/LazyScrollContext";

// Local placeholder asset — renders instantly with no network request.
const PLACEHOLDER = require("../../assets/placeholder/placeholder.png");

// The local placeholder is always shown immediately. The real product image
// is lazy on web; native mounts images eagerly to avoid blank spaces during
// fast scrolling in virtualized lists.
export const LazyImage = ({
  source,
  placeholderSource = PLACEHOLDER,
  style,
  resizeMode = "cover",
  placeholderResizeMode = "contain",
  placeholderColor = "#F1F5F9",
  eager = false,
  loadSource = true,
  onError,
}) => {
  const ctx = useContext(LazyScrollContext);
  const ref = useRef(null);
  const topRef = useRef(null);
  const [visible, setVisible] = useState(
    () => Platform.OS !== "web" || eager || !ctx,
  );

  useEffect(() => {
    if (Platform.OS !== "web" || !eager || !loadSource || !source?.uri) return;
    setVisible(true);
    Image.prefetch(source.uri).catch(() => {});
  }, [eager, loadSource, source?.uri]);

  const updateVisibility = useCallback((scrollY) => {
    if (topRef.current == null) return;
    const vh = lazyScroll.viewportHeight || 800;
    const offset = 300;
    const next =
      topRef.current < scrollY + vh + offset &&
      topRef.current + 400 > scrollY - offset;
    if (next) setVisible(true);
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
    if (Platform.OS !== "web" || eager || !ctx) {
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
      {Platform.OS !== "web" ? (
        <Image
          source={loadSource ? source : placeholderSource}
          defaultSource={placeholderSource}
          style={styles.nativeImage}
          resizeMode={loadSource ? resizeMode : placeholderResizeMode}
          resizeMethod={Platform.OS === "android" ? "resize" : undefined}
          onError={loadSource ? onError : undefined}
        />
      ) : (
        <>
          <Image
            source={placeholderSource}
            style={styles.placeholderLayer}
            resizeMode={placeholderResizeMode}
          />
          {visible && loadSource && (
            <Image
              source={source}
              style={styles.productLayer}
              resizeMode={resizeMode}
              onError={onError}
            />
          )}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  nativeImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  placeholderLayer: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
    zIndex: 0,
  },
  productLayer: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
    zIndex: 1,
  },
});
