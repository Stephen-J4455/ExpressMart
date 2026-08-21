import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Image,
  Platform,
  Animated,
  StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useResponsive } from "../hooks/useResponsive";
import { useTheme } from "../context/ThemeContext";
import { useAppStyles } from "../hooks/useAppStyles";
import { supabase, callEdgeFunction } from "../lib/supabase";
import { colors as palette, getTheme } from "../theme/colors";
import { getImageContentType, getWebUploadPayload } from "../utils/webUpload";
import { generatePaymentReference } from "../services/payment";

const PROFILE_BUCKET = "profile";
const REGISTRATION_FEE = 150; // GHC 150
const COUNTRY_CODE = "+233";

// Normalize a locally-entered phone number into international format with
// the Ghana country code. Returns null when no number is provided so the
// backend still receives a null rather than a placeholder.
const normalizePhone = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.startsWith("+")) return raw;
  const stripped = raw.replace(/^0/, "");
  return `${COUNTRY_CODE}${stripped}`;
};

// Friendly display of the phone number with the country code shown.
const formatPhone = (value) => {
  const normalized = normalizePhone(value);
  return normalized || "—";
};

const STORE_REG_STEPS = [
  { key: "details", label: "Store Details" },
  { key: "logo", label: "Logo" },
  { key: "payout", label: "Payout" },
  { key: "pay", label: "Payment" },
];

const getBlobFromAsset = async (uri, pickedFile) => {
  if (pickedFile instanceof Blob) return pickedFile;
  const response = await fetch(uri);
  const blob = await response.blob();
  if (!blob) throw new Error("Could not read the selected image");
  return blob;
};

export const StoreRegistrationScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { user, refreshProfile } = useAuth();
  const toast = useToast();
  const { isWide, contentMaxWidth } = useResponsive();
  const { colors, isDark } = useTheme();
  const theme = getTheme(colors.primary);
  const styles = useAppStyles((c) => buildStoreRegStyles(c));

  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");

  const [logoUri, setLogoUri] = useState("");
  const [logoFile, setLogoFile] = useState(null);

  const [payType, setPayType] = useState("bank");
  const [banks, setBanks] = useState([]);
  const [loadingBanks, setLoadingBanks] = useState(false);
  const [bankCode, setBankCode] = useState("");
  const [bankQuery, setBankQuery] = useState("");
  const [mobileProvider, setMobileProvider] = useState("mtn");
  const [accountNumber, setAccountNumber] = useState("");

  const [busy, setBusy] = useState(false);
  const iconAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(iconAnim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(iconAnim, {
          toValue: 0,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);

  // Handle payment success returned from PaymentWebView
  useEffect(() => {
    const params = route.params;
    if (params?.payment === "success" && params?.reference && !busy) {
      // Restore registration data that was passed through the payment flow
      // (component re-mounts after navigation.replace, so state is lost)
      const regData = params?.orderData?.registrationData || {};
      if (regData.name) setName(regData.name);
      if (regData.phone) setPhone(regData.phone);
      if (regData.description) setDescription(regData.description);
      if (regData.payType) setPayType(regData.payType);
      if (regData.bankCode) setBankCode(regData.bankCode);
      if (regData.mobileProvider) setMobileProvider(regData.mobileProvider);
      if (regData.accountNumber) setAccountNumber(regData.accountNumber);
      if (regData.avatarUrl) setLogoUri(regData.avatarUrl);

      completeRegistration(params.reference, regData);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params]);

  useEffect(() => {
    if (step === 3 && payType === "bank") {
      fetchBanks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, payType]);

  const fetchBanks = async () => {
    setLoadingBanks(true);
    try {
      const res = await callEdgeFunction("create_subaccount", {
        action: "list_banks",
        country: "ghana",
      });
      if (res && res.data) {
        setBanks(
          res.data.map((b) => ({ code: String(b.code), name: b.name })),
        );
      }
    } catch (e) {
      console.warn("Failed to load banks:", e);
    } finally {
      setLoadingBanks(false);
    }
  };

  const pickLogo = async () => {
    try {
      if (Platform.OS !== "web") {
        const { status } =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          toast.error("Gallery permission is required");
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 1,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selected = result.assets[0];
        setLogoUri(selected.uri);
        setLogoFile(selected.file instanceof Blob ? selected.file : null);
      }
    } catch (e) {
      console.error("pickLogo error", e);
      toast.error("Could not open image picker");
    }
  };

  const uploadLogo = async () => {
    if (!logoUri) return null;
    const getExt = (u) => {
      const seg = u?.split("?")[0]?.split("/").pop() || "";
      const ext = seg.includes(".") ? seg.split(".").pop()?.toLowerCase() : null;
      if (!ext || ext.length > 5) return "jpg";
      return ext === "jpeg" ? "jpg" : ext;
    };
    const ext = getExt(logoUri);
    const fileName = `store-${Date.now()}.${ext}`;
    const objectPath = `${user.id}/${fileName}`;

    // Use the robust upload utility with XHR fallback (handles web + native)
    const { fileBody, contentType } = await getWebUploadPayload({
      uri: logoUri,
      pickedFile: logoFile,
    });

    const uploadRes = await supabase.storage
      .from(PROFILE_BUCKET)
      .upload(objectPath, fileBody, {
        contentType: fileBody.type || contentType,
        cacheControl: "3600",
        upsert: true,
      });
    if (uploadRes.error) throw uploadRes.error;
    const { data: urlData } = supabase.storage
      .from(PROFILE_BUCKET)
      .getPublicUrl(objectPath);
    return urlData.publicUrl;
  };

  const createSeller = async (avatarUrl, sellerData = {}) => {
    const sellerName = String(sellerData.name || name || "").trim();
    const sellerPhone = normalizePhone(sellerData.phone || phone || "");
    const sellerDescription = String(
      sellerData.description || description || "",
    ).trim();

    const resp = await callEdgeFunction("create_seller", {
      name: sellerName,
      email: user.email,
      phone: sellerPhone || null,
      store_description: sellerDescription || null,
      avatar: avatarUrl || null,
    });

    if (!resp || !resp.success || !resp.data?.seller?.id) {
      throw new Error(resp?.error || "Could not create store");
    }

    return resp.data.seller.id;
  };

  const createPayoutAccount = async (sellerId, payoutData = {}) => {
    const payoutType = payoutData.payType || payType;
    const payoutBankCode = payoutData.bankCode || bankCode;
    const payoutMobileProvider = payoutData.mobileProvider || mobileProvider;
    const payoutAccountNumber = payoutData.accountNumber || accountNumber;

    const normalizedAccount = String(payoutAccountNumber || "")
      .replace(/\D/g, "")
      .trim();
    if (!normalizedAccount) {
      throw new Error("Payout account number is required");
    }
    const resp = await callEdgeFunction("create_subaccount", {
      seller_id: sellerId,
      name: String(payoutData.name || name || "").trim(),
      email: user.email,
      settlement_bank: payoutType === "bank" ? payoutBankCode : payoutMobileProvider,
      account_number: normalizedAccount,
      type: payoutType,
      currency: "GHS",
    });
    if (!resp || !resp.success) {
      throw new Error(resp?.error || "Failed to create payout account");
    }
    return resp;
  };

  const updateUserRoleToSeller = async () => {
    try {
      const { error } = await supabase
        .from("express_profiles")
        .update({ role: "seller" })
        .eq("id", user.id);
      if (error) {
        console.error("Failed to update user role to seller:", error);
      } else {
        console.log("✅ User role updated to seller");
      }
    } catch (roleErr) {
      console.error("Error updating user role:", roleErr);
    }
  };

  const completeRegistration = async (reference, restoredData = {}) => {
    if (busy) return;
    setBusy(true);
    try {
        const registrationData = {
          name: restoredData.name || name,
          phone: normalizePhone(restoredData.phone || phone),
          description: restoredData.description || description,
        payType: restoredData.payType || payType,
        bankCode: restoredData.bankCode || bankCode,
        mobileProvider: restoredData.mobileProvider || mobileProvider,
        accountNumber: restoredData.accountNumber || accountNumber,
        avatarUrl: restoredData.avatarUrl || null,
      };

      // Verify payment first, then create the seller record on the backend.
      // Use restoredData.avatarUrl if the logo was already uploaded before
      // navigation (the local logoUri may be stale after re-mount on web).
      let avatarUrl = registrationData.avatarUrl || null;
      if (!avatarUrl && logoUri) {
        try {
          avatarUrl = await uploadLogo();
        } catch (logoErr) {
          console.warn("Logo upload failed, continuing without logo", logoErr);
        }
      }
      // Verify the registration payment first.
      const verify = await callEdgeFunction("payment", {
        action: "verify-store-registration",
        reference,
      });
      if (!verify || !verify.verified) {
        throw new Error("Payment was not completed successfully");
      }

      const sellerId = await createSeller(avatarUrl, registrationData);

      // Update user profile role from 'customer' to 'seller'
      await updateUserRoleToSeller();

      // Refresh the profile in AuthContext so role change is reflected immediately
      try {
        await refreshProfile();
      } catch (refreshErr) {
        console.warn("Failed to refresh profile after role update:", refreshErr);
      }

      // Create Paystack subaccount for payouts
      try {
        await createPayoutAccount(sellerId, registrationData);
      } catch (payErr) {
        console.warn("Payout account creation failed:", payErr);
        toast.error(
          "Store created, but payout setup failed. You can add it later in Store Profile.",
        );
      }

      toast.success(
        "Store Registered!",
        "Your store is now live on tagit.",
      );
      navigation.reset({ index: 0, routes: [{ name: "Main" }] });
    } catch (err) {
      console.error("completeRegistration error", err);
      toast.error(
        "Registration incomplete",
        err?.message || "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handlePay = async () => {
    const normalizedAccount = String(accountNumber || "").replace(/\D/g, "").trim();
    if (!normalizedAccount) {
      toast.error(
        payType === "bank" ? "Enter account number" : "Enter phone number",
      );
      return;
    }
    if (payType === "bank" && !bankCode) {
      toast.error("Select your bank");
      return;
    }
    if (payType === "bank") {
      if (normalizedAccount.length !== 13) {
        toast.error("Account number must be 13 digits");
        return;
      }
    } else if (
      normalizedAccount.length < 10 ||
      normalizedAccount.length > 13
    ) {
      toast.error("Mobile money number must be 10 to 13 digits");
      return;
    }

    setBusy(true);
    try {
      // Upload logo BEFORE navigating so the avatar URL survives the
      // component re-mount that happens after PaymentWebView calls
      // navigation.replace("StoreRegistration", ...).
      let avatarUrl = null;
      if (logoUri) {
        try {
          avatarUrl = await uploadLogo();
        } catch (logoErr) {
          console.warn("Logo upload failed before payment, continuing without logo", logoErr);
        }
      }

      const reference = generatePaymentReference(user.id);
      const init = await callEdgeFunction("payment", {
        action: "initialize-store-registration",
        amount: REGISTRATION_FEE,
        reference,
        email: user.email,
      });
      if (init && init.success && init.data && init.data.authorization_url) {
        // Pass all registration data through orderData so it can be restored
        // when this screen re-mounts after the payment callback.
        const registrationData = {
          name: name.trim(),
          phone: normalizePhone(phone),
          description: description.trim(),
          payType,
          bankCode,
          mobileProvider,
          accountNumber: normalizedAccount,
          avatarUrl,
        };

        navigation.navigate("PaymentWebView", {
          authorization_url: init.data.authorization_url,
          access_code: init.data.access_code,
          paystack_public_key: init.data.paystack_public_key || null,
          amount: REGISTRATION_FEE,
          email: user.email,
          reference,
          orderData: {
            type: "store_registration",
            registrationData,
          },
          returnTo: "StoreRegistration",
        });
      } else {
        throw new Error(init?.error || "Could not start payment");
      }
    } catch (err) {
      console.error("handlePay error", err);
      toast.error("Payment Error", err?.message || "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const filteredBanks = (() => {
    const q = bankQuery.trim().toLowerCase();
    const filtered = banks.filter((b) => {
      if (!q) return true;
      return (
        String(b.name || "").toLowerCase().includes(q) ||
        String(b.code || "").toLowerCase().includes(q)
      );
    });
    const seen = new Set();
    const unique = [];
    for (const b of filtered) {
      const key = String(b.code ?? b.name ?? "").trim();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(b);
      }
    }
    return unique;
  })();

  const canContinueStep1 = name.trim().length > 1 && phone.trim().length > 0;

  const StepIndicator = () => (
    <View style={styles.stepIndicator}>
      {STORE_REG_STEPS.map((s, idx) => {
        const num = idx + 1;
        const active = num === step;
        const done = num < step;
        return (
          <View key={s.key} style={styles.stepDotWrap}>
            <View
              style={[
                styles.stepDot,
                active && styles.stepDotActive,
                done && styles.stepDotDone,
              ]}
            >
              {done ? (
                <Ionicons name="checkmark" size={14} color="#fff" />
              ) : (
                <Text
                  style={[
                    styles.stepDotText,
                    active && styles.stepDotTextActive,
                  ]}
                >
                o
                  {num}
                </Text>
              )}
            </View>
            <Text
              style={[styles.stepLabel, active && styles.stepLabelActive]}
            >
              {s.label}
            </Text>
          </View>
        );
      })}
    </View>
  );

  const renderStep = () => {
    if (step === 1) {
      return (
        <View style={styles.card}>
          <View style={styles.introWrap}>
            <View style={styles.introIcon}>
              <Ionicons name="storefront-outline" size={26} color="#fff" />
            </View>
            <Text style={styles.introTitle}>Store Details</Text>
            <Text style={styles.introSub}>
              Tell us about your shop. Customers will see this on your store page.
            </Text>
          </View>

          <Text style={styles.label}>Store Name</Text>
          <View style={styles.inputWrap}>
            <Ionicons
              name="storefront-outline"
              size={18}
              color={colors.muted}
              style={styles.inputIcon}
            />
            <TextInput
              style={[styles.input, styles.inputWithIcon]}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Nova Retail"
              placeholderTextColor={colors.muted}
            />
          </View>

          <Text style={styles.label}>Phone Number</Text>
          <View style={styles.phoneRow}>
            <View style={styles.countryCode}>
              <Text style={styles.countryCodeText}>{COUNTRY_CODE}</Text>
            </View>
            <View style={[styles.inputWrap, { flex: 1, marginBottom: 0 }]}>
              <Ionicons
                name="call-outline"
                size={18}
                color={colors.muted}
                style={styles.inputIcon}
              />
              <TextInput
                style={[styles.input, styles.inputWithIcon, styles.phoneInput]}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                maxLength={9}
                placeholder="e.g. 241234567"
                placeholderTextColor={colors.muted}
              />
            </View>
          </View>
          <Text style={styles.phoneHint}>
            Ghana numbers are saved with {COUNTRY_CODE} automatically.
          </Text>

          <Text style={styles.label}>Description</Text>
          <View style={styles.inputWrap}>
            <TextInput
              style={[styles.input, styles.textArea, styles.inputWithIcon]}
              value={description}
              onChangeText={setDescription}
              placeholder="Tell customers about your store"
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              maxLength={600}
            />
          </View>
        </View>
      );
    }

    if (step === 2) {
      return (
        <View style={styles.card}>
          <Text style={styles.label}>Store Logo</Text>
          <Text style={styles.subLabel}>
            Optional — you can add or change this later.
          </Text>
          <Pressable style={styles.logoPicker} onPress={pickLogo}>
            {logoUri ? (
              <Image source={{ uri: logoUri }} style={styles.logoImage} />
            ) : (
              <View style={styles.logoPlaceholder}>
                <Animated.View
                  style={{
                    opacity: iconAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 0.6],
                    }),
                  }}
                >
                  <Ionicons
                    name="cloud-upload-outline"
                    size={40}
                    color={colors.primary}
                  />
                </Animated.View>
                <Text style={styles.logoPlaceholderText}>
                  Tap to upload logo
                </Text>
              </View>
            )}
          </Pressable>
          {logoUri && (
            <Pressable
              style={styles.removeLogo}
              onPress={() => {
                setLogoUri("");
                setLogoFile(null);
              }}
            >
              <Text style={styles.removeLogoText}>Remove logo</Text>
            </Pressable>
          )}
        </View>
      );
    }

    if (step === 3) {
      return (
        <View style={styles.card}>
          <Text style={styles.label}>Payout Method</Text>
          <View style={styles.typeList}>
            <Pressable
              style={[
                styles.typeBtn,
                payType === "bank" && { borderColor: colors.primary },
              ]}
              onPress={() => setPayType("bank")}
            >
              <Ionicons
                name="business"
                size={22}
                color={payType === "bank" ? colors.primary : colors.muted}
              />
              <Text style={styles.typeText}>Bank Account</Text>
            </Pressable>
            <Pressable
              style={[
                styles.typeBtn,
                payType === "mobile_money" && { borderColor: colors.primary },
                styles.typeBtnSpacing,
              ]}
              onPress={() => setPayType("mobile_money")}
            >
              <Ionicons
                name="phone-portrait"
                size={22}
                color={
                  payType === "mobile_money" ? colors.primary : colors.muted
                }
              />
              <Text style={styles.typeText}>Mobile Money</Text>
            </Pressable>
          </View>

          {payType === "bank" ? (
            <>
              <Text style={[styles.label, { marginTop: 16 }]}>Choose Bank</Text>
              {loadingBanks ? (
                <ActivityIndicator style={{ marginVertical: 12 }} />
              ) : (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="Search bank..."
                    value={bankQuery}
                    onChangeText={setBankQuery}
                  />
                  <ScrollView
                    style={styles.bankList}
                    nestedScrollEnabled
                  >
                    {filteredBanks.length === 0 ? (
                      <Text style={styles.noBanks}>No banks match your search.</Text>
                    ) : (
                      filteredBanks.map((b, idx) => (
                        <Pressable
                          key={`${b.code}-${idx}`}
                          style={[
                            styles.chip,
                            bankCode === b.code && {
                              borderColor: colors.primary,
                            },
                          ]}
                          onPress={() => setBankCode(b.code)}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              bankCode === b.code && { color: colors.primary },
                            ]}
                          >
                            {b.name}
                          </Text>
                        </Pressable>
                      ))
                    )}
                  </ScrollView>
                </>
              )}
            </>
          ) : (
            <>
              <Text style={[styles.label, { marginTop: 16 }]}>Provider</Text>
              <View style={styles.providerRow}>
                {["mtn", "airteltigo", "telecel"].map((p) => (
                  <Pressable
                    key={p}
                    style={[
                      styles.typeBtn,
                      payType === "mobile_money" &&
                        mobileProvider === p && { borderColor: colors.primary },
                      styles.typeBtnSpacing,
                    ]}
                    onPress={() => setMobileProvider(p)}
                  >
                    <Text style={styles.typeText}>{p.toUpperCase()}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <Text style={[styles.label, { marginTop: 16 }]}>
            {payType === "bank" ? "Account Number" : "Phone Number"}
          </Text>
          <TextInput
            style={styles.input}
            value={accountNumber}
            onChangeText={setAccountNumber}
            keyboardType={payType === "bank" ? "numeric" : "phone-pad"}
            placeholder={
              payType === "bank" ? "13-digit account number" : "e.g. 024..."
            }
            placeholderTextColor={colors.muted}
          />
        </View>
      );
    }

    // step 4 — pay
    return (
      <View style={styles.card}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryKey}>Store Name</Text>
          <Text style={styles.summaryVal}>{name.trim() || "—"}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryKey}>Phone</Text>
          <Text style={styles.summaryVal}>{formatPhone(phone)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryKey}>Payout</Text>
          <Text style={styles.summaryVal}>
            {payType === "bank"
              ? `Bank • ${accountNumber.trim()}`
              : `MoMo (${mobileProvider}) • ${accountNumber.trim()}`}
          </Text>
        </View>

        <View style={styles.feeBox}>
          <Ionicons name="receipt-outline" size={22} color={colors.primary} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.feeTitle}>Store Registration Fee</Text>
            <Text style={styles.feeSub}>
              One-time fee to activate your store
            </Text>
          </View>
          <Text style={styles.feeAmount}>GH₵{REGISTRATION_FEE}</Text>
        </View>

        <Text style={styles.payNote}>
          You'll be redirected to Paystack to complete a secure payment of GH₵
          {REGISTRATION_FEE}. Your store goes live immediately after payment.
        </Text>
      </View>
    );
  };

  const renderFooter = () => {
    if (step === 1) {
      return (
        <Pressable
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          onPress={() => canContinueStep1 && setStep(2)}
          disabled={!canContinueStep1}
        >
          <Text style={styles.primaryBtnText}>Continue</Text>
        </Pressable>
      );
    }
    if (step === 2) {
      return (
        <View style={styles.footerRow}>
          <Pressable
            style={[styles.cancelBtn, styles.footerBtn]}
            onPress={() => setStep(1)}
          >
            <Text>Back</Text>
          </Pressable>
          <Pressable
            style={[styles.primaryBtn, styles.footerPrimary, { backgroundColor: colors.primary }]}
            onPress={() => setStep(3)}
          >
            <Text style={styles.primaryBtnText}>Continue</Text>
          </Pressable>
        </View>
      );
    }
    if (step === 3) {
      return (
        <View style={styles.footerRow}>
          <Pressable
            style={[styles.cancelBtn, styles.footerBtn]}
            onPress={() => setStep(2)}
          >
            <Text>Back</Text>
          </Pressable>
          <Pressable
            style={[styles.primaryBtn, styles.footerPrimary, { backgroundColor: colors.primary }]}
            onPress={() => setStep(4)}
          >
            <Text style={styles.primaryBtnText}>Continue</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={styles.footerRow}>
        <Pressable
          style={[styles.cancelBtn, styles.footerBtn]}
          onPress={() => setStep(3)}
          disabled={busy}
        >
          <Text>Back</Text>
        </Pressable>
        <Pressable
          style={[styles.primaryBtn, styles.footerPrimary, { backgroundColor: colors.primary }]}
          onPress={handlePay}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="lock-closed" size={16} color="#fff" />
              <Text style={styles.primaryBtnText}>
                Pay GH₵{REGISTRATION_FEE}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar backgroundColor={colors.light} barStyle={isDark ? "light-content" : "dark-content"} />
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => (step === 1 ? navigation.goBack() : setStep(step - 1))}
        >
          <Ionicons name="arrow-back" size={24} color={colors.dark} />
        </Pressable>
        <Text style={styles.headerTitle}>Register a Store</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={[
          styles.scrollContent,
          isWide && { maxWidth: contentMaxWidth || 700, alignSelf: "center", width: "100%" },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <StepIndicator />
        {renderStep()}
        <View style={{ height: 120 }} />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: 20 + insets.bottom }]}>
        {renderFooter()}
      </View>

      {busy && step === 4 && (
        <View style={styles.busyOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.busyText}>Finalizing your store...</Text>
        </View>
      )}
    </View>
  );
};

const buildStoreRegStyles = (c) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.light,
    },
    scrollArea: {
      flex: 1,
      backgroundColor: c.background,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 14,
      backgroundColor: c.light,
      borderBottomWidth: 1,
      borderBottomColor: "#E4E8F0",
    },
    backButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.light,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: c.dark,
    },
    scrollContent: {
      padding: 16,
      paddingBottom: 20,
    },
    stepIndicator: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 20,
    },
    stepDotWrap: {
      alignItems: "center",
      flex: 1,
    },
    stepDot: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: c.light,
      borderWidth: 1.5,
      borderColor: "#E2E8F0",
      alignItems: "center",
      justifyContent: "center",
    },
    stepDotActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    stepDotDone: {
      backgroundColor: "#22C55E",
      borderColor: "#22C55E",
    },
    stepDotText: {
      fontSize: 13,
      fontWeight: "700",
      color: c.muted,
    },
    stepDotTextActive: {
      color: "#fff",
    },
    stepLabel: {
      fontSize: 11,
      color: c.muted,
      marginTop: 6,
      fontWeight: "600",
    },
    stepLabelActive: {
      color: c.dark,
    },
    card: {
      backgroundColor: c.light,
      borderRadius: 20,
      padding: 18,
      shadowColor: "#000",
      shadowOpacity: 0.04,
      shadowRadius: 10,
      elevation: 2,
    },
    label: {
      fontWeight: "700",
      marginBottom: 8,
      marginTop: 4,
      color: c.dark,
    },
    subLabel: {
      fontSize: 12,
      color: c.muted,
      marginTop: -4,
      marginBottom: 12,
    },
    introWrap: {
      alignItems: "center",
      backgroundColor: c.light,
      borderRadius: 16,
      paddingVertical: 20,
      paddingHorizontal: 16,
      marginBottom: 18,
    },
    introIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: c.primary,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    introTitle: {
      fontSize: 18,
      fontWeight: "800",
      color: c.dark,
      marginBottom: 6,
    },
    introSub: {
      fontSize: 13,
      color: c.muted,
      textAlign: "center",
      lineHeight: 19,
      paddingHorizontal: 8,
    },
    inputWrap: {
      position: "relative",
      marginBottom: 12,
    },
    inputIcon: {
      position: "absolute",
      left: 14,
      top: 15,
      zIndex: 1,
    },
    inputWithIcon: {
      paddingLeft: 42,
    },
    phoneRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    countryCode: {
      alignItems: "center",
      justifyContent: "center",
      height: 48,
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: "#E2E8F0",
      backgroundColor: "#EEF1F6",
    },
    countryCodeText: {
      fontSize: 15,
      fontWeight: "800",
      color: c.dark,
    },
    phoneInput: {
      height: 48,
      marginBottom: 0,
    },
    phoneHint: {
      fontSize: 12,
      color: c.muted,
      marginBottom: 12,
      marginTop: -4,
    },
    input: {
      borderWidth: 1.5,
      borderColor: "#E2E8F0",
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 13,
      fontSize: 15,
      color: c.dark,
      backgroundColor: "#FAFBFC",
      marginBottom: 12,
      ...(Platform.OS === "web" ? { outlineStyle: "none", outlineWidth: 0 } : {}),
    },
    textArea: {
      height: 100,
      textAlignVertical: "top",
    },
    logoPicker: {
      marginTop: 4,
      borderRadius: 16,
      overflow: "hidden",
      borderWidth: 1.5,
      borderColor: "#E2E8F0",
      borderStyle: "dashed",
    },
    logoPlaceholder: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 36,
      backgroundColor: c.light,
    },
    logoPlaceholderText: {
      marginTop: 10,
      color: c.muted,
      fontWeight: "600",
    },
    logoImage: {
      width: "100%",
      height: 200,
      resizeMode: "cover",
    },
    removeLogo: {
      alignSelf: "flex-end",
      marginTop: 8,
    },
    removeLogoText: {
      color: "#EF4444",
      fontWeight: "600",
    },
    typeList: {
      flexDirection: "column",
    },
    typeBtn: {
      padding: 18,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: "#E2E8F0",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
    },
    typeBtnSpacing: {
      marginTop: 10,
    },
    typeText: {
      marginLeft: 12,
      fontWeight: "700",
      color: c.dark,
    },
    providerRow: {
      flexDirection: "column",
    },
    bankList: {
      maxHeight: 200,
      marginBottom: 4,
    },
    noBanks: {
      color: c.muted,
      marginTop: 8,
    },
    chip: {
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: "#E2E8F0",
      marginVertical: 5,
      backgroundColor: c.light,
    },
    chipText: {
      fontWeight: "700",
      color: c.dark,
    },
    summaryRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: "#F1F5F9",
    },
    summaryKey: {
      fontSize: 14,
      color: c.muted,
      fontWeight: "600",
    },
    summaryVal: {
      fontSize: 14,
      color: c.dark,
      fontWeight: "700",
      flexShrink: 1,
      textAlign: "right",
      marginLeft: 12,
    },
    feeBox: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 16,
      padding: 16,
      borderRadius: 14,
      backgroundColor: c.light,
    },
    feeTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: c.dark,
    },
    feeSub: {
      fontSize: 12,
      color: c.muted,
      marginTop: 2,
    },
    feeAmount: {
      fontSize: 18,
      fontWeight: "800",
      color: c.primary,
    },
    payNote: {
      marginTop: 16,
      fontSize: 13,
      color: c.muted,
      lineHeight: 20,
    },
    footer: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      padding: 16,
      backgroundColor: c.light,
      borderTopWidth: 1,
      borderTopColor: "#E4E8F0",
    },
    primaryBtn: {
      paddingVertical: 15,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryBtnText: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "700",
      marginLeft: 8,
    },
    cancelBtn: {
      paddingVertical: 15,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#F3F4F6",
    },
    footerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 12,
    },
    footerPrimary: {
      flex: 1,
      flexDirection: "row",
    },
    footerBtn: {
      marginRight: 12,
      minWidth: 90,
    },
    busyOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(255,255,255,0.85)",
      alignItems: "center",
      justifyContent: "center",
    },
    busyText: {
      marginTop: 12,
      color: c.dark,
      fontWeight: "600",
    },
  });

export default StoreRegistrationScreen;