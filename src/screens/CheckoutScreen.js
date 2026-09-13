import React, { useMemo, useState, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useOrder } from "../context/OrderContext";
import { useToast } from "../context/ToastContext";
import { useAds } from "../context/AdsContext";
import { supabase, supabaseUrl } from "../lib/supabase";
import { AdRenderer } from "../components/AdBanner";
import { useTheme } from "../context/ThemeContext";
import { useAppStyles } from "../hooks/useAppStyles";
import {
  verifyPaymentAndCreateOrder,
  generatePaymentReference,
} from "../services/payment";
import { callEdgeFunction } from "../lib/supabase";
import { useResponsive } from "../hooks/useResponsive";
import { useGrounding } from "../hooks/useGrounding";
import { radius } from "../theme/colors";

export const CheckoutScreen = ({ navigation }) => {
  const { colors: themeColors } = useTheme();
  const styles = useAppStyles((c) => buildCheckoutStyles(c));
  const { isWide, horizontalPadding } = useResponsive();
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const { user, profile, isAuthenticated } = useAuth();
  const { items, total, clearCart } = useCart();
  const toast = useToast();
  const { fetchAdsByPlacement } = useAds();
  // Addresses are preloaded in the background by OrderContext (mounted at
  // app level), so we get an instant list here without a network hop.
  const {
    addresses: contextAddresses,
    fetchAddresses: refreshContextAddresses,
    updateAddress: contextUpdateAddress,
    deleteAddress: contextDeleteAddress,
  } = useOrder();

  // AI grounding refs — let the TagAI point at these UI elements
  // (e.g. "where is my coupon code box?").
  const promoCodeRef = useGrounding("checkout.promoCode");
  const orderSummaryRef = useGrounding("checkout.orderSummary");
  const payButtonRef = useGrounding("checkout.payButton");
  const [promoCode, setPromoCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null); // coupon row + resolved scope
  const [promoChecking, setPromoChecking] = useState(false);

  const [addresses, setAddresses] = useState([]);
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [checkoutAds, setCheckoutAds] = useState([]);
  const [selectedAddress, setSelectedAddress] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showAddAddress, setShowAddAddress] = useState(false);
  // When non-null we're editing that existing address; null means "add new".
  const [editingAddress, setEditingAddress] = useState(null);
  // id of the address currently being deleted (so we can show a per-row
  // spinner instead of freezing the whole section).
  const [deletingAddressId, setDeletingAddressId] = useState(null);
  const [newAddress, setNewAddress] = useState({
    full_name: "",
    phone: "",
    street_address: "",
    city: "",
    state: "",
  });
  const processedPaymentReferenceRef = useRef(null);
  // Guards against a second initialize-payment hitting Paystack while one is
  // already in flight (double-tap / slow response retries) — duplicate
  // references each create their own Paystack transaction.
  const checkoutInitRef = useRef(false);

  const checkoutDisplayAds = checkoutAds.filter(
    (ad) => String(ad?.style || "").toLowerCase() !== "carousel",
  );

  // Calculate total shipping fees from cart items (per-product shipping_fee set by sellers)
  // NOTE: Service fee is NOT added to the customer total. It is deducted from the seller's
  // subaccount share internally by Paystack. Customer only pays product subtotal + shipping.
  const totalShippingFee = items.reduce((sum, item) => {
    const productShippingFee = parseFloat(item.product?.shipping_fee || 0);
    return sum + productShippingFee * item.quantity;
  }, 0);

  // Does a coupon cover a given cart line? Handles legacy single-store scope,
  // the newer multi-store array, category scope and the max-product-price cap.
  const couponCoversLine = (coupon, item, unitPrice) => {
    const ps = item.product?.seller_id;
    const productSellerId = typeof ps === "string" ? ps : ps?.id;
    if (
      Array.isArray(coupon.seller_ids) &&
      coupon.seller_ids.length > 0 &&
      !coupon.seller_ids.includes(productSellerId)
    )
      return false;
    if (
      !Array.isArray(coupon.seller_ids) &&
      coupon.seller_id &&
      productSellerId !== coupon.seller_id
    )
      return false;
    if (
      coupon.category_name &&
      String(item.product?.category || "").toLowerCase() !==
        String(coupon.category_name).toLowerCase()
    )
      return false;
    // Max-price cap: items above this unit price are never discounted.
    if (
      coupon.max_product_price != null &&
      unitPrice > Number(coupon.max_product_price)
    )
      return false;
    return true;
  };

  // Promo discount for the applied coupon, computed against only the cart
  // lines the coupon covers (scoped coupons ignore everything else).
  // IMPORTANT: `eligible` only includes product prices (unitPrice × quantity)
  // — shipping fees are NEVER part of the discount base. Coupons only ever
  // reduce the subtotal, never the shipping fee, regardless of which store
  // issued the coupon.
  const promoDiscount = useMemo(() => {
    if (!appliedCoupon) return 0;
    let eligible = 0;
    items.forEach((item) => {
      const unitPrice =
        typeof item.price === "number"
          ? item.price
          : item.product?.discount > 0
            ? item.product.price * (1 - item.product.discount / 100)
            : item.product?.price || 0;
      if (!couponCoversLine(appliedCoupon, item, unitPrice)) return;
      eligible += unitPrice * item.quantity;
    });
    let amount =
      (appliedCoupon.discount_type || "percentage") === "percentage"
        ? (eligible * Number(appliedCoupon.discount_value || 0)) / 100
        : Math.min(Number(appliedCoupon.discount_value || 0), eligible);
    const cap = Number(appliedCoupon.max_discount_amount || 0);
    if (cap > 0) amount = Math.min(amount, cap);
    // A promo can never push the payable total below zero. Note: this cap
    // exists only as a safety net; shipping is added back separately below
    // and is NEVER discounted by the coupon.
    amount = Math.min(amount, total + totalShippingFee);
    return Math.max(Math.round(amount * 100) / 100, 0);
  }, [appliedCoupon, items, total, totalShippingFee]);

  // Customer-facing total: subtotal + shipping − promo discount.
  // Payment initialization and both summary displays derive from this.
  const grandTotal = Math.max(total + totalShippingFee - promoDiscount, 0);

  const applyPromoCode = async () => {
    const code = promoCode.trim().toUpperCase();
    if (!code) {
      toast.warning("Promo code", "Type a coupon code to apply it.");
      return;
    }
    setPromoChecking(true);
    try {
      const { data: coupon, error } = await supabase
        .from("express_coupons")
        .select("*")
        .ilike("code", code)
        .maybeSingle();
      if (error) throw error;

      const now = new Date();
      if (!coupon || !coupon.is_active)
        throw new Error(`"${code}" is not a valid promo code.`);
      if (coupon.valid_from && new Date(coupon.valid_from) > now)
        throw new Error("This code isn't active yet.");
      const expiry = coupon.valid_until || coupon.expires_at;
      if (expiry && new Date(expiry) < now)
        throw new Error("This code has expired.");
      const uses = Number(coupon.current_uses ?? coupon.usage_count ?? 0);
      const usageCap = coupon.max_uses ?? coupon.usage_limit ?? null;
      if (usageCap != null && uses >= Number(usageCap))
        throw new Error("This code has reached its usage limit.");
      const minOrder = Number(coupon.min_order_amount || 0);
      if (minOrder > 0 && total < minOrder)
        throw new Error(
          `This code requires a minimum order of GH₵${minOrder.toFixed(2)}.`,
        );

      // Per-account limit — how many times THIS user may redeem the code.
      const perAccountLimit = Number(coupon.user_limit ?? 1);
      if (perAccountLimit > 0 && user?.id) {
        const { count: myUses, error: usesErr } = await supabase
          .from("express_coupon_redemptions")
          .select("id", { count: "exact", head: true })
          .eq("coupon_id", coupon.id)
          .eq("user_id", user.id);
        if (usesErr) throw usesErr;
        if ((myUses || 0) >= perAccountLimit)
          throw new Error(
            "You've already used this code the maximum number of times.",
          );
      }

      // Resolve a category-scoped coupon to its name so cart lines can match.
      let categoryName = null;
      if (coupon.category_id) {
        const { data: cat } = await supabase
          .from("express_categories")
          .select("name")
          .eq("id", coupon.category_id)
          .maybeSingle();
        categoryName = cat?.name || "__unmatched__";
      }

      // At least one cart line must be covered by the coupon. Diagnose WHY a
      // code fails so the message matches the real reason (wrong store,
      // wrong category, or items above the coupon's max product price).
      const lineUnitPrice = (item) =>
        typeof item.price === "number"
          ? item.price
          : item.product?.discount > 0
            ? item.product.price * (1 - item.product.discount / 100)
            : item.product?.price || 0;

      const inStoreScope = (item) => {
        const ps = item.product?.seller_id;
        const productSellerId = typeof ps === "string" ? ps : ps?.id;
        if (
          Array.isArray(coupon.seller_ids) &&
          coupon.seller_ids.length > 0 &&
          !coupon.seller_ids.includes(productSellerId)
        )
          return false;
        if (
          !Array.isArray(coupon.seller_ids) &&
          coupon.seller_id &&
          productSellerId !== coupon.seller_id
        )
          return false;
        return true;
      };
      const inCategoryScope = (item) =>
        !categoryName ||
        String(item.product?.category || "").toLowerCase() ===
          String(categoryName).toLowerCase();
      const withinPriceCap = (item) =>
        coupon.max_product_price == null ||
        lineUnitPrice(item) <= Number(coupon.max_product_price);

      const scopedItems = items.filter(
        (item) => inStoreScope(item) && inCategoryScope(item),
      );

      if (scopedItems.length === 0) {
        let scopeMessage = "None of the items in your cart are covered.";
        if (categoryName) {
          scopeMessage = `This code only applies to ${categoryName} items.`;
        } else if (
          Array.isArray(coupon.seller_ids) &&
          coupon.seller_ids.length > 0
        ) {
          // Name the actual stores so the message is actionable.
          try {
            const { data: stores } = await supabase
              .from("express_sellers")
              .select("name")
              .in("id", coupon.seller_ids);
            const names = (stores || []).map((s) => s.name).join(", ");
            scopeMessage = names
              ? `This code only applies to products from ${names}.`
              : "This code only applies to selected stores' products.";
          } catch (_) {
            scopeMessage =
              "This code only applies to selected stores' products.";
          }
        } else if (coupon.seller_id) {
          scopeMessage =
            "This code only applies to a specific seller's products.";
        }
        throw new Error(scopeMessage);
      }

      // Scope matched, but the price cap can still exclude every line.
      if (!scopedItems.some(withinPriceCap)) {
        throw new Error(
          `This code only applies to items priced up to GH₵${Number(
            coupon.max_product_price,
          ).toFixed(2)}.`,
        );
      }

      setAppliedCoupon({ ...coupon, category_name: categoryName });
      setPromoCode("");
      toast.success(
        "Promo applied",
        `${code} will be discounted from your order.`,
      );
    } catch (e) {
      toast.error("Promo code", e?.message || "Could not apply this code.");
    } finally {
      setPromoChecking(false);
    }
  };

  const removePromoCode = () => {
    setAppliedCoupon(null);
    toast.info("Promo removed", "The discount is no longer part of your total.");
  };

  useEffect(() => {
    if (!isAuthenticated) {
      navigation.replace("Auth");
    }
  }, [isAuthenticated, navigation]);

  // Hydrate the local addresses list from the OrderContext cache. The context
  // preloads addresses the moment the user authenticates (at app boot), so on
  // most visits this is synchronous and the section renders immediately. If
  // the cache is empty (e.g. user just signed in) we still kick off a
  // background refresh — no blocking spinner, no duplicate fetch.
  useEffect(() => {
    if (!user) return;
    setAddresses(contextAddresses || []);

    if (
      (!contextAddresses || contextAddresses.length === 0) &&
      !addressesLoading
    ) {
      setAddressesLoading(true);
      Promise.resolve(refreshContextAddresses()).finally(() =>
        setAddressesLoading(false),
      );
    }
  }, [user, contextAddresses, refreshContextAddresses, addressesLoading]);

  // Re-sync the local list whenever the context list changes (e.g. add/delete
  // from another screen returns here with an updated cache).
  useEffect(() => {
    setAddresses(contextAddresses || []);
  }, [contextAddresses]);

  // Auto-pick the default address (or the first one) the moment we have a
  // list but no selection. Done as a separate effect so it doesn't fight
  // with the hydration effect above and so it re-runs if the user clears
  // their selection.
  useEffect(() => {
    if (!user) return;
    if (selectedAddress) return;
    if (addresses.length === 0) return;
    setSelectedAddress(addresses[0]);
  }, [user, addresses, selectedAddress]);

  useEffect(() => {
    fetchAdsByPlacement("checkout").then((ads) => setCheckoutAds(ads || []));
  }, [fetchAdsByPlacement]);

  useEffect(() => {
    if (profile) {
      setNewAddress((prev) => ({
        ...prev,
        full_name: profile.full_name || "",
        phone: profile.phone || "",
      }));
    }
  }, [profile]);

  // Handle payment success from WebView
  useEffect(() => {
    const params = route.params;
    if (params?.payment === "success" && params?.reference) {
      if (processedPaymentReferenceRef.current === params.reference) {
        return;
      }
      processedPaymentReferenceRef.current = params.reference;
      navigation.setParams({
        payment: undefined,
        reference: undefined,
        orderData: undefined,
      });
      handlePaymentVerification(params.reference, params.orderData);
    }
  }, [route.params, navigation]);

  const handlePaymentVerification = async (reference, orderData) => {
    try {
      setLoading(true);

      const result = await verifyPaymentAndCreateOrder(reference, orderData);

      // Record promo usage once the order has actually been created. The
      // coupon MUST come from orderData (route params), not component state —
      // this screen unmounts while PaymentWebView is open, so state is gone
      // by the time verification runs. That was why usage counters never
      // incremented. Also logs a per-account redemption for user_limit checks.
      if (orderData?.couponId && user?.id) {
        supabase
          .rpc("record_coupon_use", {
            p_coupon_id: orderData.couponId,
            p_user_id: user.id,
            p_reference: reference,
          })
          .then(({ error: promoErr }) => {
            if (promoErr)
              console.warn(
                "[Checkout] coupon usage update failed:",
                promoErr.message,
              );
          });
      }

      clearCart();
      toast.success(
        "Order Placed!",
        "Your order has been successfully placed.",
      );
      setTimeout(() => {
        // Reset navigation stack so checkout is fully removed — landing on
        // the animated order-success celebration page.
        navigation.reset({
          index: 1,
          routes: [
            { name: "Main" },
            {
              name: "OrderSuccess",
              params: { reference, total: grandTotal },
            },
          ],
        });
      }, 1200);
    } catch (error) {
      processedPaymentReferenceRef.current = null;
      console.error("❌ Verification error:", error);
      toast.error("Error", error.message || "Payment verification failed");
    } finally {
      setLoading(false);
    }
  };

  // Reset the add/edit form to a blank state and open it. Used for both the
  // "+" header button and the "edit" action on a row.
  const openAddressForm = (address = null) => {
    if (address) {
      setEditingAddress(address);
      setNewAddress({
        full_name: address.full_name || "",
        phone: address.phone || "",
        street_address: address.street_address || "",
        city: address.city || "",
        state: address.state || "",
      });
    } else {
      setEditingAddress(null);
      setNewAddress({
        full_name: profile?.full_name || "",
        phone: profile?.phone || "",
        street_address: "",
        city: "",
        state: "",
      });
    }
    setShowAddAddress(true);
  };

  const closeAddressForm = () => {
    setShowAddAddress(false);
    setEditingAddress(null);
  };

  // Save the form — inserts a new address when `editingAddress` is null,
  // otherwise patches the existing row in place.
  const handleSaveAddress = async () => {
    if (
      !newAddress.full_name ||
      !newAddress.phone ||
      !newAddress.street_address ||
      !newAddress.city ||
      !newAddress.state
    ) {
      toast.error("Error", "Please fill in all required fields");
      return;
    }

    setLoading(true);
    try {
      if (editingAddress) {
        const { data, error } = await supabase
          .from("express_addresses")
          .update({
            full_name: newAddress.full_name,
            phone: newAddress.phone,
            street_address: newAddress.street_address,
            city: newAddress.city,
            state: newAddress.state,
          })
          .eq("id", editingAddress.id)
          .eq("user_id", user.id)
          .select()
          .single();

        if (error) throw error;

        // Update the local cache immediately for snappy UI.
        setAddresses((prev) =>
          prev.map((a) => (a.id === data.id ? data : a)),
        );
        // If the edited address is the one selected, refresh the selection
        // so downstream code (order submission) sees the new values.
        if (selectedAddress?.id === data.id) setSelectedAddress(data);
        // Refresh the shared context cache for other screens.
        refreshContextAddresses?.();
        // Also patch the context in-place via the exposed action — OrderContext
        // already does this internally, but call it for a single source of
        // truth.
        contextUpdateAddress?.(data.id, data);
        toast.success("Address updated", "");
      } else {
        const { data, error } = await supabase
          .from("express_addresses")
          .insert({ ...newAddress, user_id: user.id })
          .select()
          .single();

        if (error) throw error;

        setAddresses((prev) => [...prev, data]);
        setSelectedAddress(data);
        // Keep the shared OrderContext cache in sync so the next screen
        // (e.g. AddressesScreen) sees this address without a re-fetch.
        refreshContextAddresses?.();
        toast.success("Address added", "");
      }
      closeAddressForm();
    } catch (err) {
      toast.error("Error", err.message);
    } finally {
      setLoading(false);
    }
  };

  // Delete an address. If it was the currently selected one, auto-pick the
  // next available address so the checkout flow never gets stuck.
  const handleDeleteAddress = (addr) => {
    if (!addr?.id) return;
    Alert.alert(
      "Delete address",
      `Remove "${addr.full_name}" from your saved addresses?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeletingAddressId(addr.id);
            try {
              // Drop from local state immediately for snappy UI.
              setAddresses((prev) => prev.filter((a) => a.id !== addr.id));
              // If the deleted address was the active selection, clear it
              // (the auto-select effect below will pick a new one).
              if (selectedAddress?.id === addr.id) setSelectedAddress(null);
              // Use the context's delete so the shared cache stays in sync
              // for other screens.
              const { error } =
                (await contextDeleteAddress?.(addr.id)) || {};
              if (error) throw error;
              // Best-effort refresh as a safety net.
              refreshContextAddresses?.();
              toast.success("Address deleted", "");
            } catch (err) {
              toast.error("Could not delete", err.message);
              // Re-sync the local list if the network op failed so the row
              // doesn't disappear from the UI while still existing in DB.
              refreshContextAddresses?.();
            } finally {
              setDeletingAddressId(null);
            }
          },
        },
      ],
    );
  };

  const handleCheckout = async () => {
    // One initialization at a time — a second would create a second
    // Paystack transaction even though the reference differs per attempt.
    if (checkoutInitRef.current) return;
    if (!selectedAddress) {
      toast.error("Error", "Please add a delivery address");
      return;
    }

    if (items.length === 0) {
      toast.error("Error", "Your cart is empty");
      return;
    }

    if (!user) {
      toast.error("Error", "Please log in to continue");
      navigation.replace("Auth");
      return;
    }

    const reference = generatePaymentReference(user.id);
    checkoutInitRef.current = true;

    try {
      setLoading(true);

      // Order data — split & service fee computation handled entirely server-side.
      // The edge function fetches service_fee_percentage from express_settings and
      // deducts the fee from each seller's subaccount share. Customer pays
      // subtotal + shipping − promo discount (discount clamped server-side).
      const orderData = {
        shippingAddress: selectedAddress,
        paymentMethod: "paystack",
        shippingFee: totalShippingFee,
        discountAmount: promoDiscount,
        couponCode: appliedCoupon?.code || null,
        couponId: appliedCoupon?.id || null,
      };

      // Initialize payment via edge function (handles multi-vendor split)
      let init;
      try {
        init = await callEdgeFunction("payment", {
          action: "initialize-payment",
          amount: grandTotal,
          reference,
          discount_amount: promoDiscount,
          coupon_code: appliedCoupon?.code || null,
          orderData,
        });
      } catch (primaryErr) {
        console.error(
          "callEdgeFunction failed, attempting direct fetch:",
          primaryErr,
        );

        // Retry via direct fetch (same edge function, different transport)
        try {
          const { data: { session } = {} } = await supabase.auth.getSession();
          const token = session?.access_token;
          const directRes = await fetch(`${supabaseUrl}/functions/v1/payment`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              action: "initialize-payment",
              amount: grandTotal,
              reference,
              discount_amount: promoDiscount,
              coupon_code: appliedCoupon?.code || null,
              orderData,
            }),
          });
          try {
            const directBody = await directRes.json();
            init = directBody;
          } catch (parseErr) {
            console.warn("Direct fetch returned non-JSON response", parseErr);
            init = null;
          }
        } catch (directErr) {
          console.error("Direct fetch attempt failed:", directErr);
          init = null;
        }
      }

      if (init && init.success && init.data && init.data.authorization_url) {
        navigation.navigate("PaymentWebView", {
          authorization_url: init.data.authorization_url,
          access_code: init.data.access_code,
          paystack_public_key: init.data.paystack_public_key || null,
          amount: grandTotal,
          email: user.email,
          reference,
          orderData,
        });
      } else {
        // Do NOT fall back to inline Paystack — it would skip the multi-vendor
        // split and send all funds to the platform account only.
        const errorMsg =
          init?.error || "Could not initialize payment. Please try again.";
        toast.error("Payment Error", errorMsg);
      }
    } catch (err) {
      console.error("Payment initialization failed:", err);
      toast.error(
        "Payment Error",
        err.message || "Could not initialize payment. Please try again.",
      );
    } finally {
      checkoutInitRef.current = false;
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={themeColors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={themeColors.dark} />
        </Pressable>
        <Text style={styles.headerTitle}>Checkout</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
      >
        {checkoutDisplayAds.length > 0 && (
          <View style={styles.adSection}>
            <AdRenderer ads={checkoutDisplayAds} />
          </View>
        )}

        {/* Delivery Address Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="location" size={20} color={themeColors.primary} />
            <Text style={styles.sectionTitle}>Delivery Address</Text>
            <View style={{ flex: 1 }} />
            {/* Compact "+" button to add a new address — sits in the
                top-right of the card so the address list stays focused
                on the saved rows. */}
            <Pressable
              onPress={() => openAddressForm(null)}
              style={({ pressed }) => [
                styles.headerActionButton,
                pressed && { opacity: 0.6 },
              ]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Add new address"
            >
              <Ionicons
                name="add-circle"
                size={22}
                color={themeColors.primary}
              />
              <Text style={styles.headerActionButtonText}>Add</Text>
            </Pressable>
          </View>

          {addresses.length === 0 ? (
            addressesLoading ? (
              <View
                style={[
                  styles.addressOption,
                  { justifyContent: "center", opacity: 0.7 },
                ]}
              >
                <ActivityIndicator
                  size="small"
                  color={themeColors.primary}
                />
                <Text
                  style={[
                    styles.addressOptionName,
                    { marginLeft: 8, color: themeColors.muted },
                  ]}
                >
                  Loading your addresses…
                </Text>
              </View>
            ) : (
              <Pressable
                style={styles.addButton}
                onPress={() => openAddressForm(null)}
              >
                <Ionicons
                  name="add-circle"
                  size={24}
                  color={themeColors.primary}
                />
                <Text style={styles.addButtonText}>Add Delivery Address</Text>
              </Pressable>
            )
          ) : (
            /* Single unified list — the selected address is highlighted and
               shows its full details inline. This replaces the previous
               duplicate "selected card + list item" render where the same
               address appeared twice on screen. */
            <View style={styles.addressList}>
              {addresses.map((addr) => {
                const isSelected = selectedAddress?.id === addr.id;
                const isDeleting = deletingAddressId === addr.id;
                return (
                  <Pressable
                    key={addr.id}
                    style={[
                      styles.addressOption,
                      isSelected && styles.addressOptionSelected,
                    ]}
                    onPress={() => setSelectedAddress(addr)}
                  >
                    <View style={styles.radioOuter}>
                      {isSelected && <View style={styles.radioInner} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.addressOptionName}>
                        {addr.full_name}
                      </Text>
                      {isSelected ? (
                        <>
                          <Text style={styles.addressOptionText}>
                            {addr.phone}
                          </Text>
                          <Text style={styles.addressOptionText}>
                            {addr.street_address}
                          </Text>
                          <Text style={styles.addressOptionText}>
                            {addr.city}, {addr.state}
                          </Text>
                        </>
                      ) : (
                        <Text style={styles.addressOptionText}>
                          {addr.street_address}, {addr.city}
                        </Text>
                      )}
                    </View>

                    {/* Per-row edit + delete actions. The inner Pressables
                        take responder ownership on tap, so the row's
                        onPress (select address) won't fire here. */}
                    {isDeleting ? (
                      <ActivityIndicator
                        size="small"
                        color={themeColors.danger || "#EF4444"}
                      />
                    ) : (
                      <View style={styles.addressRowActions}>
                        <Pressable
                          onPress={() => openAddressForm(addr)}
                          hitSlop={10}
                          style={({ pressed }) => [
                            styles.addressIconButton,
                            pressed && { opacity: 0.5 },
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`Edit address for ${addr.full_name}`}
                        >
                          <Ionicons
                            name="create-outline"
                            size={18}
                            color={themeColors.primary}
                          />
                        </Pressable>
                        <Pressable
                          onPress={() => handleDeleteAddress(addr)}
                          hitSlop={10}
                          style={({ pressed }) => [
                            styles.addressIconButton,
                            pressed && { opacity: 0.5 },
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`Delete address for ${addr.full_name}`}
                        >
                          <Ionicons
                            name="trash-outline"
                            size={18}
                            color={themeColors.danger || "#EF4444"}
                          />
                        </Pressable>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* Add / Edit Address Form */}
        {showAddAddress && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {editingAddress ? "Edit Address" : "New Address"}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Full Name"
              value={newAddress.full_name}
              onChangeText={(text) =>
                setNewAddress({ ...newAddress, full_name: text })
              }
              placeholderTextColor={themeColors.muted}
            />
            <TextInput
              style={styles.input}
              placeholder="Phone Number"
              value={newAddress.phone}
              onChangeText={(text) =>
                setNewAddress({ ...newAddress, phone: text })
              }
              keyboardType="phone-pad"
              placeholderTextColor={themeColors.muted}
            />
            <TextInput
              style={styles.input}
              placeholder="Street Address"
              value={newAddress.street_address}
              onChangeText={(text) =>
                setNewAddress({ ...newAddress, street_address: text })
              }
              placeholderTextColor={themeColors.muted}
            />
            <View style={styles.row}>
              <TextInput
                style={[styles.input, { flex: 1, marginRight: 8 }]}
                placeholder="City"
                value={newAddress.city}
                onChangeText={(text) =>
                  setNewAddress({ ...newAddress, city: text })
                }
                placeholderTextColor={themeColors.muted}
              />
              <TextInput
                style={[styles.input, { flex: 1, marginLeft: 8 }]}
                placeholder="State"
                value={newAddress.state}
                onChangeText={(text) =>
                  setNewAddress({ ...newAddress, state: text })
                }
                placeholderTextColor={themeColors.muted}
              />
            </View>
            <View style={styles.formButtons}>
              <Pressable
                style={styles.cancelButton}
                onPress={closeAddressForm}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.saveButton}
                onPress={handleSaveAddress}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>
                    {editingAddress ? "Update Address" : "Save Address"}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        )}

        {/* Order Summary */}
        <View style={styles.section} ref={orderSummaryRef}>
          <View style={styles.sectionHeader}>
            <Ionicons name="receipt" size={20} color={themeColors.primary} />
            <Text style={styles.sectionTitle}>Order Summary</Text>
          </View>

          {items.map((item) => {
            const { product, quantity, price } = item;
            const effectivePrice =
              price ||
              (product.discount > 0
                ? product.price * (1 - product.discount / 100)
                : product.price);
            // When a coupon is applied, flag whether this line is eligible
            // and compute its share of the discount. couponCoversLine already
            // enforces store / category / max-product-price scope, so the
            // indicator only appears on items from the issuing store.
            const isCoveredByCoupon = appliedCoupon
              ? couponCoversLine(appliedCoupon, item, effectivePrice)
              : false;
            // Per-line share of the total promo discount, proportional to this
            // line's contribution to the eligible subtotal. Shipping is never
            // included in the eligible pool (see promoDiscount above), so the
            // coupon can never reduce the shipping fee.
            let lineDiscount = 0;
            if (isCoveredByCoupon && promoDiscount > 0) {
              const eligibleSubtotal = items.reduce((sum, it) => {
                const up =
                  typeof it.price === "number"
                    ? it.price
                    : it.product?.discount > 0
                      ? it.product.price * (1 - it.product.discount / 100)
                      : it.product?.price || 0;
                return couponCoversLine(appliedCoupon, it, up)
                  ? sum + up * it.quantity
                  : sum;
              }, 0);
              if (eligibleSubtotal > 0) {
                lineDiscount =
                  (effectivePrice * quantity * promoDiscount) /
                  eligibleSubtotal;
                // Round to 2dp and never exceed the line subtotal.
                lineDiscount =
                  Math.min(
                    Math.round(lineDiscount * 100) / 100,
                    effectivePrice * quantity,
                  );
              }
            }
            return (
              <View key={product.id} style={styles.orderItem}>
                <View style={styles.orderItemLeft}>
                  <Text style={styles.orderItemTitle} numberOfLines={1}>
                    {product.title}
                  </Text>
                  {isCoveredByCoupon && (
                    <View style={styles.couponBadge}>
                      <Ionicons
                        name="pricetag"
                        size={11}
                        color="#10B981"
                        style={{ marginRight: 4 }}
                      />
                      <Text
                        style={styles.couponBadgeText}
                        numberOfLines={1}
                      >
                        {appliedCoupon.code} applied
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.orderItemQty}>x{quantity}</Text>
                <View style={styles.orderItemRight}>
                  <Text style={styles.orderItemPrice}>
                    GH₵{(effectivePrice * quantity).toLocaleString()}
                  </Text>
                  {lineDiscount > 0 && (
                    <Text style={styles.orderItemDiscount}>
                      −GH₵{lineDiscount.toFixed(2)}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}

          <View style={styles.divider} />

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>GH₵{total.toLocaleString()}</Text>
          </View>
          <View style={styles.summaryRow}>
            <View style={styles.summaryLabelCluster}>
              <Text style={styles.summaryLabel}>Shipping Fee</Text>
              {appliedCoupon && totalShippingFee > 0 && (
                <Text style={styles.summaryNote}>
                  {"\u00B7"} not affected by coupon
                </Text>
              )}
            </View>
            <Text
              style={[
                styles.summaryValue,
                totalShippingFee === 0 && styles.freeShippingText,
              ]}
            >
              {totalShippingFee > 0
                ? `GH₵${totalShippingFee.toLocaleString()}`
                : "Free"}
            </Text>
          </View>
          {/* Promo discount line (only when a coupon is applied) */}
          {promoDiscount > 0 && (
            <>
              <View style={styles.divider} />
              <View style={styles.summaryRow}>
                <Text style={[styles.totalLabel, { color: "#10B981" }]}>
                  Discount ({appliedCoupon?.code})
                </Text>
                <Text style={[styles.totalValue, { color: "#10B981" }]}>
                  -GH₵{promoDiscount.toFixed(2)}
                </Text>
              </View>
            </>
          )}
          {/* Service fee is deducted internally from seller subaccount shares.
              It is NOT added to the customer total. */}
          <View style={styles.divider} />
          <View style={styles.summaryRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>
              GH₵{grandTotal.toLocaleString()}
            </Text>
          </View>
        </View>

          {/* Promo / Coupon Code */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="pricetag" size={20} color={themeColors.primary} />
              <Text style={styles.sectionTitle}>Promo Code</Text>
            </View>
            {appliedCoupon ? (
              <View
                ref={promoCodeRef}
                style={[
                  styles.promoRow,
                  { borderColor: "#10B98166", backgroundColor: "#10B98114" },
                ]}
              >
                <Ionicons
                  name="checkmark-circle"
                  size={18}
                  color="#10B981"
                  style={{ marginRight: 8 }}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.promoInput, { color: themeColors.dark }]}
                    numberOfLines={1}
                  >
                    {appliedCoupon.code}
                  </Text>
                  {promoDiscount > 0 && (
                    <Text style={{ fontSize: 12, color: "#10B981" }}>
                      You save GH₵{promoDiscount.toFixed(2)}
                    </Text>
                  )}
                </View>
                <Pressable onPress={removePromoCode} hitSlop={10}>
                  <Ionicons
                    name="close-circle-outline"
                    size={20}
                    color={themeColors.muted}
                  />
                </Pressable>
              </View>
            ) : (
              <View
                ref={promoCodeRef}
                style={[
                  styles.promoRow,
                  {
                    borderColor: themeColors.border,
                    backgroundColor: themeColors.surface,
                  },
                ]}
              >
                <Ionicons
                  name="ticket"
                  size={18}
                  color={themeColors.muted}
                  style={{ marginRight: 8 }}
                />
                <TextInput
                  style={[styles.promoInput, { color: themeColors.dark }]}
                  placeholder="Enter coupon code"
                  placeholderTextColor={themeColors.muted}
                  value={promoCode}
                  onChangeText={setPromoCode}
                  autoCapitalize="characters"
                />
                <Pressable
                  style={[
                    styles.promoApply,
                    { backgroundColor: themeColors.surfaceAlpha },
                  ]}
                  onPress={applyPromoCode}
                  disabled={promoChecking}
                >
                  {promoChecking ? (
                    <ActivityIndicator size="small" color={themeColors.primary} />
                  ) : (
                    <Text
                      style={[styles.promoApplyText, { color: themeColors.primary }]}
                    >
                      Apply
                    </Text>
                  )}
                </Pressable>
              </View>
            )}
          </View>

        {/* Payment Method */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="card" size={20} color={themeColors.primary} />
            <Text style={styles.sectionTitle}>Payment Method</Text>
          </View>
          <View style={styles.paymentMethod}>
            <View style={styles.paymentIcon}>
              <Text style={styles.paymentIconText}>P</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.paymentName}>Paystack</Text>
              <Text style={styles.paymentDesc}>
                Pay with Card, Bank Transfer, USSD
              </Text>
            </View>
            <Ionicons
              name="checkmark-circle"
              size={24}
              color={themeColors.primary}
            />
          </View>
        </View>
      </ScrollView>

      {/* Checkout Button */}
      <View style={[styles.footer, { paddingBottom: 32 + insets.bottom }]}>
        <View style={styles.footerTotal}>
          <Text style={styles.footerLabel}>Total</Text>
          <Text style={styles.footerValue}>
            GH₵{grandTotal.toLocaleString()}
          </Text>
        </View>
        <Pressable
          ref={payButtonRef}
          style={[
            styles.checkoutButton,
            loading && styles.checkoutButtonDisabled,
          ]}
          onPress={handleCheckout}
          disabled={loading}
        >
          <LinearGradient
            colors={[themeColors.primary, themeColors.accent]}
            style={styles.checkoutGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="lock-closed" size={18} color="#fff" />
                <Text style={styles.checkoutText}>Pay Now</Text>
              </>
            )}
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
};

const buildCheckoutStyles = (c) =>
  StyleSheet.create({ 
  promoRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderStyle: "solid",
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  promoInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 8,
  },
  promoApply: {
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  promoApplyText: {
    fontSize: 13,
    fontWeight: "700",
  },
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: c.light,
    borderBottomWidth: 1,
    borderBottomColor: "#E4E8F0",
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: c.light,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: c.dark,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    backgroundColor: c.light,
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  // Small "+" action that lives in the top-right of a section card.
  headerActionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  headerActionButtonText: {
    marginLeft: 4,
    color: c.primary,
    fontSize: 13,
    fontWeight: "600",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: c.dark,
    marginLeft: 8,
  },
  adSection: {
    paddingTop: 8,
    paddingBottom: 2,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: c.light,
    borderRadius: radius.xl,
    borderStyle: "dashed",
    borderWidth: 1,
    borderColor: c.primary,
  },
  addButtonText: {
    marginLeft: 8,
    color: c.primary,
    fontWeight: "600",
  },
  addressList: {
    marginTop: 12,
  },
  addressOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: c.light,
  },
  addressOptionSelected: {
    backgroundColor: `${c.primary}10`,
    borderWidth: 1,
    borderColor: c.primary,
  },
  // Right-aligned cluster of icon-only buttons inside an address row.
  addressRowActions: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 8,
  },
  addressIconButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 2,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: c.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: c.primary,
  },
  addressOptionName: {
    fontWeight: "600",
    color: c.dark,
  },
  addressOptionText: {
    fontSize: 12,
    color: c.muted,
    marginTop: 2,
  },
  input: {
    backgroundColor: c.light,
    borderRadius: radius.xl,
    padding: 14,
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E4E8F0",
    ...(Platform.OS === "web" ? { outlineStyle: "none", outlineWidth: 0 } : { }),
  },
  row: {
    flexDirection: "row",
  },
  formButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    padding: 14,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: "#E4E8F0",
    alignItems: "center",
  },
  cancelButtonText: {
    color: c.muted,
    fontWeight: "600",
  },
  saveButton: {
    flex: 1,
    padding: 14,
    borderRadius: radius.xl,
    backgroundColor: c.primary,
    alignItems: "center",
  },
  saveButtonText: {
    color: c.light,
    fontWeight: "600",
  },
  orderItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  // Left cluster: title + optional coupon badge stacked vertically.
  orderItemLeft: {
    flex: 1,
    flexDirection: "column",
    justifyContent: "center",
  },
  orderItemTitle: {
    fontSize: 14,
    color: c.dark,
  },
  // Right cluster: price + optional per-line discount stacked vertically.
  orderItemRight: {
    flexDirection: "column",
    alignItems: "flex-end",
  },
  // Small green pill that appears under a cart line when the applied coupon
  // covers it. Re-uses the success-green color used elsewhere in the file
  // (free-shipping text, discount totals) for visual consistency.
  couponBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "#10B98114",
    borderWidth: 1,
    borderColor: "#10B98133",
  },
  couponBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#10B981",
  },
  orderItemQty: {
    fontSize: 14,
    color: c.muted,
    marginHorizontal: 12,
  },
  orderItemPrice: {
    fontSize: 14,
    fontWeight: "600",
    color: c.dark,
  },
  // Per-line share of the coupon discount, shown directly under the price so
  // the customer can see how the overall "Discount (CODE)" line is split.
  orderItemDiscount: {
    fontSize: 12,
    fontWeight: "700",
    color: "#10B981",
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: "#E4E8F0",
    marginVertical: 12,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  summaryLabel: {
    color: c.muted,
  },
  // Used to show a small inline annotation next to a summary label (e.g.
  // "not affected by coupon" beside the shipping fee when a promo is in
  // effect, so the customer can see at a glance that shipping is intact).
  summaryLabelCluster: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    flexWrap: "wrap",
  },
  summaryNote: {
    color: c.muted,
    fontSize: 11,
    marginLeft: 6,
    fontStyle: "italic",
  },
  summaryValue: {
    fontWeight: "600",
    color: c.dark,
  },
  freeShipping: {
    color: c.primary,
  },
  freeShippingText: {
    color: "#10B981",
    fontWeight: "700",
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: c.dark,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: "700",
    color: c.primary,
  },
  paymentMethod: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: c.light,
    borderRadius: 12,
  },
  paymentIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#0BA4DB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  paymentIconText: {
    fontSize: 20,
    fontWeight: "800",
    color: c.light,
  },
  paymentName: {
    fontSize: 14,
    fontWeight: "600",
    color: c.dark,
  },
  paymentDesc: {
    fontSize: 12,
    color: c.muted,
    marginTop: 2,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: c.light,
    borderTopWidth: 1,
    borderTopColor: "#E4E8F0",
    paddingBottom: 32,
  },
  footerTotal: {
    flex: 1,
  },
  footerLabel: {
    fontSize: 12,
    color: c.muted,
  },
  footerValue: {
    fontSize: 20,
    fontWeight: "700",
    color: c.dark,
  },
  checkoutButton: {
    flex: 1,
    borderRadius: radius.xl,
    overflow: "hidden",
  },
  checkoutButtonDisabled: {
    opacity: 0.7,
  },
  checkoutGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 8,
  },
  checkoutText: {
    color: c.light,
    fontSize: 16,
    fontWeight: "700",
  },
});
