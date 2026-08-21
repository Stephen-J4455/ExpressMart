import React, { useState, useEffect } from "react";
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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../lib/supabase";
import { getTheme } from "../theme/colors";
import { useTheme } from "../context/ThemeContext";
import { useAppStyles } from "../hooks/useAppStyles";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { ResponsiveContainer } from "../components/ResponsiveContainer";
import { useResponsive } from "../hooks/useResponsive";
import { getImageContentType, getWebUploadPayload } from "../utils/webUpload";

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

  const [loading, setLoading] = useState(false);

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
    const fileName = `${sellerId || "unknown"}/${Date.now()}.${ext}`;
    const contentType = getImageContentType(uri);

    if (Platform.OS === "web") {
      const { fileBody, contentType: resolvedContentType } =
        await getWebUploadPayload({ uri, pickedFile, preferredContentType: contentType });
      const { error } = await supabase.storage
        .from("seller-statuses")
        .upload(fileName, fileBody, {
          contentType: resolvedContentType,
          cacheControl: "3600",
          upsert: false,
        });
      if (error) throw error;
    } else {
      const formDataUpload = new FormData();
      formDataUpload.append("file", {
        uri: uri,
        type: contentType,
        name: fileName.split("/").pop(),
      });
      const { error } = await supabase.storage
        .from("seller-statuses")
        .upload(fileName, formDataUpload, {
          contentType,
          cacheControl: "3600",
          upsert: false,
        });
      if (error) throw error;
    }
    return fileName;
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
      if (statusMode === "image") {
        const fileName = await uploadStatusImage(image, imageFile);
        const { data: { publicUrl } = {} } = supabase.storage
          .from("seller-statuses")
          .getPublicUrl(fileName);

        const { error: dbError } = await supabase
          .from("express_seller_statuses")
          .insert({
            seller_id: sellerId,
            status_type: "image",
            media_url: publicUrl,
            status_text: imageCaption || null,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          });
        if (dbError) throw dbError;
      } else {
        const { error } = await supabase
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
          });
        if (error) throw error;
      }

      toast.success("Status posted successfully!");
      navigation.goBack();
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
            <Pressable onPress={() => navigation.goBack()}>
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
              </View>
              <TextInput style={styles.textInput} placeholder="Caption (optional)" placeholderTextColor={themeColors.muted} value={imageCaption} onChangeText={setImageCaption} />
            </View>
          ) : (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Status Text</Text>
              <TextInput style={styles.textInput} placeholder="Enter your status text..." placeholderTextColor={themeColors.muted} multiline value={statusText} onChangeText={setStatusText} />
            </View>
          )}

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
  modeBtn: { padding: 12, borderRadius: 10, borderWidth: 1, borderColor: c.light, flexDirection: "row", gap: 8, alignItems: "center" },
  modeBtnActive: { borderColor: c.primary, backgroundColor: c.primary + "10" },
  modeText: { marginLeft: 6 },
  section: { marginBottom: 16 },
  sectionTitle: { fontWeight: "700", marginBottom: 8 },
  imageBtnRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
  imagePickBtn: { flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  imagePickBtnText: { fontWeight: "700" },
  textInput: { borderWidth: 1, borderColor: c.light, padding: 12, borderRadius: 8, backgroundColor: "#fff" },
  postBtn: { padding: 14, borderRadius: 12, alignItems: "center", marginTop: 12 },
  postText: { color: "#fff", fontWeight: "800" },
});

export default StatusCreatorScreen;
