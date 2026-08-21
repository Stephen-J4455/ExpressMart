import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  TextInput,
  Platform,
} from "react-native";
import { useState, useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { colors as palette, getTheme, THEMES } from "../theme/colors";
import { useTheme } from "../context/ThemeContext";
import { useAppStyles } from "../hooks/useAppStyles";
import { supabase } from "../lib/supabase";
import { useResponsive } from "../hooks/useResponsive";

export const ProfileEditScreen = ({ navigation }) => {
  const { user, profile, updateProfile } = useAuth();
  const toast = useToast();
  const { colors } = useTheme();
  const styles = useAppStyles((c) => buildProfileEditStyles(c));
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [loading, setLoading] = useState(false);
  const { isWide, horizontalPadding } = useResponsive();

  // Store (seller) settings — merged from the Express-Store seller app
  const [isSeller, setIsSeller] = useState(false);
  const [sellerId, setSellerId] = useState(null);
  const [storeDescription, setStoreDescription] = useState("");
  const [themeColor, setThemeColor] = useState(colors.primary);
  const THEME_OPTIONS = Object.values(THEMES).map((t) => t.primary);

  useEffect(() => {
    let active = true;
    const loadSeller = async () => {
      if (!supabase || !user) return;
      try {
        const { data } = await supabase
          .from("express_sellers")
          .select("id, store_description, theme_color")
          .eq("user_id", user.id)
          .maybeSingle();
        if (active && data) {
          setIsSeller(true);
          setSellerId(data.id);
          setStoreDescription(data.store_description || "");
          setThemeColor(data.theme_color || colors.primary);
        }
      } catch (e) {
        // Not a seller — store settings simply stay hidden.
      }
    };
    loadSeller();
    return () => {
      active = false;
    };
  }, [user]);

  const handleSave = async () => {
    if (!fullName.trim()) {
      toast.error("Full name is required");
      return;
    }

    setLoading(true);
    try {
      const result = await updateProfile({
        full_name: fullName.trim(),
        phone: phone.trim(),
      });
      if (result.error) {
        toast.error("Failed to update profile");
        return;
      }

      // Persist store settings when logged in as a seller (merged from Express-Store)
      if (isSeller && sellerId) {
        const { error: sellerErr } = await supabase
          .from("express_sellers")
          .update({
            store_description: storeDescription.trim() || null,
            theme_color: themeColor,
          })
          .eq("id", sellerId);
        if (sellerErr) {
          toast.error("Store settings could not be saved");
          return;
        }
      }

      toast.success("Profile updated successfully");
      navigation.goBack();
    } catch (error) {
      toast.error("Failed to update profile");
    } finally {
      setLoading(false);
    }
  };

  const initials = (profile?.full_name || user?.email || "U")
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  return (
    <SafeAreaView style={styles.container}>
      <View
        style={[
          styles.header,
          { paddingHorizontal: isWide ? horizontalPadding : 16 },
        ]}
      >
        <Pressable
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.dark} />
        </Pressable>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <Pressable
          style={[styles.saveButton, loading && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={loading}
        >
          <Text style={[styles.saveText, loading && { opacity: 0.5 }]}>
            {loading ? "Saving…" : "Save"}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            maxWidth: isWide ? 700 : undefined,
            alignSelf: isWide ? "center" : undefined,
            width: "100%",
          }}
        >
          {/* Avatar hero */}
          <LinearGradient
            colors={[colors.primary, colors.accent]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.avatarHero}
          >
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
            <Text style={styles.avatarName}>
              {profile?.full_name || "tagit User"}
            </Text>
            <Text style={styles.avatarEmail}>{user?.email}</Text>
          </LinearGradient>

          {/* Personal info card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons
                name="person-outline"
                size={18}
                color={colors.primary}
              />
              <Text style={styles.cardTitle}>Personal Information</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Full Name</Text>
              <View style={styles.inputWrap}>
                <Ionicons
                  name="person-outline"
                  size={18}
                  color={colors.muted}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Enter your full name"
                  placeholderTextColor={colors.muted}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Phone Number</Text>
              <View style={styles.inputWrap}>
                <Ionicons
                  name="call-outline"
                  size={18}
                  color={colors.muted}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="+233 XX XXX XXXX"
                  placeholderTextColor={colors.muted}
                  keyboardType="phone-pad"
                />
              </View>
            </View>
          </View>

          {/* Email (read-only) card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="mail-outline" size={18} color={colors.primary} />
              <Text style={styles.cardTitle}>Email Address</Text>
            </View>

            <View style={styles.inputGroup}>
              <View style={[styles.inputWrap, styles.inputWrapDisabled]}>
                <Ionicons
                  name="mail-outline"
                  size={18}
                  color={colors.muted}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[styles.input, styles.inputDisabled]}
                  value={user?.email || ""}
                  editable={false}
                  placeholderTextColor={colors.muted}
                />
                <View style={styles.lockPill}>
                  <Ionicons name="lock-closed" size={11} color={colors.muted} />
                </View>
              </View>
              <Text style={styles.helperText}>
                Email cannot be changed here. Use the Change Email option below.
              </Text>
            </View>
          </View>

          {/* Account actions card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons
                name="settings-outline"
                size={18}
                color={colors.primary}
              />
              <Text style={styles.cardTitle}>Account</Text>
            </View>

            <Pressable
              style={styles.actionRow}
              onPress={() => navigation.navigate("ChangePassword")}
            >
              <View style={styles.actionLeft}>
                <View
                  style={[
                    styles.actionIconWrap,
                    { backgroundColor: "#EFF6FF" },
                  ]}
                >
                  <Ionicons name="key-outline" size={18} color="#3B82F6" />
                </View>
                <Text style={styles.actionLabel}>Change Password</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
            </Pressable>

            <Pressable
              style={[styles.actionRow, styles.actionRowBorder]}
              onPress={() => navigation.navigate("ChangeEmail")}
            >
              <View style={styles.actionLeft}>
                <View
                  style={[
                    styles.actionIconWrap,
                    { backgroundColor: "#F0FDF4" },
                  ]}
                >
                  <Ionicons name="mail-outline" size={18} color="#22C55E" />
                </View>
                <Text style={styles.actionLabel}>Change Email</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
            </Pressable>
          </View>

          {/* Store settings — merged from the Express-Store seller app */}
          {isSeller && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons
                  name="storefront-outline"
                  size={18}
                  color={colors.primary}
                />
                <Text style={styles.cardTitle}>Store Settings</Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Store Description</Text>
                <View style={[styles.inputWrap, styles.inputWrapTop]}>
                  <TextInput
                    style={[styles.input, styles.textAreaInput]}
                    value={storeDescription}
                    onChangeText={setStoreDescription}
                    placeholder="Tell customers what your store is about"
                    placeholderTextColor={colors.muted}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                    maxLength={600}
                  />
                </View>
                <Text style={styles.helperText}>
                  Shown on your store profile in the tagit store app.
                </Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Store Theme</Text>
                <View style={styles.themeSwatchesContainer}>
                  {THEME_OPTIONS.map((c) => (
                    <Pressable
                      key={c}
                      onPress={() => setThemeColor(c)}
                      style={[
                        styles.themeSwatchCircle,
                        {
                          backgroundColor: c,
                          borderWidth: themeColor === c ? 3 : 1,
                          borderColor: themeColor === c ? "#000" : "#E6EDF3",
                        },
                      ]}
                    />
                  ))}
                </View>
                <Text style={styles.helperText}>
                  Applied across your store in the tagit app.
                </Text>
              </View>
            </View>
          )}

          <View style={{ height: 40 }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const buildProfileEditStyles = (c) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
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
  backButton: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: c.dark },
  saveButton: {
    paddingHorizontal: 20,
    paddingVertical: 9,
    backgroundColor: c.primary,
    borderRadius: 10,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  scrollView: { flex: 1 },
  avatarHero: {
    alignItems: "center",
    paddingTop: 36,
    paddingBottom: 28,
    paddingHorizontal: 24,
    gap: 6,
  },
  avatarCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.6)",
    marginBottom: 6,
  },
  avatarInitials: { fontSize: 32, fontWeight: "800", color: "#fff" },
  avatarName: {
    fontSize: 20,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.3,
  },
  avatarEmail: {
    fontSize: 13,
    color: "rgba(255,255,255,0.8)",
    fontWeight: "500",
  },
  card: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 20,
  },
  cardTitle: { fontSize: 15, fontWeight: "700", color: c.dark },
  inputGroup: { marginBottom: 16 },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: c.muted,
    marginBottom: 8,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: "#FAFBFC",
  },
  inputWrapDisabled: { backgroundColor: "#F1F5F9", borderColor: "#E2E8F0" },
  inputIcon: { marginRight: 8 },
  input: {
    flex: 1,
    paddingVertical: 13,
    fontSize: 15,
    color: c.dark,
    ...(Platform.OS === "web" ? { outlineStyle: "none", outlineWidth: 0 } : {}),
  },
  inputDisabled: { color: c.muted },
  lockPill: { backgroundColor: "#E2E8F0", borderRadius: 6, padding: 4 },
  helperText: {
    fontSize: 12,
    color: c.muted,
    marginTop: 6,
    lineHeight: 16,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  actionRowBorder: { borderTopWidth: 1, borderTopColor: "#F1F5F9" },
  actionLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  actionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: { fontSize: 15, fontWeight: "600", color: c.dark },
  inputWrapTop: { alignItems: "flex-start" },
  textAreaInput: { height: 96, textAlignVertical: "top" },
  themeSwatchesContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 4,
  },
  themeSwatchCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
});
