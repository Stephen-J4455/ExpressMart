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
  Easing,
  Dimensions,
  StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Svg, Path as SvgPath } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useResponsive } from "../hooks/useResponsive";
import { useTheme } from "../context/ThemeContext";
import { useAppStyles } from "../hooks/useAppStyles";
import { supabase, callEdgeFunction } from "../lib/supabase";
import { colors as brandColors, getTheme, radius } from "../theme/colors";
import { getImageContentType } from "../utils/webUpload";
import {
  R2_FOLDERS,
  uploadToR2Presigned,
} from "../services/r2Storage";
import { generatePaymentReference } from "../services/payment";

// R2 key prefix for seller profile images
const PROFILE_BUCKET = R2_FOLDERS.PROFILE;
// Registration fee is managed live from the Admin app
// (express_settings.key = "store_registration_fee") — fetched on mount.
const COUNTRY_CODE = "+233";

const { width: WINDOW_WIDTH, height: WINDOW_HEIGHT } = Dimensions.get("window");

// Success splash tuning
const CONFETTI_COUNT = 24;
const SUCCESS_CONFETTI_COLORS = [
  "#FF5A79", // coral pink
  "#00E2C8", // cyan
  "#F59E0B", // amber
  "#8B5CF6", // purple
  "#3B82F6", // blue
  "#10B981", // green
];
// Approximate arc length of the checkmark path below (viewBox units)
const CHECK_PATH_LENGTH = 44;

const AnimatedSvgPath = Animated.createAnimatedComponent(SvgPath);

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
  const { colors: themeColors } = useTheme();
  const theme = getTheme(themeColors.primary);
  const styles = useAppStyles((c) => buildStoreRegStyles(c));

  const [step, setStep] = useState(1);
  // One-time store registration fee (GHS) — admin-configurable via
  // express_settings.key = "store_registration_fee" (falls back to 150).
  const [registrationFee, setRegistrationFee] = useState(150);

  // Pull the admin-configured registration fee (no-op fallback to 150).
  useEffect(() => {
    (async () => {
      try {
        if (!supabase) return;
        const { data } = await supabase
          .from("express_settings")
          .select("value")
          .eq("key", "store_registration_fee")
          .maybeSingle();
        const fee = parseFloat(data?.value);
        if (!isNaN(fee) && fee >= 0) setRegistrationFee(fee);
      } catch (e) {
        console.warn("[StoreRegistration] fee fetch failed, using default:", e);
      }
    })();
  }, []);
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
  const [focusedField, setFocusedField] = useState(null);
  // Instant interstitial: when the screen remounts after payment (via
  // PaymentWebView's navigation.replace), skip painting the registration
  // form entirely and show a branded "setting up" screen until the store
  // is created — then hand over to the animated success splash.
  const [finalizing, setFinalizing] = useState(
    () =>
      route.params?.payment === "success" && !!route.params?.reference,
  );
  const iconAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Slide the hero progress rail forward whenever the step changes.
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: step / STORE_REG_STEPS.length,
      duration: 380,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [step, progressAnim]);

  const handleFieldFocus = (field) => () => setFocusedField(field);
  const handleFieldBlur = (field) => () =>
    setFocusedField((f) => (f === field ? null : f));

  // ── Success splash animations ────────────────────────────────────────────
  const [registered, setRegistered] = useState(false);
  const splashAnim = useRef(new Animated.Value(0)).current; // backdrop fade
  const badgeScale = useRef(new Animated.Value(0)).current; // badge pop
  const checkAnim = useRef(new Animated.Value(0)).current; // checkmark draw
  const ring1 = useRef(new Animated.Value(0)).current; // pulse rings
  const ring2 = useRef(new Animated.Value(0)).current;
  const textAnim = useRef(new Animated.Value(0)).current; // copy slide-in
  const btnAnim = useRef(new Animated.Value(0)).current; // CTA fade-in
  const confettiPieces = useRef(
    Array.from({ length: CONFETTI_COUNT }, (_, i) => {
      const rot = new Animated.Value(0);
      return {
        y: new Animated.Value(-40 - Math.random() * 260),
        // Numeric spin driver (animated in the effect below)...
        rot,
        // ...exposed to the style layer as DEGREE STRINGS, because the native
        // driver requires rotate values to be strings — passing the raw
        // number throws "Transform with key of rotate must be a string".
        rotDeg: rot.interpolate({
          inputRange: [0, 360],
          outputRange: ["0deg", "360deg"],
        }),
        delay: Math.random() * 700,
        left: WINDOW_WIDTH * 0.06 + Math.random() * (WINDOW_WIDTH * 0.82),
        color: SUCCESS_CONFETTI_COLORS[i % SUCCESS_CONFETTI_COLORS.length],
        size: 6 + Math.random() * 7,
        duration: 2300 + Math.random() * 1800,
      };
    }),
  ).current;

  useEffect(() => {
    if (!registered) return;

    badgeScale.setValue(0);
    checkAnim.setValue(0);
    textAnim.setValue(0);
    btnAnim.setValue(0);

    Animated.parallel([
      // Backdrop fades in...
      Animated.timing(splashAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      // ...badge pops in with a spring...
      Animated.spring(badgeScale, {
        toValue: 1,
        friction: 4.5,
        tension: 130,
        useNativeDriver: true,
      }),
      // ...checkmark draws itself...
      Animated.timing(checkAnim, {
        toValue: 1,
        delay: 260,
        duration: 460,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      // ...copy slides up...
      Animated.timing(textAnim, {
        toValue: 1,
        delay: 420,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      // ...and the CTA fades in last.
      Animated.timing(btnAnim, {
        toValue: 1,
        delay: 800,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    // Pulsing rings radiating from the badge (loop forever).
    [ring1, ring2].forEach((v, i) => {
      v.setValue(i === 0 ? 0 : 0.5);
      Animated.loop(
        Animated.timing(v, {
          toValue: 1,
          duration: 1800,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ).start();
    });

    // Staggered confetti drop with tumbling rotation.
    Animated.parallel(
      confettiPieces.map((p) =>
        Animated.sequence([
          Animated.delay(p.delay),
          Animated.timing(p.y, {
            toValue: WINDOW_HEIGHT + 60,
            duration: p.duration,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        ]),
      ),
    ).start();
    confettiPieces.forEach((p) => {
      if (!p?.rot) return;
      p.rot.setValue(0);
      Animated.loop(
        Animated.timing(p.rot, {
          toValue: 360,
          duration: 900 + Math.random() * 500,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ).start();
    });
  }, [
    registered,
    splashAnim,
    badgeScale,
    checkAnim,
    textAnim,
    btnAnim,
    ring1,
    ring2,
    confettiPieces,
  ]);

  const finishRegistration = () => {
    setRegistered(false);
    navigation.reset({ index: 0, routes: [{ name: "Main" }] });
  };

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
    const folder = `${PROFILE_BUCKET}/${user.id}`;

    // Upload to Cloudflare R2 via presigned URL (works on web + native).
    const { publicUrl } = await uploadToR2Presigned({
      uri: logoUri,
      pickedFile: logoFile,
      folder,
      fileName,
    });
    return publicUrl;
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

  const completingRef = useRef(false);

  const completeRegistration = async (reference, restoredData = {}) => {
    // Guard against double-invocation (StrictMode double-effects / repeated
    // navigation events) racing two verifications against each other.
    if (busy || completingRef.current) return;
    completingRef.current = true;
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

      // Step 1 — verify the registration payment.
      let verify;
      try {
        verify = await callEdgeFunction("payment", {
          action: "verify-store-registration",
          reference,
        });
      } catch (verifyErr) {
        throw new Error(
          `Payment verification failed: ${
            verifyErr?.message || "unknown error"
          }`,
        );
      }
      if (!verify || !verify.verified) {
        throw new Error(
          `Payment was not completed successfully${
            verify?.error ? ` (${verify.error})` : ""
          }`,
        );
      }

      // Step 2 — create the (dormant) seller record.
      let sellerId;
      try {
        sellerId = await createSeller(avatarUrl, registrationData);
      } catch (sellerErr) {
        throw new Error(
          `Store creation failed: ${sellerErr?.message || "unknown error"}`,
        );
      }

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

      // Show the animated success splash; the user taps "Start selling"
      // to continue into the main app.
      setRegistered(true);
    } catch (err) {
      console.error("completeRegistration error", err);
      toast.error(
        "Registration incomplete",
        err?.message || "Something went wrong. Please try again.",
      );
    } finally {
      completingRef.current = false;
      setBusy(false);
      setFinalizing(false);
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
        amount: registrationFee,
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
          amount: registrationFee,
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
          <React.Fragment key={s.key}>
            {idx > 0 && (
              <View
                style={[
                  styles.stepConnector,
                  done && { backgroundColor: brandColors.success },
                ]}
              />
            )}
            <View style={styles.stepDotWrap}>
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
          </React.Fragment>
        );
      })}
    </View>
  );

  const renderStep = () => {
    if (step === 1) {
      return (
        <View style={styles.card}>
          <View
            style={[
              styles.introWrap,
              { backgroundColor: `${themeColors.primary}12` },
            ]}
          >
            <LinearGradient
              colors={[theme.gradientStart, theme.gradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.introIcon}
            >
              <Ionicons name="storefront-outline" size={26} color="#fff" />
            </LinearGradient>
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
              color={
                focusedField === "name" ? themeColors.primary : themeColors.muted
              }
              style={styles.inputIcon}
            />
            <TextInput
              style={[
                styles.input,
                styles.inputWithIcon,
                focusedField === "name" && styles.inputFocused,
              ]}
              value={name}
              onChangeText={setName}
              onFocus={handleFieldFocus("name")}
              onBlur={handleFieldBlur("name")}
              placeholder="e.g. Nova Retail"
              placeholderTextColor={themeColors.muted}
              returnKeyType="next"
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
                color={
                  focusedField === "phone"
                    ? themeColors.primary
                    : themeColors.muted
                }
                style={styles.inputIcon}
              />
              <TextInput
                style={[
                  styles.input,
                  styles.inputWithIcon,
                  styles.phoneInput,
                  focusedField === "phone" && styles.inputFocused,
                ]}
                value={phone}
                onChangeText={setPhone}
                onFocus={handleFieldFocus("phone")}
                onBlur={handleFieldBlur("phone")}
                keyboardType="phone-pad"
                maxLength={9}
                placeholder="e.g. 241234567"
                placeholderTextColor={themeColors.muted}
              />
            </View>
          </View>
          <Text style={styles.phoneHint}>
            Ghana numbers are saved with {COUNTRY_CODE} automatically.
          </Text>

          <Text style={styles.label}>Description</Text>
          <View style={styles.inputWrap}>
            <Ionicons
              name="document-text-outline"
              size={18}
              color={
                focusedField === "description"
                  ? themeColors.primary
                  : themeColors.muted
              }
              style={styles.inputIcon}
            />
            <TextInput
              style={[
                styles.input,
                styles.textArea,
                styles.inputWithIcon,
                focusedField === "description" && styles.inputFocused,
              ]}
              value={description}
              onChangeText={setDescription}
              onFocus={handleFieldFocus("description")}
              onBlur={handleFieldBlur("description")}
              placeholder="Tell customers about your store"
              placeholderTextColor={themeColors.muted}
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
                  style={[
                    styles.logoUploadBadge,
                    {
                      opacity: iconAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 0.65],
                      }),
                      transform: [
                        {
                          translateY: iconAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, -6],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <Ionicons
                    name="cloud-upload-outline"
                    size={28}
                    color="#fff"
                  />
                </Animated.View>
                <Text style={styles.logoPlaceholderText}>
                  Tap to upload logo
                </Text>
                <Text style={styles.logoPlaceholderHint}>
                  Square images look best · PNG or JPG
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
            {[
              {
                key: "bank",
                icon: "business",
                label: "Bank Account",
                sub: "Paid out directly to your bank",
              },
              {
                key: "mobile_money",
                icon: "phone-portrait",
                label: "Mobile Money",
                sub: "MTN · Telecel · AirtelTigo",
              },
            ].map((opt) => {
              const selected = payType === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  style={[
                    styles.typeBtn,
                    selected && styles.typeBtnSelected,
                    opt.key === "mobile_money" && styles.typeBtnSpacing,
                  ]}
                  onPress={() => setPayType(opt.key)}
                >
                  <View
                    style={[
                      styles.typeIconWrap,
                      selected && styles.typeIconWrapSelected,
                    ]}
                  >
                    <Ionicons
                      name={opt.icon}
                      size={20}
                      color={selected ? themeColors.primary : themeColors.muted}
                    />
                  </View>
                  <View style={styles.typeCopy}>
                    <Text style={styles.typeText}>{opt.label}</Text>
                    <Text style={styles.typeSub}>{opt.sub}</Text>
                  </View>
                  <View
                    style={[styles.radio, selected && styles.radioSelected]}
                  >
                    {selected && (
                      <Ionicons name="checkmark" size={14} color="#fff" />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>

          {payType === "bank" ? (
            <>
              <Text style={[styles.label, { marginTop: 16 }]}>Choose Bank</Text>
              {loadingBanks ? (
                <ActivityIndicator style={{ marginVertical: 12 }} />
              ) : (
                <>
                  <TextInput
                    style={[
                      styles.input,
                      focusedField === "bankSearch" && styles.inputFocused,
                    ]}
                    placeholder="Search bank..."
                    value={bankQuery}
                    onChangeText={setBankQuery}
                    onFocus={handleFieldFocus("bankSearch")}
                    onBlur={handleFieldBlur("bankSearch")}
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
                            bankCode === b.code && styles.chipSelected,
                          ]}
                          onPress={() => setBankCode(b.code)}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              bankCode === b.code && { color: themeColors.primary },
                            ]}
                          >
                            {b.name}
                          </Text>
                          {bankCode === b.code && (
                            <Ionicons
                              name="checkmark-circle"
                              size={18}
                              color={themeColors.primary}
                            />
                          )}
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
                {[
                  { key: "mtn", label: "MTN" },
                  { key: "airteltigo", label: "AirtelTigo" },
                  { key: "telecel", label: "Telecel" },
                ].map((p) => {
                  const selected = mobileProvider === p.key;
                  return (
                    <Pressable
                      key={p.key}
                      style={[
                        styles.providerPill,
                        selected && styles.providerPillSelected,
                      ]}
                      onPress={() => setMobileProvider(p.key)}
                    >
                      <Text
                        style={[
                          styles.providerPillText,
                          selected && styles.providerPillTextSelected,
                        ]}
                      >
                        {p.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          <Text style={[styles.label, { marginTop: 16 }]}>
            {payType === "bank" ? "Account Number" : "Phone Number"}
          </Text>
          <TextInput
            style={[
              styles.input,
              focusedField === "account" && styles.inputFocused,
            ]}
            value={accountNumber}
            onChangeText={setAccountNumber}
            onFocus={handleFieldFocus("account")}
            onBlur={handleFieldBlur("account")}
            keyboardType={payType === "bank" ? "numeric" : "phone-pad"}
            placeholder={
              payType === "bank" ? "13-digit account number" : "e.g. 024..."
            }
            placeholderTextColor={themeColors.muted}
          />
        </View>
      );
    }

    // step 4 — pay
    return (
      <View style={styles.card}>
        <Text style={styles.reviewTitle}>Review your store</Text>
        <Text style={styles.subLabel}>
          Confirm everything looks good before you pay.
        </Text>

        <View style={styles.summaryCard}>
          {logoUri ? (
            <Image source={{ uri: logoUri }} style={styles.summaryLogo} />
          ) : (
            <View style={[styles.summaryLogo, styles.summaryLogoFallback]}>
              <Ionicons
                name="storefront-outline"
                size={22}
                color={themeColors.primary}
              />
            </View>
          )}
          <View style={styles.summaryHead}>
            <Text style={styles.summaryName} numberOfLines={1}>
              {name.trim() || "—"}
            </Text>
            <Text style={styles.summarySub}>{formatPhone(phone)}</Text>
          </View>
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
          <Ionicons name="receipt-outline" size={22} color={themeColors.primary} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.feeTitle}>Store Registration Fee</Text>
            <Text style={styles.feeSub}>
              One-time fee to activate your store
            </Text>
          </View>
          <Text style={styles.feeAmount}>GH₵{registrationFee}</Text>
        </View>

        <Text style={styles.payNote}>
          You'll be redirected to Paystack to complete a secure payment of GH₵
          {registrationFee}. Your store is created right away — you can go
          live whenever you're ready.
        </Text>
      </View>
    );
  };

  // Gradient primary action used across all step footers.
  const GradientAction = ({ onPress, disabled, style, children }) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        style,
        pressed && !disabled && styles.btnPressed,
        disabled && styles.btnDisabled,
      ]}
    >
      <LinearGradient
        colors={[theme.gradientStart, theme.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.primaryBtn}
      >
        {children}
      </LinearGradient>
    </Pressable>
  );

  const BackAction = ({ onPress, disabled }) => (
    <Pressable
      style={({ pressed }) => [
        styles.cancelBtn,
        styles.footerBtn,
        pressed && !disabled && styles.btnPressed,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Ionicons name="chevron-back" size={16} color={themeColors.dark} />
      <Text style={styles.cancelBtnText}>Back</Text>
    </Pressable>
  );

  const renderFooter = () => {
    if (step === 1) {
      return (
        <GradientAction
          onPress={() => canContinueStep1 && setStep(2)}
          disabled={!canContinueStep1}
        >
          <Ionicons name="arrow-forward" size={16} color="#fff" />
          <Text style={styles.primaryBtnText}>Continue</Text>
        </GradientAction>
      );
    }
    if (step === 2) {
      return (
        <View style={styles.footerRow}>
          <BackAction onPress={() => setStep(1)} />
          <GradientAction
            style={styles.footerPrimary}
            onPress={() => setStep(3)}
          >
            <Ionicons name="arrow-forward" size={16} color="#fff" />
            <Text style={styles.primaryBtnText}>Continue</Text>
          </GradientAction>
        </View>
      );
    }
    if (step === 3) {
      return (
        <View style={styles.footerRow}>
          <BackAction onPress={() => setStep(2)} />
          <GradientAction
            style={styles.footerPrimary}
            onPress={() => setStep(4)}
          >
            <Ionicons name="arrow-forward" size={16} color="#fff" />
            <Text style={styles.primaryBtnText}>Continue</Text>
          </GradientAction>
        </View>
      );
    }
    return (
      <View style={styles.footerRow}>
        <BackAction onPress={() => setStep(3)} disabled={busy} />
        <GradientAction
          style={styles.footerPrimary}
          onPress={handlePay}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="lock-closed" size={16} color="#fff" />
              <Text style={styles.primaryBtnText}>
                Pay GH₵{registrationFee}
              </Text>
            </>
          )}
        </GradientAction>
      </View>
    );
  };

  // Payment-return interstitial — never flash the registration form while
  // the payment is verified and the store is created in the background.
  // When done: registered=true hands over to the success splash; on error
  // we drop back to the form so the user can retry.
  if (finalizing && !registered) {
    return (
      <View style={styles.container}>
        <StatusBar
          backgroundColor={theme.gradientStart}
          barStyle="light-content"
        />
        <LinearGradient
          colors={[theme.gradientStart, theme.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.finalWrap}
        >
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.finalTitle}>Setting up your store</Text>
          <Text style={styles.finalSub}>
            Verifying your payment and creating your space on Tagit.
          </Text>
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar
        backgroundColor={theme.gradientStart}
        barStyle="light-content"
      />

      {/* Gradient hero header */}
      <LinearGradient
        colors={[theme.gradientStart, theme.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + 8 }]}
      >
        <View style={styles.heroTopRow}>
          <Pressable
            style={({ pressed }) => [
              styles.heroBackBtn,
              pressed && styles.heroBackPressed,
            ]}
            onPress={() =>
              step === 1 ? navigation.goBack() : setStep(step - 1)
            }
          >
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          <View style={styles.heroStepChip}>
            <Text style={styles.heroStepChipText}>
              Step {step} of {STORE_REG_STEPS.length}
            </Text>
          </View>
        </View>
        <Text style={styles.heroTitle}>Create your store</Text>
        <Text style={styles.heroSubtitle}>
          Sell to thousands of buyers on Tagit.
        </Text>

        {/* Animated progress rail */}
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0%", "100%"],
                }),
              },
            ]}
          />
        </View>
      </LinearGradient>

      {/* Keyboard-aware shell: keeps the sticky footer above the keyboard */}
      <KeyboardAvoidingView
        style={styles.kav}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={[
            styles.scrollContent,
            isWide && {
              maxWidth: contentMaxWidth || 700,
              alignSelf: "center",
              width: "100%",
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <StepIndicator />
          {renderStep()}
          <View style={{ height: 140 }} />
        </ScrollView>

        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(insets.bottom, 12) + 8 },
          ]}
        >
          {renderFooter()}
        </View>
      </KeyboardAvoidingView>

      {busy && step === 4 && (
        <View style={styles.busyOverlay}>
          <View style={styles.busyCard}>
            <ActivityIndicator size="large" color={themeColors.primary} />
            <Text style={styles.busyText}>Finalizing your store...</Text>
          </View>
        </View>
      )}

      {/* Success splash — animated celebration on registration */}
      {registered && (
        <Animated.View style={[styles.successWrap, { opacity: splashAnim }]}>
          <LinearGradient
            colors={[theme.gradientStart, theme.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />

          {/* Confetti */}
          {confettiPieces.map((p, i) => (
            <Animated.View
              key={`confetti-${i}`}
              pointerEvents="none"
              style={[
                styles.confettiPiece,
                {
                  left: p.left,
                  width: p.size,
                  height: p.size * 1.6,
                  backgroundColor: p.color,
                  transform: [{ translateY: p.y }, { rotate: p.rotDeg }],
                },
              ]}
            />
          ))}

          {/* Pulsing rings + springing badge with drawn checkmark */}
          <View style={styles.successRingsWrap}>
            <Animated.View
              style={[
                styles.successRing,
                {
                  transform: [
                    {
                      scale: ring1.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.85, 1.9],
                      }),
                    },
                  ],
                  opacity: ring1.interpolate({
                    inputRange: [0, 0.7, 1],
                    outputRange: [0.45, 0.15, 0],
                  }),
                },
              ]}
            />
            <Animated.View
              style={[
                styles.successRing,
                {
                  transform: [
                    {
                      scale: ring2.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.85, 1.9],
                      }),
                    },
                  ],
                  opacity: ring2.interpolate({
                    inputRange: [0, 0.7, 1],
                    outputRange: [0.45, 0.15, 0],
                  }),
                },
              ]}
            />
            <Animated.View style={{ transform: [{ scale: badgeScale }] }}>
              <LinearGradient
                colors={["rgba(255,255,255,0.30)", "rgba(255,255,255,0.10)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.successBadge}
              >
                <Svg width={64} height={64} viewBox="0 0 64 64">
                  <AnimatedSvgPath
                    d="M20 33 L29 42 L45 23"
                    stroke="#fff"
                    strokeWidth={5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                    strokeDasharray={CHECK_PATH_LENGTH}
                    strokeDashoffset={checkAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [CHECK_PATH_LENGTH, 0],
                    })}
                  />
                </Svg>
              </LinearGradient>
            </Animated.View>
          </View>

          {/* Copy */}
          <Animated.View
            style={[
              styles.successContent,
              {
                opacity: textAnim,
                transform: [
                  {
                    translateY: textAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [22, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Text style={styles.successTitle}>You're all set! 🎉</Text>
            {!!name.trim() && (
              <Text style={styles.successName}>{name.trim()}</Text>
            )}
            <Text style={styles.successSub}>
              Your store has been created. Add products and go live from your
              Seller Dashboard when you're ready.
            </Text>
          </Animated.View>

          {/* CTA */}
          <Animated.View style={[styles.successCtaWrap, { opacity: btnAnim }]}>
            <Pressable
              onPress={finishRegistration}
              style={({ pressed }) => pressed && styles.btnPressed}
            >
              <LinearGradient
                colors={[theme.gradientStart, theme.gradientEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.primaryBtn}
              >
                <Ionicons name="storefront" size={17} color="#fff" />
                <Text style={styles.primaryBtnText}>Start selling</Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
};

const buildStoreRegStyles = (c) =>
  StyleSheet.create({ 
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    kav: {
      flex: 1,
    },
    scrollArea: {
      flex: 1,
      backgroundColor: c.background,
    },
    hero: {
      paddingHorizontal: 20,
      paddingBottom: 18,
      borderBottomLeftRadius: radius.xl,
      borderBottomRightRadius: radius.xl,
    },
    heroTopRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 16,
    },
    heroBackBtn: {
      width: 40,
      height: 40,
      borderRadius: radius.full,
      backgroundColor: "rgba(255,255,255,0.18)",
      alignItems: "center",
      justifyContent: "center",
    },
    heroBackPressed: {
      backgroundColor: "rgba(255,255,255,0.32)",
    },
    heroStepChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: radius.pill,
      backgroundColor: "rgba(255,255,255,0.18)",
    },
    heroStepChipText: {
      fontSize: 12,
      fontWeight: "800",
      color: "#fff",
      letterSpacing: 0.3,
    },
    heroTitle: {
      fontSize: 24,
      fontWeight: "900",
      color: "#fff",
      letterSpacing: -0.4,
    },
    heroSubtitle: {
      fontSize: 13,
      color: "rgba(255,255,255,0.85)",
      marginTop: 4,
      marginBottom: 16,
    },
    progressTrack: {
      height: 5,
      borderRadius: radius.full,
      backgroundColor: "rgba(255,255,255,0.25)",
      overflow: "hidden",
    },
    progressFill: {
      height: "100%",
      borderRadius: radius.full,
      backgroundColor: "#fff",
    },
    scrollContent: {
      padding: 16,
      paddingBottom: 20,
    },
    stepIndicator: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginBottom: 18,
    },
    stepConnector: {
      flex: 1,
      height: 2,
      borderRadius: 1,
      backgroundColor: c.border,
      marginTop: 14,
      marginHorizontal: 6,
    },
    stepDotWrap: {
      alignItems: "center",
    },
    stepDot: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: c.light,
      borderWidth: 1.5,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
    },
    stepDotActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    stepDotDone: {
      backgroundColor: brandColors.success,
      borderColor: brandColors.success,
    },
    stepDotText: {
      fontSize: 13,
      fontWeight: "700",
      color: c.muted,
    },
    stepDotTextActive: {
      color: c.light,
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
      borderRadius: radius.lg,
      padding: 18,
      borderWidth: 1,
      borderColor: c.borderAlpha,
      shadowColor: "#000",
      shadowOpacity: 0.05,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
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
      overflow: "hidden",
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
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.surfaceAlpha,
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
      borderColor: c.border,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      paddingVertical: 13,
      fontSize: 15,
      color: c.dark,
      backgroundColor: c.background,
      marginBottom: 12,
      ...(Platform.OS === "web" ? { outlineStyle: "none", outlineWidth: 0 } : { }),
    },
    inputFocused: {
      borderColor: c.primary,
      shadowColor: c.primary,
      shadowOpacity: 0.25,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 0 },
      elevation: 2,
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
      borderColor: c.border,
      borderStyle: "dashed",
    },
    logoPlaceholder: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 36,
      backgroundColor: c.light,
    },
    logoPlaceholderText: {
      marginTop: 12,
      color: c.dark,
      fontWeight: "700",
    },
    logoPlaceholderHint: {
      fontSize: 11,
      color: c.muted,
      marginTop: 4,
    },
    logoUploadBadge: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: c.primary,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: c.primary,
      shadowOpacity: 0.35,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
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
      flexDirection: "row",
      alignItems: "center",
      padding: 14,
      borderRadius: radius.lg,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.background,
    },
    typeBtnSelected: {
      borderColor: c.primary,
    },
    typeIconWrap: {
      width: 42,
      height: 42,
      borderRadius: radius.md,
      backgroundColor: c.surfaceAlpha,
      alignItems: "center",
      justifyContent: "center",
    },
    typeIconWrapSelected: {
      backgroundColor: `${c.primary}18`,
    },
    typeCopy: {
      flex: 1,
      marginLeft: 12,
    },
    typeSub: {
      fontSize: 12,
      fontWeight: "600",
      color: c.muted,
      marginTop: 2,
    },
    radio: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
    },
    radioSelected: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    typeBtnSpacing: {
      marginTop: 10,
    },
    typeText: {
      fontSize: 15,
      fontWeight: "800",
      color: c.dark,
    },
    providerRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    providerPill: {
      paddingVertical: 12,
      paddingHorizontal: 18,
      borderRadius: radius.pill,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.background,
    },
    providerPillSelected: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    providerPillText: {
      fontSize: 13,
      fontWeight: "800",
      color: c.dark,
    },
    providerPillTextSelected: {
      color: "#fff",
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
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 13,
      paddingHorizontal: 16,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: c.border,
      marginVertical: 5,
      backgroundColor: c.background,
    },
    chipSelected: {
      borderColor: c.primary,
      backgroundColor: `${c.primary}0F`,
    },
    chipText: {
      fontWeight: "700",
      color: c.dark,
      flexShrink: 1,
      marginRight: 8,
    },
    reviewTitle: {
      fontSize: 17,
      fontWeight: "800",
      color: c.dark,
      marginTop: 4,
      marginBottom: 2,
    },
    summaryCard: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 14,
      padding: 14,
      borderRadius: radius.lg,
      backgroundColor: c.surfaceAlpha,
      borderWidth: 1,
      borderColor: c.borderAlpha,
    },
    summaryLogo: {
      width: 48,
      height: 48,
      borderRadius: radius.md,
    },
    summaryLogoFallback: {
      backgroundColor: `${c.primary}14`,
      alignItems: "center",
      justifyContent: "center",
    },
    summaryHead: {
      flex: 1,
      marginLeft: 12,
    },
    summaryName: {
      fontSize: 15,
      fontWeight: "800",
      color: c.dark,
    },
    summarySub: {
      fontSize: 12,
      color: c.muted,
      marginTop: 2,
    },
    summaryRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 12,
      marginTop: 6,
      borderBottomWidth: 1,
      borderBottomColor: c.borderAlpha,
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
      borderRadius: radius.lg,
      backgroundColor: `${c.primary}10`,
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
      paddingHorizontal: 16,
      paddingTop: 12,
      backgroundColor: c.light,
      borderTopWidth: 1,
      borderTopColor: c.borderAlpha,
    },
    btnPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.98 }],
    },
    btnDisabled: {
      opacity: 0.5,
    },
    primaryBtn: {
      paddingVertical: 15,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
    },
    primaryBtnText: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "800",
      marginLeft: 8,
    },
    cancelBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 15,
      paddingHorizontal: 18,
      borderRadius: radius.pill,
      backgroundColor: c.surfaceAlpha,
    },
    cancelBtnText: {
      color: c.dark,
      fontWeight: "700",
      marginLeft: 2,
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
      backgroundColor: c.overlay,
      alignItems: "center",
      justifyContent: "center",
    },
    busyCard: {
      backgroundColor: c.light,
      borderRadius: radius.lg,
      paddingHorizontal: 28,
      paddingVertical: 24,
      alignItems: "center",
    },
    busyText: {
      marginTop: 12,
      color: c.dark,
      fontWeight: "600",
    },
    successWrap: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 100,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 28,
    },
    confettiPiece: {
      position: "absolute",
      top: -40,
      borderRadius: 2,
    },
    successRingsWrap: {
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 26,
    },
    successRing: {
      position: "absolute",
      width: 150,
      height: 150,
      borderRadius: 75,
      borderWidth: 2,
      borderColor: "#fff",
    },
    successBadge: {
      width: 118,
      height: 118,
      borderRadius: 59,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOpacity: 0.25,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
    successContent: {
      alignItems: "center",
    },
    successTitle: {
      fontSize: 26,
      fontWeight: "900",
      color: "#fff",
      letterSpacing: -0.4,
    },
    successName: {
      fontSize: 17,
      fontWeight: "800",
      color: "#fff",
      marginTop: 8,
    },
    successSub: {
      fontSize: 13,
      lineHeight: 19,
      color: "rgba(255,255,255,0.88)",
      textAlign: "center",
      marginTop: 10,
      maxWidth: 300,
    },
    successCtaWrap: {
      marginTop: 34,
      width: "100%",
      maxWidth: 320,
    },
    // Payment-return interstitial
    finalWrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 32,
    },
    finalTitle: {
      fontSize: 20,
      fontWeight: "900",
      color: "#fff",
      marginTop: 18,
    },
    finalSub: {
      fontSize: 13,
      lineHeight: 19,
      color: "rgba(255,255,255,0.85)",
      textAlign: "center",
      marginTop: 8,
    },
  });

export default StoreRegistrationScreen;