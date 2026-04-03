import React, { useState, useEffect, useRef } from "react";
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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useToast } from "../context/ToastContext";
import { useAds } from "../context/AdsContext";
import { supabase, supabaseUrl } from "../lib/supabase";
import { AdRenderer } from "../components/AdBanner";
import { colors } from "../theme/colors";
import {
  verifyPaymentAndCreateOrder,
  generatePaymentReference,
} from "../services/payment";
import { callEdgeFunction } from "../lib/supabase";
import { useResponsive } from "../hooks/useResponsive";

export const CheckoutScreen = ({ navigation }) => {
  const { isWide, horizontalPadding } = useResponsive();
  const route = useRoute();
  const { user, profile, isAuthenticated } = useAuth();
  const { items, total, clearCart } = useCart();
  const toast = useToast();
  const { fetchAdsByPlacement } = useAds();

  const [addresses, setAddresses] = useState([]);
  const [checkoutAds, setCheckoutAds] = useState([]);
  const [selectedAddress, setSelectedAddress] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [newAddress, setNewAddress] = useState({
    full_name: "",
    phone: "",
    street_address: "",
    city: "",
    state: "",
  });

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

  // Customer-facing total: subtotal + shipping fees only
  const grandTotal = total + totalShippingFee;

  useEffect(() => {
    if (!isAuthenticated) {
      navigation.replace("Auth");
    }
  }, [isAuthenticated, navigation]);

  // Fetch addresses
  useEffect(() => {
    if (user) {
      fetchAddresses();
    }
  }, [user]);

  useEffect(() => {
    fetchAdsByPlacement("checkout").then((ads) => setCheckoutAds(ads || []));
  }, [fetchAdsByPlacement]);

  const fetchAddresses = async () => {
    try {
      const { data, error } = await supabase
        .from("express_addresses")
        .select("*")
        .eq("user_id", user.id)
        .order("is_default", { ascending: false });

      if (error) throw error;
      setAddresses(data || []);

      // Auto-select first address (default or first available) if no address is selected
      if (data && data.length > 0 && !selectedAddress) {
        setSelectedAddress(data[0]);
      }
    } catch (err) {
      console.error("Error fetching addresses:", err);
    }
  };

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
      handlePaymentVerification(params.reference, params.orderData);
    }
  }, [route.params]);

  const handlePaymentVerification = async (reference, orderData) => {
    try {
      setLoading(true);

      const result = await verifyPaymentAndCreateOrder(reference, orderData);

      clearCart();
      toast.success(
        "Order Placed!",
        "Your order has been successfully placed.",
      );
      setTimeout(() => {
        // Reset navigation stack so checkout is fully removed
        navigation.reset({
          index: 1,
          routes: [{ name: "Main" }, { name: "Orders" }],
        });
      }, 1500);
    } catch (error) {
      console.error("❌ Verification error:", error);
      toast.error("Error", error.message || "Payment verification failed");
    } finally {
      setLoading(false);
    }
  };

  const handleAddAddress = async () => {
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
      const { data, error } = await supabase
        .from("express_addresses")
        .insert({ ...newAddress, user_id: user.id })
        .select()
        .single();

      if (error) throw error;

      setAddresses((prev) => [...prev, data]);
      setSelectedAddress(data);
      setShowAddAddress(false);
      setNewAddress({
        full_name: profile?.full_name || "",
        phone: profile?.phone || "",
        street_address: "",
        city: "",
        state: "",
      });
    } catch (err) {
      toast.error("Error", err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = async () => {
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

    try {
      setLoading(true);

      // Order data — split & service fee computation handled entirely server-side.
      // The edge function fetches service_fee_percentage from express_settings and
      // deducts the fee from each seller's subaccount share. Customer pays subtotal + shipping only.
      const orderData = {
        shippingAddress: selectedAddress,
        paymentMethod: "paystack",
        shippingFee: totalShippingFee,
      };

      // Initialize payment via edge function (handles multi-vendor split)
      let init;
      try {
        init = await callEdgeFunction("payment", {
          action: "initialize-payment",
          amount: grandTotal,
          reference,
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
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
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
          <Ionicons name="arrow-back" size={24} color={colors.dark} />
        </Pressable>
        <Text style={styles.headerTitle}>Checkout</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {checkoutDisplayAds.length > 0 && (
          <View style={styles.adSection}>
            <AdRenderer ads={checkoutDisplayAds} />
          </View>
        )}

        {/* Delivery Address Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="location" size={20} color={colors.primary} />
            <Text style={styles.sectionTitle}>Delivery Address</Text>
          </View>

          {selectedAddress ? (
            <Pressable
              style={styles.addressCard}
              onPress={() => setShowAddAddress(true)}
            >
              <View style={styles.addressContent}>
                <Text style={styles.addressName}>
                  {selectedAddress.full_name}
                </Text>
                <Text style={styles.addressPhone}>{selectedAddress.phone}</Text>
                <Text style={styles.addressText}>
                  {selectedAddress.street_address}
                </Text>
                <Text style={styles.addressText}>
                  {selectedAddress.city}, {selectedAddress.state}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </Pressable>
          ) : (
            <Pressable
              style={styles.addButton}
              onPress={() => setShowAddAddress(true)}
            >
              <Ionicons name="add-circle" size={24} color={colors.primary} />
              <Text style={styles.addButtonText}>Add Delivery Address</Text>
            </Pressable>
          )}

          {/* Address list */}
          {addresses.length > 0 && !showAddAddress && (
            <View style={styles.addressList}>
              {addresses.map((addr) => (
                <Pressable
                  key={addr.id}
                  style={[
                    styles.addressOption,
                    selectedAddress?.id === addr.id &&
                      styles.addressOptionSelected,
                  ]}
                  onPress={() => setSelectedAddress(addr)}
                >
                  <View style={styles.radioOuter}>
                    {selectedAddress?.id === addr.id && (
                      <View style={styles.radioInner} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.addressOptionName}>
                      {addr.full_name}
                    </Text>
                    <Text style={styles.addressOptionText}>
                      {addr.street_address}, {addr.city}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Add Address Form */}
        {showAddAddress && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>New Address</Text>
            <TextInput
              style={styles.input}
              placeholder="Full Name"
              value={newAddress.full_name}
              onChangeText={(text) =>
                setNewAddress({ ...newAddress, full_name: text })
              }
              placeholderTextColor={colors.muted}
            />
            <TextInput
              style={styles.input}
              placeholder="Phone Number"
              value={newAddress.phone}
              onChangeText={(text) =>
                setNewAddress({ ...newAddress, phone: text })
              }
              keyboardType="phone-pad"
              placeholderTextColor={colors.muted}
            />
            <TextInput
              style={styles.input}
              placeholder="Street Address"
              value={newAddress.street_address}
              onChangeText={(text) =>
                setNewAddress({ ...newAddress, street_address: text })
              }
              placeholderTextColor={colors.muted}
            />
            <View style={styles.row}>
              <TextInput
                style={[styles.input, { flex: 1, marginRight: 8 }]}
                placeholder="City"
                value={newAddress.city}
                onChangeText={(text) =>
                  setNewAddress({ ...newAddress, city: text })
                }
                placeholderTextColor={colors.muted}
              />
              <TextInput
                style={[styles.input, { flex: 1, marginLeft: 8 }]}
                placeholder="State"
                value={newAddress.state}
                onChangeText={(text) =>
                  setNewAddress({ ...newAddress, state: text })
                }
                placeholderTextColor={colors.muted}
              />
            </View>
            <View style={styles.formButtons}>
              <Pressable
                style={styles.cancelButton}
                onPress={() => setShowAddAddress(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.saveButton}
                onPress={handleAddAddress}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>Save Address</Text>
                )}
              </Pressable>
            </View>
          </View>
        )}

        {/* Order Summary */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="receipt" size={20} color={colors.primary} />
            <Text style={styles.sectionTitle}>Order Summary</Text>
          </View>

          {items.map((item) => {
            const { product, quantity, price } = item;
            const effectivePrice =
              price ||
              (product.discount > 0
                ? product.price * (1 - product.discount / 100)
                : product.price);
            return (
              <View key={product.id} style={styles.orderItem}>
                <Text style={styles.orderItemTitle} numberOfLines={1}>
                  {product.title}
                </Text>
                <Text style={styles.orderItemQty}>x{quantity}</Text>
                <Text style={styles.orderItemPrice}>
                  GH₵{(effectivePrice * quantity).toLocaleString()}
                </Text>
              </View>
            );
          })}

          <View style={styles.divider} />

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>GH₵{total.toLocaleString()}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Shipping Fee</Text>
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

        {/* Payment Method */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="card" size={20} color={colors.primary} />
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
              color={colors.primary}
            />
          </View>
        </View>
      </ScrollView>

      {/* Checkout Button */}
      <View style={styles.footer}>
        <View style={styles.footerTotal}>
          <Text style={styles.footerLabel}>Total</Text>
          <Text style={styles.footerValue}>
            GH₵{grandTotal.toLocaleString()}
          </Text>
        </View>
        <Pressable
          style={[
            styles.checkoutButton,
            loading && styles.checkoutButtonDisabled,
          ]}
          onPress={handleCheckout}
          disabled={loading}
        >
          <LinearGradient
            colors={[colors.primary, colors.accent]}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E4E8F0",
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.light,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.dark,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    backgroundColor: "#fff",
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.dark,
    marginLeft: 8,
  },
  addressCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: colors.light,
    borderRadius: 12,
  },
  addressContent: {
    flex: 1,
  },
  adSection: {
    paddingTop: 8,
    paddingBottom: 2,
  },
  addressName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.dark,
  },
  addressPhone: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 2,
  },
  addressText: {
    fontSize: 14,
    color: colors.dark,
    marginTop: 4,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: colors.light,
    borderRadius: 12,
    borderStyle: "dashed",
    borderWidth: 1,
    borderColor: colors.primary,
  },
  addButtonText: {
    marginLeft: 8,
    color: colors.primary,
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
    backgroundColor: colors.light,
  },
  addressOptionSelected: {
    backgroundColor: `${colors.primary}10`,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  addressOptionName: {
    fontWeight: "600",
    color: colors.dark,
  },
  addressOptionText: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  input: {
    backgroundColor: colors.light,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E4E8F0",
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E4E8F0",
    alignItems: "center",
  },
  cancelButtonText: {
    color: colors.muted,
    fontWeight: "600",
  },
  saveButton: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
  saveButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  orderItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  orderItemTitle: {
    flex: 1,
    fontSize: 14,
    color: colors.dark,
  },
  orderItemQty: {
    fontSize: 14,
    color: colors.muted,
    marginHorizontal: 12,
  },
  orderItemPrice: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.dark,
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
    color: colors.muted,
  },
  summaryValue: {
    fontWeight: "600",
    color: colors.dark,
  },
  freeShipping: {
    color: colors.primary,
  },
  freeShippingText: {
    color: "#10B981",
    fontWeight: "700",
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.dark,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.primary,
  },
  paymentMethod: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: colors.light,
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
    color: "#fff",
  },
  paymentName: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.dark,
  },
  paymentDesc: {
    fontSize: 12,
    color: colors.muted,
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
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#E4E8F0",
    paddingBottom: 32,
  },
  footerTotal: {
    flex: 1,
  },
  footerLabel: {
    fontSize: 12,
    color: colors.muted,
  },
  footerValue: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.dark,
  },
  checkoutButton: {
    flex: 1,
    borderRadius: 16,
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
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
