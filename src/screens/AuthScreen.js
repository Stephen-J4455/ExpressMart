import { useState, useEffect, useRef, useCallback } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme/colors";
import { useResponsive } from "../hooks/useResponsive";
import * as Linking from "expo-linking";

import * as WebBrowser from "expo-web-browser";
import { supabase } from "../lib/supabase";
import { useToast } from "../context/ToastContext";

WebBrowser.maybeCompleteAuthSession();

export const AuthScreen = ({ navigation, route }) => {
  const getInitialIsLogin = useCallback(() => {
    const mode = route?.params?.mode;
    if (mode === "register" || mode === "signup" || mode === "create-account") {
      return false;
    }
    return true;
  }, [route?.params?.mode]);
  const [isLogin, setIsLogin] = useState(getInitialIsLogin);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { isWide } = useResponsive();

  const { signIn, signUp, isAuthenticated } = useAuth();
  const toast = useToast();
  const redirectHandledRef = useRef(false);
  const oauthCallbackInFlightRef = useRef(false);

  const navigateAfterLogin = useCallback(() => {
    const redirectTo = route?.params?.redirectTo;
    const redirectParams = route?.params?.redirectParams;
    const tabScreens = new Set(["Home", "Categories", "Feed", "Cart", "Account"]);

    if (redirectTo && tabScreens.has(redirectTo)) {
      navigation.reset({
        index: 0,
        routes: [{ name: "Main", params: { screen: redirectTo } }],
      });
      return;
    }

    if (redirectTo && redirectTo !== "Auth") {
      navigation.reset({
        index: 1,
        routes: [{ name: "Main" }, { name: redirectTo, params: redirectParams }],
      });
      return;
    }

    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.reset({
      index: 0,
      routes: [{ name: "Main" }],
    });
  }, [navigation, route?.params?.redirectParams, route?.params?.redirectTo]);

  useEffect(() => {
    if (!isAuthenticated) {
      redirectHandledRef.current = false;
      return;
    }

    if (redirectHandledRef.current) return;
    redirectHandledRef.current = true;
    navigateAfterLogin();
  }, [isAuthenticated, navigateAfterLogin]);

  useEffect(() => {
    setIsLogin(getInitialIsLogin());
  }, [getInitialIsLogin]);

  const cleanupWebAuthUrl = () => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    window.history.replaceState({}, document.title, window.location.pathname);
  };

  const completeOAuthFromUrl = useCallback(
    async (callbackUrl) => {
      if (!callbackUrl || oauthCallbackInFlightRef.current) return false;
      oauthCallbackInFlightRef.current = true;
      try {
        const urlObj = new URL(callbackUrl);
        const hashParams = new URLSearchParams(urlObj.hash.replace(/^#/, ""));
        const errorDescription =
          urlObj.searchParams.get("error_description") ||
          hashParams.get("error_description") ||
          urlObj.searchParams.get("error") ||
          hashParams.get("error");

        if (errorDescription) {
          throw new Error(decodeURIComponent(errorDescription));
        }

        const code = urlObj.searchParams.get("code");
        if (code) {
          const { error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
          toast.success("Successfully signed in with Google!");
          return true;
        }

        const access_token =
          hashParams.get("access_token") ||
          urlObj.searchParams.get("access_token");
        const refresh_token =
          hashParams.get("refresh_token") ||
          urlObj.searchParams.get("refresh_token");

        if (!access_token || !refresh_token) {
          throw new Error("No authentication code or tokens found in callback URL");
        }

        const { error: setError } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        if (setError) throw setError;

        toast.success("Successfully signed in with Google!");
        return true;
      } finally {
        oauthCallbackInFlightRef.current = false;
      }
    },
    [toast],
  );

  // Handle OAuth callback on web
  useEffect(() => {
    if (Platform.OS !== "web") return;

    const handleWebOAuthCallback = async () => {
      const url = new URL(window.location.href);
      const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
      const hasOAuthParams =
        url.searchParams.has("code") ||
        url.searchParams.has("access_token") ||
        url.searchParams.has("refresh_token") ||
        hashParams.has("access_token") ||
        hashParams.has("refresh_token") ||
        url.searchParams.has("error") ||
        hashParams.has("error");

      if (!hasOAuthParams) return;

      const oauthError =
        url.searchParams.get("error_description") ||
        hashParams.get("error_description") ||
        url.searchParams.get("error") ||
        hashParams.get("error");

      if (oauthError) {
        cleanupWebAuthUrl();
        toast.error(decodeURIComponent(oauthError));
        return;
      }

      try {
        if (typeof supabase.auth.getSessionFromUrl === "function") {
          const { data, error } = await supabase.auth.getSessionFromUrl({
            storeSession: true,
          });
          if (error) throw error;

          // Some mobile browsers can drop the PKCE exchange callback resolution.
          if (!data?.session && url.searchParams.has("code")) {
            const code = url.searchParams.get("code");
            const { error: exchangeError } =
              await supabase.auth.exchangeCodeForSession(code);
            if (exchangeError) throw exchangeError;
          }
        } else if (url.searchParams.has("code")) {
          const code = url.searchParams.get("code");
          const { error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        } else {
          const access_token =
            hashParams.get("access_token") || url.searchParams.get("access_token");
          const refresh_token =
            hashParams.get("refresh_token") || url.searchParams.get("refresh_token");

          if (!access_token || !refresh_token) {
            throw new Error("No authentication tokens found in callback URL");
          }

          const { error: setSessionError } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (setSessionError) throw setSessionError;
        }

        toast.success("Successfully signed in with Google!");
      } catch (error) {
        try {
          const handled = await completeOAuthFromUrl(window.location.href);
          if (!handled) throw error;
        } catch (fallbackError) {
          console.error("Error handling web OAuth callback:", fallbackError);
          toast.error(fallbackError.message || "Failed to complete Google Sign-In");
        }
      } finally {
        cleanupWebAuthUrl();
      }
    };

    handleWebOAuthCallback();
  }, [completeOAuthFromUrl, toast]);

  // Handle OAuth callback on native when the browser redirects back via deep-link.
  useEffect(() => {
    if (Platform.OS === "web") return;

    const subscription = Linking.addEventListener("url", async ({ url }) => {
      try {
        await completeOAuthFromUrl(url);
      } catch (error) {
        console.error("Error handling native OAuth callback:", error);
        toast.error(error.message || "Failed to complete Google Sign-In");
      }
    });

    return () => subscription.remove();
  }, [completeOAuthFromUrl, toast]);

  const getGoogleRedirectUrl = () => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      return new URL("/login", window.location.origin).toString();
    }

    return Linking.createURL("auth/callback", { scheme: "expressmart" });
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      const redirectTo = getGoogleRedirectUrl();
      console.log("Google OAuth redirectTo:", redirectTo);

      if (Platform.OS === "web") {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo,
            queryParams: {
              prompt: "select_account",
            },
          },
        });

        if (error) throw error;
        return;
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          queryParams: {
            prompt: "select_account",
          },
        },
      });

      if (error) throw error;
      if (!data?.url) throw new Error("Unable to start Google Sign-In flow");

      // Mobile: Open browser for OAuth
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      console.log("OAuth result:", result);

      if (result.type === "success" && result.url) {
        console.log("OAuth redirect URL:", result.url);
        await completeOAuthFromUrl(result.url);
      } else if (result.type === "cancel" || result.type === "dismiss") {
        console.log("User cancelled OAuth flow");
      } else {
        console.log("OAuth result type:", result.type);
        throw new Error(`OAuth flow failed: ${result.type}`);
      }
    } catch (error) {
      console.error("Google Sign-In Error:", error);
      toast.error(error.message || "Google Sign-In failed");
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!email || !password) {
      toast.error("Please fill in all fields");
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) throw error;
      } else {
        if (!fullName) {
          toast.error("Please enter your full name");
          setLoading(false);
          return;
        }
        const { error } = await signUp(email, password, fullName);
        if (error) throw error;
        setIsLogin(true);
        toast.success("Account created! Please sign in.");
      }
    } catch (error) {
      toast.error(error.message || "Authentication failed");
    } finally {
      setLoading(false);
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
          nestedScrollEnabled={true}
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
            <Text style={styles.title}>
              {isLogin ? "Welcome Back!" : "Create Account"}
            </Text>
            <Text style={styles.subtitle}>
              {isLogin
                ? "Sign in to continue shopping"
                : "Join ExpressMart and start shopping"}
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {!isLogin && (
              <View style={styles.inputContainer}>
                <Ionicons
                  name="person-outline"
                  size={20}
                  color={colors.muted}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Full Name"
                  value={fullName}
                  onChangeText={setFullName}
                  autoCapitalize="words"
                  placeholderTextColor={colors.muted}
                />
              </View>
            )}

            <View style={styles.inputContainer}>
              <Ionicons
                name="mail-outline"
                size={20}
                color={colors.muted}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                placeholderTextColor={colors.muted}
              />
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
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                placeholderTextColor={colors.muted}
              />
              <Pressable onPress={() => setShowPassword(!showPassword)}>
                <Ionicons
                  name={showPassword ? "eye-outline" : "eye-off-outline"}
                  size={20}
                  color={colors.muted}
                />
              </Pressable>
            </View>

            {isLogin && (
              <Pressable
                style={styles.forgotPassword}
                onPress={() => navigation.navigate("ForgotPassword")}
              >
                <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
              </Pressable>
            )}

            <Pressable
              style={[styles.submitButton, loading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              <LinearGradient
                colors={[colors.primary, colors.accent]}
                style={styles.buttonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons
                      name={isLogin ? "log-in" : "person-add"}
                      size={20}
                      color="#fff"
                    />
                    <Text style={styles.buttonText}>
                      {isLogin ? "Sign In" : "Create Account"}
                    </Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable
              style={[styles.socialButton, googleLoading && { opacity: 0.7 }]}
              onPress={handleGoogleLogin}
              disabled={googleLoading || loading}
            >
              {googleLoading ? (
                <ActivityIndicator color={colors.dark} />
              ) : (
                <>
                  <Ionicons name="logo-google" size={20} color="#EA4335" />
                  <Text style={styles.socialButtonText}>
                    Continue with Google
                  </Text>
                </>
              )}
            </Pressable>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              {isLogin ? "Don't have an account?" : "Already have an account?"}
            </Text>
            <Pressable onPress={() => setIsLogin(!isLogin)}>
              <Text style={styles.footerLink}>
                {isLogin ? "Sign Up" : "Sign In"}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

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
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
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
  form: {
    gap: 16,
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
  forgotPassword: {
    alignSelf: "flex-end",
    marginTop: -8,
  },
  forgotPasswordText: {
    color: colors.primary,
    fontWeight: "600",
    fontSize: 14,
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
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#E4E8F0",
  },
  dividerText: {
    marginHorizontal: 16,
    color: colors.muted,
    fontWeight: "600",
    fontSize: 14,
  },
  socialButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    height: 56,
    borderWidth: 1,
    borderColor: "#E4E8F0",
    gap: 12,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 5,
  },
  socialButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.dark,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginTop: "auto",
    paddingTop: 24,
    paddingBottom: 20,
  },
  footerText: {
    fontSize: 16,
    color: colors.muted,
  },
  footerLink: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.primary,
  },
});
