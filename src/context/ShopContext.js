import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";

const ShopContext = createContext();

const CACHE_KEYS = {
  products: "expressmart.cache.products",
  categories: "expressmart.cache.categories",
  sellers: "expressmart.cache.sellers",
  settings: "expressmart.cache.settings",
};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const PAGE_SIZE = 24;

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
  category: product.category,
  description: product.description,
  discount: product.discount || 0,
  quantity: product.quantity || 0,
  sizes: product.sizes || [],
  colors: product.colors || [],
  specifications: product.specifications || null,
  tags: product.tags || [],
  weight: product.weight || null,
  weight_unit: product.weight_unit || null,
  sku: product.sku || null,
  barcode: product.barcode || null,
  seller: product.seller_id || null,
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

  // Load cached data on mount for instant display
  useEffect(() => {
    const loadCache = async () => {
      try {
        const [
          cachedProducts,
          cachedCategories,
          cachedSellers,
          cachedSettings,
        ] = await Promise.all([
          AsyncStorage.getItem(CACHE_KEYS.products),
          AsyncStorage.getItem(CACHE_KEYS.categories),
          AsyncStorage.getItem(CACHE_KEYS.sellers),
          AsyncStorage.getItem(CACHE_KEYS.settings),
        ]);
        if (cachedProducts) {
          const { data, ts } = JSON.parse(cachedProducts);
          if (Date.now() - ts < CACHE_TTL) setProducts(data);
        }
        if (cachedCategories) {
          const { data, ts } = JSON.parse(cachedCategories);
          if (Date.now() - ts < CACHE_TTL) setCategories(data);
        }
        if (cachedSellers) {
          const { data, ts } = JSON.parse(cachedSellers);
          if (Date.now() - ts < CACHE_TTL) setSellers(data);
        }
        if (cachedSettings) {
          const { data, ts } = JSON.parse(cachedSettings);
          if (Date.now() - ts < CACHE_TTL) setSettings(data);
        }
      } catch (e) {
        // Cache read failure is non-fatal
      }
    };
    loadCache();
  }, []);

  const saveCache = useCallback(async (key, data) => {
    try {
      await AsyncStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
    } catch (e) {
      // Cache write failure is non-fatal
    }
  }, []);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (!supabase) {
      console.error("Supabase not initialized");
      setLoading(false);
      return;
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const [
        { data: productsData, error: productError },
        { data: categoriesData, error: categoriesError },
        { data: sellersData, error: sellersError },
        { data: reviewsData, error: reviewsError },
        { data: settingsData, error: settingsError },
        { data: followsData, error: followsError },
      ] = await Promise.all([
        supabase
          .from("express_products")
          .select(
            "*, seller_id(id,name,avatar,rating,total_ratings,badges,store_description,social_facebook,social_instagram,social_twitter,social_whatsapp,social_website,theme_color,theme_apply_customer)",
          )
          .eq("status", "active")
          .gt("quantity", 0)
          .order("created_at", { ascending: false })
          .range(0, PAGE_SIZE - 1),
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

      if (productError) throw productError;
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

      const mappedProducts = (productsData || []).map(mapProduct);
      setProducts(mappedProducts);
      setHasMore(mappedProducts.length === PAGE_SIZE);

      // Calculate seller ratings from actual reviews
      const sellerRatings = {};
      (reviewsData || []).forEach((review) => {
        // Find the product to get the seller_id
        const product = mappedProducts.find((p) => p.id === review.product_id);
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
          const calculatedRating = sellerStats.totalRating / sellerStats.count;
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
      setError(err?.message || JSON.stringify(err));
      console.error(
        "Error fetching products:",
        err?.message || JSON.stringify(err),
      );
    } finally {
      setLoading(false);
    }
  }, [saveCache]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || loading) return;
    setLoadingMore(true);
    try {
      const start = products.length;
      const end = start + PAGE_SIZE - 1;
      const { data, error: fetchError } = await supabase
        .from("express_products")
        .select(
          "*, seller_id(id,name,avatar,rating,total_ratings,badges,store_description,social_facebook,social_instagram,social_twitter,social_whatsapp,social_website,theme_color,theme_apply_customer)",
        )
        .eq("status", "active")
        .gt("quantity", 0)
        .order("created_at", { ascending: false })
        .range(start, end);

      if (fetchError) throw fetchError;
      const newProducts = (data || []).map(mapProduct);
      const allProducts = [...products, ...newProducts];
      setProducts(allProducts);
      setHasMore(newProducts.length === PAGE_SIZE);
      saveCache(CACHE_KEYS.products, allProducts);
    } catch (err) {
      console.warn("loadMore error:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, loading, products, saveCache]);

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
    fetchProducts();
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
      productsChannel.unsubscribe();
      sellersChannel.unsubscribe();
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
