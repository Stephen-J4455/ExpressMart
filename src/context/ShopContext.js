import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";
import { trackEvent } from "../services/feedPersonalizationService";

const ShopContext = createContext();

const CACHE_KEYS = {
  products: "expressmart.cache.products",
  categories: "expressmart.cache.categories",
  sellers: "expressmart.cache.sellers",
  settings: "expressmart.cache.settings",
};
const PAGE_SIZE = 24;
const isOfflineNetworkError = (error) => {
  const message = String(error?.message || error || "");
  return /(UnknownHostException|No address associated with hostname|fetch failed|Network request failed|Failed to fetch|ERR_NETWORK|ERR_INTERNET_DISCONNECTED|resolve host|offline|timed out)/i.test(
    message,
  );
};
const mapProduct = (product) => ({
  id: product.id,
  title: product.title,
  vendor: product.vendor,
  price: Number(product.price || 0),
  shipping_fee: Number(product.shipping_fee || 0),
  rating: Number(product.rating || 0),
  badges: product.badges || [],
  thumbnail: product.thumbnail,
  thumbnails: product.thumbnails || [],
  video_url: product.video_url || null,
  video_hls_url: product.video_hls_url || null,
  category: product.category,
  description: product.description,
  discount: product.discount || 0,
  quantity: product.quantity || 0,
  is_preorder: product.is_preorder || false,
  allow_backorder: product.allow_backorder || false,
  sizes: product.sizes || [],
  colors: product.colors || [],
  specifications: product.specifications || null,
  tags: product.tags || [],
  weight: product.weight || null,
  weight_unit: product.weight_unit || null,
  sku: product.sku || null,
  barcode: product.barcode || null,
  seller: product.seller_id || null,
  // Engagement counters (attached fresh by cached-products on every fetch).
  // Without these, feed cards show "Q&A"/blank until opened.
  comments_count: Number(product.comments_count || 0),
  likes_count: Number(product.likes_count || 0),
});

export const ShopProvider = ({ children }) => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState(null);
  const [followedSellers, setFollowedSellers] = useState([]);

  // Guard so the initial bootstrap (loadCache + first fetchProducts) runs
  // exactly once. Without this, the effect re-runs whenever a dependency's
  // identity changes (e.g. `supabase` resolves after auth init, which changes
  // `fetchProducts`), causing a second fetch that overwrites the feed and
  // produces a visible flicker.
  const bootstrappedRef = useRef(false);

  const loadCache = useCallback(async () => {
    try {
      const [cachedProducts, cachedCategories, cachedSellers, cachedSettings] =
        await Promise.all([
          AsyncStorage.getItem(CACHE_KEYS.products),
          AsyncStorage.getItem(CACHE_KEYS.categories),
          AsyncStorage.getItem(CACHE_KEYS.sellers),
          AsyncStorage.getItem(CACHE_KEYS.settings),
        ]);

      if (cachedProducts) {
        const { data } = JSON.parse(cachedProducts);
        if (Array.isArray(data) && data.length > 0) setProducts(data);
      }
      if (cachedCategories) {
        const { data } = JSON.parse(cachedCategories);
        if (Array.isArray(data)) setCategories(data);
      }
      if (cachedSellers) {
        const { data } = JSON.parse(cachedSellers);
        if (Array.isArray(data)) setSellers(data);
      }
      if (cachedSettings) {
        const { data } = JSON.parse(cachedSettings);
        if (data && typeof data === "object") setSettings(data);
      }

      return true;
    } catch (e) {
      // Cache read failure is non-fatal
      return false;
    }
  }, []);

  const saveCache = useCallback(async (key, data) => {
    try {
      await AsyncStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
    } catch (e) {
      // Cache write failure is non-fatal
    }
  }, []);

  const readCacheProducts = useCallback(async () => {
    try {
      const cached = await AsyncStorage.getItem(CACHE_KEYS.products);
      if (!cached) return null;
      const { data } = JSON.parse(cached);
      if (Array.isArray(data) && data.length > 0) return data;
      return null;
    } catch (e) {
      return null;
    }
  }, []);

  // Fetch products from the Upstash-backed edge function with a hard timeout
  // so a slow network fails fast and we can fall back to the local cache.
  //
  // `userId` is forwarded to the edge function so the "For You" feed can
  // re-order the cached set per user on page 0. The server takes the
  // user id from the body's `userId` field only when the JWT also matches
  // (enforced inside the edge function), so passing a stale id is safe —
  // the server just falls back to the recency-sorted feed.
  const fetchFromUpstash = useCallback(
    async (offset, limit, { userId = null } = {}) => {
      if (!supabase) throw new Error("Supabase not initialized");
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Upstash request timed out")), 4000),
      );
      const page = Math.floor(offset / Math.max(1, limit));
      const body = { offset, limit, page };
      if (userId) body.userId = userId;
      const call = supabase.functions.invoke("cached-products", {
        body,
      });
      const { data, error } = await Promise.race([call, timeoutPromise]);
      if (error) throw error;
      return data;
    },
    [supabase],
  );

  const fetchProducts = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      setError(null);
      if (!supabase) {
        console.error("Supabase not initialized");
        if (!silent) setLoading(false);
        return;
      }

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const [
          { data: categoriesData, error: categoriesError },
          { data: sellersData, error: sellersError },
          { data: reviewsData, error: reviewsError },
          { data: settingsData, error: settingsError },
          { data: followsData, error: followsError },
        ] = await Promise.all([
          supabase
            .from("express_categories")
            .select("id,name,icon,color")
            .eq("is_active", true)
            .order("sort_order"),
          supabase
            .from("express_sellers")
            .select(
              "id,name,avatar,rating,total_ratings,badges,store_description,social_facebook,social_instagram,social_twitter,social_whatsapp,social_website,theme_color,theme_apply_customer",
            )
            .eq("is_active", true)
            .order("rating", { ascending: false })
            .limit(10),
          supabase
            .from("express_reviews")
            .select("product_id, rating")
            .eq("is_approved", true),
          supabase.from("express_settings").select("key, value"),
          user
            ? supabase
                .from("express_follows")
                .select("seller_id")
                .eq("user_id", user.id)
            : { data: [], error: null },
        ]);

        if (categoriesError) throw categoriesError;
        if (sellersError) throw sellersError;
        if (reviewsError) throw reviewsError;
        if (settingsError) throw settingsError;
        if (followsError) throw followsError;

        // Extract followed seller IDs
        const followedIds = (followsData || []).map((f) => f.seller_id);
        setFollowedSellers(followedIds);

        // Map settings to object
        const settingsMap = {};
        (settingsData || []).forEach((s) => {
          settingsMap[s.key] = s.value;
        });
        setSettings(settingsMap);

        let productsData = [];
        let fromLocalCache = false;
        try {
          const cachedData = await fetchFromUpstash(0, PAGE_SIZE, {
            userId: user?.id || null,
          });
          const cacheSource = cachedData?.cache?.source || "redis";
          const personalized = !!cachedData?.cache?.personalized;
          console.info(
            `[ShopContext] Network sync fetched products through cached-products (${cacheSource})${personalized ? " (personalized)" : ""}`,
          );
          productsData = cachedData?.products || [];
        } catch (upstashErr) {
          console.warn(
            "[ShopContext] cached-products fetch failed, falling back to local cache:",
            upstashErr?.message || JSON.stringify(upstashErr),
          );
          const localProducts = await readCacheProducts();
          if (localProducts && localProducts.length > 0) {
            productsData = localProducts;
            fromLocalCache = true;
          }
        }

        // Local cache already stores mapped products, so skip re-mapping there.
        const mappedProducts = fromLocalCache
          ? productsData || []
          : (productsData || []).map(mapProduct);
        setProducts(mappedProducts);
        setHasMore(mappedProducts.length === PAGE_SIZE);

        // Calculate seller ratings from actual reviews
        const sellerRatings = {};
        (reviewsData || []).forEach((review) => {
          // Find the product to get the seller_id
          const product = mappedProducts.find(
            (p) => p.id === review.product_id,
          );
          if (product?.seller?.id) {
            if (!sellerRatings[product.seller.id]) {
              sellerRatings[product.seller.id] = {
                totalRating: 0,
                count: 0,
              };
            }
            sellerRatings[product.seller.id].totalRating += review.rating;
            sellerRatings[product.seller.id].count += 1;
          }
        });

        // Update sellers with calculated ratings
        const updatedSellers = (sellersData || []).map((seller) => {
          const sellerStats = sellerRatings[seller.id];
          if (sellerStats && sellerStats.count > 0) {
            const calculatedRating =
              sellerStats.totalRating / sellerStats.count;
            return {
              ...seller,
              rating: Number(calculatedRating.toFixed(1)),
              total_ratings: sellerStats.count,
            };
          }
          return {
            ...seller,
            rating: 0,
            total_ratings: 0,
          };
        });

        setCategories(categoriesData || []);
        setSellers(updatedSellers);

        // Persist to cache for instant loads next time
        saveCache(CACHE_KEYS.products, mappedProducts);
        saveCache(CACHE_KEYS.categories, categoriesData || []);
        saveCache(CACHE_KEYS.sellers, updatedSellers);
        saveCache(CACHE_KEYS.settings, settingsMap);
      } catch (err) {
        if (!isOfflineNetworkError(err)) {
          console.error(
            "Error fetching products:",
            err?.message || JSON.stringify(err),
          );
        } else {
          console.warn(
            "[ShopContext] Offline or DNS resolution failed; using cached products.",
          );
        }

        // OFFLINE FALLBACK — when the whole network sync fails before anything
        // is on screen, hydrate the feed from the last snapshot persisted in
        // AsyncStorage instead of leaving the home page blank until
        // connectivity returns.
        if (products.length === 0) {
          const cachedProducts = await readCacheProducts();
          if (cachedProducts && cachedProducts.length > 0) {
            console.warn(
              `[ShopContext] Network sync failed — serving ${cachedProducts.length} cached product(s) from local storage.`,
            );
            setProducts(cachedProducts);
            // The disk snapshot is a single finite page — disable further
            // infinite-scroll paging so we don't hammer the network offline.
            setHasMore(false);
            // Rehydrate categories/sellers/settings so the rest of the home
            // page (category strip, top sellers) matches the cached feed.
            await loadCache();
            return;
          }
          if (!isOfflineNetworkError(err)) {
            setError(err?.message || JSON.stringify(err));
          }
        } else {
          console.warn(
            "Network sync failed, continuing with local cache:",
            err?.message || JSON.stringify(err),
          );
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [
      products.length,
      saveCache,
      fetchFromUpstash,
      readCacheProducts,
      loadCache,
    ],
  );

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || loading) return;
    setLoadingMore(true);
    try {
      const start = products.length;

      // Resolve the current user id for the personalization layer. The
      // server only re-ranks on page 0 (offset < PAGE_SIZE), so the id
      // is technically optional here, but we forward it for symmetry
      // with the page-0 path. Same auth.getUser() pattern as fetchProducts.
      let loadMoreUserId = null;
      if (supabase) {
        try {
          const {
            data: { user: currentUser },
          } = await supabase.auth.getUser();
          loadMoreUserId = currentUser?.id || null;
        } catch {
          // Non-fatal: anonymous / unauthenticated loadMore is fine.
        }
      }

      let rows = [];
      try {
        const cachedData = await fetchFromUpstash(start, PAGE_SIZE, {
          userId: loadMoreUserId,
        });
        const cacheSource = cachedData?.cache?.source || "redis";
        console.info(
          `[ShopContext] loadMore products fetched through cached-products (${cacheSource}, offset=${start})`,
        );
        rows = cachedData?.products || [];
      } catch (upstashErr) {
        console.warn(
          `[ShopContext] loadMore failed through cached-products (offset=${start}); keeping current feed`,
          upstashErr?.message || JSON.stringify(upstashErr),
        );
      }

      const newProducts = rows.map(mapProduct);
      const allProducts = [...products, ...newProducts];
      setProducts(allProducts);
      setHasMore(newProducts.length === PAGE_SIZE);
      saveCache(CACHE_KEYS.products, allProducts);
    } catch (err) {
      console.warn("loadMore error:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, loading, products, saveCache, fetchFromUpstash]);

  const refreshSellers = useCallback(async () => {
    await fetchProducts({ silent: true });
  }, [fetchProducts]);

  const followSeller = useCallback(async (sellerId) => {
    if (!supabase) return;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const { error } = await supabase.from("express_follows").insert({
        user_id: user.id,
        seller_id: sellerId,
      });

      if (error) throw error;

      setFollowedSellers((prev) => [...prev, sellerId]);
      // Personalization signal: user has expressed sustained interest in
      // this seller, so boost it in the For-You feed.
      trackEvent("follow", { sellerId });
    } catch (err) {
      console.error("Error following seller:", err);
      throw err;
    }
  }, []);

  const unfollowSeller = useCallback(async (sellerId) => {
    if (!supabase) return;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const { error } = await supabase
        .from("express_follows")
        .delete()
        .eq("user_id", user.id)
        .eq("seller_id", sellerId);

      if (error) throw error;

      setFollowedSellers((prev) => prev.filter((id) => id !== sellerId));
      // Personalization signal: decay this seller's contribution to the
      // For-You ranking.
      trackEvent("unfollow", { sellerId });
    } catch (err) {
      console.error("Error unfollowing seller:", err);
      throw err;
    }
  }, []);

  const isFollowing = useCallback(
    (sellerId) => followedSellers.includes(sellerId),
    [followedSellers],
  );

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    const bootstrap = async () => {
      // Categories/sellers/settings are pre-hydrated from local cache for a
      // fast first paint, but PRODUCTS are NOT — the "For You" feed must load
      // from Upstash first, with the local cache only used as a fallback when
      // Upstash fails (handled inside fetchProducts).
      await loadCache();
      console.info(
        "[ShopContext] Bootstrap order: Upstash Redis first -> local cache fallback",
      );
      await fetchProducts();
    };
    bootstrap();
    // Run once on mount. Dependencies are intentionally omitted: the ref guard
    // guarantees a single execution, and re-running on dependency changes is
    // exactly what caused the duplicate fetch + feed flicker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime subscriptions — update products/sellers in-place without full reload
  useEffect(() => {
    if (!supabase) return;

    const productsChannel = supabase
      .channel("shop-products-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "express_products",
          filter: "status=eq.active&quantity=gt.0",
        },
        (payload) => {
          // Only insert if quantity > 0 (filter should already ensure this)
          if (!payload.new || (payload.new.quantity || 0) <= 0) return;
          const newProduct = mapProduct(payload.new);
          setProducts((prev) => {
            if (prev.some((p) => p.id === newProduct.id)) return prev;
            return [newProduct, ...prev];
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "express_products",
        },
        (payload) => {
          // If product deactivated or now out of stock, remove it
          if (
            payload.new.status !== "active" ||
            (payload.new.quantity || 0) <= 0
          ) {
            setProducts((prev) => prev.filter((p) => p.id !== payload.new.id));
            return;
          }
          const updated = mapProduct(payload.new);
          setProducts((prev) => {
            const exists = prev.some((p) => p.id === updated.id);
            if (exists) {
              return prev.map((p) => (p.id === updated.id ? updated : p));
            }
            return [updated, ...prev];
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "express_products",
        },
        (payload) => {
          setProducts((prev) => prev.filter((p) => p.id !== payload.old.id));
        },
      )
      .subscribe();

    const sellersChannel = supabase
      .channel("shop-sellers-realtime")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "express_sellers",
        },
        (payload) => {
          setSellers((prev) =>
            prev.map((s) =>
              s.id === payload.new.id ? { ...s, ...payload.new } : s,
            ),
          );
        },
      )
      .subscribe();

    return () => {
      if (
        productsChannel &&
        typeof productsChannel.unsubscribe === "function"
      ) {
        Promise.resolve(productsChannel.unsubscribe()).catch((error) => {
          console.warn("Products realtime cleanup failed:", error);
        });
      }
      if (sellersChannel && typeof sellersChannel.unsubscribe === "function") {
        Promise.resolve(sellersChannel.unsubscribe()).catch((error) => {
          console.warn("Sellers realtime cleanup failed:", error);
        });
      }
    };
  }, []);

  const value = useMemo(
    () => ({
      products,
      categories,
      sellers,
      settings,
      loading,
      loadingMore,
      hasMore,
      error,
      refresh: fetchProducts,
      refreshSellers,
      loadMore,
      followedSellers,
      followSeller,
      unfollowSeller,
      isFollowing,
    }),
    [
      products,
      categories,
      sellers,
      settings,
      loading,
      loadingMore,
      hasMore,
      error,
      refreshSellers,
      loadMore,
      followedSellers,
      followSeller,
      unfollowSeller,
      isFollowing,
    ],
  );

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
};

export const useShop = () => {
  const context = useContext(ShopContext);
  if (!context) {
    throw new Error("useShop must be used within a ShopProvider");
  }
  return context;
};
