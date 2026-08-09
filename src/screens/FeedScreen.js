// ReelsScreen (formerly FeedScreen)
// ---------------------------------------------------------------------------
// A low-data vertical "Reels" short-video page for product showcases.
// Each item is a vertical 9:16 video stored on Cloudflare R2 and rendered with
// react-native-video. A FAB lets sellers capture/select a video and upload it
// via the `uploadReel` service (compress -> presigned PUT -> DB insert).
// ---------------------------------------------------------------------------

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  Dimensions,
} from "react-native";
import { Video } from "react-native-video";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "@react-navigation/native";
import { colors } from "../theme/colors";
import { uploadReel, fetchReels } from "../services/uploadReel";

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get("window");
const REEL_ASPECT = 9 / 16; // width / height

export const FeedScreen = ({ route, navigation }) => {
  const [reels, setReels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadPhase, setUploadPhase] = useState(null);
  const videoRefs = useRef({});

  const loadReels = useCallback(async () => {
    setLoading(true);
    const data = await fetchReels(30);
    setReels(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadReels();
  }, [loadReels]);

  // Refresh when navigating to this screen with a refresh param.
  useFocusEffect(
    useCallback(() => {
      if (route?.params?.refresh) {
        loadReels();
        navigation.setParams({ refresh: false });
      }
    }, [route?.params?.refresh, loadReels, navigation]),
  );

  // ── Seller: pick a local video and upload it as a product reel ───────────────
  const handleCreateReel = useCallback(async () => {
    try {
      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: true,
        videoMaxDuration: 60,
        quality: 0.6,
      });

      if (pickerResult.canceled || !pickerResult.assets?.length) return;

      const asset = pickerResult.assets[0];
      const localUri = asset.uri; // RN uses file:// / content:// URIs

      // Gather minimal product metadata. Alert.prompt is unavailable on web,
      // so fall back to sensible defaults there.
      let title = "Featured product";
      let priceText = "0";
      if (Platform.OS !== "web" && Alert.prompt) {
        const enteredTitle = await new Promise((resolve) => {
          Alert.prompt(
            "Reel title",
            "Name the product shown in this reel",
            [
              { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
              { text: "OK", onPress: (text) => resolve(text) },
            ],
            "plain-text",
            "Featured product",
          );
        });
        if (!enteredTitle) return;
        title = enteredTitle || title;

        const enteredPrice = await new Promise((resolve) => {
          Alert.prompt(
            "Price (GH₵)",
            "Enter the product price",
            [
              { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
              { text: "OK", onPress: (text) => resolve(text) },
            ],
            "plain-text",
            "0",
          );
        });
        if (enteredPrice === null) return;
        priceText = enteredPrice;
      }

      setUploading(true);
      setUploadPhase("compress");
      setUploadProgress(0);

      const result = await uploadReel(
        localUri,
        {
          title: title || "Untitled product",
          price: Number(priceText) || 0,
          category: route?.params?.category || null,
          tags: ["new"],
        },
        (p) => {
          setUploadPhase(p.phase);
          setUploadProgress(p.progress);
        },
      );

      Alert.alert("Success", "Your product reel was published!");
      // Prepend the new reel to the feed.
      setReels((prev) => [
        {
          id: result.reelId,
          video_url: result.publicUrl,
          title: title || "Untitled product",
          price: Number(priceText) || 0,
        },
        ...prev,
      ]);
    } catch (err) {
      console.error("Upload reel failed:", err);
      Alert.alert("Upload failed", err?.message || "Something went wrong");
    } finally {
      setUploading(false);
      setUploadPhase(null);
      setUploadProgress(0);
    }
  }, [route?.params?.category]);

  const togglePlay = useCallback((id) => {
    const ref = videoRefs.current[id];
    if (!ref) return;
    // Simple toggle: we keep a muted/playing map lightly via ref state.
    if (!videoRefs.current[`_playing_${id}`]) {
      ref.resume?.();
      ref.play?.();
      videoRefs.current[`_playing_${id}`] = true;
    } else {
      ref.pause?.();
      videoRefs.current[`_playing_${id}`] = false;
    }
  }, []);

  const renderReel = useCallback(
    ({ item }) => (
      <View style={styles.reelContainer}>
        <Pressable
          style={styles.videoWrap}
          onPress={() => togglePlay(item.id)}
        >
          <Video
            ref={(r) => {
              if (r) videoRefs.current[item.id] = r;
            }}
            source={{ uri: item.video_url }}
            style={styles.video}
            resizeMode="cover"
            repeat
            muted
            paused
            poster={item.thumbnail_url || null}
            posterResizeMode="cover"
          />
          {/* Lightweight overlay with product info (low-data) */}
          <View style={styles.overlay}>
            <Text style={styles.reelTitle} numberOfLines={2}>
              {item.title}
            </Text>
            {item.price != null && (
              <Text style={styles.reelPrice}>GH₵ {item.price}</Text>
            )}
            {item.description ? (
              <Text style={styles.reelDesc} numberOfLines={2}>
                {item.description}
              </Text>
            ) : null}
            <Pressable
              style={styles.shopBtn}
              onPress={() =>
                item.product_id
                  ? navigation.navigate("ProductDetail", {
                      product: { id: item.product_id },
                    })
                  : null
              }
            >
              <Text style={styles.shopBtnText}>View product</Text>
            </Pressable>
          </View>
        </Pressable>
      </View>
    ),
    [navigation, togglePlay],
  );

  return (
    <View style={styles.wrapper}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={reels}
          keyExtractor={(item) => item.id?.toString?.() || Math.random()}
          renderItem={renderReel}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          getItemLayout={(data, index) => ({
            length: SCREEN_HEIGHT,
            offset: SCREEN_HEIGHT * index,
            index,
          })}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          windowSize={3}
        />
      )}

      {/* Upload progress overlay */}
      {uploading && (
        <View style={styles.uploadOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.uploadText}>
            {uploadPhase === "compress" && "Compressing video…"}
            {uploadPhase === "upload" && "Uploading to R2…"}
            {uploadPhase === "save" && "Saving reel…"}{" "}
            {Math.round(uploadProgress * 100)}%
          </Text>
        </View>
      )}

      {/* Create reel FAB (seller) */}
      <Pressable style={styles.fab} onPress={handleCreateReel}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: "#000",
    paddingTop: Platform.OS === "web" ? 0 : 50,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  reelContainer: {
    height: SCREEN_HEIGHT,
    width: SCREEN_WIDTH,
    backgroundColor: "#000",
  },
  videoWrap: {
    flex: 1,
    justifyContent: "flex-end",
  },
  video: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH / REEL_ASPECT,
  },
  overlay: {
    padding: 16,
    paddingBottom: 40,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  reelTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  reelPrice: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 4,
  },
  reelDesc: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    marginTop: 4,
  },
  shopBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  shopBtnText: {
    color: "#fff",
    fontWeight: "700",
  },
  fab: {
    position: "absolute",
    right: 16,
    bottom: 90,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 5,
  },
  fabText: {
    color: "#fff",
    fontSize: 30,
    fontWeight: "700",
    lineHeight: 34,
  },
  uploadOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  uploadText: {
    color: "#fff",
    marginTop: 12,
    fontSize: 14,
  },
});

export default FeedScreen;