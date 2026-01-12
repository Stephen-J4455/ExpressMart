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
  seller: product.seller || null,
});

export const ShopProvider = ({ children }) => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (!supabase) {
      setLoading(false);
      return;
    }

    try {
      const [
        { data: productsData, error: productError },
        { data: categoriesData, error: categoriesError },
      ] = await Promise.all([
        supabase
          .from("express_products")
          .select("*, seller:express_sellers(badges)")
          .eq("status", "active")
          .order("created_at", { ascending: false }),
        supabase
          .from("express_categories")
          .select("id,name,icon,color")
          .eq("is_active", true)
          .order("sort_order"),
      ]);

      if (productError) throw productError;
      if (categoriesError) throw categoriesError;

      setProducts((productsData || []).map(mapProduct));
      setCategories(categoriesData || []);
    } catch (err) {
      setError(err.message);
      console.error("Error fetching products:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const value = useMemo(
    () => ({ products, categories, loading, error, refresh: fetchProducts }),
    [products, categories, loading, error, fetchProducts]
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
