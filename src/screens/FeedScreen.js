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
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { FeedVideo } from "../components/FeedVideo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../context/ThemeContext";
import { useAppStyles } from "../hooks/useAppStyles";
import { fetchProductReels } from "../services/uploadReel";
import { getReelSource, preloadReel } from "../services/reelVideoCache";
import { trackEvent } from "../services/feedPersonalizationService";
import { useResponsive } from "../hooks/useResponsive";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { supabase } from "../lib/supabase";
import { playLikeSound } from "../lib/sounds";
import { R2_FOLDERS, resolveMediaUrl } from "../services/r2Storage";
import { shareReel, shareProduct } from "../utils/shareUtils";
import { radius } from "../theme/colors";

const REVIEW_STAR_COLOR = "#F97316";

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

const resolveAvatarUri = (rawValue) =>
  resolveMediaUrl(rawValue, R2_FOLDERS.PROFILE);

export const FeedScreen = ({ route, navigation }) => {
  const [reels, setReels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [paused, setPaused] = useState(false);
  // Feed-wide mute state — lifted HERE (not per-reel) so the speaker setting
  // stays consistent across every scroll/swipe: muting one reel mutes them
  // all, and returning to a reel keeps whatever the user last chose.
  // Web starts muted (autoplay policies); native starts unmuted.
  const [isMuted, setIsMuted] = useState(Platform.OS === "web");
  const screenIsFocused = useIsFocused();
  const { isWide } = useResponsive();
  const { colors: themeColors } = useTheme();
  const { user } = useAuth();
  const styles = useAppStyles((c) => buildFeedStyles(c));
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

  // Feed-wide mute toggle — passed down to every reel (stable identity).
  const toggleMute = useCallback(() => setIsMuted((v) => !v), []);

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
  //
  // IMPORTANT — created ONCE per screen mount via the useState lazy
  // initializer. Defining this component inline (plain const) gave it a NEW
  // type identity on every FeedScreen render (e.g. every pause/play toggle),
  // so React unmounted and remounted every reel subtree — destroying and
  // recreating the video element, which showed a thumbnail flash and
  // restarted playback from zero. Values previously closed over from this
  // scope (styles / themeColors / isWide) are passed as props instead.
  const [ReelItem] = useState(() =>
    React.memo(
      ({
        item,
        isActive,
        navigation,
        paused,
        togglePlay,
        screenIsFocused,
        styles,
        themeColors,
        isWide,
        isMuted,
        onToggleMute,
      }) => {
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
      // Mirror of the video's current time, kept in a ref (no re-renders) so
      // the hold-to-rewind stepper always reads a fresh position.
      const currentTimeRef = useRef(0);
      // TikTok-style hold gestures: press-and-hold the right half → 2x speed
      // forward; left half → continuous rewind; both until release. A short
      // tap still toggles play/pause.
      const [playbackRate, setPlaybackRate] = useState(1);
      const [holdAction, setHoldAction] = useState(null); // "forward" | "rewind" | null
      // NOTE: mute is NOT owned here any more — `isMuted` / `onToggleMute`
      // come from FeedScreen so the setting persists across scrolling.
      const holdTimerRef = useRef(null);
      const rewindIntervalRef = useRef(null);
      const holdActivatedRef = useRef(false);
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

      // Platform-aware seek used by the hold-to-rewind gesture:
      // react-native-video v6 exposes ref.seek(); the web backend forwards
      // the DOM <video> element as the ref (currentTime assignment).
      const seekTo = useCallback(
        (seconds) => {
          const ref = videoRef.current;
          if (!ref) return;
          try {
            if (Platform.OS === "web") {
              ref.currentTime = seconds;
            } else if (typeof ref.seek === "function") {
              ref.seek(seconds);
            }
            currentTimeRef.current = seconds;
          } catch (e) {
            logReel("seek failed", e);
          }
        },
        [logReel],
      );

      // ── Hold-to-seek (TikTok-style) ────────────────────────────────────────
      const clearHoldTimers = useCallback(() => {
        if (holdTimerRef.current) {
          clearTimeout(holdTimerRef.current);
          holdTimerRef.current = null;
        }
        if (rewindIntervalRef.current) {
          clearInterval(rewindIntervalRef.current);
          rewindIntervalRef.current = null;
        }
      }, []);

      // Ends any active hold. Returns true when the gesture was a hold
      // (already consumed) and false for a quick tap (caller should toggle
      // play/pause).
      const endHold = useCallback(() => {
        clearHoldTimers();
        if (!holdActivatedRef.current) return false;
        holdActivatedRef.current = false;
        setPlaybackRate(1);
        setHoldAction(null);
        return true;
      }, [clearHoldTimers]);

      const handleVideoPressIn = useCallback(
        (e) => {
          const locationX = e.nativeEvent?.locationX ?? 0;
          const side = locationX < SCREEN_WIDTH / 2 ? "left" : "right";
          // Grace period so a quick tap doesn't trigger seeking.
          holdTimerRef.current = setTimeout(() => {
            holdActivatedRef.current = true;
            if (side === "right") {
              // Smooth continuous forward: bump the playback rate (TikTok's
              // 2x hold-to-fast-forward).
              setHoldAction("forward");
              setPlaybackRate(2);
            } else {
              // Continuous rewind: step backwards from the live position
              // until release (or the start of the video).
              setHoldAction("rewind");
              rewindIntervalRef.current = setInterval(() => {
                const next = Math.max(0, currentTimeRef.current - 0.4);
                seekTo(next);
                if (next <= 0) endHold();
              }, 80);
            }
          }, 280);
        },
        [seekTo, endHold],
      );

      const handleVideoPressOut = useCallback(() => {
        // Ends any active hold (restores 1x rate, clears the rewind timer).
        // Tap toggling is handled by onPress, which — unlike onPressOut —
        // does not fire when the FlatList steals the touch for scrolling.
        endHold();
      }, [endHold]);

      const handleVideoTap = useCallback(() => {
        // Ignore the release of a completed hold — the gesture already ran.
        if (holdActivatedRef.current) return;
        fireTapPulse();
        togglePlay();
      }, [fireTapPulse, togglePlay]);

      // ── Centered control-strip hold actions ────────────────────────────────
      // • Hold ⏩ → VISIBLE fast-forward: playback rate goes to 1.5X (with an
      //   on-screen badge) so you actually watch the video speed up.
      // • Hold ⏪ → gradual rewind: the position steps backwards continuously
      //   while held (same cadence as the TikTok-style hold).
      // A quick tap intentionally does nothing — actions run only while held.
      const stripHoldIntervalRef = useRef(null);
      // Anchor for the wall-clock-driven rewind (start position + start time).
      const stripHoldRef = useRef({ startPos: 0, startedAt: 0 });

      const endStripHold = useCallback(() => {
        if (stripHoldIntervalRef.current) {
          clearInterval(stripHoldIntervalRef.current);
          stripHoldIntervalRef.current = null;
        }
      }, []);

      // Released (or reel scrolled away): restore normal 1X playback.
      const endStripActions = useCallback(() => {
        endStripHold();
        setPlaybackRate(1);
        setHoldAction(null);
      }, [endStripHold]);

      // Release safety-net on unmount (e.g. reel scrolls away mid-hold).
      useEffect(() => endStripHold, [endStripHold]);

      const startStripForward = useCallback(() => {
        fireTapPulse();
        setHoldAction("forward");
        setPlaybackRate(1.5);
      }, [fireTapPulse]);

      const startStripRewind = useCallback(() => {
        fireTapPulse();
        // Anchor the rewind to WALL-CLOCK time: every tick seeks to exactly
        // where the video should be at that instant (start position minus
        // 1.5 seconds of video per real second elapsed). Because each target
        // is computed fresh from the clock — never from the previous target —
        // slow or fast seeks cannot cause drift, and the motion stays at a
        // true, even 1.5X in reverse.
        stripHoldRef.current = {
          startPos: currentTimeRef.current || 0,
          startedAt: Date.now(),
        };
        setHoldAction("rewind");
        stripHoldIntervalRef.current = setInterval(() => {
          const { startPos, startedAt } = stripHoldRef.current;
          const target = Math.max(
            0,
            startPos - ((Date.now() - startedAt) / 1000) * 1.5,
          );
          seekTo(target);
          if (target <= 0) endStripActions();
        }, 120);
      }, [fireTapPulse, seekTo, endStripActions]);

      const handleControlsTogglePlay = useCallback(() => {
        fireTapPulse();
        togglePlay();
      }, [fireTapPulse, togglePlay]);

      useEffect(() => clearHoldTimers, [clearHoldTimers]);

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
      // Tags can come from the DB as an array OR (rarely) as a comma-separated
      // string — normalize so the first non-empty tag is always picked.
      const itemTags = Array.isArray(item.tags)
        ? item.tags
        : typeof item.tags === "string"
        ? item.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [];
      const primaryTag =
        itemTags.find((tag) => String(tag || "").trim()) ||
        item.category ||
        "Featured";
      const baseLikeCount = Number(item.likes_count || 0);
      const baseCommentCount = Number(item.comments_count || 0);

      // Product-based actions (like / comment / tag) operate on the linked
      // product, mirroring the ProductDetail screen, not the video itself.
      const { user } = useAuth();
      const toast = useToast();
      const productId = item.product_id;

      // --- Like (product wishlist) with optimistic update + pop animation ---
      const [isWishlisted, setIsWishlisted] = useState(false);
      const [likeCount, setLikeCount] = useState(baseLikeCount);
      const likeAnim = useRef(new Animated.Value(1)).current;
      const likeBurstAnim = useRef(new Animated.Value(0)).current;

      useEffect(() => {
        let mounted = true;
        const checkWishlist = async () => {
          if (!user || !productId || !supabase) return;
          const { data } = await supabase
            .from("express_wishlists")
            .select("id")
            .eq("user_id", user.id)
            .eq("product_id", productId)
            .maybeSingle();
          if (!mounted) return;
          // maybeSingle() returns null (not an error) when no row exists.
          setIsWishlisted(!!data);
        };
        checkWishlist();
        return () => {
          mounted = false;
        };
      }, [user, productId]);

      const playLikeAnimation = useCallback(() => {
        likeAnim.setValue(0.6);
        Animated.spring(likeAnim, {
          toValue: 1,
          friction: 3,
          tension: 220,
          useNativeDriver: true,
        }).start();
        likeBurstAnim.setValue(0);
        Animated.timing(likeBurstAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }).start();
      }, [likeAnim, likeBurstAnim]);

      const toggleLike = useCallback(async () => {
        if (!user) {
          toast.info("Sign in required", "Please sign in to like this product");
          return;
        }
        if (!productId || !supabase) return;

        // Optimistic update: flip state + count immediately for snappy UX.
        const willLike = !isWishlisted;
        setIsWishlisted(willLike);
        setLikeCount((c) => Math.max(0, c + (willLike ? 1 : -1)));
        if (willLike) {
          playLikeAnimation();
          playLikeSound();
        }

        try {
          if (!willLike) {
            await supabase
              .from("express_wishlists")
              .delete()
              .eq("user_id", user.id)
              .eq("product_id", productId);
          } else {
            await supabase.from("express_wishlists").insert({
              user_id: user.id,
              product_id: productId,
            });
          }
          // Personalization signal: like/unlike from the reels feed.
          // Forward whatever product metadata is on the reel record so
          // the scorer doesn't need an extra round-trip.
          const productFromItem = item && item.product;
          const sellerField =
            productFromItem && productFromItem.seller_id;
          const sellerId =
            typeof sellerField === "string"
              ? sellerField
              : sellerField && sellerField.id;
          trackEvent(willLike ? "like" : "unlike", {
            productId,
            categoryId:
              productFromItem && productFromItem.category_id
                ? productFromItem.category_id
                : undefined,
            category:
              productFromItem && productFromItem.category
                ? productFromItem.category
                : undefined,
            sellerId,
          });
        } catch (err) {
          // Roll back on failure.
          setIsWishlisted(!willLike);
          setLikeCount((c) => Math.max(0, c + (willLike ? -1 : 1)));
          toast.error("Error", err.message);
        }
      }, [user, isWishlisted, productId, toast, playLikeAnimation, item]);

      // --- Comment: own modal in the feed, backed by PRODUCT comments
      // (express_reviews + express_review_comments), mirroring the
      // ProductDetail screen. ---
      const [commentModalVisible, setCommentModalVisible] = useState(false);
      const [comments, setComments] = useState([]);
      const [commentCount, setCommentCount] = useState(baseCommentCount);
      const [commentText, setCommentText] = useState("");
      const [commentPosting, setCommentPosting] = useState(false);
      const [commentsLoading, setCommentsLoading] = useState(false);

      const loadComments = useCallback(async () => {
        if (!productId || !supabase) return;
        setCommentsLoading(true);
        try {
          // Pull approved product reviews that have a comment, newest first.
          const { data: reviews } = await supabase
            .from("express_reviews")
            .select(
              "id, product_id, user_id, rating, comment, created_at, express_profiles!express_reviews_user_id_fkey(full_name, avatar_url)",
            )
            .eq("product_id", productId)
            .eq("is_approved", true)
            .not("comment", "is", null)
            .order("created_at", { ascending: false })
            .limit(50);

          const rows = (reviews ?? [])
            .filter((r) => String(r.comment || "").trim())
            .map((r) => {
              const profile = Array.isArray(r.express_profiles)
                ? r.express_profiles[0]
                : r.express_profiles;
              return {
                id: r.id,
                review_id: r.id,
                user_id: r.user_id,
                rating: r.rating,
                comment: r.comment,
                created_at: r.created_at,
                author_name: profile?.full_name || "Customer",
                author_avatar: profile?.avatar_url || null,
              };
            });
          setComments(rows);
          setCommentCount(rows.length);
        } catch (e) {
          console.warn("loadComments error:", e);
        } finally {
          setCommentsLoading(false);
        }
      }, [productId]);

      const openCommentModal = useCallback(() => {
        setCommentModalVisible(true);
        loadComments();
      }, [loadComments]);

      const submitComment = useCallback(async () => {
        const trimmed = String(commentText).trim();
        if (!trimmed) return;
        if (!user) {
          toast.info("Sign in required", "Please sign in to comment");
          return;
        }
        if (!productId || !supabase) return;
        setCommentPosting(true);
        try {
          // A feed comment is a product review with a comment (default 5-star
          // rating). Users may post MULTIPLE comments, so we always INSERT a
          // new row rather than upserting an existing one.
          const { data, error } = await supabase
            .from("express_reviews")
            .insert({
              product_id: productId,
              user_id: user.id,
              rating: 5,
              comment: trimmed,
              is_approved: true,
            })
            .select(
              "id, product_id, user_id, rating, comment, created_at, express_profiles!express_reviews_user_id_fkey(full_name, avatar_url)",
            )
            .single();
          if (error) throw error;
          const saved = data;

          const profile = Array.isArray(saved.express_profiles)
            ? saved.express_profiles[0]
            : saved.express_profiles;
          const newComment = {
            id: saved.id,
            review_id: saved.id,
            user_id: saved.user_id,
            rating: saved.rating,
            comment: saved.comment,
            created_at: saved.created_at,
            author_name: profile?.full_name || "You",
            author_avatar: profile?.avatar_url || null,
          };

          // Prepend the new comment to the top of the list.
          setComments((prev) => [newComment, ...prev]);
          setCommentCount((c) => c + 1);
          setCommentText("");
          toast.success(
            "Comment posted",
            "Your comment was added to the product",
          );
        } catch (err) {
          toast.error("Error", err.message);
        } finally {
          setCommentPosting(false);
        }
      }, [commentText, user, productId, toast]);

      const handleComment = useCallback(() => {
        openCommentModal();
      }, [openCommentModal]);

      const handleTag = useCallback(async () => {
        if (!productId) return;
        try {
          const result = await shareProduct(productId, item.title);
          if (result.success) {
            toast.success("Product shared!", "Share link copied to clipboard");
          } else {
            toast.error("Failed to share", result.error || "Please try again");
          }
        } catch (error) {
          toast.error("Error", "Failed to share product");
          console.error("Error sharing product:", error);
        }
      }, [productId, item.title, toast]);

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
          <FeedVideo
            ref={videoRef}
            source={source}
            style={styles.video}
            resizeMode="cover"
            repeat
            // CRITICAL (Android/Fabric): react-native-video is a LEGACY
            // component rendered through the interop layer (no codegenConfig),
            // and on the new architecture its native view participates in
            // touch dispatch ABOVE Fabric siblings — swallowing every tap and
            // press in the video's bounds no matter what zIndex the gesture
            // layer uses. The video never needs touches (the invisible
            // gesture layer below owns them), so disable its interactivity
            // entirely.
            pointerEvents="none"
            muted={isMuted}
            controls={false}
            rate={playbackRate}
            // Freeze REAL playback while reverse-scrubbing: otherwise the
            // decoder keeps playing forward between our backward seeks, the
            // picture appears stuck, and the seeks pile up into one big jump.
            // Pausing lets every 1.5X-rate seek render its own frame, giving
            // smooth visible reverse playback. On release the hold flag clears
            // and playback resumes exactly where the rewind stopped.
            paused={
              !screenIsFocused ||
              !isActive ||
              paused ||
              holdAction === "rewind"
            }
            onLoad={(meta) => logReel("onLoad", meta?.duration, source?.uri)}
            onReadyForDisplay={() =>
              logReel("onReadyForDisplay", source?.uri)
            }
            onBuffer={(event) =>
              logReel("onBuffer", event?.isBuffering, source?.uri)
            }
            onError={(error) => logReel("onError", error, source?.uri)}
            onProgress={(progress) => {
              if (progress?.currentTime != null) {
                logReel(
                  "onProgress",
                  progress.currentTime,
                  progress.playableDuration,
                );
              }
              // Keep the ref fresh for the hold-to-rewind stepper (no
              // re-renders — there is no visible progress UI anymore).
              if (progress?.currentTime != null) {
                currentTimeRef.current = progress.currentTime;
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

          {/* Invisible touch layer rendered ABOVE the video. This is the key
              fix for "taps don't work": the native video surface (ExoPlayer on
              Android) and the web <video> element can swallow touches aimed at
              a parent wrapper, so the gesture layer must sit ON TOP of it.
              • tap → play/pause (onPress — never fires when the FlatList
                steals the touch for scrolling)
              • hold left/right → rewind / 2x forward until release */}
          <Pressable
            style={styles.videoTouchLayer}
            // collapsable={false} stops Android from optimizing the layer out
            // of the native view tree, and zIndex pins it above the video
            // (matters on the new architecture where legacy-view ordering
            // can place the player surface above Fabric siblings).
            collapsable={false}
            onPressIn={handleVideoPressIn}
            onPressOut={handleVideoPressOut}
            onPress={handleVideoTap}
          >
            {/* NOTE: the hold indicator badge lives in the controls layer
                ABOVE this touch layer (single instance). It previously also
                rendered here and showed doubled-up next to the controls-layer
                badge once the control strips went transparent. */}
          </Pressable>

          {/* Centered player controls — the FIX for "controls don't work".
              Rendered as a sibling ABOVE the touch layer and pinned to the
              exact center of the reel with a zIndex ABOVE the gesture layer
              but BELOW all other page buttons (see style comments).
              Hold-to-seek: ⏪/⏩ scrub gradually while held (no jump on tap).
              • hold ⏪ = rewind   • tap = play/pause (resumes in place)
              • hold ⏩ = fast-forward */}
          <View
            style={styles.centerControlsLayer}
            pointerEvents="box-none"
            collapsable={false}
          >
            <View style={styles.centerControlsRow}>
              <Pressable
                style={styles.controlSideBtn}
                onPressIn={startStripRewind}
                onPressOut={endStripActions}
                hitSlop={6}
              >
                <Ionicons name="play-back" size={18} color="#fff" />
                <Text style={styles.controlSideLabel}>rew</Text>
              </Pressable>

              <Pressable
                style={styles.controlMainBtn}
                onPress={handleControlsTogglePlay}
                hitSlop={6}
              >
                {/* Pulsing halo only while user-paused (same behaviour as the
                    previous paused-state button). */}
                {paused ? (
                  <Animated.View
                    pointerEvents="none"
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
                ) : null}
                <Ionicons
                  name={paused ? "play" : "pause"}
                  size={28}
                  color="#fff"
                />
              </Pressable>

              <Pressable
                style={styles.controlSideBtn}
                onPressIn={startStripForward}
                onPressOut={endStripActions}
                hitSlop={6}
              >
                <Ionicons name="play-forward" size={18} color="#fff" />
                <Text style={styles.controlSideLabel}>fwd</Text>
              </Pressable>
            </View>

            {/* Hold indicator — shown ABOVE the control cards while an action
                is active: "1.5x" while ⏩ is held, "rewind" while ⏪ is held.
                Purely visual — pointerEvents="none". */}
            {holdAction ? (
              <View style={styles.holdBadge} pointerEvents="none">
                <View style={styles.holdBadgePill}>
                  <Ionicons
                    name={
                      holdAction === "forward"
                        ? "play-forward-outline"
                        : "play-back-outline"
                    }
                    size={14}
                    color="#fff"
                  />
                  <Text style={styles.holdBadgeText}>
                    {holdAction === "forward" ? "▶ 1.5x" : "◀ 1.5x"}
                  </Text>
                </View>
              </View>
            ) : null}

            {/* One-shot tap ripple — lives HERE (above the control columns)
                so the feedback ring is fully visible and dead-centre of the
                screen on every tap, instead of rendering buried underneath
                the translucent strips in the touch layer below.
                Purely visual — pointerEvents="none". */}
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
          </View>

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
                      <Image
                        source={{ uri: storeAvatar }}
                        style={styles.storeAvatar}
                      />
                    ) : (
                      <View style={styles.storeAvatarFallback}>
                        <Ionicons
                          name="storefront-outline"
                          size={14}
                          color={themeColors.primary}
                        />
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
                    <Image
                      source={{ uri: item.thumbnail_url }}
                      style={styles.tinyProductThumb}
                    />
                  ) : (
                    <View style={styles.tinyProductThumbFallback}>
                      <Ionicons
                        name="image-outline"
                        size={16}
                        color={themeColors.muted}
                      />
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

              {/* Right: mute / like / comment / tag actions stacked vertically.
                  Mute is a video control but lives at the top of this rail so
                  it's thumb-reachable; the rest act on the linked PRODUCT
                  (like the ProductDetail screen), not the video. */}
              <View style={styles.actionCol}>
                {/* Mute/unmute — feed-wide setting (persists across scrolls),
                    drives the FeedVideo `muted` prop. */}
                <Pressable
                  style={styles.actionBtn}
                  onPress={onToggleMute}
                >
                  <View style={styles.actionIconWrap}>
                    <Ionicons
                      name={isMuted ? "volume-mute" : "volume-high"}
                      size={22}
                      color="#fff"
                    />
                  </View>
                  <Text style={styles.actionLabel}>
                    {isMuted ? "Muted" : "Sound"}
                  </Text>
                </Pressable>

                <Pressable style={styles.actionBtn} onPress={toggleLike}>
                  <View style={styles.actionIconWrap}>
                    {/* Burst ring behind the heart on like */}
                    <Animated.View
                      pointerEvents="none"
                      style={[
                        styles.likeBurst,
                        {
                          opacity: likeBurstAnim.interpolate({
                            inputRange: [0, 0.4, 1],
                            outputRange: [0, 0.7, 0],
                          }),
                          transform: [
                            {
                              scale: likeBurstAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0.4, 1.8],
                              }),
                            },
                          ],
                        },
                      ]}
                    />
                    <Animated.View style={{ transform: [{ scale: likeAnim }] }}>
                      <Ionicons
                        name={isWishlisted ? "heart" : "heart-outline"}
                        size={24}
                        color={
                          isWishlisted ? themeColors.accent : themeColors.light
                        }
                      />
                    </Animated.View>
                  </View>
                  <Text style={styles.actionLabel}>{likeCount}</Text>
                </Pressable>

                <Pressable style={styles.actionBtn} onPress={handleComment}>
                  <View style={styles.actionIconWrap}>
                    <Ionicons name="chatbubble" size={24} color="#fff" />
                  </View>
                  <Text style={styles.actionLabel}>{commentCount}</Text>
                </Pressable>

                <Pressable style={styles.actionBtn} onPress={handleTag}>
                  <View style={[styles.actionIconWrap, styles.tagIconWrap]}>
                    <Ionicons
                      name="pricetag"
                      size={22}
                      color={themeColors.primary}
                    />
                  </View>
                  <Text style={styles.actionLabel}>Tag</Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* Comment modal — own to the feed, posts reel-native comments */}
          <Modal
            visible={commentModalVisible}
            transparent
            animationType="slide"
            onRequestClose={() => setCommentModalVisible(false)}
          >
            <View style={styles.commentModalBackdrop}>
              <Pressable
                style={styles.commentModalBackdrop}
                onPress={() => setCommentModalVisible(false)}
              />
              <View style={styles.commentModalSheet}>
                <View style={styles.commentModalHandle} />
                <View style={styles.commentModalHeader}>
                  <Text style={styles.commentModalTitle}>
                    Comments ({commentCount})
                  </Text>
                  <Pressable
                    onPress={() => setCommentModalVisible(false)}
                    hitSlop={8}
                  >
                    <Ionicons name="close" size={22} color={themeColors.dark} />
                  </Pressable>
                </View>

                {commentsLoading ? (
                  <View style={styles.commentModalLoading}>
                    <ActivityIndicator color={themeColors.primary} />
                  </View>
                ) : (
                  <ScrollView
                    style={styles.commentList}
                    contentContainerStyle={styles.commentListContent}
                    keyboardShouldPersistTaps="handled"
                  >
                    {comments.length === 0 ? (
                      <Text style={styles.commentEmpty}>
                        No comments yet. Be the first!
                      </Text>
                    ) : (
                      comments.map((c) => (
                        <View key={c.id} style={styles.commentItem}>
                          <View style={styles.commentAvatarWrap}>
                            {c.author_avatar ? (
                              <Image
                                source={{ uri: c.author_avatar }}
                                style={styles.commentAvatar}
                              />
                            ) : (
                              <View style={styles.commentAvatarFallback}>
                                <Ionicons
                                  name="person"
                                  size={14}
                                  color={themeColors.primary}
                                />
                              </View>
                            )}
                          </View>
                          <View style={styles.commentBody}>
                            <View style={styles.commentAuthorRow}>
                              <Text style={styles.commentAuthor}>
                                {c.author_name}
                              </Text>
                              {c.rating ? (
                                <View style={styles.commentStars}>
                                  {[1, 2, 3, 4, 5].map((s) => (
                                    <Ionicons
                                      key={s}
                                      name={
                                        s <= c.rating ? "star" : "star-outline"
                                      }
                                      size={11}
                                      color={REVIEW_STAR_COLOR}
                                    />
                                  ))}
                                </View>
                              ) : null}
                            </View>
                            <Text style={styles.commentText}>{c.comment}</Text>
                          </View>
                        </View>
                      ))
                    )}
                  </ScrollView>
                )}

                <KeyboardStickyView style={styles.commentInputRow}>
                  <TextInput
                    style={styles.commentInput}
                    placeholder="Add a comment…"
                    placeholderTextColor={themeColors.muted}
                    value={commentText}
                    onChangeText={setCommentText}
                    multiline
                    editable={!commentPosting}
                  />
                  <Pressable
                    style={[
                      styles.commentSendBtn,
                      (!commentText.trim() || commentPosting) &&
                        styles.commentSendBtnDisabled,
                    ]}
                    onPress={submitComment}
                    disabled={!commentText.trim() || commentPosting}
                  >
                    {commentPosting ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Ionicons name="send" size={18} color="#fff" />
                    )}
                  </Pressable>
                </KeyboardStickyView>
              </View>
            </View>
          </Modal>
        </View>
      );
      },
    ),
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
        styles={styles}
        themeColors={themeColors}
        isWide={isWide}
        isMuted={isMuted}
        onToggleMute={toggleMute}
      />
    ),
    [
      activeId,
      navigation,
      paused,
      screenIsFocused,
      togglePlay,
      styles,
      themeColors,
      isWide,
      isMuted,
      toggleMute,
    ],
  );

  return (
    <View style={styles.wrapper}>
      {/* The feed is always a dark video canvas — status bar content stays
          LIGHT regardless of app theme. Unmounting restores the theme-driven
          bar set by App.js (expo-status-bar / RN StatusBar stack). */}
      <StatusBar style="light" />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={themeColors.primary} />
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

const buildFeedStyles = (c) =>
  StyleSheet.create({
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
    // Invisible full-size touch layer sitting ON TOP of the video surface —
    // owns tap = play/pause and hold-left/right = rewind / 2x forward.
    videoTouchLayer: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 2,
    },
    centerPlayPulse: {
      position: "absolute",
      // 96×96 halo centred BOTH vertically and horizontally inside the
      // play/pause card: anchor the top-left corner at the card's exact
      // centre (50%/50%) then pull back by half the halo size (-48px) so
      // the halo expands symmetrically around the play/pause icon.
      left: "50%",
      top: "50%",
      marginLeft: -48,
      marginTop: -48,
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: "rgba(255,255,255,0.12)",
    },
    // ── Centered control bar ("controls don't work" fix) ────────────────────
    // In-flow flex child of reelContainer — flex:1 makes it cover the FULL
    // feed screen height (the other siblings are absolutely positioned, so
    // this layer gets all the layout space). zIndex 3 puts it ABOVE the
    // invisible gesture layer (zIndex 2) so its cards stay tappable, but
    // BELOW every other button on the page (the overlay shell renders with
    // a higher zIndex).
    centerControlsLayer: {
      flex: 1,
      zIndex: 3,
      elevation: 3,
    },
    // Flex row stretching its three control cards across that full height.
    // The cards split the FULL feed screen width evenly (flex: 1 each).
    centerControlsRow: {
      flex: 1,
      flexDirection: "row",
      alignItems: "stretch",
    },
    // INVISIBLE tap zones: the three playback strips keep their full-height,
    // third-of-screen hit areas but render nothing at all — transparent
    // background, no border/shadow, and opacity 0 hides the icons/labels/
    // pulse halo too. `opacity` does NOT disable touches, so rewind /
    // play-pause / forward keeps working exactly as before.
    controlMainBtn: {
      flex: 1,
      alignSelf: "stretch",
      alignItems: "center",
      justifyContent: "center",
      // Clip the pulsing halo to the card while paused.
      overflow: "hidden",
      borderRadius: 0,
      backgroundColor: "transparent",
      borderWidth: 0,
      borderColor: "transparent",
      shadowColor: "transparent",
      shadowOpacity: 0,
      shadowRadius: 0,
      shadowOffset: { width: 0, height: 0 },
      opacity: 0,
    },
    controlSideBtn: {
      flex: 1,
      alignSelf: "stretch",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 0,
      backgroundColor: "transparent",
      borderWidth: 0,
      borderColor: "transparent",
      shadowColor: "transparent",
      shadowOpacity: 0,
      shadowRadius: 0,
      shadowOffset: { width: 0, height: 0 },
      opacity: 0,
    },
    controlSideLabel: {
      color: "#fff",
      fontSize: 9,
      fontWeight: "800",
      marginTop: -2,
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
    // Hold-gesture indicator (shown while fast-forwarding / rewinding).
    // Outer container anchors a full-width strip so the pill is ALWAYS
    // centred horizontally regardless of which parent renders it.
    holdBadge: {
      position: "absolute",
      top: 90,
      left: 0,
      right: 0,
      alignItems: "center",
    },
    holdBadgePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: "rgba(0, 0, 0, 0.55)",
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.18)",
    },
    holdBadgeText: {
      color: "#fff",
      fontSize: 12,
      fontWeight: "800",
    },
    video: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: SCREEN_WIDTH,
      height: ITEM_HEIGHT,
      zIndex: 0,
    },
    overlayShell: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 12,
      // Above the full-height control columns (zIndex 3) so the store row,
      // product card and mute/like/comment/tag rail paint over AND receive
      // touches before the playback strips underneath.
      zIndex: 10,
      elevation: 10,
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
      borderColor: c.border,
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
      color: c.light,
      fontSize: 14,
      fontWeight: "800",
      textShadowColor: "rgba(0,0,0,0.85)",
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4,
    },
    storeSub: {
      color: c.light,
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
      backgroundColor: c.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    tinyProductMeta: {
      flex: 1,
      minWidth: 0,
    },
    tinyProductTitle: {
      color: c.dark,
      fontSize: 12,
      fontWeight: "800",
    },
    tinyProductPrice: {
      color: c.primary,
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
      borderRadius: radius.full,
      backgroundColor: c.overlay,
      alignItems: "center",
      justifyContent: "center",
    },
    tagIconWrap: {
      backgroundColor: c.light,
    },
    actionLabel: {
      color: c.light,
      fontSize: 11,
      fontWeight: "800",
      textShadowColor: "rgba(0,0,0,0.85)",
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4,
    },
    likeBurst: {
      position: "absolute",
      width: 46,
      height: 46,
      borderRadius: 23,
      borderWidth: 2,
      borderColor: c.accent,
      backgroundColor: "transparent",
    },
    commentModalBackdrop: {
      flex: 1,
      backgroundColor: c.overlay,
      justifyContent: "flex-end",
    },
    commentModalSheet: {
      backgroundColor: c.light,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      maxHeight: "75%",
      paddingBottom: Platform.OS === "ios" ? 24 : 12,
    },
    commentModalHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.border,
      alignSelf: "center",
      marginTop: 8,
      marginBottom: 8,
    },
    commentModalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: "#F1F1F1",
    },
    commentModalTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: c.dark,
    },
    commentModalLoading: {
      paddingVertical: 40,
      alignItems: "center",
    },
    commentList: {
      maxHeight: 320,
    },
    commentListContent: {
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    commentEmpty: {
      textAlign: "center",
      color: c.muted,
      paddingVertical: 24,
    },
    commentItem: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 14,
    },
    commentAvatarWrap: {
      width: 32,
      height: 32,
      borderRadius: 16,
      overflow: "hidden",
      backgroundColor: "#F1F1F1",
    },
    commentAvatar: {
      width: 32,
      height: 32,
    },
    commentAvatarFallback: {
      width: 32,
      height: 32,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.border,
    },
    commentBody: {
      flex: 1,
    },
    commentAuthorRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 2,
    },
    commentStars: {
      flexDirection: "row",
      gap: 1,
    },
    commentAuthor: {
      fontSize: 13,
      fontWeight: "700",
      color: c.dark,
      marginBottom: 2,
    },
    commentText: {
      fontSize: 14,
      color: "#374151",
      lineHeight: 19,
    },
    commentInputRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 8,
      paddingHorizontal: 16,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: "#F1F1F1",
    },
    commentInput: {
      flex: 1,
      minHeight: 40,
      maxHeight: 100,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.full,
      paddingHorizontal: 14,
      paddingVertical: 9,
      fontSize: 14,
      color: c.dark,
    },
    commentSendBtn: {
      width: 40,
      height: 40,
      borderRadius: radius.full,
      backgroundColor: c.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    commentSendBtnDisabled: {
      opacity: 0.4,
    },
    reelTopRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      paddingTop: 8,
      paddingHorizontal: 4,
    },
    reelMenuButton: {
      width: 40,
      height: 40,
      borderRadius: radius.full,
      backgroundColor: c.overlay,
      alignItems: "center",
      justifyContent: "center",
    },
    menuBackdrop: {
      flex: 1,
      backgroundColor: c.overlay,
      justifyContent: "center",
      alignItems: "center",
    },
    menuCard: {
      width: "80%",
      maxWidth: 320,
      backgroundColor: c.light,
      borderRadius: 16,
      paddingVertical: 8,
      paddingHorizontal: 8,
      shadowColor: "#000",
      shadowOpacity: 0.25,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
    menuTitle: {
      fontSize: 14,
      fontWeight: "800",
      color: c.dark,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: "#EEF2F6",
    },
    menuItemRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 12,
    },
    menuItemText: {
      fontSize: 15,
      fontWeight: "700",
      color: "#EF4444",
    },
  });

export default FeedScreen;
