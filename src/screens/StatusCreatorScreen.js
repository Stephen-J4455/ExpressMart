import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Platform,
  Pressable,
  Dimensions,
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../lib/supabase";
import {getTheme, radius } from "../theme/colors";
import { useTheme } from "../context/ThemeContext";
import { useAppStyles } from "../hooks/useAppStyles";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { ResponsiveContainer } from "../components/ResponsiveContainer";
import { useResponsive } from "../hooks/useResponsive";
import { getImageContentType } from "../utils/webUpload";
import { R2_FOLDERS, uploadToR2Presigned } from "../services/r2Storage";

/** Extract hashtags (#tag) from a string, normalized lowercase without the #. */
const extractHashtags = (text = "") => {
  const tags = [...text.matchAll(/#(\w+)/g)].map((m) => m[1].toLowerCase());
  return [...new Set(tags)];
};

const SCREEN_WIDTH = Dimensions.get("window").width;

export const StatusCreatorScreen = ({ navigation }) => {
  const { user } = useAuth();
  const { colors: themeColors } = useTheme();
  const styles = useAppStyles((c) => buildStatusCreatorStyles(c));
  const theme = getTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { isWide } = useResponsive();

  const [sellerId, setSellerId] = useState(null);

  // Mode: 'image' or 'text'
  const [statusMode, setStatusMode] = useState("image");

  // Image mode states
  const [image, setImage] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imageCaption, setImageCaption] = useState("");

  // Text mode states
  const [statusText, setStatusText] = useState("");
  const [backgroundType, setBackgroundType] = useState("solid");
  const [solidColor, setSolidColor] = useState("#FF6B6B");
  const [gradientStart, setGradientStart] = useState("#FF6B6B");
  const [gradientEnd, setGradientEnd] = useState("#FFA500");
  const [textColor, setTextColor] = useState("#FFFFFF");
  const [fontSize, setFontSize] = useState(28);

  // Product tagging state (image mode only)
  const [taggedProducts, setTaggedProducts] = useState([]); // { product_id, x, y }
  const [tagMode, setTagMode] = useState(false);
  const [tagProducts, setTagProducts] = useState([]); // search results
  const [tagQuery, setTagQuery] = useState("");

  // Hashtags parsed from caption/status text
  const [hashtags, setHashtags] = useState([]);

  const [loading, setLoading] = useState(false);

  const handleClose = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate("Main", { screen: "Account" });
  };

  useEffect(() => {
    let active = true;
    const loadSeller = async () => {
      if (!supabase || !user) return;
      try {
        const { data } = await supabase
          .from("express_sellers")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (active && data) setSellerId(data.id);
      } catch (e) {
        console.warn("Failed to load seller id for status creator", e);
      }
    };
    loadSeller();
    return () => {
      active = false;
    };
  }, [user]);

  // Search seller's own products to tag in a status.
  const searchTagProducts = useCallback(async (q) => {
    if (!q || q.length < 2) {
      setTagProducts([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .from("express_products")
        .select("id, title, thumbnail, price")
        .eq("seller_id", sellerId)
        .ilike("title", `%${q}%`)
        .limit(8);
      if (error) throw error;
      setTagProducts(data || []);
    } catch (err) {
      console.warn("Product tag search failed:", err);
      setTagProducts([]);
    }
  }, [sellerId]);

  const toggleTagProduct = (product) => {
    setTaggedProducts((prev) => {
      const exists = prev.find((t) => t.product_id === product.id);
      if (exists) return prev.filter((t) => t.product_id !== product.id);
      return [...prev, { product_id: product.id, x: 50, y: 50 }];
    });
    setTagQuery("");
    setTagProducts([]);
    setTagMode(false);
  };

  const removeTag = (productId) => {
    setTaggedProducts((prev) => prev.filter((t) => t.product_id !== productId));
  };

  // Parse hashtags from the caption / status text whenever it changes.
  useEffect(() => {
    const text = statusMode === "image" ? imageCaption : statusText;
    setHashtags(extractHashtags(text));
  }, [imageCaption, statusText, statusMode]);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.8,
    });
    if (!result.canceled) {
      const selectedAsset = result.assets[0];
      setImage(selectedAsset.uri);
      if (Platform.OS === "web") setImageFile(selectedAsset.file || null);
    }
  };

  const takePhoto = async () => {
    if (Platform.OS === "web") {
      toast.info("Camera capture is limited on web", "Choose from gallery");
      await pickImage();
      return;
    }

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      toast.error("Camera permission is required");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.8,
    });
    if (!result.canceled) {
      const selectedAsset = result.assets[0];
      setImage(selectedAsset.uri);
      if (Platform.OS === "web") setImageFile(selectedAsset.file || null);
    }
  };

  const canPost = () => {
    if (statusMode === "image") return !!image;
    return statusText.trim().length > 0;
  };

  const getImageExtension = (uri) => {
    const cleanUri = uri?.split("?")[0] || "";
    const ext = cleanUri.split(".").pop()?.toLowerCase();
    if (!ext || ext.length > 5) return "jpg";
    return ext === "jpeg" ? "jpg" : ext;
  };

  const uploadStatusImage = async (uri, pickedFile = null) => {
    const ext = getImageExtension(uri);
    const fileName = `${Date.now()}.${ext}`;
    const folder = `${R2_FOLDERS.STATUSES}/${sellerId || "unknown"}`;
    const contentType = getImageContentType(uri);

    const { publicUrl } = await uploadToR2Presigned({
      uri,
      pickedFile,
      folder,
      fileName,
    });
    return publicUrl;
  };

  const handlePost = async () => {
    if (!canPost()) {
      toast.error(statusMode === "image" ? "Select an image first" : "Enter status text");
      return;
    }
    if (!sellerId) {
      toast.error("Seller profile not loaded");
      return;
    }

    setLoading(true);
    try {
      let statusId;
      if (statusMode === "image") {
        const mediaUrl = await uploadStatusImage(image, imageFile);

        const { data: inserted, error: dbError } = await supabase
          .from("express_seller_statuses")
          .insert({
            seller_id: sellerId,
            status_type: "image",
            media_url: mediaUrl,
            status_text: imageCaption || null,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          })
          .select("id")
          .single();
        if (dbError) throw dbError;
        statusId = inserted.id;
      } else {
        const { data: inserted, error } = await supabase
          .from("express_seller_statuses")
          .insert({
            seller_id: sellerId,
            status_type: "text",
            status_text: statusText,
            background_color: backgroundType === "solid" ? solidColor : null,
            gradient_start: backgroundType === "gradient" ? gradientStart : null,
            gradient_end: backgroundType === "gradient" ? gradientEnd : null,
            text_color: textColor,
            font_size: fontSize,
            media_url: "text-status",
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          })
          .select("id")
          .single();
        if (error) throw error;
        statusId = inserted.id;
      }

      // ── Insert product tags ─────────────────────────────────────────────
      if (statusId && taggedProducts.length > 0) {
        const { error: tagError } = await supabase
          .from("status_product_tags")
          .insert(
            taggedProducts.map((t) => ({
              status_id: statusId,
              product_id: t.product_id,
              x_position: t.x ?? 50,
              y_position: t.y ?? 50,
            })),
          );
        if (tagError) throw tagError;
      }

      // ── Insert hashtags ─────────────────────────────────────────────────
      if (statusId && hashtags.length > 0) {
        // Upsert hashtags and link them to the status.
        for (const tag of hashtags) {
          const { data: existing } = await supabase
            .from("hashtags")
            .select("id")
            .eq("tag", tag)
            .maybeSingle();

          let hashtagId;
          if (existing) {
            hashtagId = existing.id;
          } else {
            const { data: created, error: hErr } = await supabase
              .from("hashtags")
              .insert({ tag, post_count: 1 })
              .select("id")
              .single();
            if (hErr) throw hErr;
            hashtagId = created.id;
          }

          await supabase.from("status_hashtags").insert({
            status_id: statusId,
            hashtag_id: hashtagId,
          });
        }
      }

      toast.success("Status posted successfully!");
      handleClose();
    } catch (error) {
      console.error("Error posting status:", error);
      toast.error("Failed to post status");
    } finally {
      setLoading(false);
    }
  };

  const previewColors = backgroundType === "solid" ? [solidColor, solidColor] : [gradientStart, gradientEnd];

  return (
    <ResponsiveContainer maxWidth={700}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 16 }}>
          <View style={styles.headerRow}>
            <Pressable onPress={handleClose}>
              <Ionicons name="arrow-back" size={24} color={themeColors.dark} />
            </Pressable>
            <Text style={styles.title}>Create Status</Text>
            <View style={{ width: 24 }} />
          </View>

          <View style={styles.modeRow}>
            <Pressable onPress={() => setStatusMode("image")} style={[styles.modeBtn, statusMode === "image" && styles.modeBtnActive]}>
              <Ionicons name="images" size={18} color={statusMode === "image" ? themeColors.primary : themeColors.muted} />
              <Text style={[styles.modeText, statusMode === "image" && { color: themeColors.primary }]}>Image</Text>
            </Pressable>
            <Pressable onPress={() => setStatusMode("text")} style={[styles.modeBtn, statusMode === "text" && styles.modeBtnActive]}>
              <Ionicons name="text" size={18} color={statusMode === "text" ? themeColors.primary : themeColors.muted} />
              <Text style={[styles.modeText, statusMode === "text" && { color: themeColors.primary }]}>Text</Text>
            </Pressable>
          </View>

          {statusMode === "image" ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Select Image</Text>
              <View style={styles.imageBtnRow}>
                <TouchableOpacity style={[styles.imagePickBtn, { borderColor: themeColors.primary }]} onPress={pickImage}>
                  <Ionicons name="images" size={20} color={themeColors.primary} />
                  <Text style={[styles.imagePickBtnText, { color: themeColors.primary }]}>Gallery</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.imagePickBtn, { borderColor: themeColors.primary }]} onPress={takePhoto}>
                  <Ionicons name="camera" size={20} color={themeColors.primary} />
                  <Text style={[styles.imagePickBtnText, { color: themeColors.primary }]}>Camera</Text>
                </TouchableOpacity>
                {image && (
                  <Pressable onPress={() => setTagMode(!tagMode)} style={[styles.tagModeBtn, tagMode && styles.tagModeBtnActive]}>
                    <Ionicons name={tagMode ? "close" : "pricetag"} size={18} color={tagMode ? themeColors.red.primary : themeColors.primary} />
                    <Text style={[styles.tagModeBtnText, tagMode && { color: themeColors.red.primary }]}>
                      {tagMode ? "Done Tagging" : "Tag Product"}
                    </Text>
                  </Pressable>
                )}
              </View>
              <TextInput style={styles.textInput} placeholder="Caption (optional) — add #hashtags" placeholderTextColor={themeColors.muted} value={imageCaption} onChangeText={setImageCaption} />
              {hashtags.length > 0 && (
                <View style={styles.hashtagRow}>
                  {hashtags.map((tag) => (
                    <Pressable key={tag} style={styles.hashtagChip}>
                      <Text style={styles.hashtagChipText}>#{tag}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
              {tagMode && image && (
                <View style={styles.tagSearchSection}>
                  <Text style={styles.sectionTitle}>Tag a Product</Text>
                  <TextInput style={styles.textInput} placeholder="Search your products..." value={tagQuery} onChangeText={(t) => { setTagQuery(t); searchTagProducts(t); }} />
                  {tagProducts.length > 0 && (
                    <FlatList
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      data={tagProducts}
                      keyExtractor={(item) => item.id}
                      renderItem={({ item }) => (
                        <Pressable onPress={() => toggleTagProduct(item)} style={styles.tagChip}>
                          <Image source={{ uri: item.thumbnail }} style={styles.tagChipImage} />
                          <Text style={styles.tagChipText}>{item.title}</Text>
                        </Pressable>
                      )}
                    />
                  )}
                </View>
              )}
              {taggedProducts.length > 0 && (
                <View style={styles.taggedList}>
                  <Text style={styles.sectionTitle}>Tagged Products</Text>
                  {taggedProducts.map((t) => {
                    const product = tagProducts.find((p) => p.id === t.product_id);
                    return (
                      <Pressable key={t.product_id} onPress={() => removeTag(t.product_id)} style={styles.taggedRow}>
                        <Text style={styles.taggedRowText}>{product?.title || "Product"}</Text>
                        <Ionicons name="close" size={16} color={themeColors.muted} />
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          ) : (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Status Text</Text>
              <TextInput style={styles.textInput} placeholder="Enter your status text..." placeholderTextColor={themeColors.muted} multiline value={statusText} onChangeText={setStatusText} />
            </View>
          )}

          {/* ── Live preview — renders exactly what viewers will see ─────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Preview</Text>
            <View style={styles.previewWrap}>
              <View style={[styles.previewCard, { backgroundColor: statusMode === "text" ? solidColor : themeColors.light }]}>
                {statusMode === "image" ? (
                  image ? (
                    <>
                      <Image source={{ uri: image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                      {/* Bottom scrim so the caption stays readable over
                          any photo, mirroring the StatusViewer rendering. */}
                      {imageCaption ? (
                        <LinearGradient
                          colors={["transparent", "rgba(0,0,0,0.65)"]}
                          style={styles.previewCaptionScrim}
                        >
                          <Text style={styles.previewCaptionText} numberOfLines={4}>
                            {imageCaption}
                          </Text>
                        </LinearGradient>
                      ) : null}
                      {/* Tag overlays on the preview image */}
                      {taggedProducts.map((t) => {
                        const product = tagProducts.find((p) => p.id === t.product_id);
                        if (!product) return null;
                        return (
                          <Pressable
                            key={t.product_id}
                            onPress={() => removeTag(t.product_id)}
                            style={styles.tagOverlay}
                          >
                            <View style={styles.tagOverlayBadge}>
                              <Ionicons name="pricetag" size={14} color="#fff" />
                              <Text style={styles.tagOverlayText}>{product.title}</Text>
                            </View>
                          </Pressable>
                        );
                      })}
                    </>
                  ) : (
                    <View style={styles.previewPlaceholder}>
                      <Ionicons name="image-outline" size={32} color={themeColors.muted} />
                      <Text style={styles.previewPlaceholderText}>
                        Pick an image to see your status
                      </Text>
                    </View>
                  )
                ) : (
                  <View style={styles.previewTextWrap}>
                    {backgroundType === "gradient" ? (
                      <LinearGradient
                        colors={previewColors}
                        style={StyleSheet.absoluteFill}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                      />
                    ) : null}
                    <Text
                      style={[
                        styles.previewStatusText,
                        {
                          color:
                            backgroundType === "solid" ? "#FFFFFF" : textColor,
                          fontSize: Math.min(fontSize, 34),
                        },
                      ]}
                    >
                      {statusText || "Your status text appears here…"}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.previewHint}>
                This is how your status will appear to customers.
              </Text>
            </View>
          </View>

          <Pressable style={[styles.postBtn, { backgroundColor: themeColors.primary }, loading && { opacity: 0.6 }]} onPress={handlePost} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.postText}>Post Status</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </ResponsiveContainer>
  );
};

const buildStatusCreatorStyles = (c) =>
  StyleSheet.create({ 
  container: { backgroundColor: c.background, flexGrow: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  title: { fontSize: 18, fontWeight: "700", color: c.dark },
  modeRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  modeBtn: { padding: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: c.light, flexDirection: "row", gap: 8, alignItems: "center" },
  modeBtnActive: { borderColor: c.primary, backgroundColor: c.primary + "10" },
  modeText: { marginLeft: 6 },
  section: { marginBottom: 16 },
  sectionTitle: { fontWeight: "700", marginBottom: 8 },
  imageBtnRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
  imagePickBtn: { flex: 1, padding: 12, borderRadius: radius.lg, borderWidth: 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  imagePickBtnText: { fontWeight: "700" },
  textInput: { borderWidth: 1, borderColor: c.light, padding: 12, borderRadius: radius.lg, backgroundColor: c.light },
  postBtn: { padding: 14, borderRadius: radius.xl, alignItems: "center", marginTop: 12 },
  postText: { color: c.light, fontWeight: "800" },
  // ── Product tagging styles ─────────────────────────────────────────────
  tagModeBtn: { padding: 8, borderRadius: radius.md, borderWidth: 1, borderColor: c.light, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  tagModeBtnActive: { borderColor: c.primary, backgroundColor: c.primary + "10" },
  tagModeBtnText: { fontSize: 12, fontWeight: "700" },
  tagSearchSection: { marginTop: 12 },
  tagChip: { flexDirection: "row", alignItems: "center", gap: 6, padding: 8, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.light },
  tagChipImage: { width: 32, height: 32, borderRadius: radius.sm },
  tagChipText: { fontSize: 12, fontWeight: "600", color: c.dark },
  taggedList: { marginTop: 12 },
  taggedRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 8, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.light, marginBottom: 6 },
  taggedRowText: { fontSize: 13, fontWeight: "600", color: c.dark },
  hashtagRow: { flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" },
  hashtagChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1, borderColor: c.primary, backgroundColor: c.primary + "10" },
  hashtagChipText: { color: c.primary, fontWeight: "700", fontSize: 13 },
  // Tag overlay badge on the preview image
  tagOverlay: { position: "absolute", bottom: 12, left: 12 },
  tagOverlayBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.full, backgroundColor: "rgba(0,0,0,0.7)" },
  tagOverlayText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  // ── Live preview card (9:16 story format) ──────────────────────────────
  previewWrap: { alignItems: "center" },
  previewCard: {
    // Phone-proportioned story thumbnail, clamped so it never overflows
    // wide screens inside ResponsiveContainer.
    width: Math.min(280, SCREEN_WIDTH - 48),
    height: Math.min(280, SCREEN_WIDTH - 48) * (16 / 9),
    borderRadius: radius.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: c.border,
  },
  previewCaptionScrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 32,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  previewCaptionText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  previewPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 20,
  },
  previewPlaceholderText: { color: c.muted, fontSize: 13, textAlign: "center" },
  previewTextWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  previewStatusText: { fontWeight: "700", textAlign: "center" },
  previewHint: { color: c.muted, fontSize: 12, marginTop: 8, textAlign: "center" },
 });

export default StatusCreatorScreen;
