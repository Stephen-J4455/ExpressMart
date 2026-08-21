import {
  Pressable,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  Modal,
  TextInput,
  ScrollView,
} from "react-native";
import { useState, useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { supabase, callEdgeFunction } from "../lib/supabase";
import { colors as palette } from "../theme/colors";
import { useTheme } from "../context/ThemeContext";
import { useAppStyles } from "../hooks/useAppStyles";
import { useResponsive } from "../hooks/useResponsive";

export const PaymentsScreen = ({ navigation }) => {
  const { user, profile } = useAuth();
  const toast = useToast();
  const { colors } = useTheme();
  const styles = useAppStyles((c) => buildPaymentsStyles(c));
  const { cardColumns, horizontalPadding, getItemWidth } = useResponsive();
  const cardItemWidth = getItemWidth(cardColumns);
  const [loading, setLoading] = useState(true);

  // Store (seller) payment account — mirrors the Express-Store profile page.
  // tagit's express_sellers table stores the Paystack subaccount in
  // `payment_account` (code), with `payment_platform`, `payment_provider`,
  // `payment_currency`, `account_code` (payout account number) and
  // `account_verified` describing the receiving account.
  const [sellerId, setSellerId] = useState(null);
  const [storeName, setStoreName] = useState("");
  const [subaccountCode, setSubaccountCode] = useState(null); // payment_account
  const [paymentProvider, setPaymentProvider] = useState(null); // payment_provider (bank | mobile_money)
  const [paymentCurrency, setPaymentCurrency] = useState("GHS"); // payment_currency
  const [accountCode, setAccountCode] = useState(""); // account_code (payout number)
  const [accountVerified, setAccountVerified] = useState(false); // account_verified

  const [setupVisible, setSetupVisible] = useState(false);
  const [setupType, setSetupType] = useState("bank");
  const [setupBank, setSetupBank] = useState("");
  const [setupBankDropdownVisible, setSetupBankDropdownVisible] = useState(false);
  const [setupMobileProvider, setSetupMobileProvider] = useState("mtn");
  const [setupCurrency, setSetupCurrency] = useState("GHS");
  const [setupAccount, setSetupAccount] = useState("");
  const [creating, setCreating] = useState(false);
  const [loadingBanks, setLoadingBanks] = useState(false);
  const [paymentDetailsLoading, setPaymentDetailsLoading] = useState(false);
  const [paymentLoadError, setPaymentLoadError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const MOBILE_MONEY_PROVIDERS = ["mtn", "airteltigo", "telecel"];
  const DEFAULT_PAYSTACK_BANKS = [
    { code: "044", name: "Access Bank" },
    { code: "050", name: "Ecobank" },
    { code: "058", name: "GTBank" },
    { code: "057", name: "Zenith Bank" },
    { code: "011", name: "First Bank" },
    { code: "033", name: "UBA" },
    { code: "032", name: "Sterling Bank" },
    { code: "039", name: "Stanbic IBTC" },
  ];
  const [PAYSTACK_BANKS, setPAYSTACK_BANKS] = useState(DEFAULT_PAYSTACK_BANKS);

  // Load the seller's payment account from the database (like Express-Store's
  // syncPaystackAndDatabase / profile load).
  const loadPaymentAccount = async () => {
    if (!supabase || !user) return;
    const { data, error } = await supabase
      .from("express_sellers")
      .select(
        "id, name, payment_platform, payment_account, payment_provider, payment_currency, account_code, account_verified",
      )
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) {
      console.warn("Failed to load payment account:", error);
      return;
    }
    if (data) {
      setSellerId(data.id);
      setStoreName(data.name || "");
      const code = data.payment_account || null;
      setSubaccountCode(code);
      setPaymentProvider(data.payment_provider || null);
      setPaymentCurrency(data.payment_currency || "GHS");
      setAccountCode(data.account_code || "");
      setAccountVerified(Boolean(data.account_verified));
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      if (!supabase || !user) {
        if (active) setLoading(false);
        return;
      }
      await loadPaymentAccount();
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [user]);

  const fetchPaymentBanks = async () => {
    setLoadingBanks(true);
    try {
      const res = await callEdgeFunction("create_subaccount", {
        action: "list_banks",
        country: "ghana",
      });
      if (res?.data?.length) {
        const seen = new Set();
        const unique = [];
        for (const b of res.data) {
          const code = String(b?.code || "").trim();
          const name = String(b?.name || "").trim();
          if (!code || !name) continue;
          if (seen.has(code)) continue;
          seen.add(code);
          unique.push({ code, name });
        }
        setPAYSTACK_BANKS(unique);
      }
    } catch (err) {
      console.warn("Failed to load Paystack banks:", err);
    } finally {
      setLoadingBanks(false);
    }
  };

  const openSetup = async (editMode) => {
    if (editMode) {
      const provider = paymentProvider || "bank";
      setSetupType(provider === "mobile_money" ? "mobile_money" : "bank");
      setSetupCurrency(paymentCurrency || "GHS");
      if (provider === "mobile_money") {
        setSetupMobileProvider(
          MOBILE_MONEY_PROVIDERS.includes(provider) ? provider : "mtn",
        );
      } else {
        setSetupBank("");
      }
      setSetupAccount(accountCode || "");
    } else {
      setSetupType("bank");
      setSetupBank("");
      setSetupMobileProvider("mtn");
      setSetupCurrency("GHS");
      setSetupAccount("");
    }
    setPaymentLoadError("");
    setPaymentDetailsLoading(true);
    setSetupVisible(true);
    try {
      await fetchPaymentBanks();
      // Load existing Paystack subaccount details if available
      if (subaccountCode) {
        try {
          const paystackResp = await callEdgeFunction("create_subaccount", {
            action: "get_subaccount",
            subaccount_code: subaccountCode,
          });
          const pd = paystackResp?.data;
          if (pd) {
            const settlementValue = String(pd.settlement_bank || "").toLowerCase();
            const provider = MOBILE_MONEY_PROVIDERS.find((p) => p === settlementValue);
            if (provider) {
              setSetupType("mobile_money");
              setSetupMobileProvider(provider);
            } else if (settlementValue) {
              setSetupType("bank");
              setSetupBank(String(pd.settlement_bank));
            }
            if (pd.account_number) setSetupAccount(String(pd.account_number));
          }
        } catch (e) {
          console.warn("Failed to load existing Paystack subaccount:", e);
        }
      }
    } catch (e) {
      console.error("Error loading payment details:", e);
    } finally {
      setPaymentDetailsLoading(false);
    }
  };

  useEffect(() => {
    if (setupVisible && setupType === "bank") fetchPaymentBanks();
  }, [setupVisible, setupType]);

  // Ensure a seller row exists for this user (creating one on first setup if needed).
  const ensureSeller = async () => {
    if (sellerId) return sellerId;
    if (!supabase || !user) return null;
    const baseName =
      profile?.full_name || user.email?.split("@")[0] || "My Store";
    const { data, error } = await supabase
      .from("express_sellers")
      .insert({
        user_id: user.id,
        name: baseName,
        email: user.email,
        phone: profile?.phone || null,
      })
      .select("id, name")
      .single();
    if (error) throw error;
    if (data) {
      setSellerId(data.id);
      setStoreName(data.name || baseName);
    }
    return data?.id || null;
  };

  // Create/update the Paystack subaccount AND persist it to the database.
  // The edge function writes payment_account/payment_provider/payment_currency/
  // account_code/account_verified, then we re-read the row to reflect it in the UI.
  const handleCreateSubaccount = async () => {
    const normalized = String(setupAccount || "").replace(/\D/g, "").trim();
    if (!normalized) {
      toast.error(
        setupType === "bank" ? "Enter account number" : "Enter phone number",
      );
      return;
    }
    if (setupType === "bank") {
      const expectedLen = setupCurrency === "GHS" ? 13 : 10;
      if (normalized.length !== expectedLen) {
        toast.error(
          `Account number must be ${expectedLen} digits for ${setupCurrency}`,
        );
        return;
      }
    }
    if (
      setupType === "mobile_money" &&
      (normalized.length < 10 || normalized.length > 13)
    ) {
      toast.error("Mobile money number must be 10 to 13 digits");
      return;
    }
    try {
      setCreating(true);
      // Make sure we have a seller row to attach the subaccount to.
      const resolvedSellerId = await ensureSeller();
      if (!resolvedSellerId) {
        throw new Error("Could not create your store record");
      }

      // Create/update the Paystack subaccount. Passing the existing
      // subaccount_code makes this an update instead of a new account.
      const settlementBank =
        setupType === "bank" ? setupBank || "GCB Bank" : setupMobileProvider;
      const resp = await callEdgeFunction("create_subaccount", {
        seller_id: resolvedSellerId,
        name: storeName || user?.email,
        email: user?.email,
        subaccount_code: subaccountCode || undefined,
        settlement_bank: settlementBank,
        account_number: normalized,
        type: setupType,
        currency: setupCurrency,
      });

      if (!resp?.success && resp?.error) {
        throw new Error(resp.error);
      }

      // Re-read the database so the UI reflects the persisted account.
      await loadPaymentAccount();
      setSetupVisible(false);
      setSetupAccount("");
      setSetupBank("");
      toast.success("Payment account saved");
    } catch (err) {
      toast.error(err?.message || "Failed to set up payment account");
    } finally {
      setCreating(false);
    }
  };

  // Sync the Paystack subaccount status back into the database (verification,
  // payout account) — mirrors Express-Store's syncPaystackAndDatabase.
  const handleSync = async () => {
    if (!sellerId || !subaccountCode) return;
    try {
      setSyncing(true);
      await callEdgeFunction("create_subaccount", {
        action: "sync_subaccount_status",
        seller_id: sellerId,
        subaccount_code: subaccountCode,
      });
      await loadPaymentAccount();
      toast.success("Synced with Paystack");
    } catch (err) {
      toast.error(err?.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const renderStoreCard = () => {
    const acct = String(accountCode || "").replace(/\D/g, "");
    const last4 = acct.slice(-4);
    return (
      <LinearGradient
        colors={[colors.primary, colors.accent]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.storeCard}
      >
        <View style={styles.storeCardTop}>
          <Text style={styles.storeCardBrand}>TAGIT</Text>
          <Ionicons name="card" size={28} color="#fff" />
        </View>
        <Text style={styles.storeCardNumber}>
          •••• •••• •••• {last4 || "0000"}
        </Text>
        <View style={styles.storeCardBottom}>
          <View>
            <Text style={styles.storeCardLabel}>RECEIVING ACCOUNT</Text>
            <Text style={styles.storeCardName} numberOfLines={1}>
              {storeName || "Your Store"}
            </Text>
          </View>
          <View
            style={[
              styles.storeCardBadge,
              {
                backgroundColor: accountVerified
                  ? "rgba(16,185,129,0.9)"
                  : "rgba(255,255,255,0.25)",
              },
            ]}
          >
            <Ionicons
              name={accountVerified ? "checkmark-circle" : "time"}
              size={13}
              color="#fff"
            />
            <Text style={styles.storeCardBadgeText}>
              {accountVerified ? "Verified" : "Pending"}
            </Text>
          </View>
        </View>
      </LinearGradient>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View
        style={[
          styles.header,
          { paddingHorizontal: cardColumns > 1 ? horizontalPadding : 16 },
        ]}
      >
        <Pressable
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.dark} />
        </Pressable>
        <Text style={styles.headerTitle}>Payment Methods</Text>
        {!subaccountCode && (
          <Pressable style={styles.addButton} onPress={() => openSetup(false)}>
            <Ionicons name="add" size={24} color={colors.primary} />
          </Pressable>
        )}
      </View>

      {/* Store payment account — the account this store uses to receive payments.
          Shown for every signed-in user so they can set up / edit their
          receiving account (a seller row is created on first save if needed). */}
      <View style={styles.storeSection}>
        <Text style={styles.sectionTitle}>Store Payment Account</Text>
        {subaccountCode ? (
          <View>
            {renderStoreCard()}
            <View style={styles.storeDetails}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Account Type</Text>
                <Text style={styles.detailValue}>
                  {paymentProvider === "mobile_money" ? "Mobile Money" : "Bank"}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Currency</Text>
                <Text style={styles.detailValue}>{paymentCurrency || "GHS"}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Subaccount Code</Text>
                <Text style={styles.detailValue} numberOfLines={1}>
                  {subaccountCode}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Payout Account</Text>
                <Text style={styles.detailValue}>
                  •••• {String(accountCode || "").slice(-4) || "—"}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Status</Text>
                <Text
                  style={[
                    styles.detailValue,
                    {
                      color: accountVerified ? colors.success : colors.muted,
                    },
                  ]}
                >
                  {accountVerified ? "Verified" : "Pending verification"}
                </Text>
              </View>
              <View style={styles.detailActions}>
                <Pressable
                  style={[styles.detailActionBtn, styles.detailEditBtn]}
                  onPress={() => openSetup(true)}
                >
                  <Ionicons
                    name="create-outline"
                    size={16}
                    color={colors.primary}
                  />
                  <Text style={styles.editButtonText}>Edit account</Text>
                </Pressable>
                <Pressable
                  style={[styles.detailActionBtn, styles.detailSyncBtn]}
                  onPress={handleSync}
                  disabled={syncing}
                >
                  {syncing ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Ionicons
                      name="sync-outline"
                      size={16}
                      color={colors.primary}
                    />
                  )}
                  <Text style={styles.editButtonText}>Sync</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : (
          <Pressable style={styles.setupButton} onPress={() => openSetup(false)}>
            <Ionicons name="add-circle-outline" size={20} color="#fff" />
            <Text style={styles.setupButtonText}>
              Set up payment account
            </Text>
          </Pressable>
        )}
      </View>

      <View style={styles.infoContainer}>
        <Ionicons
          name="shield-checkmark-outline"
          size={20}
          color={colors.success}
        />
        <Text style={styles.infoText}>
          Your payment information is securely stored and encrypted
        </Text>
      </View>

      {/* Store payment account setup / edit modal */}
      <Modal visible={setupVisible} transparent animationType="slide">
        <View style={styles.setupModalOverlay}>
          <View style={styles.setupModal}>
            <View style={styles.setupModalHead}>
              <Text style={styles.setupModalTitle}>
                {subaccountCode ? "Edit payment account" : "Set up payment account"}
              </Text>
              <Pressable onPress={() => setSetupVisible(false)}>
                <Ionicons name="close" size={24} color={colors.dark} />
              </Pressable>
            </View>

            <Text style={styles.setupLabel}>Account type</Text>
            <View style={styles.setupTypeRow}>
              <Pressable
                style={[
                  styles.setupTypeBtn,
                  setupType === "bank" && styles.setupTypeBtnActive,
                ]}
                onPress={() => setSetupType("bank")}
              >
                <Text
                  style={[
                    styles.setupTypeText,
                    setupType === "bank" && styles.setupTypeTextActive,
                  ]}
                >
                  Bank
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.setupTypeBtn,
                  setupType === "mobile_money" && styles.setupTypeBtnActive,
                ]}
                onPress={() => setSetupType("mobile_money")}
              >
                <Text
                  style={[
                    styles.setupTypeText,
                    setupType === "mobile_money" && styles.setupTypeTextActive,
                  ]}
                >
                  Mobile Money
                </Text>
              </Pressable>
            </View>

            <Text style={styles.setupLabel}>Currency</Text>
            <View style={styles.setupTypeRow}>
              {["GHS", "NGN"].map((c) => (
                <Pressable
                  key={c}
                  style={[
                    styles.setupTypeBtn,
                    setupCurrency === c && styles.setupTypeBtnActive,
                  ]}
                  onPress={() => setSetupCurrency(c)}
                >
                  <Text
                    style={[
                      styles.setupTypeText,
                      setupCurrency === c && styles.setupTypeTextActive,
                    ]}
                  >
                    {c}
                  </Text>
                </Pressable>
              ))}
            </View>

            {paymentDetailsLoading ? (
              <View style={styles.setupLoading}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.setupLoadingText}>Loading payment details...</Text>
              </View>
            ) : (
              <>
                {setupType === "bank" ? (
                  <>
                    <Text style={styles.setupLabel}>Bank name</Text>
                    <Pressable
                      style={styles.setupInput}
                      onPress={() => setSetupBankDropdownVisible((v) => !v)}
                    >
                      <Text
                        style={[
                          styles.setupInputText,
                          !setupBank && { color: colors.muted },
                        ]}
                      >
                        {setupBank || "Select your bank"}
                      </Text>
                      <Ionicons name="chevron-down" size={18} color={colors.muted} />
                    </Pressable>
                    {setupBankDropdownVisible && (
                      <View style={styles.bankDropdown}>
                        {loadingBanks ? (
                          <ActivityIndicator style={{ marginVertical: 12 }} color={colors.primary} />
                        ) : (
                          <ScrollView style={styles.bankScroll} keyboardShouldPersistTaps="handled">
                            {PAYSTACK_BANKS.map((b) => (
                              <Pressable
                                key={b.code}
                                style={[
                                  styles.bankOption,
                                  setupBank === b.name && styles.bankOptionActive,
                                ]}
                                onPress={() => {
                                  setSetupBank(b.name);
                                  setSetupBankDropdownVisible(false);
                                }}
                              >
                                <Text
                                  style={[
                                    styles.bankOptionText,
                                    setupBank === b.name && styles.bankOptionTextActive,
                                  ]}
                                >
                                  {b.name}
                                </Text>
                              </Pressable>
                            ))}
                          </ScrollView>
                        )}
                      </View>
                    )}
                  </>
                ) : (
                  <>
                    <Text style={styles.setupLabel}>Mobile money provider</Text>
                    <View style={styles.setupTypeRow}>
                      {MOBILE_MONEY_PROVIDERS.map((p) => (
                        <Pressable
                          key={p}
                          style={[
                            styles.setupTypeBtn,
                            setupMobileProvider === p && styles.setupTypeBtnActive,
                          ]}
                          onPress={() => setSetupMobileProvider(p)}
                        >
                          <Text
                            style={[
                              styles.setupTypeText,
                              setupMobileProvider === p && styles.setupTypeTextActive,
                            ]}
                          >
                            {p.toUpperCase()}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                )}

                <Text style={styles.setupLabel}>
                  {setupType === "bank" ? "Account number" : "Phone number"}
                </Text>
                <TextInput
                  style={styles.setupInput}
                  value={setupAccount}
                  onChangeText={setSetupAccount}
                  keyboardType={setupType === "bank" ? "numeric" : "phone-pad"}
                  placeholder={
                    setupType === "bank"
                      ? `${setupCurrency} ${setupCurrency === "GHS" ? "13" : "10"}-digit number`
                      : "+233..."
                  }
                  placeholderTextColor={colors.muted}
                />

                {paymentLoadError ? (
                  <Text style={styles.setupErrorText}>{paymentLoadError}</Text>
                ) : null}

                <Pressable
                  style={[
                    styles.setupSubmit,
                    { backgroundColor: colors.primary },
                    creating && { opacity: 0.6 },
                  ]}
                  onPress={handleCreateSubaccount}
                  disabled={creating}
                >
                  {creating ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.setupSubmitText}>
                      {subaccountCode ? "Save Changes" : "Create Account"}
                    </Text>
                  )}
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const buildPaymentsStyles = (c) =>
  StyleSheet.create({
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: c.light,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: c.dark,
  },
  addButton: {
    padding: 8,
  },
  infoContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#fff",
    marginTop: 16,
    marginHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.light,
  },
  infoText: {
    fontSize: 14,
    color: c.muted,
    marginLeft: 8,
    flex: 1,
  },
  storeSection: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: c.dark,
    marginBottom: 12,
  },
  storeCard: {
    borderRadius: 18,
    padding: 20,
    height: 190,
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  storeCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  storeCardBrand: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 1,
  },
  storeCardNumber: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 2,
  },
  storeCardBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  storeCardLabel: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  storeCardName: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    marginTop: 2,
    maxWidth: 160,
  },
  storeCardBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  storeCardBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  storeDetails: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: c.light,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  detailLabel: {
    fontSize: 13,
    color: c.muted,
    fontWeight: "600",
  },
  detailValue: {
    fontSize: 14,
    color: c.dark,
    fontWeight: "700",
    maxWidth: 180,
    textAlign: "right",
  },
  detailActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  detailActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#EEF2FF",
  },
  detailEditBtn: {},
  detailSyncBtn: {},
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#EEF2FF",
  },
  editButtonText: {
    color: c.primary,
    fontSize: 14,
    fontWeight: "700",
  },
  storeHint: {
    fontSize: 12,
    color: c.muted,
    marginTop: 8,
  },
  setupButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: c.primary,
    borderRadius: 12,
    paddingVertical: 14,
  },
  setupButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  setupModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  setupModal: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
  },
  setupModalHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  setupModalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: c.dark,
  },
  setupLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: c.dark,
    marginTop: 12,
    marginBottom: 6,
  },
  setupTypeRow: { flexDirection: "row", gap: 12 },
  setupTypeBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    alignItems: "center",
  },
  setupTypeBtnActive: { borderColor: c.primary, backgroundColor: "#EEF2FF" },
  setupTypeText: { fontWeight: "700", color: c.muted },
  setupTypeTextActive: { color: c.primary },
  setupInput: {
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 13,
    fontSize: 15,
    color: c.dark,
  },
  setupInputText: { fontSize: 15, color: c.dark },
  setupLoading: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 20, justifyContent: "center" },
  setupLoadingText: { fontSize: 14, color: c.muted, marginTop: 8 },
  bankDropdown: {
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    marginTop: 6,
    maxHeight: 200,
    backgroundColor: "#fff",
  },
  bankScroll: { maxHeight: 200 },
  bankOption: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  bankOptionActive: { backgroundColor: "#EEF2FF" },
  bankOptionText: { fontSize: 15, color: c.dark },
  bankOptionTextActive: { color: c.primary, fontWeight: "700" },
  setupErrorText: { color: "#EF4444", fontSize: 12, marginTop: 8 },
  setupSubmit: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  setupSubmitText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});