import { useState } from "react";
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

import * as WebBrowser from "expo-web-browser";
import { supabase } from "../lib/supabase";
import { useToast } from "../context/ToastContext";

WebBrowser.maybeCompleteAuthSession();

export const AuthScreen = ({ navigation }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { isWide } = useResponsive();

  const { signIn, signUp } = useAuth();
  const toast = useToast();

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: "expressmart://",
          skipBrowserRedirect: false,
        },
      });

      if (error) throw error;

      if (data?.url) {
        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          "expressmart://",
        );
        if (result.type === "success" && result.url) {
          // supabase-js sometimes doesn't expose getSessionFromUrl in RN build
          // so offer a fallback by parsing tokens manually.
          if (typeof supabase.auth.getSessionFromUrl === "function") {
            const { error: sessionError } =
              await supabase.auth.getSessionFromUrl(result.url);
            if (sessionError) throw sessionError;
          } else {
            // manually extract tokens and set session
            let params;
            if (result.url.includes("#")) {
              const hash = result.url.split("#")[1];
              params = new URLSearchParams(hash);
            } else {
              const urlObj = new URL(result.url);
              params = urlObj.searchParams;
            }
            const access_token = params.get("access_token");
            const refresh_token = params.get("refresh_token");
            if (access_token && refresh_token) {
              const { error: setError } = await supabase.auth.setSession({
                access_token,
                refresh_token,
              });
              if (setError) throw setError;
            }
          }
        }
      }
    } catch (error) {
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
