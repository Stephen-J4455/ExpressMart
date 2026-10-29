// ── useScreenIndexing ───────────────────────────────────────────────────────
// Opt-in helpers that let a screen register items + scrollable surfaces
// with TagAIAssistantContext. The agent's `read_screen` / `find_on_screen` /
// `scroll` / `scroll_to` tools read from these registries.
//
// Usage in a screen:
//   useEffect(() => { setActiveRoute('Home'); }, [setActiveRoute]);
//   const cardRef = useScreenIndexing('product-abc', {
//     text: 'Wireless earbuds', role: 'product', meta: { price: 199 },
//   }, [product.id]);
//   <View ref={cardRef}>...</View>
//
//   const listRef = useScrollSurface('home-feed', { measure, scrollBy, scrollToIndex });

import { useEffect, useRef } from "react";
import { useTagAIAssistant } from "../context/TagAIAssistantContext";

/**
 * Register a single item against the live screen index.
 * Returns a ref to attach to the underlying View.
 */
export const useScreenIndexing = (id, entry, deps = []) => {
  const { registerScreenItem, unregisterScreenItem } = useTagAIAssistant();
  const ref = useRef(null);

  useEffect(() => {
    if (!id) return undefined;
    registerScreenItem(id, { ...(entry || {}), ref, ts: Date.now() });
    return () => unregisterScreenItem(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, ...deps]);

  return ref;
};

/**
 * useScreenIndexingList — register many items in one shot. Useful for
 * FlatList renderItem callbacks where individual useScreenIndexing would
 * allocate too many effects.
 *
 *   const refFor = useScreenIndexingList('feed', products);
 *   renderItem={({ item, index }) => (
 *     <View ref={refFor(item.id)}>...</View>
 *   )}
 */
export const useScreenIndexingList = (routeName, items) => {
  const { registerScreenItem, unregisterScreenItem, setActiveRoute } =
    useTagAIAssistant();
  // Track ids across renders so we can unregister the ones that left.
  const seenRef = useRef(new Set());

  useEffect(() => {
    setActiveRoute(routeName);
    return () => setActiveRoute(null);
  }, [routeName, setActiveRoute]);

  useEffect(() => {
    const list = Array.isArray(items) ? items : [];
    const nextSeen = new Set();
    list.forEach((item, index) => {
      if (!item?.id) return;
      const id = String(item.id);
      nextSeen.add(id);
      registerScreenItem(id, {
        route: routeName,
        text: item.title || item.text || item.label || null,
        role: item.role || (item.title ? "product" : "row"),
        meta: {
          ...(item.meta || {}),
          index,
          category: item.category || null,
          price: item.price ?? null,
        },
        surface: item.surface || routeName,
        ref: item.ref || null,
        ts: Date.now(),
      });
    });
    // Unregister items that left the list.
    for (const oldId of seenRef.current) {
      if (!nextSeen.has(oldId)) unregisterScreenItem(oldId);
    }
    seenRef.current = nextSeen;
  }, [items, routeName, registerScreenItem, unregisterScreenItem]);

  // Helper to attach a ref to a row given its id.
  const refFor = (id) => (id ? createIndexRef(id, routeName) : null);
  return refFor;
};

// Local helper that returns a stable callback ref which registers the
// underlying view into the index. Used by refFor().
const indexRefCache = new Map();
const createIndexRef = (id, route) => {
  if (indexRefCache.has(id)) return indexRefCache.get(id);
  const ref = { current: null };
  indexRefCache.set(id, ref);
  return ref;
};

/**
 * useScrollSurface — register a scrollable surface (FlatList / ScrollView)
 * with the agent. Returns a ref to attach to the underlying component and
 * an imperative `scrollBy` / `scrollTo` / `scrollToIndex` API.
 */
export const useScrollSurface = (key, surfaceApi) => {
  const { registerScrollSurface, unregisterScrollSurface } = useTagAIAssistant();
  const ref = useRef(null);
  const apiRef = useRef(surfaceApi);

  useEffect(() => {
    apiRef.current = surfaceApi;
  });

  useEffect(() => {
    if (!key) return undefined;
    // The surface object exposes measure + (scrollBy | scrollTo |
    // scrollToIndex). We pass through any imperative methods the caller
    // provides, and stub the rest with the ref's native equivalents.
    const surface = {
      measure: surfaceApi?.measure || null,
      scrollBy:
        surfaceApi?.scrollBy ||
        ((dx, dy, animated) => {
          const node = ref.current;
          if (node && typeof node.scrollTo === "function") {
            node.scrollTo({ x: dx, y: dy, animated: animated !== false });
          }
        }),
      scrollTo: surfaceApi?.scrollTo || null,
      scrollToIndex: surfaceApi?.scrollToIndex || null,
      scrollToOffset: surfaceApi?.scrollToOffset || null,
    };
    registerScrollSurface(key, surface);
    return () => unregisterScrollSurface(key);
  }, [key, registerScrollSurface, unregisterScrollSurface]);

  return ref;
};
