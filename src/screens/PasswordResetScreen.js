import React from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Image,
  Pressable,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../theme/colors";

import * as Linking from "expo-linking";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { supabaseAnonKey, supabaseUrl } from "../lib/supabase";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import { useResponsive } from "../hooks/useResponsive";

export default function PasswordResetScreen({ navigation }) {
  const toast = useToast();
  const { resetPassword } = useAuth();
  const { isWide } = useResponsive();

  // On web, avoid persisting the recovery-session to localStorage.
  // Otherwise, other tabs of the app will become authenticated as soon as the
  // reset link is opened.
  const resetSupabase = React.useMemo(() => {
    if (Platform.OS !== "web") return supabase;
    if (!supabaseUrl || !supabaseAnonKey) return supabase;

    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }, []);

  const [loading, setLoading] = React.useState(true);
  const [recoveryToken, setRecoveryToken] = React.useState(null);
  const [refreshToken, setRefreshToken] = React.useState(null);
  const [recoveryCode, setRecoveryCode] = React.useState(null);
  const [error, setError] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [requestingNewLink, setRequestingNewLink] = React.useState(false);
  const [newLinkRequested, setNewLinkRequested] = React.useState(false);

  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showNewPassword, setShowNewPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const extractTokensFromUrl = React.useCallback((url) => {
    if (!url)
      return {
        access_token: null,
        refresh_token: null,
        type: null,
        code: null,
      };

    try {
      const hashIndex = url.indexOf("#");
      if (hashIndex >= 0) {
        const hash = url.slice(hashIndex + 1);
        const params = new URLSearchParams(hash);
        return {
          access_token: params.get("access_token"),
          refresh_token: params.get("refresh_token"),
          type: params.get("type"),
          code: params.get("code"),
        };
      }

      const queryIndex = url.indexOf("?");
      const qs = queryIndex >= 0 ? url.slice(queryIndex + 1) : "";
      const params = new URLSearchParams(qs);
      return {
        access_token: params.get("access_token"),
        refresh_token: params.get("refresh_token"),
        type: params.get("type"),
        code: params.get("code"),
      };
    } catch (e) {
      return { access_token: null, refresh_token: null, type: null, code: null };
    }
  }, []);

  const handleIncomingUrl = React.useCallback(
    async (url) => {
      try {
        if (!url) {
          throw new Error(
            "Password reset link is missing required parameters. Please request a new one.",
          );
        }

        console.log("PasswordResetScreen incoming url:", url);

        const { access_token, refresh_token, type, code } =
          extractTokensFromUrl(url);

        // Supabase may send recovery links in two shapes:
        // 1) Implicit: #access_token=...&refresh_token=...&type=recovery
        // 2) PKCE: ?code=... (optionally with type=recovery)
        if (code) {
          setRecoveryCode(code);
          const { error: exchErr } =
            await resetSupabase.auth.exchangeCodeForSession(code);
          if (exchErr) throw exchErr;
        } else if (access_token) {
          // Some environments omit `type` even though it's a valid token.
          if (type && type !== "recovery") {
            throw new Error(
              "Password reset link type is invalid. Please request a new one.",
            );
          }

          setRecoveryToken(access_token);
          setRefreshToken(refresh_token || "");

          const { error: setErr } = await resetSupabase.auth.setSession({
            access_token,
            refresh_token: refresh_token || "",
          });
          if (setErr) throw setErr;
        } else if (typeof resetSupabase.auth.getSessionFromUrl === "function") {
          const { error: urlErr } = await resetSupabase.auth.getSessionFromUrl({
            url,
            storeSession: false,
          });
          if (urlErr) throw urlErr;
        } else {
          throw new Error(
            "Password reset link is missing required parameters. Please request a new one.",
          );
        }

        const {
          data: { session },
        } = await resetSupabase.auth.getSession();
        if (!session) {
          throw new Error("Unable to establish session from reset link");
        }
      } catch (e) {
        setError(
          e?.message ||
            "Password reset link is invalid or expired. Please request a new one.",
        );
      } finally {
        setLoading(false);
      }
    },
    [extractTokensFromUrl, resetSupabase],
  );

  React.useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        // IMPORTANT: Clear any existing session first to prevent auto-login
        // This ensures the PasswordResetScreen handles the reset flow, not AuthContext
        const { data: { session: existingSession } } = await supabase.auth.getSession();
        if (existingSession) {
          console.log("PasswordResetScreen: Clearing existing session to prevent auto-login");
          await supabase.auth.signOut();
        }

        let initialUrl = await Linking.getInitialURL();
        if (
          Platform.OS === "web" &&
          typeof window !== "undefined" &&
          window.location?.href
        ) {
          initialUrl = window.location.href;
        }
        if (!mounted) return;

        if (initialUrl) {
          await handleIncomingUrl(initialUrl);
        } else {
          setError(
            "Password reset link is invalid or expired. Please request a new one.",
          );
          setLoading(false);
        }
      } catch (e) {
        if (!mounted) return;
        setError(e?.message || "Failed to read reset link");
        setLoading(false);
      }
    };
    init();

    const sub = Linking.addEventListener("url", ({ url }) => {
      handleIncomingUrl(url);
    });

    return () => {
      mounted = false;
      try {
        sub?.remove?.();
      } catch (e) {
        // ignore
      }
    };
  }, [handleIncomingUrl]);

  const handleUpdate = async () => {
    if (submitting) return;

    // If the user arrived via PKCE (`code`), we may not have an `access_token` in the URL,
    // but `exchangeCodeForSession` will still establish a session for `updateUser`.

    if (!newPassword || !confirmPassword) {
      toast.error("Error", "Please fill in all fields");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Error", "Passwords do not match");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("Error", "Password must be at least 6 characters");
      return;
    }

    setSubmitting(true);
    try {
      const { error: updateError } = await resetSupabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) throw updateError;

      toast.success("Success", "Your password has been reset");
      navigation?.reset?.({ index: 0, routes: [{ name: "Main" }] });
      return;
    } catch (e) {
      toast.error("Error", e?.message || "Failed to reset password");
    } finally {
      try {
        await resetSupabase.auth.signOut();
      } catch (e) {
        // ignore
      }
      setSubmitting(false);
    }
  };

  const handleRequestNewLink = async () => {
    if (requestingNewLink) return;

    if (!email) {
      toast.error("Error", "Please enter your email address");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error("Error", "Please enter a valid email address");
      return;
    }

    setRequestingNewLink(true);
    try {
      const { error: resetErr } = await resetPassword(email);
      if (resetErr) throw resetErr;
      setNewLinkRequested(true);
      toast.success("Success", "A new password reset link has been sent");
    } catch (e) {
      toast.error(
        "Error",
        e?.message || "Failed to request a new password reset link",
      );
    } finally {
      setRequestingNewLink(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Subtle background circles */}
      <View style={styles.bgCircle1} />
      <View style={styles.bgCircle2} />
      <View style={styles.bgCircle3} />
      <View style={styles.bgCircle4} />
      <View style={styles.bgCircle5} />
      <View style={styles.bgCircle6} />

      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === "ios" ? "padding" : "padding"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            isWide && { maxWidth: 480, alignSelf: "center", width: "100%" },
          ]}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Image
                source={require("../../assets/express.png")}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.title}>Reset Password</Text>
            <Text style={styles.subtitle}>
              Create a new password for your account
            </Text>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Verifying reset link...</Text>
            </View>
          ) : error ? (
            <View style={styles.form}>
              <Text style={styles.errorText}>{error}</Text>

              <View style={styles.inputContainer}>
                <Ionicons
                  name="mail-outline"
                  size={20}
                  color={colors.muted}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your email to request a new link"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholderTextColor={colors.muted}
                />
              </View>

              <Pressable
                style={[
                  styles.submitButton,
                  (requestingNewLink || newLinkRequested) && styles.buttonDisabled,
                ]}
                onPress={handleRequestNewLink}
                disabled={requestingNewLink || newLinkRequested}
              >
                <LinearGradient
                  colors={[colors.primary, colors.accent]}
                  style={styles.buttonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {requestingNewLink ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="send" size={20} color="#fff" />
                      <Text style={styles.buttonText}>
                        {newLinkRequested ? "Link Requested" : "Request New Link"}
                      </Text>
                    </>
                  )}
                </LinearGradient>
              </Pressable>
            </View>
          ) : (
            <View style={styles.form}>
              <View style={styles.inputContainer}>
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color={colors.muted}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="New Password"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry={!showNewPassword}
                  autoCapitalize="none"
                  placeholderTextColor={colors.muted}
                />
                <Pressable onPress={() => setShowNewPassword(!showNewPassword)}>
                  <Ionicons
                    name={showNewPassword ? "eye-outline" : "eye-off-outline"}
                    size={20}
                    color={colors.muted}
                  />
                </Pressable>
              </View>

              <View style={styles.inputContainer}>
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color={colors.muted}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Confirm Password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  placeholderTextColor={colors.muted}
                />
                <Pressable onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                  <Ionicons
                    name={showConfirmPassword ? "eye-outline" : "eye-off-outline"}
                    size={20}
                    color={colors.muted}
                  />
                </Pressable>
              </View>

              <Pressable
                style={[styles.submitButton, submitting && styles.buttonDisabled]}
                onPress={handleUpdate}
                disabled={submitting}
              >
                <LinearGradient
                  colors={[colors.primary, colors.accent]}
                  style={styles.buttonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={20} color="#fff" />
                      <Text style={styles.buttonText}>Update Password</Text>
                    </>
                  )}
                </LinearGradient>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  // Subtle background circles
  bgCircle1: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: `${colors.primary}35`,
    top: -50,
    right: -50,
  },
  bgCircle2: {
    position: "absolute",
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: `${colors.accent}30`,
    top: 200,
    left: -40,
  },
  bgCircle3: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: `${colors.primary}28`,
    bottom: 100,
    right: -30,
  },
  bgCircle4: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: `${colors.accent}25`,
    bottom: 50,
    left: -60,
  },
  bgCircle5: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: `${colors.primary}22`,
    top: 400,
    right: 30,
  },
  bgCircle6: {
    position: "absolute",
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: `${colors.accent}32`,
    bottom: 200,
    right: 50,
  },
  content: {
    flex: 1,
    width: "100%",
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    width: "100%",
  },
  header: {
    alignItems: "center",
    marginTop: 20,
    marginBottom: 40,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: `${colors.primary}15`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  logoImage: {
    width: 95,
    height: 95,
    borderRadius: 50,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.dark,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.muted,
  },
  form: {
    gap: 16,
  },
  errorText: {
    fontSize: 16,
    color: colors.dark,
    textAlign: "center",
    marginBottom: 20,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#E4E8F0",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    height: 56,
    fontSize: 16,
    color: colors.dark,
    ...(Platform.OS === "web" ? { outlineStyle: "none", outlineWidth: 0 } : {}),
  },
  submitButton: {
    borderRadius: 16,
    overflow: "hidden",
    marginTop: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonGradient: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  buttonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
});
