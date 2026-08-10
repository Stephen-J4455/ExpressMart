// FeedScreen (Reels)
// ---------------------------------------------------------------------------
// A low-data vertical "Reels" short-video page for product showcases.
// Each item is a vertical 9:16 video stored on Cloudflare R2 and rendered with
// react-native-video.
// ---------------------------------------------------------------------------

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Video } from "react-native-video";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors } from "../theme/colors";
import { fetchProductReels } from "../services/uploadReel";
import { getLocalVideoUri, cacheReelVideo } from "../services/reelVideoCache";
import { useResponsive } from "../hooks/useResponsive";
import { supabase } from "../lib/supabase";

// Cache the reels feed locally so it loads instantly from disk on every mount
// instead of re-streaming the list from the network (saves data on metered
// connections). The cache is used as the source of truth for the first paint,
// then refreshed in the background and re-persisted.
const REELS_CACHE_KEY = "expressmart.cache.reels";
const REELS_CACHE_TS_KEY = "expressmart.cache.reels_timestamp";
// Reels change infrequently; refresh the local copy at most once per 30 min.
const REELS_CACHE_DURATION = 30 * 60 * 1000;

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get("window");
const REEL_ASPECT = 9 / 16;

// Top inset (status bar / header) reserved by the wrapper. The feed area is the
// full screen minus this inset, so each reel page must be exactly this tall to
// avoid a gap that pushes the next video down.
const TOP_INSET = Platform.OS === "web" ? 0 : 50;
const ITEM_HEIGHT = SCREEN_HEIGHT - TOP_INSET;

const FLOATING_TAB_OFFSET = 120;

const resolveAvatarUri = (rawValue) => {
  const value = String(rawValue || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value) || value.startsWith("file://")) {
    return value;
  }
  const normalizedPath = value.replace(/^\/+/, "");
  const { data } = supabase.storage.from("profile").getPublicUrl(normalizedPath);
  return data?.publicUrl || "";
};

export const FeedScreen = ({ route, navigation }) => {
  const [reels, setReels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [paused, setPaused] = useState(false);
  const { isWide } = useResponsive();
  const videoRefs = useRef({});

  // Read the cached reels payload (if fresh enough) so we can paint instantly.
  const loadReelsFromCache = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(REELS_CACHE_KEY);
      const tsRaw = await AsyncStorage.getItem(REELS_CACHE_TS_KEY);
      if (!raw || !tsRaw) return null;
      if (Date.now() - Number(tsRaw) > REELS_CACHE_DURATION) return null;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) return null;
      return parsed;
    } catch (e) {
      console.warn("Failed to read cached reels:", e);
      return null;
    }
  }, []);

  const saveReelsToCache = useCallback(async (data) => {
    try {
      await AsyncStorage.setItem(REELS_CACHE_KEY, JSON.stringify(data));
      await AsyncStorage.setItem(REELS_CACHE_TS_KEY, Date.now().toString());
    } catch (e) {
      console.warn("Failed to cache reels:", e);
    }
  }, []);

  const loadReels = useCallback(async () => {
    // 1. Paint immediately from local cache (no network, saves data).
    const cached = await loadReelsFromCache();
    if (cached) {
      setReels(cached);
      setActiveId(cached?.[0]?.id ?? null);
      setPaused(false);
      setLoading(false);
    } else {
      setLoading(true);
    }

    // 2. Refresh from the network in the background so the feed stays current.
    try {
      const data = await fetchProductReels(30);
      if (Array.isArray(data) && data.length > 0) {
        setReels(data);
        setActiveId(data?.[0]?.id ?? null);
        setPaused(false);
        saveReelsToCache(data);
      }
    } catch (e) {
      console.warn("Reels refresh failed, using cache:", e);
    } finally {
      setLoading(false);
    }
  }, [loadReelsFromCache, saveReelsToCache]);

  useEffect(() => {
    loadReels();
  }, [loadReels]);

  useFocusEffect(
    useCallback(() => {
      if (route?.params?.refresh) {
        loadReels();
        navigation.setParams({ refresh: false });
      }
    }, [route?.params?.refresh, loadReels, navigation]),
  );

  // Pause all videos when the feed is not focused (e.g. user navigated away).
  useFocusEffect(
    useCallback(() => {
      const ref = activeId ? videoRefs.current[activeId] : null;
      if (ref && !paused) ref.play?.();
      return () => {
        Object.values(videoRefs.current).forEach((r) => r?.pause?.());
      };
    }, [activeId, paused]),
  );

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    const centred = viewableItems.find((v) => v.isViewable);
    if (centred) {
      setActiveId(centred.item.id);
      setPaused(false);
    }
  }).current;

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 60,
    minimumViewTime: 0,
  }).current;

  useEffect(() => {
    Object.entries(videoRefs.current).forEach(([id, ref]) => {
      if (!ref) return;
      if (id === activeId) {
        ref.play?.();
      } else {
        ref.pause?.();
      }
    });
  }, [activeId]);

  const togglePlay = useCallback(() => {
    const ref = activeId ? videoRefs.current[activeId] : null;
    if (!ref) return;
    if (paused) {
      ref.play?.();
      setPaused(false);
    } else {
      ref.pause?.();
      setPaused(true);
    }
  }, [activeId, paused]);

  // A single reel. Owns its own video source so it can resolve/swap to a
  // locally-cached file: on mount it checks disk (instant if previously
  // watched), and when it becomes the active item it downloads the MP4 to the
  // local cache so scrolling up and back plays from disk instead of re-streaming.
  const ReelItem = React.memo(
    ({ item, isActive, navigation, paused, togglePlay, videoRefs }) => {
      const itemId = item.id;
      const [source, setSource] = useState(() => ({
        uri: item.hls_url || item.video_url,
      }));

      // Resolve a cached local file immediately (no network) on first paint.
      useEffect(() => {
        let cancelled = false;
        (async () => {
          const local = await getLocalVideoUri(itemId);
          if (!cancelled && local) setSource({ uri: local });
        })();
        return () => {
          cancelled = true;
        };
      }, [itemId]);

      // When the user is actually watching this reel, cache its video locally
      // (once) so future views don't re-fetch from R2. HLS is preferred because
      // it is adaptive and far smaller than the full-bitrate MP4.
      useEffect(() => {
        if (!isActive) return;
        let cancelled = false;
        (async () => {
          const local = await cacheReelVideo(itemId, {
            hlsUrl: item.hls_url,
            videoUrl: item.video_url,
          });
          if (!cancelled && local) setSource({ uri: local });
        })();
        return () => {
          cancelled = true;
        };
      }, [isActive, itemId, item.hls_url, item.video_url]);

      const storeName = item.seller?.name || "Store";
      const storeAvatar = resolveAvatarUri(item.seller?.avatar);
      const primaryTag =
        item.tags?.find((tag) => String(tag || "").trim()) ||
        item.category ||
        "Featured";
      const likeCount = Number(item.likes_count || 0);
      const commentCount = Number(item.comments_count || 0);

      const openStore = () => {
        if (item.seller?.id) {
          navigation.navigate("Store", {
            sellerId: item.seller.id,
            seller: item.seller,
          });
        }
      };

      return (
        <View style={styles.reelContainer}>
          {/* Center tap toggles play/pause. The overlay below uses
              pointerEvents="box-none" so only its interactive children
              (store, product, actions) capture touches; taps elsewhere
              fall through to this layer. */}
          <Pressable style={styles.videoWrap} onPress={togglePlay}>
            <Video
              ref={(ref) => {
                if (ref) videoRefs.current[item.id] = ref;
              }}
              source={source}
              style={styles.video}
              resizeMode="cover"
              repeat
              paused={!isActive || paused}
              poster={item.thumbnail_url || null}
              posterResizeMode="cover"
              // ABR: keep a modest forward buffer so rendition switches are
              // smooth without over-fetching data on metered connections.
              bufferConfig={{
                minBufferMs: 5000,
                maxBufferMs: 15000,
                bufferForPlaybackMs: 1500,
                bufferForPlaybackAfterRebufferMs: 3000,
              }}
            />
          </Pressable>

          <View
            style={[
              styles.overlayShell,
              { paddingBottom: isWide ? 24 : FLOATING_TAB_OFFSET },
            ]}
            pointerEvents="box-none"
          >
            <View style={styles.reelBottomRow}>
              {/* Left: store + tiny product card */}
              <View style={styles.leftCol}>
                <Pressable style={styles.storeRow} onPress={openStore}>
                  <View style={styles.storeAvatarWrap}>
                    {storeAvatar ? (
                      <Image source={{ uri: storeAvatar }} style={styles.storeAvatar} />
                    ) : (
                      <View style={styles.storeAvatarFallback}>
                        <Ionicons name="storefront-outline" size={14} color={colors.primary} />
                      </View>
                    )}
                  </View>
                  <View style={styles.storeMeta}>
                    <Text style={styles.storeName} numberOfLines={1}>
                      {storeName}
                    </Text>
                    <Text style={styles.storeSub} numberOfLines={1}>
                      {primaryTag}
                    </Text>
                  </View>
                </Pressable>

                {/* Tiny product card under the store */}
                <Pressable
                  style={styles.tinyProductCard}
                  onPress={() =>
                    item.product_id
                      ? navigation.navigate("ProductDetail", {
                          product: { id: item.product_id },
                        })
                      : null
                  }
                >
                  {item.thumbnail_url ? (
                    <Image source={{ uri: item.thumbnail_url }} style={styles.tinyProductThumb} />
                  ) : (
                    <View style={styles.tinyProductThumbFallback}>
                      <Ionicons name="image-outline" size={16} color={colors.muted} />
                    </View>
                  )}
                  <View style={styles.tinyProductMeta}>
                    <Text style={styles.tinyProductTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {item.price != null ? (
                      <Text style={styles.tinyProductPrice}>
                        GH₵ {Number(item.price).toLocaleString()}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              </View>

              {/* Right: like / comment / tag actions stacked vertically */}
              <View style={styles.actionCol}>
                <Pressable style={styles.actionBtn}>
                  <View style={styles.actionIconWrap}>
                    <Ionicons name="heart" size={24} color="#fff" />
                  </View>
                  <Text style={styles.actionLabel}>{likeCount}</Text>
                </Pressable>

                <Pressable style={styles.actionBtn}>
                  <View style={styles.actionIconWrap}>
                    <Ionicons name="chatbubble" size={24} color="#fff" />
                  </View>
                  <Text style={styles.actionLabel}>{commentCount}</Text>
                </Pressable>

                <Pressable style={styles.actionBtn}>
                  <View style={[styles.actionIconWrap, styles.tagIconWrap]}>
                    <Ionicons name="pricetag" size={22} color={colors.primary} />
                  </View>
                  <Text style={styles.actionLabel}>Tag</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      );
    },
  );

  const renderReel = useCallback(
    ({ item }) => (
      <ReelItem
        item={item}
        isActive={item.id === activeId}
        navigation={navigation}
        paused={paused}
        togglePlay={togglePlay}
        videoRefs={videoRefs}
      />
    ),
    [activeId, navigation, paused, togglePlay, videoRefs],
  );

  return (
    <View style={styles.wrapper}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <View style={styles.feedArea}>
          <FlatList
            data={reels}
            keyExtractor={(item) => item.id?.toString?.() || String(item.id)}
            renderItem={renderReel}
            pagingEnabled
            showsVerticalScrollIndicator={false}
            getItemLayout={(data, index) => ({
              length: ITEM_HEIGHT,
              offset: ITEM_HEIGHT * index,
              index,
            })}
            initialNumToRender={2}
            maxToRenderPerBatch={2}
            windowSize={3}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: "#000",
    paddingTop: TOP_INSET,
  },
  feedArea: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  reelContainer: {
    height: ITEM_HEIGHT,
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
    height: ITEM_HEIGHT,
  },
  overlayShell: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
  },
  reelBottomRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 10,
  },
  leftCol: {
    flex: 1,
    minWidth: 0,
  },
  storeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  storeAvatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  storeAvatar: {
    width: "100%",
    height: "100%",
  },
  storeAvatarFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  storeMeta: {
    flex: 1,
    minWidth: 0,
  },
  storeName: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
    textShadowColor: "rgba(0,0,0,0.85)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  storeSub: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "600",
    marginTop: 1,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    textShadowColor: "rgba(0,0,0,0.85)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  tinyProductCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 14,
    padding: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.7)",
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
    maxWidth: 260,
  },
  tinyProductThumb: {
    width: 42,
    height: 42,
    borderRadius: 10,
  },
  tinyProductThumbFallback: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  tinyProductMeta: {
    flex: 1,
    minWidth: 0,
  },
  tinyProductTitle: {
    color: colors.dark,
    fontSize: 12,
    fontWeight: "800",
  },
  tinyProductPrice: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
  },
  actionCol: {
    alignItems: "center",
    gap: 18,
    paddingBottom: 4,
  },
  actionBtn: {
    alignItems: "center",
    gap: 4,
  },
  actionIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  tagIconWrap: {
    backgroundColor: "#fff",
  },
  actionLabel: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
    textShadowColor: "rgba(0,0,0,0.85)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});

export default FeedScreen;