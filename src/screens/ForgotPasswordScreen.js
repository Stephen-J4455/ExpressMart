import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useTheme } from "../context/ThemeContext";
import { useAppStyles } from "../hooks/useAppStyles";

export const ForgotPasswordScreen = ({ navigation }) => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const { resetPassword } = useAuth();
  const toast = useToast();
  const { colors: themeColors } = useTheme();
  const styles = useAppStyles((c) => buildForgotPasswordStyles(c));

  const handleResetPassword = async () => {
    if (!email) {
      toast.error("Error", "Please enter your email address");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Error", "Please enter a valid email address");
      return;
    }

    setLoading(true);
    try {
      const { error } = await resetPassword(email);
      if (!error) setEmailSent(true);
    } finally {
      setLoading(false);
    }
  };

  if (emailSent) {
    return (
      <SafeAreaView style={styles.container} edges={["left", "right", "bottom"]}>
        <StatusBar style="light" translucent backgroundColor="transparent" />
        <View style={styles.successHero}>
          <Text style={styles.eyebrow}>TAGIT ACCOUNT</Text>
          <Text style={styles.heroTitle}>Check your{"\n"}inbox</Text>
        </View>
        <View style={styles.successCard}>
          <View style={styles.successIcon}>
            <Ionicons name="mail-open-outline" size={30} color={themeColors.primary} />
          </View>
          <Text style={styles.successTitle}>Reset link sent</Text>
          <Text style={styles.successMessage}>
            We sent a secure password reset link to:
          </Text>
          <Text style={styles.successEmail}>{email}</Text>
          <Text style={styles.successHint}>
            Check your inbox and spam folder, then return here to sign in.
          </Text>
          <Pressable style={styles.submitButton} onPress={() => navigation.goBack()}>
            <LinearGradient
              colors={[themeColors.gradientStart, themeColors.gradientEnd]}
              style={styles.buttonGradient}
            >
              <Text style={styles.buttonText}>Back to sign in</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </LinearGradient>
          </Pressable>
          <Pressable style={styles.resendButton} onPress={() => setEmailSent(false)}>
            <Text style={styles.resendText}>Didn't receive it? Try again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["left", "right", "bottom"]}>
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bottomOffset={24}
        extraKeyboardSpace={16}
        mode="insets"
        disableScrollOnKeyboardHide
      >
        <View style={styles.hero}>
          <View style={styles.topBar}>
            <View style={styles.topBarSpacer} />
            <Ionicons name="ellipsis-horizontal" size={20} color="#fff" />
          </View>
          <Text style={styles.eyebrow}>ACCOUNT RECOVERY</Text>
          <Text style={styles.heroTitle}>Reset your{"\n"}password</Text>
        </View>

        <View style={styles.formCard}>
          <View style={styles.sheetHandle} />
          <View style={styles.brandLockup}>
            <Text style={styles.brandLabel}>TAGIT</Text>
          </View>
          <Text style={styles.title}>Forgot your password?</Text>
          <Text style={styles.subtitle}>
            Enter your email and we’ll send you a secure link to get back into tagit.
          </Text>
          <Text style={styles.label}>EMAIL ADDRESS</Text>
          <View style={styles.inputContainer}>
            <Ionicons name="mail-outline" size={18} color={themeColors.primary} />
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              placeholderTextColor={themeColors.muted}
              returnKeyType="send"
              onSubmitEditing={handleResetPassword}
            />
          </View>
          <Pressable
            style={[styles.submitButton, loading && styles.buttonDisabled]}
            onPress={handleResetPassword}
            disabled={loading}
          >
            <LinearGradient
              colors={[themeColors.gradientStart, themeColors.gradientEnd]}
              style={styles.buttonGradient}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.buttonText}>SEND RESET LINK</Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </>
              )}
            </LinearGradient>
          </Pressable>
          <Pressable style={styles.footerLink} onPress={() => navigation.goBack()}>
            <Text style={styles.footerLinkText}>Return to sign in</Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
};

const buildForgotPasswordStyles = (c) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.surface },
    scrollContent: { flexGrow: 1, paddingBottom: 20 },
    hero: {
      minHeight: 300,
      padding: 24,
      paddingTop: 84,
      paddingBottom: 76,
      backgroundColor: c.primaryDark,
      borderBottomLeftRadius: 42,
      borderBottomRightRadius: 42,
    },
    successHero: {
      minHeight: 300,
      padding: 24,
      paddingTop: 84,
      backgroundColor: c.primaryDark,
      borderBottomLeftRadius: 42,
      borderBottomRightRadius: 42,
    },
    backButton: {
      width: 42,
      height: 42,
      borderRadius: 13,
      backgroundColor: "rgba(255,255,255,0.18)",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 30,
    },
    topBar: { flexDirection: "row", alignItems: "center", marginBottom: 34 },
    topBarSpacer: { flex: 1 },
    brandLabel: {
      flex: 1,
      color: "#fff",
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 2,
      marginLeft: 10,
    },
    eyebrow: { color: "#ffd6df", fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
    heroTitle: { color: "#fff", fontSize: 38, lineHeight: 42, fontWeight: "800", marginTop: 12 },
    formCard: {
      marginTop: -54,
      marginHorizontal: 18,
      padding: 24,
      paddingBottom: 32,
      backgroundColor: c.light,
      borderRadius: 36,
      shadowColor: c.dark,
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.16,
      shadowRadius: 20,
      elevation: 8,
    },
    successCard: {
      marginTop: -54,
      marginHorizontal: 18,
      padding: 28,
      paddingBottom: 36,
      backgroundColor: c.light,
      borderRadius: 36,
      shadowColor: c.dark,
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.16,
      shadowRadius: 20,
      elevation: 8,
      alignItems: "center",
    },
    sheetHandle: {
      width: 42,
      height: 4,
      borderRadius: 3,
      backgroundColor: c.border,
      alignSelf: "center",
      marginBottom: 22,
    },
    brandLockup: {
      alignItems: "flex-start",
      justifyContent: "center",
      marginBottom: 22,
    },
    brandLabel: {
      color: c.primaryDark,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 2,
      marginTop: 7,
    },
    title: { color: c.dark, fontSize: 27, lineHeight: 32, fontWeight: "800" },
    subtitle: { color: c.muted, fontSize: 14, lineHeight: 21, marginTop: 9, marginBottom: 25 },
    label: { color: c.primaryDark, fontSize: 10, fontWeight: "900", letterSpacing: 1, marginBottom: 3 },
    inputContainer: {
      minHeight: 54,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    input: { flex: 1, minHeight: 52, color: c.dark, fontSize: 15 },
    submitButton: { borderRadius: 30, overflow: "hidden", marginTop: 24 },
    buttonGradient: {
      minHeight: 54,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
    },
    buttonText: { color: "#fff", fontSize: 13, fontWeight: "900", letterSpacing: 0.8 },
    buttonDisabled: { opacity: 0.65 },
    footerLink: { alignSelf: "center", marginTop: 22 },
    footerLinkText: { color: c.primary, fontSize: 13, fontWeight: "800" },
    successIcon: {
      width: 68,
      height: 68,
      borderRadius: 22,
      backgroundColor: `${c.primary}18`,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 18,
    },
    successTitle: { color: c.dark, fontSize: 26, fontWeight: "800" },
    successMessage: { color: c.muted, fontSize: 14, textAlign: "center", marginTop: 12 },
    successEmail: { color: c.primary, fontSize: 15, fontWeight: "800", marginTop: 7 },
    successHint: { color: c.muted, fontSize: 13, lineHeight: 20, textAlign: "center", marginTop: 16 },
    resendButton: { marginTop: 20 },
    resendText: { color: c.primary, fontSize: 13, fontWeight: "700" },
  });
