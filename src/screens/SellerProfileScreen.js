import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  Pressable,
  Image,
  ActivityIndicator,
  Platform,
  Switch,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { supabase } from "../lib/supabase";
import { getTheme, THEMES, radius } from "../theme/colors";
import { useTheme } from "../context/ThemeContext";
import { useAppStyles } from "../hooks/useAppStyles";
import { useResponsive } from "../hooks/useResponsive";
import { getImageContentType } from "../utils/webUpload";

// Supabase storage bucket for seller profile images (mirrors Express-Store)
const PROFILE_BUCKET = "profile";

const THEME_OPTIONS = Object.values(THEMES).map((t) => t.primary);

const resolveProfileImageUri = (rawValue) => {
  const value = String(rawValue || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value) || value.startsWith("file://")) {
    return value;
  }
  const normalizedPath = value.replace(/^\/+/, "");
  const { data } = supabase.storage
    .from(PROFILE_BUCKET)
    .getPublicUrl(normalizedPath);
  return data?.publicUrl || "";
};

const getProfileAvatarValue = (profile) => {
  const candidates = [profile?.avatar, profile?.avatar_url, profile?.profile_image];
  for (const candidate of candidates) {
    const value = String(candidate || "").trim();
    if (value) return value;
  }
  return "";
};

const SOCIAL_FIELDS = [
  { key: "social_facebook", label: "Facebook", icon: "logo-facebook", type: "facebook", domain: "facebook.com", placeholder: "Facebook page URL" },
  { key: "social_instagram", label: "Instagram", icon: "logo-instagram", type: "instagram", domain: "instagram.com", placeholder: "Instagram profile URL" },
  { key: "social_twitter", label: "Twitter / X", icon: "logo-twitter", type: "twitter", domain: "twitter.com", placeholder: "Twitter/X profile URL" },
  { key: "social_whatsapp", label: "WhatsApp", icon: "logo-whatsapp", type: "whatsapp", domain: null, placeholder: "WhatsApp number e.g. 233..." },
  { key: "social_website", label: "Website", icon: "globe-outline", type: "website", domain: null, placeholder: "Website URL" },
];

export const SellerProfileScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors: themeColors } = useTheme();
  const styles = useAppStyles((c) => buildSellerProfileStyles(c));
  const { user } = useAuth();
  const toast = useToast();
  const { isWide, horizontalPadding } = useResponsive();

  const [loading, setLoading] = useState(true);
  const [seller, setSeller] = useState(null);
  const [sellerId, setSellerId] = useState(null);
  const [productCount, setProductCount] = useState(0);
  const [followerCount, setFollowerCount] = useState(0);

  const [editName, setEditName] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editStoreDescription, setEditStoreDescription] = useState("");
  const [editFulfillmentSpeed, setEditFulfillmentSpeed] = useState("");
  const [editWeeklyTarget, setEditWeeklyTarget] = useState("");
  const [editAvatar, setEditAvatar] = useState("");
  const [editAvatarFile, setEditAvatarFile] = useState(null);
  const [social, setSocial] = useState({});
  const [editThemeColor, setEditThemeColor] = useState(themeColors.primary);
  const [editApplyToStore, setEditApplyToStore] = useState(false);
  const [editApplyToCustomer, setEditApplyToCustomer] = useState(false);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);

  const activeTheme = getTheme(seller?.theme_color || themeColors.primary);
  const heroUri = seller ? resolveProfileImageUri(getProfileAvatarValue(seller)) : "";
  const displayUri = editing && editAvatar ? editAvatar : heroUri;

  const loadSeller = async () => {
    if (!supabase || !user) return;
    try {
      const { data, error } = await supabase
        .from("express_sellers")
        .select(
          "id,name,email,phone,avatar,location,store_description,fulfillment_speed,weekly_target,theme_color,theme_apply_store,theme_apply_customer,social_facebook,social_instagram,social_twitter,social_whatsapp,social_website,rating",
        )
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        toast.error("Store profile not found");
        navigation.goBack();
        return;
      }
      setSeller(data);
      setSellerId(data.id);
      syncFromProfile(data);

      try {
        const [{ count: pc }, { count: fc }] = await Promise.all([
          supabase
            .from("express_products")
            .select("*", { count: "exact", head: true })
            .eq("seller_id", data.id),
          supabase
            .from("express_follows")
            .select("*", { count: "exact", head: true })
            .eq("seller_id", data.id),
        ]);
        setProductCount(pc || 0);
        setFollowerCount(fc || 0);
      } catch (e) {
        console.warn("store stats failed", e);
      }
    } catch (e) {
      console.error("loadSeller error", e);
      toast.error("Failed to load store profile");
    } finally {
      setLoading(false);
    }
  };

  const syncFromProfile = (data) => {
    setEditName(data?.name || "");
    setEditLocation(data?.location || "");
    setEditStoreDescription(data?.store_description || "");
    setEditFulfillmentSpeed(data?.fulfillment_speed || "");
    setEditWeeklyTarget(data?.weekly_target?.toString() || "");
    setEditAvatar(getProfileAvatarValue(data));
    setEditAvatarFile(null);
    setSocial({
      social_facebook: data?.social_facebook || "",
      social_instagram: data?.social_instagram || "",
      social_twitter: data?.social_twitter || "",
      social_whatsapp: data?.social_whatsapp || "",
      social_website: data?.social_website || "",
    });
    setEditThemeColor(data?.theme_color || themeColors.primary);
    setEditApplyToStore(!!data?.theme_apply_store);
    setEditApplyToCustomer(!!data?.theme_apply_customer);
  };

  useEffect(() => {
    loadSeller();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const pickImage = async () => {
    try {
      if (Platform.OS !== "web") {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
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
        setEditAvatar(selected.uri);
        setEditAvatarFile(
          selected.file instanceof Blob ? selected.file : null,
        );
      }
    } catch (e) {
      console.error("pickImage error", e);
      toast.error("Could not open image picker");
    }
  };

  // Read the picked asset into a Blob — the reliable cross-platform upload
  // payload for supabase-js v2 (works on both native and web).
  const getBlobFromAsset = async (uri, pickedFile) => {
    if (pickedFile instanceof Blob) return pickedFile;
    const response = await fetch(uri);
    const blob = await response.blob();
    if (!blob) throw new Error("Could not read the selected image");
    return blob;
  };

  const uploadImage = async (uri, pickedFile = null) => {
    const getExt = (u) => {
      const seg = u?.split("?")[0]?.split("/").pop() || "";
      const ext = seg.includes(".") ? seg.split(".").pop()?.toLowerCase() : null;
      if (!ext || ext.length > 5) return "jpg";
      return ext === "jpeg" ? "jpg" : ext;
    };
    const ext = getExt(uri);
    const fileName = `avatar-${Date.now()}.${ext}`;
    const objectPath = sellerId ? `${sellerId}/${fileName}` : fileName;
    const contentType = getImageContentType(uri);

    if (sellerId) {
      try {
        const { data: existing } = await supabase.storage
          .from(PROFILE_BUCKET)
          .list(sellerId);
        if (existing && existing.length > 0) {
          await supabase.storage
            .from(PROFILE_BUCKET)
            .remove(existing.map((e) => `${sellerId}/${e.name}`));
        }
      } catch (e) {
        console.warn("Failed to list existing profile objects", e);
      }
    }

    const fileBody = await getBlobFromAsset(uri, pickedFile);
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

  const saveProfile = async () => {
    if (!editName.trim()) {
      toast.error("Store name is required");
      return;
    }
    setSaving(true);
    try {
      let avatarUrl = editAvatar;
      if (
        editAvatar &&
        editAvatar !== getProfileAvatarValue(seller) &&
        !editAvatar.startsWith("http")
      ) {
        avatarUrl = await uploadImage(editAvatar, editAvatarFile);
      }
      const updates = {
        name: editName.trim(),
        location: editLocation.trim() || null,
        store_description: editStoreDescription.trim() || null,
        fulfillment_speed: editFulfillmentSpeed.trim() || null,
        weekly_target: editWeeklyTarget ? parseFloat(editWeeklyTarget) : null,
        avatar: avatarUrl,
        social_facebook: social.social_facebook || null,
        social_instagram: social.social_instagram || null,
        social_twitter: social.social_twitter || null,
        social_whatsapp: social.social_whatsapp || null,
        social_website: social.social_website || null,
        theme_color: editThemeColor,
        theme_apply_store: editApplyToStore,
        theme_apply_customer: editApplyToCustomer,
      };
      const { error } = await supabase
        .from("express_sellers")
        .update(updates)
        .eq("id", sellerId);
      if (error) throw error;
      setSeller((prev) => ({ ...prev, ...updates }));
      setEditing(false);
      setEditAvatarFile(null);
      toast.success("Store profile updated!");
    } catch (e) {
      console.error("saveProfile error", e);
      toast.error(e.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const startEditing = () => {
    syncFromProfile(seller);
    setEditing(true);
  };

  const fulfillmentOptions = ["Same day", "1-2 days", "2-3 days", "3-5 days", "1 week"];

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={activeTheme.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingHorizontal: isWide ? horizontalPadding : 16 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Cover — full page width, shows the profile image */}
      <View style={[styles.hero, { marginHorizontal: isWide ? -horizontalPadding : -16 }]}>
        {displayUri ? (
          <Image source={{ uri: displayUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <LinearGradient
            colors={[activeTheme.primary, activeTheme.accent || activeTheme.primary]}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
        )}
        <View style={styles.heroOverlay} />

        {!editing && (
          <Pressable style={styles.coverPress} onPress={() => setPreviewVisible(true)} />
        )}

        {!editing && (
          <Pressable style={styles.backFloating} onPress={() => navigation.goBack()} hitSlop={10}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </Pressable>
        )}

        {editing && (
          <Pressable style={styles.coverCamera} onPress={pickImage} hitSlop={10}>
            <Ionicons name="camera" size={20} color="#fff" />
          </Pressable>
        )}

        <View style={styles.heroBottom}>
          <Text style={styles.heroName}>{seller?.name}</Text>
          {editing ? (
            <View style={styles.actionRow}>
              <Pressable style={styles.cancelBtn} onPress={() => setEditing(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.saveBtn, { backgroundColor: activeTheme.primary }, saving && { opacity: 0.6 }]}
                onPress={saveProfile}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveText}>Save Changes</Text>
                )}
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={[styles.editBtn, { backgroundColor: activeTheme.primary }]}
              onPress={startEditing}
            >
              <Ionicons name="create-outline" size={18} color="#fff" />
              <Text style={styles.editText}>Edit Store Profile</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Stats — vertical list (no longer side by side) */}
      <View style={styles.statsCard}>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Products</Text>
          <Text style={styles.statValue}>{productCount}</Text>
        </View>
        <View style={styles.statDividerH} />
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Followers</Text>
          <Text style={styles.statValue}>{followerCount}</Text>
        </View>
        <View style={styles.statDividerH} />
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Rating</Text>
          <Text style={styles.statValue}>
            {seller?.rating ? Number(seller.rating).toFixed(1) : "—"}
          </Text>
        </View>
      </View>

      {/* Store Information — flat, no card container */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="storefront-outline" size={18} color={activeTheme.primary} />
          <Text style={styles.sectionTitle}>Store Information</Text>
        </View>

        {editing ? (
          <>
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Store Name</Text>
              <TextInput style={styles.input} value={editName} onChangeText={setEditName} placeholder="Store name" placeholderTextColor={themeColors.muted} />
            </View>
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Location</Text>
              <TextInput style={styles.input} value={editLocation} onChangeText={setEditLocation} placeholder="City / Region" placeholderTextColor={themeColors.muted} />
            </View>
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Store Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={editStoreDescription}
                onChangeText={setEditStoreDescription}
                placeholder="Tell customers about your store"
                placeholderTextColor={themeColors.muted}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                maxLength={600}
              />
            </View>
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Fulfillment Speed</Text>
              <View style={styles.chipRow}>
                {fulfillmentOptions.map((opt) => (
                  <Pressable
                    key={opt}
                    style={[
                      styles.chip,
                      editFulfillmentSpeed === opt && { backgroundColor: activeTheme.primary, borderColor: activeTheme.primary },
                    ]}
                    onPress={() => setEditFulfillmentSpeed(opt)}
                  >
                    <Text style={[styles.chipText, editFulfillmentSpeed === opt && { color: "#fff" }]}>{opt}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Weekly Target (orders)</Text>
              <TextInput
                style={styles.input}
                value={editWeeklyTarget}
                onChangeText={setEditWeeklyTarget}
                keyboardType="numeric"
                placeholder="e.g. 50"
                placeholderTextColor={themeColors.muted}
              />
            </View>
          </>
        ) : (
          <>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Store Name</Text>
              <Text style={styles.valueText}>{seller?.name}</Text>
            </View>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Location</Text>
              <Text style={styles.valueText}>{seller?.location || "—"}</Text>
            </View>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Description</Text>
              <Text style={[styles.valueText, styles.valueWrap]}>{seller?.store_description || "—"}</Text>
            </View>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Fulfillment</Text>
              <Text style={styles.valueText}>{seller?.fulfillment_speed || "—"}</Text>
            </View>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Weekly Target</Text>
              <Text style={styles.valueText}>
                {seller?.weekly_target ? `${seller.weekly_target} / wk` : "—"}
              </Text>
            </View>
          </>
        )}
      </View>

      {/* Social Links — flat, no card container */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="share-social-outline" size={18} color={activeTheme.primary} />
          <Text style={styles.sectionTitle}>Social Links</Text>
        </View>

        {SOCIAL_FIELDS.map((f) => (
          <View key={f.key} style={editing ? styles.fieldBlock : styles.fieldRow}>
            <View style={styles.socialLead}>
              <Ionicons name={f.icon} size={18} color={themeColors.muted} style={styles.socialIcon} />
              <Text style={styles.fieldLabel}>{f.label}</Text>
            </View>
            {editing ? (
              <TextInput
                style={styles.input}
                value={social[f.key]}
                onChangeText={(t) => setSocial((prev) => ({ ...prev, [f.key]: t }))}
                placeholder={f.placeholder}
                placeholderTextColor={themeColors.muted}
                keyboardType={f.type === "whatsapp" ? "phone-pad" : "url"}
              />
            ) : (
              <Text style={[styles.valueText, styles.valueWrap]} numberOfLines={1}>
                {seller?.[f.key] || "—"}
              </Text>
            )}
          </View>
        ))}
      </View>

      {/* Theme — flat, no card container */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="color-palette-outline" size={18} color={activeTheme.primary} />
          <Text style={styles.sectionTitle}>Store Theme</Text>
        </View>

        <Text style={styles.fieldLabel}>Theme Color</Text>
        <View style={styles.themeSwatches}>
          {THEME_OPTIONS.map((c) => (
            <Pressable
              key={c}
              onPress={() => setEditThemeColor(c)}
              style={[
                styles.themeSwatch,
                {
                  backgroundColor: c,
                  borderWidth: editThemeColor === c ? 3 : 1,
                  borderColor: editThemeColor === c ? "#000" : "#E6EDF3",
                },
              ]}
            />
          ))}
        </View>

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>Apply theme to my store</Text>
            <Text style={styles.switchSub}>Show this color in your tagit store</Text>
          </View>
          <Switch
            value={editApplyToStore}
            onValueChange={setEditApplyToStore}
            trackColor={{ true: activeTheme.primary }}
            thumbColor="#fff"
          />
        </View>

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>Apply theme to customers</Text>
            <Text style={styles.switchSub}>Use this color on your store for shoppers</Text>
          </View>
          <Switch
            value={editApplyToCustomer}
            onValueChange={setEditApplyToCustomer}
            trackColor={{ true: activeTheme.primary }}
            thumbColor="#fff"
          />
        </View>
      </View>

      <View style={{ height: 40 }} />

      <Modal visible={previewVisible} transparent animationType="fade" onRequestClose={() => setPreviewVisible(false)}>
        <Pressable style={styles.previewOverlay} onPress={() => setPreviewVisible(false)}>
          <View style={styles.previewWrap}>
            {displayUri ? <Image source={{ uri: displayUri }} style={styles.previewImage} /> : null}
          </View>
        </Pressable>
      </Modal>
    </ScrollView>
  );
};

const buildSellerProfileStyles = (c) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  scrollContent: { paddingBottom: 30 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: { position: "relative", height: 180, justifyContent: "flex-end", paddingBottom: 16 },
  heroOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.28)" },
  coverPress: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  coverCamera: { position: "absolute", top: 12, right: 16, zIndex: 5, width: 36, height: 36, borderRadius: radius.full, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" },
  backFloating: { position: "absolute", top: 12, left: 16, zIndex: 5, width: 36, height: 36, borderRadius: radius.full, backgroundColor: "rgba(0,0,0,0.3)", alignItems: "center", justifyContent: "center" },
  heroBottom: { alignItems: "center", gap: 10, paddingHorizontal: 16 },
  heroName: { color: "#fff", fontSize: 22, fontWeight: "800", textShadowColor: "rgba(0,0,0,0.4)", textShadowRadius: 4 },
  actionRow: { flexDirection: "row", gap: 12, paddingHorizontal: 16, marginTop: 4 },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: radius.md, backgroundColor: "rgba(255,255,255,0.3)", alignItems: "center" },
  cancelText: { fontWeight: "700", color: "#fff" },
  saveBtn: { flex: 2, paddingVertical: 13, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  saveText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  editBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 11, paddingHorizontal: 20, borderRadius: radius.md, marginTop: 4 },
  editText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  statsCard: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginTop: -28,
    borderRadius: radius.lg,
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
    zIndex: 2,
  },
  statRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, paddingHorizontal: 20 },
  statDividerH: { height: 1, backgroundColor: "#EDF1F6" },
  statValue: { fontSize: 18, fontWeight: "900", color: c.dark },
  statLabel: { fontSize: 14, fontWeight: "600", color: c.muted },
  section: { marginTop: 24, paddingHorizontal: 4 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8, paddingHorizontal: 12 },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: c.dark },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  fieldBlock: { paddingVertical: 10, paddingHorizontal: 12 },
  fieldLabel: { fontSize: 13, fontWeight: "600", color: c.muted },
  valueText: { fontSize: 15, color: c.dark, fontWeight: "600" },
  valueWrap: { flexShrink: 1, textAlign: "right" },
  socialLead: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 120 },
  socialIcon: { marginRight: 0 },
  input: {
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 13,
    fontSize: 15,
    color: c.dark,
    backgroundColor: "#FAFBFC",
    marginTop: 8,
    ...(Platform.OS === "web" ? { outlineStyle: "none", outlineWidth: 0 } : {}),
  },
  textArea: { height: 96, textAlignVertical: "top" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.md, borderWidth: 1.5, borderColor: "#E2E8F0", backgroundColor: "#FAFBFC" },
  chipText: { fontWeight: "600", color: c.muted, fontSize: 13 },
  themeSwatches: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 8, paddingHorizontal: 12 },
  themeSwatch: { width: 36, height: 36, borderRadius: radius.full },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  switchLabel: { fontSize: 15, fontWeight: "600", color: c.dark },
  switchSub: { fontSize: 12, color: c.muted, marginTop: 2 },
  previewOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center" },
  previewWrap: { borderRadius: radius.lg, overflow: "hidden", backgroundColor: "#fff", padding: 6 },
  previewImage: { width: 260, height: 260, borderRadius: radius.md },
});