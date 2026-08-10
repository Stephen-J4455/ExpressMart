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
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { Video } from "react-native-video";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors } from "../theme/colors";
import { fetchProductReels } from "../services/uploadReel";
import { getReelSource, preloadReel } from "../services/reelVideoCache";
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
  const screenIsFocused = useIsFocused();
  const { isWide } = useResponsive();
  const logFeed = useCallback((...args) => {
    if (typeof __DEV__ === "undefined" || __DEV__) {
      console.log("[FeedScreen]", ...args);
    }
  }, []);

  // Read the cached reels payload (if fresh enough) so we can paint instantly.
  const loadReelsFromCache = useCallback(async () => {
    try {
      logFeed("reading cached reels payload");
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
      logFeed("saving reels cache", Array.isArray(data) ? data.length : 0);
      await AsyncStorage.setItem(REELS_CACHE_KEY, JSON.stringify(data));
      await AsyncStorage.setItem(REELS_CACHE_TS_KEY, Date.now().toString());
    } catch (e) {
      console.warn("Failed to cache reels:", e);
    }
  }, []);

  const loadReels = useCallback(async () => {
    logFeed("loading reels");
    // 1. Paint immediately from local cache (no network, saves data).
    const cached = await loadReelsFromCache();
    if (cached) {
      logFeed("using cached reels", cached.length);
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
        logFeed("network reels loaded", data.length);
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
    logFeed("mount load reels");
    loadReels();
  }, [loadReels]);

  useFocusEffect(
    useCallback(() => {
      if (route?.params?.refresh) {
        logFeed("route refresh requested");
        loadReels();
        navigation.setParams({ refresh: false });
      }
    }, [route?.params?.refresh, loadReels, navigation]),
  );

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    const centred = viewableItems.find((v) => v.isViewable);
    if (centred) {
      logFeed("viewable item active", centred.item?.id);
      setActiveId(centred.item.id);
      setPaused(false);
    }
  }).current;

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 60,
    minimumViewTime: 0,
  }).current;

  useEffect(() => {
    if (!screenIsFocused) {
      // Auto-pause for performance while the feed is backgrounded (e.g. when
      // the user opened a product/store page from a reel).
      setPaused(true);
    } else {
      // Resume when returning to the feed so the play button doesn't linger
      // from the backgrounded auto-pause.
      setPaused(false);
    }
  }, [screenIsFocused]);

  const togglePlay = useCallback(() => {
    if (paused) {
      logFeed("toggle play", activeId);
      setPaused(false);
    } else {
      logFeed("toggle pause", activeId);
      setPaused(true);
    }
  }, [activeId, paused]);

  // Warm the local cache for the neighbouring reels (one ahead, one behind) so
  // the next swipe plays from disk instead of re-streaming. The download runs
  // in the background and never blocks the active video.
  useEffect(() => {
    if (!activeId || reels.length === 0) return;
    const idx = reels.findIndex((r) => r.id === activeId);
    if (idx < 0) return;
    for (let offset = -1; offset <= 1; offset += 1) {
      const neighbour = reels[idx + offset];
      if (neighbour) {
        const url = neighbour.video_url || neighbour.hls_url;
        if (url) preloadReel(url);
      }
    }
  }, [activeId, reels]);

  // A single reel. Owns its own video source so it can resolve/swap to a
  // locally-cached file: on mount it checks disk (instant if previously
  // watched), and when it becomes the active item it downloads the MP4 to the
  // local cache so scrolling up and back plays from disk instead of re-streaming.
  const ReelItem = React.memo(
    ({ item, isActive, navigation, paused, togglePlay, screenIsFocused }) => {
      const itemId = item.id;
      const streamUrl = item.video_url || item.hls_url;
      // Resolve the best source: prefer a locally-cached copy (downloaded once)
      // and fall back to the streaming URL so playback never waits on the
      // download. When the cache finishes we swap to the local file URI.
      const [source, setSource] = useState(() => ({
        uri: streamUrl,
        isNetwork: true,
      }));
      const videoRef = useRef(null);
      // Looping pulse that only plays when the video is *user-paused* (so it
      // never flashes while scrolling or while the feed is backgrounded).
      const pulseAnim = useRef(new Animated.Value(0)).current;
      // One-shot ripple that fires on every center tap for tactile feedback.
      const tapAnim = useRef(new Animated.Value(0)).current;

      const fireTapPulse = useCallback(() => {
        tapAnim.stopAnimation();
        tapAnim.setValue(0);
        Animated.timing(tapAnim, {
          toValue: 1,
          duration: 450,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
      }, [tapAnim]);

      const logReel = useCallback(
        (...args) => {
          if (typeof __DEV__ === "undefined" || __DEV__) {
            console.log("[FeedScreen][Reel]", itemId, ...args);
          }
        },
        [itemId],
      );

      // Resolve the source (cached local file if present, else stream) once on
      // mount, then upgrade to the local copy when the background download
      // completes — without interrupting playback if it's already streaming.
      useEffect(() => {
        let mounted = true;
        getReelSource(streamUrl).then(({ uri, cached }) => {
          if (!mounted) return;
          setSource({ uri, isNetwork: !cached });
        });
        return () => {
          mounted = false;
        };
      }, [streamUrl]);

      useEffect(() => {
        // The looping pulse + play button only appear when the user has
        // explicitly paused. This prevents the button from flashing during a
        // scroll (where the outgoing item is briefly !isActive) or lingering
        // after returning from a product/store page (where the feed was
        // backgrounded and auto-paused).
        if (!paused) {
          pulseAnim.stopAnimation();
          pulseAnim.setValue(0);
          return;
        }

        const loop = Animated.loop(
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 900,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
              toValue: 0,
              duration: 900,
              easing: Easing.in(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
        );

        loop.start();
        return () => {
          loop.stop();
        };
      }, [isActive, paused, pulseAnim, screenIsFocused]);

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
          <Pressable
            style={styles.videoWrap}
            onPress={() => {
              fireTapPulse();
              togglePlay();
            }}
          >
            <Video
              ref={videoRef}
              source={source}
              style={styles.video}
              resizeMode="cover"
              repeat
              muted={Platform.OS === "web"}
              paused={!screenIsFocused || !isActive || paused}
              onLoad={(meta) => logReel("onLoad", meta?.duration, source?.uri)}
              onReadyForDisplay={() => logReel("onReadyForDisplay", source?.uri)}
              onBuffer={(event) => logReel("onBuffer", event?.isBuffering, source?.uri)}
              onError={(error) => logReel("onError", error, source?.uri)}
              onProgress={(progress) => {
                if (progress?.currentTime != null) {
                  logReel("onProgress", progress.currentTime, progress.playableDuration);
                }
              }}
              // ABR: keep a modest forward buffer so rendition switches are
              // smooth without over-fetching data on metered connections.
              bufferConfig={{
                minBufferMs: 10000,
                maxBufferMs: 30000,
                bufferForPlaybackMs: 2500,
                bufferForPlaybackAfterRebufferMs: 5000,
              }}
            />

            {/* One-shot ripple that fires on every center tap for tactile
                feedback, regardless of play/pause state. */}
            <Animated.View
              pointerEvents="none"
              style={[
                styles.centerTapRipple,
                {
                  opacity: tapAnim.interpolate({
                    inputRange: [0, 0.25, 1],
                    outputRange: [0, 0.55, 0],
                  }),
                  transform: [
                    {
                      scale: tapAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.6, 1.6],
                      }),
                    },
                  ],
                },
              ]}
            >
              <View style={styles.centerTapRing} />
            </Animated.View>

            {/* The play/pulse button only shows when the video is paused
                (never while scrolling or after navigating away/back). */}
            {paused ? (
              <Pressable
                style={styles.centerPlayHitTarget}
                onPress={() => {
                  fireTapPulse();
                  togglePlay();
                }}
              >
                <Animated.View
                  style={[
                    styles.centerPlayPulse,
                    {
                      opacity: pulseAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.22, 0.62],
                      }),
                      transform: [
                        {
                          scale: pulseAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 1.5],
                          }),
                        },
                      ],
                    },
                  ]}
                />
                <View style={styles.centerPlayButton}>
                  <Ionicons name="play" size={26} color="#fff" />
                </View>
              </Pressable>
            ) : null}
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
        screenIsFocused={screenIsFocused}
      />
    ),
    [activeId, navigation, paused, screenIsFocused, togglePlay],
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
            snapToInterval={ITEM_HEIGHT}
            snapToAlignment="start"
            decelerationRate="fast"
            getItemLayout={(data, index) => ({
              length: ITEM_HEIGHT,
              offset: ITEM_HEIGHT * index,
              index,
            })}
            initialNumToRender={2}
            maxToRenderPerBatch={2}
            windowSize={2}
            removeClippedSubviews={false}
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
  centerPlayHitTarget: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  centerPlayPulse: {
    position: "absolute",
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  centerPlayButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.42)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },
  centerTapRipple: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    // A simple expanding ring centred on the video for tap feedback.
  },
  centerTapRing: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.9)",
    backgroundColor: "rgba(255,255,255,0.08)",
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