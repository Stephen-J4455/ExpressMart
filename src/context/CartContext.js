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

const STORAGE_KEY = "expressmart.cart";
const CartContext = createContext();

export const CartProvider = ({ children }) => {
  const [items, setItems] = useState([]);
  const [cartId, setCartId] = useState(null);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const { user } = useAuth();

  // Load cart from database or local storage
  const loadCart = useCallback(async () => {
    try {
      if (user && supabase) {
        // Load from database for authenticated users
        const { data: cart, error: cartError } = await supabase
          .from("express_carts")
          .select("id")
          .eq("user_id", user.id)
          .single();

        if (cartError && cartError.code !== "PGRST116") {
          console.warn("Error fetching cart:", cartError);
        }

        if (cart) {
          setCartId(cart.id);
          // Load cart items with product data
          const { data: cartItems, error: itemsError } = await supabase
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

          if (itemsError) {
            console.warn("Error fetching cart items:", itemsError);
          } else if (cartItems) {
            const formattedItems = cartItems
              .filter((item) => item.product) // Only include items with valid products
              .map((item) => ({
                id: item.id,
                product: item.product,
                quantity: item.quantity,
                size: item.size,
                color: item.color,
                variant_id: item.variant_id,
                price: item.price, // Store the discounted price
              }));
            setItems(formattedItems);
          }
        } else {
          // Create new cart for user
          const { data: newCart, error: createError } = await supabase
            .from("express_carts")
            .insert({ user_id: user.id })
            .select("id")
            .single();

          if (createError) {
            console.warn("Error creating cart:", createError);
          } else {
            setCartId(newCart.id);
          }
          setItems([]);
        }
      } else {
        // Load from local storage for guests
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          setItems(JSON.parse(raw));
        }
      }
    } catch (error) {
      console.warn("Failed to load cart", error);
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
          await supabase.from("express_cart_items").upsert(
            {
              cart_id: cartId,
              product_id: item.product.id,
              quantity: item.quantity,
              price:
                item.product.discount > 0
                  ? item.product.price * (1 - item.product.discount / 100)
                  : item.product.price,
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
  ) => {
    if (user && cartId && supabase) {
      // Add to database
      try {
        // Build query to check for existing item
        let query = supabase
          .from("express_cart_items")
          .select("id, quantity")
          .eq("cart_id", cartId)
          .eq("product_id", product.id);

        // Handle null values properly
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
          // Update quantity
          const { error: updateError } = await supabase
            .from("express_cart_items")
            .update({ quantity: existing.quantity + quantity })
            .eq("id", existing.id);

          if (updateError) {
            console.warn("Error updating cart item:", updateError);
          }
        } else {
          // Insert new item
          const { error: insertError } = await supabase
            .from("express_cart_items")
            .insert({
              cart_id: cartId,
              product_id: product.id,
              quantity,
              price:
                product.discount > 0
                  ? product.price * (1 - product.discount / 100)
                  : product.price,
              size,
              color,
            });

          if (insertError) {
            console.warn("Error inserting cart item:", insertError);
          }
        }
        // Reload cart
        await loadCart();
      } catch (error) {
        console.warn("Failed to add to cart:", error);
      }
    } else {
      // Add to local state for guests
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
              ? { ...item, quantity: item.quantity + quantity }
              : item,
          );
        }
        return [
          ...prev,
          {
            product,
            quantity,
            size,
            color,
            price:
              product.discount > 0
                ? product.price * (1 - product.discount / 100)
                : product.price,
          },
        ];
      });
    }
  };

  const updateQuantity = async (productId, quantity, itemId = null) => {
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
      }
    } else {
      setItems((prev) =>
        prev
          .map((item) =>
            item.product.id === productId ? { ...item, quantity } : item,
          )
          .filter((item) => item.quantity > 0),
      );
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
