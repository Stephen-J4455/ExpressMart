import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import { Alert } from "react-native";
import { supabase, callEdgeFunction } from "../lib/supabase";
import { useAuth } from "./AuthContext";

const OrderContext = createContext();

export const OrderProvider = ({ children }) => {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch user's orders
  const fetchOrders = useCallback(async () => {
    if (!supabase || !user) return;

    setLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from("express_orders")
        .select(
          `
          *,
          items:express_order_items(*)
        `
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;
      setOrders(data || []);
    } catch (err) {
      setError(err.message);
      console.error("Error fetching orders:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Fetch user's addresses
  const fetchAddresses = useCallback(async () => {
    if (!supabase || !user) return;

    try {
      const { data, error: fetchError } = await supabase
        .from("express_addresses")
        .select("*")
        .eq("user_id", user.id)
        .order("is_default", { ascending: false });

      if (fetchError) throw fetchError;
      setAddresses(data || []);
    } catch (err) {
      console.error("Error fetching addresses:", err);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchOrders();
      fetchAddresses();
    } else {
      setOrders([]);
      setAddresses([]);
    }
  }, [user, fetchOrders, fetchAddresses]);

  // Set up realtime subscription for orders
  useEffect(() => {
    if (!supabase || !user) return;

    const subscription = supabase
      .channel("orders-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "express_orders",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log("Order change:", payload);
          if (payload.eventType === "INSERT") {
            setOrders((prev) => [payload.new, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setOrders((prev) =>
              prev.map((order) =>
                order.id === payload.new.id
                  ? { ...order, ...payload.new }
                  : order
              )
            );
          } else if (payload.eventType === "DELETE") {
            setOrders((prev) =>
              prev.filter((order) => order.id !== payload.old.id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user]);

  // Create a new order
  const createOrder = useCallback(
    async ({ items, shippingAddress, paymentMethod = "paystack" }) => {
      if (!supabase || !user) {
        Alert.alert("Error", "Please sign in to place an order");
        return { error: new Error("Not authenticated") };
      }

      try {
        // Calculate totals
        const subtotal = items.reduce(
          (sum, item) => sum + item.price * item.quantity,
          0
        );
        const shippingFee = subtotal >= 10000 ? 0 : 500; // Free shipping over GH₵10,000
        const total = subtotal + shippingFee;

        // Group items by seller/vendor
        const vendorItems = items.reduce((acc, item) => {
          const vendor = item.product.vendor || "ExpressMart";
          if (!acc[vendor]) acc[vendor] = [];
          acc[vendor].push(item);
          return acc;
        }, {});

        // Create orders for each vendor
        const createdOrders = [];
        for (const [vendor, vendorItemList] of Object.entries(vendorItems)) {
          const vendorSubtotal = vendorItemList.reduce(
            (sum, item) => sum + item.price * item.quantity,
            0
          );
          const vendorTotal =
            vendorSubtotal + shippingFee / Object.keys(vendorItems).length;

          // Create order
          const { data: order, error: orderError } = await supabase
            .from("express_orders")
            .insert({
              user_id: user.id,
              vendor,
              status: "pending_payment",
              subtotal: vendorSubtotal,
              shipping_fee: shippingFee / Object.keys(vendorItems).length,
              total: vendorTotal,
              currency: "NGN",
              customer: {
                name: shippingAddress.full_name,
                email: user.email,
                phone: shippingAddress.phone,
              },
              shipping_address: shippingAddress,
              payment_method: paymentMethod,
              payment_status: "pending",
            })
            .select()
            .single();

          if (orderError) throw orderError;

          // Create order items
          const orderItems = vendorItemList.map((item) => ({
            order_id: order.id,
            product_id: item.product.id,
            title: item.product.title,
            thumbnail: item.product.thumbnail || item.product.thumbnails?.[0],
            quantity: item.quantity,
            price: item.price,
            total: item.price * item.quantity,
            size: item.size,
            color: item.color,
          }));

          const { error: itemsError } = await supabase
            .from("express_order_items")
            .insert(orderItems);

          if (itemsError) throw itemsError;

          createdOrders.push(order);
        }

        // Combine orders for payment
        const totalAmount = createdOrders.reduce(
          (sum, o) => sum + Number(o.total),
          0
        );
        const primaryOrder = createdOrders[0];

        return {
          data: {
            orders: createdOrders,
            primaryOrder,
            total: totalAmount,
          },
          error: null,
        };
      } catch (err) {
        console.error("Create order error:", err);
        Alert.alert("Error", err.message);
        return { data: null, error: err };
      }
    },
    [user]
  );

  // Initialize Paystack payment
  const initializePayment = useCallback(
    async (orderId, amount, email) => {
      try {
        const result = await callEdgeFunction("initialize-payment", {
          email,
          amount,
          order_id: orderId,
          user_id: user?.id,
        });

        if (!result.success) {
          throw new Error(result.error || "Failed to initialize payment");
        }

        return result.data;
      } catch (err) {
        console.error("Initialize payment error:", err);
        Alert.alert("Payment Error", err.message);
        throw err;
      }
    },
    [user]
  );

  // Verify payment
  const verifyPayment = useCallback(
    async (reference, orderId) => {
      try {
        const result = await callEdgeFunction("verify-payment", {
          reference,
          order_id: orderId,
        });

        if (!result.success) {
          throw new Error(result.error || "Payment verification failed");
        }

        // Refresh orders
        await fetchOrders();

        return result.data;
      } catch (err) {
        console.error("Verify payment error:", err);
        throw err;
      }
    },
    [fetchOrders]
  );

  // Add address
  const addAddress = useCallback(
    async (addressData) => {
      if (!supabase || !user) return { error: new Error("Not authenticated") };

      try {
        const { data, error } = await supabase
          .from("express_addresses")
          .insert({ ...addressData, user_id: user.id })
          .select()
          .single();

        if (error) throw error;
        setAddresses((prev) => [...prev, data]);
        return { data, error: null };
      } catch (err) {
        Alert.alert("Error", err.message);
        return { data: null, error: err };
      }
    },
    [user]
  );

  // Update address
  const updateAddress = useCallback(
    async (addressId, updates) => {
      if (!supabase || !user) return { error: new Error("Not authenticated") };

      try {
        const { data, error } = await supabase
          .from("express_addresses")
          .update(updates)
          .eq("id", addressId)
          .eq("user_id", user.id)
          .select()
          .single();

        if (error) throw error;
        setAddresses((prev) =>
          prev.map((addr) => (addr.id === addressId ? data : addr))
        );
        return { data, error: null };
      } catch (err) {
        Alert.alert("Error", err.message);
        return { data: null, error: err };
      }
    },
    [user]
  );

  // Delete address
  const deleteAddress = useCallback(
    async (addressId) => {
      if (!supabase || !user) return { error: new Error("Not authenticated") };

      try {
        const { error } = await supabase
          .from("express_addresses")
          .delete()
          .eq("id", addressId)
          .eq("user_id", user.id);

        if (error) throw error;
        setAddresses((prev) => prev.filter((addr) => addr.id !== addressId));
        return { error: null };
      } catch (err) {
        Alert.alert("Error", err.message);
        return { error: err };
      }
    },
    [user]
  );

  const defaultAddress = useMemo(
    () => addresses.find((addr) => addr.is_default) || addresses[0],
    [addresses]
  );

  const value = {
    orders,
    addresses,
    defaultAddress,
    loading,
    error,
    createOrder,
    initializePayment,
    verifyPayment,
    fetchOrders,
    fetchAddresses,
    addAddress,
    updateAddress,
    deleteAddress,
  };

  return (
    <OrderContext.Provider value={value}>{children}</OrderContext.Provider>
  );
};

export const useOrder = () => {
  const context = useContext(OrderContext);
  if (!context) {
    throw new Error("useOrder must be used within an OrderProvider");
  }
  return context;
};
