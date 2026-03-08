import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import {
  supabase,
  callEdgeFunction,
  supabaseUrl,
  supabaseAnonKey,
} from "../lib/supabase";
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
    if (!supabase || !user) {
      if (!supabase) console.warn("Supabase not initialized in fetchOrders");
      return;
    }

    setLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from("express_orders")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;

      // Fetch order items separately if needed
      if (data && data.length > 0) {
        const orderIds = data.map((o) => o.id);
        const { data: itemsData } = await supabase
          .from("express_order_items")
          .select("*")
          .in("order_id", orderIds);

        const ordersWithItems = data.map((order) => ({
          ...order,
          items: itemsData?.filter((item) => item.order_id === order.id) || [],
        }));

        setOrders(ordersWithItems);
      } else {
        setOrders(data || []);
      }
    } catch (err) {
      setError(err?.message || JSON.stringify(err));
      console.error(
        "Error fetching orders:",
        err?.message || JSON.stringify(err),
      );
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Fetch user's addresses
  const fetchAddresses = useCallback(async () => {
    if (!supabase || !user) {
      if (!supabase) console.warn("Supabase not initialized in fetchAddresses");
      return;
    }

    try {
      const { data, error: fetchError } = await supabase
        .from("express_addresses")
        .select("*")
        .eq("user_id", user.id)
        .order("is_default", { ascending: false });

      if (fetchError) throw fetchError;
      setAddresses(data || []);
    } catch (err) {
      console.error(
        "Error fetching addresses:",
        err?.message || JSON.stringify(err),
      );
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
                  : order,
              ),
            );
          } else if (payload.eventType === "DELETE") {
            setOrders((prev) =>
              prev.filter((order) => order.id !== payload.old.id),
            );
          }
        },
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user]);

  // Verify payment
  const verifyPayment = useCallback(
    async (reference, orderData = null) => {
      console.log(
        "🚀 OrderContext.verifyPayment called with reference:",
        reference,
        "orderData:",
        orderData,
      );
      try {
        // Refresh session to ensure token is valid
        console.log(
          "OrderContext: Refreshing session for payment verification...",
        );
        const { data: sessionData, error: refreshError } =
          await supabase.auth.refreshSession();

        if (refreshError) {
          console.error("OrderContext: Session refresh error:", refreshError);
          throw new Error("Authentication failed. Please log in again.");
        }

        // Get the refreshed session
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          throw new Error("User not authenticated");
        }

        if (!session.access_token) {
          throw new Error("No access token available. Please log in again.");
        }

        console.log("✅ Session token obtained:", session.access_token.substring(0, 20) + "...");
        console.log("OrderContext: Verifying payment...");

        // Call Edge Function directly
        const edgeFunctionUrl = `${supabaseUrl}/functions/v1/payment`;
        console.log("🔗 Edge Function URL:", edgeFunctionUrl);
        console.log("📤 Sending POST request with:");
        console.log("   - Authorization: Bearer " + session.access_token.substring(0, 20) + "...");
        console.log("   - Content-Type: application/json");
        console.log("   - Body:", JSON.stringify({ reference, orderData: orderData ? "provided" : "null" }));

        const response = await fetch(edgeFunctionUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            reference,
            orderData,
          }),
        });

        console.log(
          "📥 Response status:",
          response.status
        );

        let result;
        try {
          result = await response.json();
          console.log("📥 Response body:", result);
        } catch (parseError) {
          console.error("❌ Failed to parse response as JSON:", parseError);
          console.log("📥 Response text:", await response.text());
          throw new Error("Invalid response from edge function");
        }

        if (!response.ok) {
          // Check if it's a 404 or 500 error indicating the function might not be deployed
          if (response.status === 404) {
            throw new Error(
              "❌ Payment edge function not found (404). Please ensure the function is deployed to Supabase. " +
              "Run: supabase functions deploy payment"
            );
          }
          if (response.status === 401) {
            throw new Error(
              "❌ Authorization failed (401). Your session may have expired. " +
              "Error: " + (result.message || result.error || "Invalid credentials")
            );
          }
          if (response.status === 500) {
            throw new Error(
              "❌ Server error (500). Edge function encountered an error. " +
              "Error: " + (result.message || result.error || "Unknown server error")
            );
          }
          throw new Error(
            result.error || result.message || `HTTP ${response.status}: ${response.statusText}`,
          );
        }

        if (!result.success) {
          throw new Error(result.error || "Payment verification failed");
        }

        // Refresh orders
        await fetchOrders();

        return result.data;
      } catch (err) {
        console.error("❌ Verify payment error:", err);
        console.error("❌ Error message:", err.message);
        console.error("❌ Full error object:", JSON.stringify(err, null, 2));

        // If it's an auth error, try to refresh the session and retry once
        if (
          err.message?.includes("auth") ||
          err.message?.includes("token") ||
          err.message?.includes("session")
        ) {
          console.log(
            "Auth error detected, attempting to refresh session and retry...",
          );

          try {
            // Force a session refresh
            const { data, error } = await supabase.auth.refreshSession();
            if (error) throw error;

            // Get the refreshed session
            const {
              data: { session: refreshedSession },
            } = await supabase.auth.getSession();

            if (!refreshedSession) {
              throw new Error("Failed to refresh session");
            }

            // Retry the payment verification
            const retryResponse = await fetch(
              `${supabaseUrl}/functions/v1/payment`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${refreshedSession.access_token}`,
                },
                body: JSON.stringify({
                  reference,
                  orderData,
                }),
              },
            );

            console.log(
              "OrderContext: Retry verify payment response status:",
              retryResponse.status,
            );
            const retryResult = await retryResponse.json();
            console.log(
              "OrderContext: Retry verify payment result:",
              retryResult,
            );

            if (!retryResponse.ok) {
              throw new Error(
                retryResult.error ||
                `HTTP ${retryResponse.status}: ${retryResponse.statusText}`,
              );
            }

            if (!retryResult.success) {
              throw new Error(
                retryResult.error || "Payment verification failed after retry",
              );
            }

            await fetchOrders();
            return retryResult.data;
          } catch (retryErr) {
            console.error("Retry failed:", retryErr);
            throw new Error(
              "Authentication failed. Please log in again and try verifying your payment.",
            );
          }
        }

        throw err;
      }
    },
    [fetchOrders],
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
        console.error("Add Address Error:", err.message);
        return { data: null, error: err };
      }
    },
    [user],
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
          prev.map((addr) => (addr.id === addressId ? data : addr)),
        );
        return { data, error: null };
      } catch (err) {
        console.error("Update Address Error:", err.message);
        return { data: null, error: err };
      }
    },
    [user],
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
        console.error("Delete Address Error:", err.message);
        return { error: err };
      }
    },
    [user],
  );

  const value = {
    orders,
    addresses,
    loading,
    error,
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
