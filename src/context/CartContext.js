import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";
import { trackEvent } from "../services/feedPersonalizationService";

const STORAGE_KEY = "expressmart.cart";
const CartContext = createContext();

const isOfflineNetworkError = (error) => {
  const message = String(error?.message || error || "");
  return /(UnknownHostException|No address associated with hostname|fetch failed|Network request failed|Failed to fetch|ERR_NETWORK|ERR_INTERNET_DISCONNECTED|resolve host|offline|timed out)/i.test(
    message,
  );
};

const readLocalCart = async () => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const normalizeCartProduct = (product) => {
  if (!product || typeof product !== "object") return product;

  const safeSeller = product.seller || product.seller_id || null;
  const thumbnails = Array.isArray(product.thumbnails)
    ? product.thumbnails.filter(Boolean)
    : Array.isArray(product.images)
      ? product.images.filter(Boolean)
      : product.thumbnail
        ? [product.thumbnail]
        : [];

  return {
    ...product,
    seller: safeSeller,
    seller_id: safeSeller,
    thumbnails,
    thumbnail: product.thumbnail || thumbnails[0] || null,
    tags: Array.isArray(product.tags) ? product.tags : [],
    colors: Array.isArray(product.colors) ? product.colors : [],
    sizes: Array.isArray(product.sizes) ? product.sizes : [],
    images: thumbnails,
  };
};

export const CartProvider = ({ children }) => {
  const [items, setItems] = useState([]);
  const [cartId, setCartId] = useState(null);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const { user } = useAuth();

  // Load cart from database or local storage
  const loadCart = useCallback(async () => {
    const localFallback = await readLocalCart();
    if (localFallback.length > 0) {
      setItems(localFallback);
    }

    try {
      if (user && supabase) {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Cart load timed out")), 5000),
        );

        const cartQuery = supabase
          .from("express_carts")
          .select("id")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const { data: cart, error: cartError } = await Promise.race([
          cartQuery,
          timeoutPromise,
        ]);

        if (cartError) {
          console.warn("Error fetching cart:", cartError);
        }

        if (cart) {
          setCartId(cart.id);
          const cartItemsQuery = supabase
            .from("express_cart_items")
            .select(
              `
              id,
              product_id,
              quantity,
              size,
              color,
              variant_id,
              price,
              product:express_products(*)
            `,
            )
            .eq("cart_id", cart.id);

          const { data: cartItems, error: itemsError } = await Promise.race([
            cartItemsQuery,
            timeoutPromise,
          ]);

          if (itemsError) {
            console.warn("Error fetching cart items:", itemsError);
          } else if (cartItems) {
            const formattedItems = cartItems
              .filter((item) => item.product)
              .map((item) => ({
                id: item.id,
                product: normalizeCartProduct(item.product),
                quantity: item.quantity,
                size: item.size,
                color: item.color,
                variant_id: item.variant_id,
                price: item.price,
              }));
            setItems(formattedItems);
          }
        } else {
          const { data: newCart, error: createError } = await Promise.race([
            supabase
              .from("express_carts")
              .insert({ user_id: user.id })
              .select("id")
              .single(),
            timeoutPromise,
          ]);

          if (createError) {
            console.warn("Error creating cart:", createError);
            if (createError.code === "23505") {
              const { data: existingCart, error: existingCartError } =
                await Promise.race([
                  supabase
                    .from("express_carts")
                    .select("id")
                    .eq("user_id", user.id)
                    .order("created_at", { ascending: false })
                    .limit(1)
                    .maybeSingle(),
                  timeoutPromise,
                ]);
              if (existingCartError) {
                console.warn(
                  "Error loading existing cart after unique violation:",
                  existingCartError,
                );
              } else if (existingCart) {
                setCartId(existingCart.id);
              }
            }
          } else if (newCart) {
            setCartId(newCart.id);
          }

          if (localFallback.length > 0) {
            setItems(localFallback);
          } else {
            setItems([]);
          }
        }
      } else {
        // Load from local storage for guests
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setItems(parsed);
        }
      }
    } catch (error) {
      if (isOfflineNetworkError(error)) {
        const cached = await readLocalCart();
        if (cached.length > 0) setItems(cached);
        else setItems([]);
        return;
      }
      console.warn("Failed to load cart", error);
      const cached = await readLocalCart();
      if (cached.length > 0) setItems(cached);
    } finally {
      setReady(true);
    }
  }, [user]);

  useEffect(() => {
    loadCart();
  }, [loadCart]);

  // Persist to local storage for guests
  useEffect(() => {
    if (!ready || user) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items)).catch((error) =>
      console.warn("Failed to persist cart", error),
    );
  }, [items, ready, user]);

  // Sync local cart to database when user logs in
  useEffect(() => {
    const syncLocalCartToDatabase = async () => {
      if (!user || !cartId || !supabase || syncing) return;

      // Check if there are local items to sync
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const localItems = JSON.parse(raw);
      if (localItems.length === 0) return;

      setSyncing(true);
      try {
        for (const item of localItems) {
          // Prefer the stored item.price (may be a flash-sale price) over recalculating;
          // fall back to discount-based calculation only when no stored price exists.
          const syncPrice =
            item.price != null && item.price > 0
              ? item.price
              : item.product.discount > 0
                ? item.product.price * (1 - item.product.discount / 100)
                : item.product.price;
          await supabase.from("express_cart_items").upsert(
            {
              cart_id: cartId,
              product_id: item.product.id,
              quantity: item.quantity,
              price: syncPrice,
              size: item.size || null,
              color: item.color || null,
              variant_id: item.variant_id || null,
            },
            {
              onConflict: "cart_id,product_id,size,color,variant_id",
            },
          );
        }
        // Clear local storage after syncing
        await AsyncStorage.removeItem(STORAGE_KEY);
        // Reload cart from database
        await loadCart();
      } catch (error) {
        console.warn("Failed to sync cart to database:", error);
      } finally {
        setSyncing(false);
      }
    };

    syncLocalCartToDatabase();
  }, [user, cartId, syncing, loadCart]);

  const addToCart = async (
    product,
    quantity = 1,
    size = null,
    color = null,
    flashSalePrice = null,
  ) => {
    const effectivePrice =
      flashSalePrice !== null
        ? flashSalePrice
        : product.discount > 0
          ? product.price * (1 - product.discount / 100)
          : product.price;

    // Optimistic update — update UI immediately for snappy feel
    setItems((prev) => {
      const existing = prev.find(
        (item) =>
          item.product.id === product.id &&
          item.size === size &&
          item.color === color,
      );
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id &&
          item.size === size &&
          item.color === color
            ? {
                ...item,
                quantity: item.quantity + quantity,
                price: effectivePrice,
              }
            : item,
        );
      }
      return [
        ...prev,
        {
          id: `temp-${product.id}-${size ?? "x"}-${color ?? "x"}-${Date.now()}`,
          product: normalizeCartProduct(product),
          quantity,
          size,
          color,
          price: effectivePrice,
        },
      ];
    });

    if (user && cartId && supabase) {
      // Persist to database in background
      try {
        let query = supabase
          .from("express_cart_items")
          .select("id, quantity")
          .eq("cart_id", cartId)
          .eq("product_id", product.id);

        if (size === null) {
          query = query.is("size", null);
        } else {
          query = query.eq("size", size);
        }

        if (color === null) {
          query = query.is("color", null);
        } else {
          query = query.eq("color", color);
        }

        const { data: existing, error: selectError } =
          await query.maybeSingle();

        if (selectError) {
          console.warn("Error checking existing cart item:", selectError);
        }

        if (existing) {
          const { error: updateError } = await supabase
            .from("express_cart_items")
            .update({
              quantity: existing.quantity + quantity,
              price: effectivePrice,
            })
            .eq("id", existing.id);

          if (updateError) {
            console.warn("Error updating cart item:", updateError);
          }
        } else {
          const { error: insertError } = await supabase
            .from("express_cart_items")
            .insert({
              cart_id: cartId,
              product_id: product.id,
              quantity,
              price: effectivePrice,
              size,
              color,
            });

          if (insertError) {
            console.warn("Error inserting cart item:", insertError);
          } else {
            // Personalization signal: cart_add is one of the strongest
            // product-level signals (weight 8). We track the add itself
            // (not subsequent quantity updates) so the scorer isn't
            // flooded with duplicate signals on the same product.
            const sellerField = product.seller_id;
            const sellerId =
              typeof sellerField === "string"
                ? sellerField
                : sellerField && sellerField.id;
            trackEvent("cart_add", {
              productId: product.id,
              categoryId: product.category_id || undefined,
              category: product.category || undefined,
              sellerId,
              metadata: { quantity, size, color },
            });
          }
        }
        // Sync DB state back (silently, no loading state)
        loadCart();
      } catch (error) {
        console.warn("Failed to add to cart:", error);
        // Revert optimistic update on failure
        loadCart();
      }
    }
  };

  const updateQuantity = async (productId, quantity, itemId = null) => {
    // Optimistic update — immediate UI response for snappy feel
    setItems((prev) =>
      prev
        .map((item) =>
          (itemId ? item.id === itemId : item.product.id === productId)
            ? { ...item, quantity }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );

    if (user && cartId && supabase) {
      try {
        if (quantity <= 0) {
          // Remove item
          if (itemId) {
            await supabase.from("express_cart_items").delete().eq("id", itemId);
          } else {
            await supabase
              .from("express_cart_items")
              .delete()
              .eq("cart_id", cartId)
              .eq("product_id", productId);
          }
        } else {
          // Update quantity
          if (itemId) {
            await supabase
              .from("express_cart_items")
              .update({ quantity })
              .eq("id", itemId);
          } else {
            await supabase
              .from("express_cart_items")
              .update({ quantity })
              .eq("cart_id", cartId)
              .eq("product_id", productId);
          }
        }
        await loadCart();
      } catch (error) {
        console.warn("Failed to update quantity:", error);
        // Revert optimistic update on failure
        loadCart();
      }
    }
  };

  const removeFromCart = async (
    productId,
    size = null,
    color = null,
    itemId = null,
  ) => {
    if (user && cartId && supabase) {
      try {
        if (itemId) {
          await supabase.from("express_cart_items").delete().eq("id", itemId);
        } else {
          // Delete by product_id, size, color
          let query = supabase
            .from("express_cart_items")
            .delete()
            .eq("cart_id", cartId)
            .eq("product_id", productId);

          if (size === null) {
            query = query.is("size", null);
          } else {
            query = query.eq("size", size);
          }

          if (color === null) {
            query = query.is("color", null);
          } else {
            query = query.eq("color", color);
          }

          await query;
        }
        await loadCart();
      } catch (error) {
        console.warn("Failed to remove from cart:", error);
      }
    } else {
      setItems((prev) =>
        prev.filter(
          (item) =>
            !(
              item.product.id === productId &&
              item.size === size &&
              item.color === color
            ),
        ),
      );
    }
  };

  const clearCart = async () => {
    if (user && cartId && supabase) {
      try {
        await supabase
          .from("express_cart_items")
          .delete()
          .eq("cart_id", cartId);
        setItems([]);
      } catch (error) {
        console.warn("Failed to clear cart:", error);
      }
    } else {
      setItems([]);
    }
  };

  const total = items.reduce((sum, item) => {
    // Use stored price for authenticated users, calculate for guests
    const price =
      item.price ||
      (item.product.discount > 0
        ? item.product.price * (1 - item.product.discount / 100)
        : item.product.price);
    return sum + Number(price || 0) * item.quantity;
  }, 0);

  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  const value = useMemo(
    () => ({
      ready,
      items,
      total,
      itemCount,
      cartId,
      addToCart,
      updateQuantity,
      removeFromCart,
      clearCart,
      refreshCart: loadCart,
    }),
    [ready, items, total, itemCount, cartId, loadCart],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
};
