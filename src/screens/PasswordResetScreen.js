import React from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../theme/colors";

import * as Linking from "expo-linking";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { supabaseAnonKey, supabaseUrl } from "../lib/supabase";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";

export default function PasswordResetScreen() {
  const toast = useToast();
  const { resetPassword } = useAuth();

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
        const initialUrl = await Linking.getInitialURL();
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
      <View style={styles.messageBox}>
        <Text style={styles.title}>Reset Password</Text>

        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : error ? (
          <>
            <Text style={styles.text}>{error}</Text>

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

            <TouchableOpacity
              style={[
                styles.button,
                (requestingNewLink || newLinkRequested) && styles.buttonDisabled,
              ]}
              onPress={handleRequestNewLink}
              disabled={requestingNewLink || newLinkRequested}
            >
              {requestingNewLink ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>
                  {newLinkRequested ? "Link Requested" : "Request New Link"}
                </Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.text}>Enter your new password below.</Text>

            <TextInput
              style={styles.input}
              placeholder="New Password"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              autoCapitalize="none"
              placeholderTextColor={colors.muted}
            />
            <TextInput
              style={styles.input}
              placeholder="Confirm Password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoCapitalize="none"
              placeholderTextColor={colors.muted}
            />

            <TouchableOpacity
              style={[styles.button, submitting && styles.buttonDisabled]}
              onPress={handleUpdate}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Update Password</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: colors.background,
  },
  messageBox: {
    alignItems: "center",
    width: "100%",
    maxWidth: Platform.OS === "web" ? 480 : undefined,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 12,
    color: colors.primary,
  },
  text: {
    fontSize: 16,
    color: colors.dark,
    textAlign: "center",
    marginBottom: 20,
  },
  input: {
    width: "100%",
    height: 52,
    borderWidth: 1,
    borderColor: "#E4E8F0",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
    color: colors.dark,
    ...(Platform.OS === "web" ? { outlineStyle: "none", outlineWidth: 0 } : {}),
  },
  button: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    width: "100%",
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: { color: "#fff", fontWeight: "600" },
});
