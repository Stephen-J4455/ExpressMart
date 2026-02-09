import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../lib/supabase";

const ShopContext = createContext();

const mapProduct = (product) => ({
  id: product.id,
  title: product.title,
  vendor: product.vendor,
  price: Number(product.price || 0),
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
  const [error, setError] = useState(null);
  const [followedSellers, setFollowedSellers] = useState([]);

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
          .select("*, seller_id(id,name,avatar,rating,total_ratings,badges,social_facebook,social_instagram,social_twitter,social_whatsapp,social_website)")
          .eq("status", "active")
          .order("created_at", { ascending: false }),
        supabase
          .from("express_categories")
          .select("id,name,icon,color")
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("express_sellers")
          .select("id,name,avatar,rating,total_ratings,badges,social_facebook,social_instagram,social_twitter,social_whatsapp,social_website")
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
    } catch (err) {
      setError(err?.message || JSON.stringify(err));
      console.error(
        "Error fetching products:",
        err?.message || JSON.stringify(err),
      );
    } finally {
      setLoading(false);
    }
  }, []);

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
    [followedSellers]
  );

  useEffect(() => {
    fetchProducts();
  }, []);

  const value = useMemo(
    () => ({
      products,
      categories,
      sellers,
      settings,
      loading,
      error,
      refresh: fetchProducts,
      followedSellers,
      followSeller,
      unfollowSeller,
      isFollowing,
    }),
    [products, categories, sellers, settings, loading, error, followedSellers, followSeller, unfollowSeller, isFollowing],
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
