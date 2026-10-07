// HomeScreen
// ---------------------------------------------------------------------------
// Social-feed style discovery home screen (the app's landing tab). Keeps the
// same AppHeader, theme tokens, and floating bottom-nav patterns.
//
// Filter tabs:
//   For You       — default, uses the ShopContext product feed (Upstash-cached)
//   Following     — products from sellers the user follows (express_follows)
//   Trending      — highest rated / discounted active products
//   New Arrivals  — most recently added active products
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { NativeViewGestureHandler } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { AppHeader } from "../components/AppHeader";
import { FeedProductCard } from "../components/FeedProductCard";
import { FeedCardPlaceholder } from "../components/FeedCardPlaceholder";
import { ProductCard } from "../components/ProductCard";
import { AdRenderer } from "../components/AdBanner";
import { StorefrontHomeScreen } from "./StorefrontHomeScreen";
import { useShop } from "../context/ShopContext";
import { useChat } from "../context/ChatContext";
import { useCart } from "../context/CartContext";
import { useTagAIAssistant } from "../context/TagAIAssistantContext";
import { compressProductImage } from "../utils/compressImage";
import { TagAIProductCardRow } from "../components/tagai/TagAIProductCard";
import { useAds } from "../context/AdsContext";
import { useTheme } from "../context/ThemeContext";
import { useAppStyles } from "../hooks/useAppStyles";
import { useResponsive } from "../hooks/useResponsive";
import { radius } from "../theme/colors";
import { supabase } from "../lib/supabase";
import { flashSaleService } from "../services/flashSaleService";
import { loadHiddenSellers } from "../utils/hiddenSellers";
import { injectAdsIntoProducts } from "../utils/adPlacement";
import { updateTabBarOnScroll, showTabBar } from "../utils/tabBarAutoHide";

const FILTERS = ["For You", "Following", "Trending", "New Arrivals"];
// Number of categories shown in the horizontal strip on Home — ranked by the
// most active products. Tapping "See More" opens the full Categories tab.
const TOP_CATEGORIES_LIMIT = 5;
const HOME_CATEGORIES_CACHE_KEY = "expressmart.cache.home_categories";
// Skeleton cards rendered in place of feed cards during the initial load.
// Rendered through the same FlatList as the real cards so the loading state
// keeps the page's full structure and is scrollable like the loaded feed.
const FEED_PLACEHOLDER_ITEMS = Array.from(
  { length: 6 },
  (_, i) => `feed-placeholder-${i}`,
);
const DESKTOP_RAIL_WIDTH = 400;
const CART_RAIL_BREAKPOINT = 1280;
const CART_RAIL_WIDTH = 360;

export const HomeScreen = ({ navigation }) => {
  const { colors: c } = useTheme();
  const styles = useAppStyles(buildHomeStyles);
  const { width } = useWindowDimensions();
  const { isDesktop: isWideScreen } = useResponsive();
  const isDesktop = Platform.OS === "web" && isWideScreen;
  const showCartRail = isDesktop && width >= CART_RAIL_BREAKPOINT;
  const { conversations } = useChat();
  const { addToCart, items: cartItems, total: cartTotal, itemCount } = useCart();
  const { messages: aiMessages, isThinking: aiIsThinking, sendMessage } =
    useTagAIAssistant();
  const [miniAiInput, setMiniAiInput] = useState("");
  const [miniAiVisionImage, setMiniAiVisionImage] = useState(null);
  const [pagerWidth, setPagerWidth] = useState(width);
  const [pagerScrollEnabled, setPagerScrollEnabled] = useState(true);
  const pagerRef = useRef(null);
  const pagerOffsetRef = useRef(0);
  const pagerLockedRef = useRef(false);
  const lockPager = useCallback((locked) => {
    pagerLockedRef.current = locked;
    if (locked) {
      pagerOffsetRef.current = Math.round(pagerOffsetRef.current);
    }
    setPagerScrollEnabled(!locked);
  }, []);
  const handlePagerScroll = useCallback((event) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    if (pagerLockedRef.current) {
      const lockedOffset = pagerOffsetRef.current;
      if (Math.abs(offsetX - lockedOffset) > 0.5) {
        pagerRef.current?.scrollTo({ x: lockedOffset, animated: false });
      }
      return;
    }
    pagerOffsetRef.current = offsetX;
  }, []);
  const { fetchAdsByPlacement } = useAds();
  const {
    products,
    loading,
    refresh,
    loadMore,
    hasMore,
    loadingMore,
    followedSellers,
  } = useShop();
  const recentConversations = useMemo(
    () =>
      [...(conversations || [])]
        .sort(
          (a, b) =>
            new Date(b.last_message_at || b.created_at || 0).getTime() -
            new Date(a.last_message_at || a.created_at || 0).getTime(),
        )
        .slice(0, 3),
    [conversations],
  );
  const handleMiniAiSend = useCallback(
    (text = miniAiInput) => {
      const prompt = text.trim();
      if ((!prompt && !miniAiVisionImage) || aiIsThinking) return;
      setMiniAiInput("");
      sendMessage(prompt, {
        image: miniAiVisionImage,
        navigateTo: (route, params) => navigation.navigate(route, params),
        addProductToCart: async (product, quantity) => {
          await addToCart(product, quantity);
        },
      });
      setMiniAiVisionImage(null);
    },
    [
      addToCart,
      aiIsThinking,
      miniAiInput,
      miniAiVisionImage,
      navigation,
      sendMessage,
    ],
  );
  const pickMiniAiVisionImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const compressed = await compressProductImage(
      asset.uri,
      Platform.OS === "web" ? asset.file || null : null,
    );
    if (Platform.OS === "web" && compressed.pickedFile) {
      const bytes = new Uint8Array(await compressed.pickedFile.arrayBuffer());
      let binary = "";
      for (let index = 0; index < bytes.length; index += 1) {
        binary += String.fromCharCode(bytes[index]);
      }
      setMiniAiVisionImage(`data:image/jpeg;base64,${btoa(binary)}`);
      return;
    }
    const base64 = await FileSystem.readAsStringAsync(compressed.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    setMiniAiVisionImage(`data:image/jpeg;base64,${base64}`);
  }, []);
  const [activeFilter, setActiveFilter] = useState("For You");
  const [refreshing, setRefreshing] = useState(false);
  const [topCategories, setTopCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  // Active flash sales surfaced as a horizontally-scrolling row on the home
  // feed. `null` means we haven't fetched yet (renders nothing); an empty
  // array means "fetched and there are no live flash sales" (also renders
  // nothing); a non-empty array renders the row.
  const [flashSales, setFlashSales] = useState(null);
  const [homeAds, setHomeAds] = useState([]);
  const [visibleVideoId, setVisibleVideoId] = useState(null);
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 60,
    minimumViewTime: 120,
  }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    const visibleVideo = viewableItems.find(
      (entry) => entry?.isViewable && entry.item?.__type === "product_video",
    );
    setVisibleVideoId(visibleVideo ? String(visibleVideo.item.id) : null);
  }).current;
  // Local mirror of the device-wide hidden-sellers list. Hydrated from
  // AsyncStorage on mount / focus so we don't show previously-hidden sellers
  // again on app launch (e.g. sellers the user hid from the feed in a prior
  // session before the menu action was removed).
  const [hiddenSellers, setHiddenSellers] = useState([]);

  // ── Auto-hiding header (direction-aware) ─────────────────────────────────
  // Same convention as the tab bar auto-hide util: finger swipe UP (reading
  // further down the feed) hides the header; swipe DOWN or being near the top
  // reveals it again. While hidden, the feed scrolls edge-to-edge — including
  // under the status bar.
  const insets = useSafeAreaInsets();
  // 1 = shown, 0 = hidden. The value is animated IMPERATIVELY from the scroll
  // handler (same pattern as the bottom tab bar in App.js) so the motion
  // starts in the same tick as the gesture instead of waiting for a React
  // re-render round-trip — that round-trip is what made it feel laggy.
  const headerAnim = useRef(new Animated.Value(1)).current;
  const headerHiddenRef = useRef(false);
  // Mirrors headerHiddenRef for pointerEvents only — never gates animation.
  const [headerHidden, setHeaderHidden] = useState(false);
  // Measured from the rendered header via onLayout (falls back to an estimate
  // for the first frame). Drives both the slide distance and the list's top
  // content inset.
  const [headerHeight, setHeaderHeight] = useState(insets.top + 76);
  const lastScrollYRef = useRef(0);

  const animateHeader = useCallback(
    (hide) => {
      if (headerHiddenRef.current === hide) return;
      headerHiddenRef.current = hide;
      setHeaderHidden(hide);
      Animated.timing(headerAnim, {
        toValue: hide ? 0 : 1,
        duration: 150, // snappier than the tab bar's 220ms
        easing: Easing.out(Easing.quad),
        useNativeDriver: true, // translateY only
      }).start();
    },
    [headerAnim],
  );

  const showHeader = useCallback(() => animateHeader(false), [animateHeader]);

  useEffect(() => {
    if (isDesktop) showHeader();
  }, [isDesktop, showHeader]);

  // ── Top categories: the 5 categories with the most active products ────────
  // Personalization note: when the signed-in user has enough event signal
  // (express_user_events), the "Picked for you" row at the top of the
  // feed could replace this with the user's top categories. For the
  // first cut we keep the existing recency-sorted strip and let the
  // personalized product order do the work; a follow-up can add a
  // separate `feed-top-categories` edge function that reads the same
  // signal map and returns {id, name}[].
  const loadTopCategories = useCallback(async () => {
    const toRanked = (rows) =>
      rows
        .map((cat) => ({
          id: cat.id,
          name: cat.name,
          icon: cat.icon,
          color: cat.color,
          image_url: cat.image_url,
          productCount: Number(cat.products_count?.[0]?.count || 0),
        }))
        .sort(
          (a, b) =>
            b.productCount - a.productCount ||
            String(a.name).localeCompare(String(b.name)),
        )
        .slice(0, TOP_CATEGORIES_LIMIT);

    let hasCachedCategories = false;
    try {
      const cached = await AsyncStorage.getItem(HOME_CATEGORIES_CACHE_KEY);
      const parsed = cached ? JSON.parse(cached) : null;
      if (Array.isArray(parsed?.data) && parsed.data.length > 0) {
        setTopCategories(parsed.data);
        setCategoriesLoading(false);
        hasCachedCategories = true;
      }
    } catch (cacheError) {
      console.warn(
        "[HomeScreen] cached categories read failed:",
        cacheError?.message,
      );
    }

    const saveCategories = async (data) => {
      if (!Array.isArray(data) || data.length === 0) return;
      try {
        await AsyncStorage.setItem(
          HOME_CATEGORIES_CACHE_KEY,
          JSON.stringify({ data, ts: Date.now() }),
        );
      } catch (cacheError) {
        console.warn(
          "[HomeScreen] cached categories write failed:",
          cacheError?.message,
        );
      }
    };

    if (!supabase) {
      if (!hasCachedCategories) setTopCategories([]);
      setCategoriesLoading(false);
      return;
    }

    try {
      // Preferred: server-side count via an embedded aggregate. The FK hint
      // disambiguates between the two relationships products has with
      // categories (category_id → id and category → name).
      const { data, error } = await supabase
        .from("express_categories")
        .select(
          "id,name,icon,color,image_url," +
            "products_count:express_products!express_products_category_fkey(count)",
        )
        .eq("is_active", true)
        .eq("express_products.status", "active")
        .order("sort_order");

      if (error) throw error;
      if (data) {
        const ranked = toRanked(data);
        setTopCategories(ranked);
        await saveCategories(ranked);
        setCategoriesLoading(false);
        return;
      }
    } catch (embedErr) {
      console.warn(
        "[HomeScreen] embedded category count failed, falling back:",
        embedErr?.message,
      );
    }

    // Fallback: aggregate counts client-side from the product `category`
    // name column (same field CategoryProductsScreen filters on).
    try {
      const [{ data: cats }, { data: prods }] = await Promise.all([
        supabase
          .from("express_categories")
          .select("id,name,icon,color,image_url")
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("express_products")
          .select("category")
          .eq("status", "active"),
      ]);

      const counts = new Map();
      (prods || []).forEach((p) => {
        const key = String(p.category || "").toLowerCase();
        if (!key) return;
        counts.set(key, (counts.get(key) || 0) + 1);
      });

      const ranked = (cats || [])
        .map((cat) => ({
          ...cat,
          productCount: counts.get(String(cat.name).toLowerCase()) || 0,
        }))
        .filter((cat) => cat.productCount > 0)
        .sort((a, b) => b.productCount - a.productCount)
        .slice(0, TOP_CATEGORIES_LIMIT);

      setTopCategories(ranked);
      await saveCategories(ranked);
    } catch (fallbackErr) {
      console.warn(
        "[HomeScreen] top categories load failed:",
        fallbackErr?.message,
      );
      if (!hasCachedCategories) setTopCategories([]);
    } finally {
      setCategoriesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTopCategories();
  }, [loadTopCategories]);

  // ── Active flash sales: load once on mount and again whenever the screen
  // comes back into focus (so a flash sale that started mid-session shows up).
  // The service returns `{ success, data }` where `data` is an array of flash
  // sale rows joined with their product. We flatten it into the shape the
  // ProductCard + FlashSaleCountdown components expect.
  const loadFlashSales = useCallback(async () => {
    if (!supabase) {
      setFlashSales([]);
      return;
    }
    try {
      const { success, data } = await flashSaleService.getActiveFlashSales();
      if (!success || !Array.isArray(data)) {
        setFlashSales([]);
        return;
      }
      // Filter out entries whose product isn't loaded — those would render as
      // empty cards. Keep the rest ordered by soonest-to-end.
      const now = Date.now();
      const live = data.filter(
        (fs) =>
          fs?.product &&
          fs?.product?.status === "active" &&
          new Date(fs.end_time).getTime() > now,
      );
      setFlashSales(live);
    } catch (e) {
      console.warn("[HomeScreen] flash sales load failed:", e?.message);
      setFlashSales([]);
    }
  }, []);

  // Re-fetch on focus (and on first mount) so a flash sale that started
  // mid-session appears without needing a full reload.
  useFocusEffect(
    useCallback(() => {
      loadFlashSales();
      fetchAdsByPlacement("home")
        .then((ads) => setHomeAds(Array.isArray(ads) ? ads : []))
        .catch(() => setHomeAds([]));
      // Hydrate the hidden-sellers list from disk every time we re-enter the
      // screen — covers the case where the user unhides a seller from a
      // future Settings screen, or where a sibling device syncs a different
      // set.
      loadHiddenSellers()
        .then((list) => setHiddenSellers(Array.isArray(list) ? list : []))
        .catch(() => {});
    }, [fetchAdsByPlacement, loadFlashSales]),
  );

  // ── Feed items per filter ────────────────────────────────────────────────
  // `feedItems` is the product list filtered for the current tab. If we have
  // live flash sales and the list has enough room (≥10 items), the flash-sale
  // strip is injected at the 10th index so it surfaces only after the user
  // has scrolled past 10 real products. The injected row uses the special
  // `__type === "flash_sale_row"` discriminator that `renderFeedItem` checks
  // for before falling back to a regular `FeedProductCard`.
  const FLASH_SALE_INSERT_AFTER = 10; // show flash sale strip after this many products

  const injectFlashSaleRow = useCallback(
    (items) => {
      if (!Array.isArray(items) || items.length < FLASH_SALE_INSERT_AFTER) {
        return items;
      }
      if (!Array.isArray(flashSales) || flashSales.length === 0) {
        return items;
      }
      // Insert the flash-sale row right after the 10th product (index 10).
      const insertIndex = FLASH_SALE_INSERT_AFTER;
      const before = items.slice(0, insertIndex);
      const after = items.slice(insertIndex);
      return [
        ...before,
        { __type: "flash_sale_row", id: "flash-sale-row", sales: flashSales },
        ...after,
      ];
    },
    [flashSales],
  );

  // Drop products whose seller is in the user's hidden list. Done before the
  // flash-sale splice so the 10-count gate still corresponds to real products.
  const filterHiddenSellers = useCallback(
    (items) => {
      if (!Array.isArray(hiddenSellers) || hiddenSellers.length === 0) {
        return items;
      }
      const hiddenSet = new Set(hiddenSellers);
      return items.filter((p) => {
        const sellerId =
          (p?.seller && (p.seller.id || p.seller)) ||
          p?.seller_id?.id ||
          p?.seller_id;
        return !sellerId || !hiddenSet.has(String(sellerId));
      });
    },
    [hiddenSellers],
  );

  const dedupeFeedItems = useCallback((items) => {
    const seen = new Set();
    return (items || []).filter((item) => {
      const id = item?.id;
      if (!id || seen.has(String(id))) return false;
      seen.add(String(id));
      return true;
    });
  }, []);

  const mixProductVideoItems = useCallback((items) => {
    const productsWithVideos = (items || [])
      .map((product, productIndex) => ({
        product,
        productIndex,
        video: Boolean(product?.video_url || product?.video_hls_url),
      }))
      .filter((entry) => entry.video);
    const videoPosts = productsWithVideos
      .map(({ product, productIndex }) => ({
        __type: "product_video",
        id: `${product.id}-video`,
        product,
        productIndex,
        video_url: product.video_url || product.video_hls_url,
      }))
      .sort(() => Math.random() - 0.5);
    const postsBySlot = new Map();
    const slotCount = (items || []).length + 1;

    videoPosts.forEach((post) => {
      const validSlots = Array.from({ length: slotCount }, (_, slot) => slot)
        .filter(
          (slot) =>
            slot !== post.productIndex && slot !== post.productIndex + 1,
        )
        .filter((slot) => !postsBySlot.has(slot));
      const fallbackSlots = Array.from(
        { length: slotCount },
        (_, slot) => slot,
      ).filter((slot) => !postsBySlot.has(slot));
      const slots = validSlots.length > 0 ? validSlots : fallbackSlots;
      if (slots.length === 0) return;
      const slot = slots[Math.floor(Math.random() * slots.length)];
      postsBySlot.set(slot, post);
    });

    const mixed = [];
    (items || []).forEach((product, index) => {
      if (postsBySlot.has(index)) mixed.push(postsBySlot.get(index));
      mixed.push(product);
    });
    if (postsBySlot.has((items || []).length)) {
      mixed.push(postsBySlot.get((items || []).length));
    }
    return mixed;
  }, []);

  const feedItems = useMemo(() => {
    let base;
    switch (activeFilter) {
      case "Following": {
        base = followedSellers.length
          ? products.filter((p) => followedSellers.includes(p.seller?.id))
          : [];
        break;
      }
      case "Trending":
        base = [...products]
          .sort((a, b) => {
            const scoreA = Number(a.rating || 0) * 10 + Number(a.discount || 0);
            const scoreB = Number(b.rating || 0) * 10 + Number(b.discount || 0);
            return scoreB - scoreA;
          })
          .slice(0, 30);
        break;
      case "New Arrivals":
        base = [...products]
          .sort((a, b) => {
            const dateA = new Date(a.created_at || 0).getTime();
            const dateB = new Date(b.created_at || 0).getTime();
            return dateB - dateA;
          })
          .slice(0, 30);
        break;
      default:
        base = products;
    }
    const visibleProducts = dedupeFeedItems(filterHiddenSellers(base));
    const feedProductsWithVideos = mixProductVideoItems(visibleProducts);
    const withAds = injectAdsIntoProducts({
      products: feedProductsWithVideos,
      ads: homeAds,
      seed: "home",
      minInterval: 5,
      maxInterval: 9,
      maxAds: homeAds.length,
    });
    return injectFlashSaleRow(withAds);
  }, [
    activeFilter,
    products,
    followedSellers,
    injectFlashSaleRow,
    filterHiddenSellers,
    dedupeFeedItems,
    mixProductVideoItems,
    homeAds,
  ]);

  const handlePagerLayout = useCallback((event) => {
    const nextWidth = event.nativeEvent.layout.width;
    setPagerWidth((currentWidth) =>
      Math.abs(currentWidth - nextWidth) > 1 ? nextWidth : currentWidth,
    );
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    showHeader();
    try {
      await Promise.all([refresh({ silent: true }), loadTopCategories()]);
    } finally {
      setRefreshing(false);
    }
  }, [refresh, loadTopCategories, showHeader]);

  const handleScroll = useCallback(
    (e) => {
      // Direction-aware tab bar auto-hide (hide on upward swipe, show on
      // downward swipe / near top).
      updateTabBarOnScroll(e.nativeEvent.contentOffset.y);
      const y = e.nativeEvent.contentOffset.y;
      if (!isDesktop) {
        // Direction-aware header auto-hide (same convention as the tab bar:
        // swipe up → hide, swipe down or near top → show).
        const delta = y - lastScrollYRef.current;
        lastScrollYRef.current = y;
        if (y <= 60) {
          animateHeader(false);
        } else if (delta > 8) {
          animateHeader(true);
        } else if (delta < -8) {
          animateHeader(false);
        }
      }
      const { contentSize, layoutMeasurement, contentOffset } = e.nativeEvent;
      const distanceFromBottom =
        contentSize.height - layoutMeasurement.height - contentOffset.y;
      if (distanceFromBottom < 400 && hasMore && !loadingMore) {
        loadMore();
      }
    },
    [hasMore, loadingMore, loadMore, animateHeader, isDesktop],
  );

  const handleStorefrontScroll = useCallback(
    (e) => {
      const y = e.nativeEvent.contentOffset.y;
      updateTabBarOnScroll(y);
      if (!isDesktop) {
        const delta = y - lastScrollYRef.current;
        lastScrollYRef.current = y;
        if (y <= 60) {
          animateHeader(false);
        } else if (delta > 8) {
          animateHeader(true);
        } else if (delta < -8) {
          animateHeader(false);
        }
      }
    },
    [animateHeader, isDesktop],
  );

  // Renders one row in the FlatList. Regular products go through the standard
  // FeedProductCard. The injected flash-sale row (synthesized by
  // `injectFlashSaleRow`) is matched by its `__type` discriminator and
  // rendered as a horizontal scroller of compact ProductCards — each card
  // already shows its own countdown via the `flashSale` prop, so we don't
  // stack another timer on top of it.
  const renderFeedItem = useCallback(
    ({ item }) => {
      if (item?.__type === "flash_sale_row") {
        return (
          <View style={styles.flashSaleSection}>
            <View style={styles.flashSaleHeaderRow}>
              <View style={styles.flashSaleTitleGroup}>
                <LinearGradient
                  colors={["#EF4444", "#DC2626"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.flashSaleIconBadge}
                >
                  <Ionicons name="flash" size={14} color="#fff" />
                </LinearGradient>
                <Text style={styles.flashSaleTitle}>Flash Sale</Text>
                <View style={styles.flashSaleLiveDot} />
              </View>
              <Text style={styles.flashSaleCount}>
                {item.sales.length} {item.sales.length === 1 ? "deal" : "deals"}{" "}
                live
              </Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.flashSaleRow}
            >
              {item.sales.map((fs) => (
                <View
                  key={fs.id || `${fs.product_id}-${fs.start_time}`}
                  style={styles.flashSaleCardWrap}
                >
                  <ProductCard
                    product={fs.product}
                    compact
                    hideCta
                    flashSale={fs}
                    onPress={() =>
                      navigation.navigate("ProductDetail", {
                        product: fs.product,
                      })
                    }
                  />
                </View>
              ))}
            </ScrollView>
          </View>
        );
      }
      if (item?.__type === "injected_ad") {
        return (
          <View style={styles.adWrap}>
            <AdRenderer ad={item.ad} flush />
          </View>
        );
      }
      if (item?.__type === "product_video") {
        return (
          <View style={[styles.cardWrap, { width: "100%" }]}>
            <FeedProductCard
              product={item.product}
              isVideoActive={visibleVideoId === String(item.id)}
              onPress={() =>
                navigation.navigate("ProductDetail", { product: item.product })
              }
            />
          </View>
        );
      }
      return (
        <View style={[styles.cardWrap, { width: "100%" }]}>
          <FeedProductCard
            product={item}
            showVideo={false}
            onPress={() =>
              navigation.navigate("ProductDetail", { product: item })
            }
          />
        </View>
      );
    },
    [navigation, styles, visibleVideoId],
  );

  // Skeleton rows for the initial load — same wrapper as renderFeedItem so
  // placeholder cards sit exactly where real cards will appear.
  const renderPlaceholderItem = useCallback(
    () => (
      <View style={[styles.cardWrap, { width: "100%" }]}>
        <FeedCardPlaceholder />
      </View>
    ),
    [styles],
  );

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <Ionicons
        name={
          activeFilter === "Following"
            ? "people-outline"
            : activeFilter === "New Arrivals"
              ? "flower-outline"
              : "sparkles-outline"
        }
        size={40}
        color={c.muted}
      />
      <Text style={styles.emptyTitle}>
        {activeFilter === "Following"
          ? "No listings from sellers you follow yet"
          : activeFilter === "New Arrivals"
            ? "No new arrivals yet"
            : "Nothing trending right now"}
      </Text>
      {activeFilter === "Following" && !followedSellers.length && (
        <Pressable
          style={styles.emptyAction}
          onPress={() => navigation.navigate("Stores")}
        >
          <Text style={styles.emptyActionText}>Discover stores</Text>
        </Pressable>
      )}
    </View>
  );

  // Categories strip rendered as the FlatList's header so it scrolls away
  // together with the feed cards.
  const listHeader = (
    <View style={styles.catSection}>
      {/* Filter pills — scroll with the feed: hide as you read down, come
          back when you scroll up. */}
      <View style={styles.filterBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {FILTERS.map((filter) => {
            const isActive = filter === activeFilter;
            return (
              <Pressable
                key={filter}
                onPress={() => {
                  setActiveFilter(filter);
                  // Content resets on filter switch — keep bars visible.
                  showTabBar();
                  showHeader();
                }}
                style={[styles.filterPill, isActive && styles.filterPillActive]}
              >
                <Text
                  style={[
                    styles.filterText,
                    isActive && styles.filterTextActive,
                  ]}
                >
                  {filter}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Flash Sale strip (inline-injected into the FlatList data, NOT here).
          Kept out of `listHeader` so it appears only after the user has
          scrolled past 10 feed products, matching the "show after 10" rule.
          See `injectFlashSaleRow` in `feedItems` memo below. */}

      <View style={styles.catHeaderRow}>
        <Text style={styles.catSectionTitle}>Categories</Text>
        <Pressable
          hitSlop={8}
          style={styles.seeMoreBtn}
          onPress={() => navigation.navigate("Categories")}
          accessibilityRole="button"
          accessibilityLabel="See more categories"
        >
          <Text style={styles.seeMoreText}>See More</Text>
          <Ionicons name="chevron-forward" size={14} color={c.primary} />
        </Pressable>
      </View>

      {categoriesLoading && !topCategories.length ? (
        // Skeleton cards shaped like the category cards
        <NativeViewGestureHandler>
          <ScrollView
            horizontal
            directionalLockEnabled
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.catRow}
            onTouchStart={() => lockPager(true)}
            onTouchMove={() => lockPager(true)}
            onTouchEnd={() => lockPager(false)}
            onTouchCancel={() => lockPager(false)}
          >
            {Array.from({ length: TOP_CATEGORIES_LIMIT }).map((_, i) => (
              <View key={i} style={styles.catCard}>
                <View style={[styles.catImageFallback, styles.catSkeletonBg]} />
                <View style={styles.catInfo}>
                  <View style={[styles.catSkeletonLine, { width: 80 }]} />
                  <View style={[styles.catSkeletonLine, { width: 44 }]} />
                </View>
              </View>
            ))}
          </ScrollView>
        </NativeViewGestureHandler>
      ) : topCategories.length ? (
        <NativeViewGestureHandler>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            directionalLockEnabled
            nestedScrollEnabled
            contentContainerStyle={styles.catRow}
            onTouchStart={() => lockPager(true)}
            onTouchMove={() => lockPager(true)}
            onTouchEnd={() => lockPager(false)}
            onTouchCancel={() => lockPager(false)}
          >
            {topCategories.map((cat) => (
              <Pressable
                key={cat.id}
                style={({ pressed }) => [
                  styles.catCard,
                  pressed && styles.catCardPressed,
                ]}
                onPress={() =>
                  navigation.navigate("CategoryProducts", {
                    category: { id: cat.id, name: cat.name },
                  })
                }
              >
                {/* Background: photo if one exists, otherwise brand color with
                  the category icon. Only ever one of the two renders, so the
                  card reads as a single surface. */}
                {String(cat.image_url || "").trim() ? (
                  <Image
                    source={{ uri: String(cat.image_url).trim() }}
                    style={styles.catImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View
                    style={[
                      styles.catImageFallback,
                      cat.color ? { backgroundColor: cat.color } : null,
                    ]}
                  >
                    <Ionicons
                      name={cat.icon || "apps"}
                      size={40}
                      color="rgba(255,255,255,0.9)"
                    />
                  </View>
                )}

                {/* Layer 3: bottom-weighted gradient — one continuous surface
                  under both the photo and the label, no seam */}
                <LinearGradient
                  colors={[
                    "rgba(0,0,0,0)",
                    "rgba(0,0,0,0.25)",
                    "rgba(0,0,0,0.75)",
                  ]}
                  locations={[0.45, 0.7, 1]}
                  style={styles.catScrim}
                />

                {/* Layer 4: label overlaid on the gradient */}
                <View style={styles.catInfo}>
                  <Text style={styles.catName} numberOfLines={1}>
                    {cat.name}
                  </Text>
                  <Text style={styles.catCount}>
                    {cat.productCount}{" "}
                    {cat.productCount === 1 ? "item" : "items"}
                  </Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </NativeViewGestureHandler>
      ) : null}
    </View>
  );

  const showFeedPlaceholders = loading && products.length === 0;

  return (
    // NOTE: no LazyScrollContext here — LazyImage's measureLayout-based lazy
    // hydration only works inside a plain ScrollView (Home). Inside a
    // virtualized FlatList the measurement is invalid, so cards render their
    // images eagerly instead.
    <View style={styles.container}>
      {/* Auto-hide header: overlays the feed (not in flow) and slides up out
          of view on upward swipe. While hidden, cards scroll edge-to-edge,
          including under the status bar. */}
      <Animated.View
        pointerEvents={headerHidden ? "none" : "auto"}
        style={[
          styles.headerOverlay,
          {
            transform: [
              {
                translateY: headerAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-headerHeight, 0],
                }),
              },
            ],
          },
        ]}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h > 0 && Math.abs(h - headerHeight) > 1) setHeaderHeight(h);
        }}
      >
        <AppHeader
          onAccountPress={() => navigation.navigate("Account")}
          onSearchPress={() => navigation.navigate("Search")}
          onStoresPress={() => navigation.navigate("Stores")}
          onNotificationsPress={() => navigation.navigate("Notifications")}
        />
      </Animated.View>

      {/* Categories strip renders inside the FlatList header so it scrolls
          together with the feed — see listHeader below. */}

      {/* Filter pill row lives inside the FlatList header (see listHeader)
          so it scrolls away with the feed and back again. */}

      {/* FlatList renders in BOTH states: while loading it receives skeleton
          items so the page keeps its exact structure (filter pills →
          categories strip → feed-shaped skeletons) and the placeholders are
          scrollable exactly like the loaded feed. */}
      <View style={[styles.homeContent, isDesktop && styles.desktopContent]}>
        <ScrollView
          ref={pagerRef}
          horizontal
          pagingEnabled
          directionalLockEnabled
          disableIntervalMomentum
          scrollEnabled={pagerScrollEnabled}
          onScroll={handlePagerScroll}
          onLayout={handlePagerLayout}
          scrollEventThrottle={1}
          showsHorizontalScrollIndicator={false}
          nestedScrollEnabled
          style={styles.homePager}
        >
          <View style={[styles.homePane, { width: pagerWidth }]}>
            <FlatList
              style={styles.homeList}
              data={showFeedPlaceholders ? FEED_PLACEHOLDER_ITEMS : feedItems}
              keyExtractor={(item) =>
                showFeedPlaceholders ? String(item) : String(item?.id ?? item)
              }
              renderItem={
                showFeedPlaceholders ? renderPlaceholderItem : renderFeedItem
              }
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={viewabilityConfig}
              ListHeaderComponent={listHeader}
              ListFooterComponent={
                loadingMore ? (
                  <View style={styles.footerLoader}>
                    <ActivityIndicator size="small" color={c.primary} />
                  </View>
                ) : null
              }
              ListEmptyComponent={!showFeedPlaceholders ? renderEmpty : null}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[
                styles.listContent,
                { paddingTop: headerHeight + 8 },
              ]}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  progressViewOffset={headerHeight}
                />
              }
              initialNumToRender={4}
              maxToRenderPerBatch={4}
              updateCellsBatchingPeriod={16}
              windowSize={5}
              removeClippedSubviews={false}
            />
          </View>

          <View style={[styles.homePane, { width: pagerWidth }]}>
            <StorefrontHomeScreen
              navigation={navigation}
              width={pagerWidth}
              topInset={headerHeight + 8}
              onScroll={handleStorefrontScroll}
              onHorizontalTouchStart={() => lockPager(true)}
              onHorizontalTouchEnd={() => lockPager(false)}
            />
          </View>
        </ScrollView>
        {isDesktop ? (
          <View style={[styles.desktopRail, { paddingTop: headerHeight + 8 }]}>
            <View style={styles.messagesPanel}>
              <View style={styles.railHeading}>
                <View style={styles.railIcon}>
                  <Ionicons
                    name="chatbubbles"
                    size={17}
                    color={c.primary}
                  />
                </View>
                <Text style={styles.railTitle}>Messages</Text>
                <Pressable
                  onPress={() =>
                    navigation.navigate("Chats", {
                      initialConversationId: recentConversations[0]?.id,
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel="View all messages"
                  style={styles.railSeeAll}
                >
                  <Text style={styles.railSeeAllText}>See all</Text>
                  <Ionicons
                    name="arrow-forward"
                    size={13}
                    color={c.primary}
                  />
                </Pressable>
              </View>
              <ScrollView
                style={styles.messagesList}
                contentContainerStyle={styles.messagesListContent}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
                {recentConversations.length ? (
                  recentConversations.map((conversation) => {
                    const seller = conversation.seller;
                    const name = seller?.name || "Seller";
                    return (
                      <Pressable
                        key={conversation.id}
                        style={styles.messagePreview}
                        onPress={() =>
                          navigation.navigate("Chats", {
                            initialConversationId: conversation.id,
                          })
                        }
                      >
                        <View style={styles.messageAvatar}>
                          {seller?.avatar ? (
                            <Image
                              source={{ uri: seller.avatar }}
                              style={styles.messageAvatarImage}
                            />
                          ) : (
                            <Ionicons
                              name="storefront-outline"
                              size={17}
                              color={c.primary}
                            />
                          )}
                        </View>
                        <View style={styles.messageCopy}>
                          <Text style={styles.messageName} numberOfLines={1}>
                            {name}
                          </Text>
                          <Text style={styles.messageText} numberOfLines={1}>
                            {conversation.last_message || "Start a conversation"}
                          </Text>
                        </View>
                        {conversation.unread_count > 0 ? (
                          <View style={styles.unreadDot} />
                        ) : null}
                      </Pressable>
                    );
                  })
                ) : (
                  <Text style={styles.emptyMessages}>
                    Your recent conversations will appear here.
                  </Text>
                )}
              </ScrollView>
            </View>

            <View style={styles.aiPanel}>
              <View style={styles.aiHeader}>
                <LinearGradient
                  colors={[c.gradientStart, c.accent]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.aiOrb}
                >
                  <Ionicons name="sparkles" size={16} color="#fff" />
                </LinearGradient>
                <View style={styles.aiHeaderCopy}>
                  <Text style={styles.aiTitle}>Tag AI</Text>
                  <View style={styles.aiStatusRow}>
                    <View style={styles.aiOnlineDot} />
                    <Text style={styles.aiStatus}>Ready to help</Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => navigation.navigate("TagAI")}
                  accessibilityRole="button"
                  accessibilityLabel="Open full Tag AI chat"
                  hitSlop={8}
                >
                  <Ionicons
                    name="expand-outline"
                    size={17}
                    color={c.muted}
                  />
                </Pressable>
              </View>
              <ScrollView
                style={styles.aiConversation}
                contentContainerStyle={styles.aiConversationContent}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
                {aiMessages.length ? (
                  aiMessages.map((message) => (
                    <View key={message.id}>
                      {message.role === "assistant" &&
                      Array.isArray(message.tools) &&
                      message.tools.length ? (
                        <View style={styles.aiToolRow}>
                          {message.tools.map((tool, index) => (
                            <View
                              key={`${tool.name}-${index}`}
                              style={styles.aiToolChip}
                            >
                              <Ionicons
                                name={
                                  tool.status === "error"
                                    ? "alert-circle"
                                    : "checkmark-circle"
                                }
                                size={11}
                                color={
                                  tool.status === "error"
                                    ? c.badgeDanger
                                    : c.primary
                                }
                              />
                              <Text
                                numberOfLines={1}
                                style={styles.aiToolText}
                              >
                                {tool.label || tool.name}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                      <View
                        style={[
                          styles.aiMessageBubble,
                          message.role === "user"
                            ? styles.aiUserBubble
                            : styles.aiReplyBubble,
                        ]}
                      >
                        {message.image ? (
                          <Image
                            source={{ uri: message.image }}
                            style={styles.aiAttachedImage}
                            resizeMode="cover"
                          />
                        ) : null}
                        {message.text ? (
                          <Text
                            numberOfLines={4}
                            style={[
                              styles.aiMessageText,
                              message.role === "user" && styles.aiUserText,
                            ]}
                          >
                            {message.text}
                          </Text>
                        ) : null}
                      </View>
                      {message.role === "assistant" &&
                      Array.isArray(message.products) ? (
                        <TagAIProductCardRow products={message.products} />
                      ) : null}
                    </View>
                  ))
                ) : (
                  <View style={[styles.aiMessageBubble, styles.aiReplyBubble]}>
                    <Text style={styles.aiMessageText}>
                      Hi! I can help you find products, compare options, or spot
                      a great deal.
                    </Text>
                  </View>
                )}
                {aiIsThinking ? (
                  <View style={[styles.aiMessageBubble, styles.aiReplyBubble]}>
                    <Text style={styles.aiThinking}>Finding an answer…</Text>
                  </View>
                ) : null}
              </ScrollView>
              {!aiMessages.length ? (
                <View style={styles.aiPromptRow}>
                  {[
                    "Find today's deals",
                    "Shop headphones",
                  ].map((prompt) => (
                    <Pressable
                      key={prompt}
                      style={styles.aiPromptChip}
                      onPress={() => handleMiniAiSend(prompt)}
                      disabled={aiIsThinking}
                    >
                      <Text style={styles.aiPromptText}>{prompt}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <View style={styles.aiComposer}>
                {miniAiVisionImage ? (
                  <View style={styles.aiImagePreview}>
                    <Image
                      source={{ uri: miniAiVisionImage }}
                      style={styles.aiImagePreviewImage}
                    />
                    <Pressable
                      onPress={() => setMiniAiVisionImage(null)}
                      style={styles.aiImageRemove}
                      accessibilityRole="button"
                      accessibilityLabel="Remove attached image"
                      hitSlop={6}
                    >
                      <Ionicons name="close" size={11} color="#fff" />
                    </Pressable>
                  </View>
                ) : null}
                <Pressable
                  onPress={pickMiniAiVisionImage}
                  disabled={aiIsThinking}
                  style={styles.aiAttachButton}
                  accessibilityRole="button"
                  accessibilityLabel="Attach image to Tag AI message"
                >
                  <Ionicons
                    name="image-outline"
                    size={17}
                    color={c.primary}
                  />
                </Pressable>
                <TextInput
                  value={miniAiInput}
                  onChangeText={setMiniAiInput}
                  onSubmitEditing={() => handleMiniAiSend()}
                  placeholder="Message Tag AI…"
                  placeholderTextColor={c.muted}
                  returnKeyType="send"
                  editable={!aiIsThinking}
                  style={styles.aiInput}
                  accessibilityLabel="Message Tag AI"
                />
                <Pressable
                  style={[
                    styles.aiSendButton,
                    (!miniAiInput.trim() &&
                      !miniAiVisionImage ||
                      aiIsThinking) &&
                      styles.aiSendDisabled,
                  ]}
                  onPress={() => handleMiniAiSend()}
                  disabled={
                    (!miniAiInput.trim() && !miniAiVisionImage) ||
                    aiIsThinking
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Send message to Tag AI"
                >
                  <Ionicons name="arrow-up" size={16} color="#fff" />
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
        {showCartRail ? (
          <View style={[styles.cartRail, { paddingTop: headerHeight + 8 }]}>
            <View style={styles.cartPanel}>
              <View style={styles.railHeading}>
                <View style={styles.railIcon}>
                  <Ionicons name="cart-outline" size={17} color={c.primary} />
                </View>
                <Text style={styles.railTitle}>Your cart</Text>
                <Text style={styles.cartCount}>{itemCount}</Text>
              </View>
              {cartItems.length ? (
                <ScrollView
                  style={styles.cartList}
                  contentContainerStyle={styles.cartListContent}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                >
                  {cartItems.slice(0, 6).map((item) => {
                    const { product, quantity, price } = item;
                    const unitPrice =
                      price ??
                      (product.discount > 0
                        ? product.price * (1 - product.discount / 100)
                        : product.price);
                    const imageUri =
                      product.thumbnail || product.thumbnails?.[0];

                    return (
                      <Pressable
                        key={item.id}
                        style={styles.cartItem}
                        onPress={() =>
                          navigation.navigate("ProductDetail", { product })
                        }
                      >
                        {imageUri ? (
                          <Image
                            source={{ uri: imageUri }}
                            style={styles.cartItemImage}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={styles.cartItemImageFallback}>
                            <Ionicons
                              name="image-outline"
                              size={17}
                              color={c.muted}
                            />
                          </View>
                        )}
                        <View style={styles.cartItemCopy}>
                          <Text style={styles.cartItemTitle} numberOfLines={2}>
                            {product.title}
                          </Text>
                          <Text style={styles.cartItemMeta}>
                            Qty {quantity}
                          </Text>
                        </View>
                        <Text style={styles.cartItemPrice}>
                          GH₵{Number(unitPrice || 0).toLocaleString()}
                        </Text>
                      </Pressable>
                    );
                  })}
                  {cartItems.length > 6 ? (
                    <Text style={styles.cartMore}>
                      +{cartItems.length - 6} more items
                    </Text>
                  ) : null}
                </ScrollView>
              ) : (
                <View style={styles.emptyCart}>
                  <Ionicons
                    name="bag-handle-outline"
                    size={28}
                    color={c.muted}
                  />
                  <Text style={styles.emptyCartText}>Your cart is empty</Text>
                </View>
              )}
              <View style={styles.cartFooter}>
                <View style={styles.cartSubtotalRow}>
                  <Text style={styles.cartSubtotalLabel}>Subtotal</Text>
                  <Text style={styles.cartSubtotal}>
                    GH₵{Number(cartTotal || 0).toLocaleString()}
                  </Text>
                </View>
                <Pressable
                  style={styles.cartButton}
                  onPress={() => navigation.navigate("Cart")}
                  accessibilityRole="button"
                  accessibilityLabel={`View cart with ${itemCount} items`}
                >
                  <Text style={styles.cartButtonText}>View cart</Text>
                  <Ionicons name="arrow-forward" size={14} color={c.onPrimary} />
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
};

const buildHomeStyles = (c) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    homeContent: {
      flex: 1,
      minHeight: 0,
    },
    desktopContent: {
      flexDirection: "row",
      width: "100%",
    },
    homePager: {
      flex: 1,
      minWidth: 0,
      maxWidth: 720,
    },
    homePane: {
      flex: 1,
      minHeight: 0,
    },
    homeList: {
      flex: 1,
      minHeight: 0,
    },
    desktopRail: {
      width: DESKTOP_RAIL_WIDTH,
      flexDirection: "column",
      flexShrink: 0,
      minHeight: 0,
      overflow: "hidden",
      gap: 10,
      paddingHorizontal: 16,
      paddingBottom: 16,
      borderLeftWidth: 1,
      borderLeftColor: c.border,
      backgroundColor: c.background,
    },
    cartRail: {
      width: CART_RAIL_WIDTH,
      flexShrink: 0,
      minHeight: 0,
      overflow: "hidden",
      paddingHorizontal: 16,
      paddingBottom: 16,
      borderLeftWidth: 1,
      borderLeftColor: c.border,
      backgroundColor: c.background,
    },
    cartPanel: {
      flex: 1,
      minHeight: 0,
      overflow: "hidden",
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      padding: 16,
      gap: 12,
    },
    cartCount: {
      minWidth: 24,
      overflow: "hidden",
      borderRadius: radius.full,
      paddingHorizontal: 7,
      paddingVertical: 3,
      backgroundColor: c.primary + "12",
      color: c.primary,
      fontSize: 11,
      fontWeight: "800",
      textAlign: "center",
    },
    cartList: {
      flex: 1,
      minHeight: 0,
    },
    cartListContent: {
      gap: 12,
    },
    cartItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      minHeight: 54,
    },
    cartItemImage: {
      width: 48,
      height: 48,
      borderRadius: radius.sm,
      backgroundColor: c.borderAlpha,
    },
    cartItemImageFallback: {
      width: 48,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.sm,
      backgroundColor: c.borderAlpha,
    },
    cartItemCopy: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    cartItemTitle: {
      color: c.dark,
      fontSize: 12,
      fontWeight: "700",
      lineHeight: 16,
    },
    cartItemMeta: {
      color: c.muted,
      fontSize: 11,
    },
    cartItemPrice: {
      color: c.dark,
      fontSize: 11,
      fontWeight: "800",
    },
    cartMore: {
      color: c.muted,
      fontSize: 11,
      textAlign: "center",
      paddingVertical: 4,
    },
    emptyCart: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    emptyCartText: {
      color: c.muted,
      fontSize: 12,
      fontWeight: "600",
    },
    cartFooter: {
      gap: 12,
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingTop: 12,
    },
    cartSubtotalRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    cartSubtotalLabel: {
      color: c.muted,
      fontSize: 12,
      fontWeight: "600",
    },
    cartSubtotal: {
      color: c.dark,
      fontSize: 15,
      fontWeight: "800",
    },
    cartButton: {
      minHeight: 40,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      borderRadius: radius.md,
      paddingHorizontal: 12,
      backgroundColor: c.primary,
    },
    cartButtonText: {
      color: c.onPrimary,
      fontSize: 12,
      fontWeight: "800",
    },
    messagesPanel: {
      maxHeight: "34%",
      minHeight: 0,
      flexShrink: 1,
      overflow: "hidden",
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      padding: 16,
      gap: 8,
    },
    messagesList: {
      minHeight: 0,
      flexShrink: 1,
    },
    messagesListContent: {
      gap: 8,
    },
    railHeading: {
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      marginBottom: 2,
    },
    railIcon: {
      width: 32,
      height: 32,
      borderRadius: radius.sm,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.primary + "12",
    },
    railTitle: {
      flex: 1,
      fontSize: 15,
      fontWeight: "800",
      color: c.dark,
    },
    railSeeAll: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
    },
    railSeeAllText: {
      color: c.primary,
      fontSize: 12,
      fontWeight: "700",
    },
    messagePreview: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    messageAvatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.primary + "12",
    },
    messageAvatarImage: {
      width: "100%",
      height: "100%",
    },
    messageCopy: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    messageName: {
      color: c.dark,
      fontSize: 13,
      fontWeight: "700",
    },
    messageText: {
      color: c.muted,
      fontSize: 12,
    },
    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: c.primary,
    },
    emptyMessages: {
      color: c.muted,
      fontSize: 12,
      lineHeight: 18,
      paddingVertical: 6,
    },
    aiPanel: {
      flex: 1,
      minHeight: 0,
      flexShrink: 1,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: 14,
      overflow: "hidden",
      backgroundColor: c.surface,
      gap: 8,
    },
    aiHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      flexShrink: 0,
    },
    aiOrb: {
      width: 36,
      height: 36,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
    },
    aiHeaderCopy: {
      flex: 1,
      gap: 2,
    },
    aiTitle: {
      color: c.dark,
      fontSize: 15,
      fontWeight: "800",
    },
    aiStatusRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    aiOnlineDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: "#22C55E",
    },
    aiStatus: {
      color: c.muted,
      fontSize: 10,
      fontWeight: "600",
    },
    aiConversation: {
      flex: 1,
      minHeight: 0,
    },
    aiConversationContent: {
      gap: 8,
      paddingVertical: 2,
    },
    aiAttachedImage: {
      width: 150,
      height: 112,
      borderRadius: radius.xs,
      marginBottom: 6,
    },
    aiToolRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 5,
      marginBottom: 5,
    },
    aiToolChip: {
      maxWidth: "100%",
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.full,
      paddingHorizontal: 7,
      paddingVertical: 3,
    },
    aiToolText: {
      maxWidth: 170,
      color: c.muted,
      fontSize: 9,
    },
    aiMessageBubble: {
      maxWidth: "92%",
      borderRadius: radius.md,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    aiReplyBubble: {
      alignSelf: "flex-start",
      backgroundColor: c.background,
    },
    aiUserBubble: {
      alignSelf: "flex-end",
      backgroundColor: c.primary,
    },
    aiMessageText: {
      color: c.dark,
      fontSize: 11,
      lineHeight: 16,
    },
    aiUserText: {
      color: "#fff",
    },
    aiThinking: {
      color: c.muted,
      fontSize: 11,
      fontStyle: "italic",
    },
    aiPromptRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      flexShrink: 0,
    },
    aiPromptChip: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.full,
      paddingHorizontal: 9,
      paddingVertical: 6,
    },
    aiPromptText: {
      color: c.primary,
      fontSize: 10,
      fontWeight: "700",
    },
    aiComposer: {
      minHeight: 42,
      flexDirection: "row",
      flexWrap: "wrap",
      flexShrink: 0,
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.md,
      paddingLeft: 11,
      paddingRight: 4,
      backgroundColor: c.background,
    },
    aiAttachButton: {
      width: 26,
      height: 32,
      alignItems: "center",
      justifyContent: "center",
    },
    aiImagePreview: {
      position: "relative",
      width: 36,
      height: 36,
      marginVertical: 3,
    },
    aiImagePreviewImage: {
      width: "100%",
      height: "100%",
      borderRadius: radius.xs,
    },
    aiImageRemove: {
      position: "absolute",
      top: -5,
      right: -5,
      width: 16,
      height: 16,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.dark,
    },
    aiInput: {
      flex: 1,
      minWidth: 0,
      color: c.dark,
      fontSize: 12,
      paddingVertical: 8,
      outlineStyle: "none",
    },
    aiSendButton: {
      width: 30,
      height: 30,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.primary,
    },
    aiSendDisabled: {
      opacity: 0.45,
    },
    // Header floats above the feed; translateY slides it fully off-screen.
    headerOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10,
      elevation: 10,
    },
    filterBar: {
      paddingTop: 10,
      paddingBottom: 6,
    },
    filterRow: {
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 12,
    },
    filterPill: {
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surfaceAlpha,
      paddingVertical: 8,
      paddingHorizontal: 18,
    },
    filterPillActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    filterText: {
      fontSize: 13,
      fontWeight: "700",
      color: c.muted,
    },
    filterTextActive: {
      color: c.onPrimary,
    },
    listContent: {
      flexGrow: 1,
    },
    cardWrap: {
      width: "100%",
      maxWidth: 720,
      alignSelf: "flex-start",
      marginBottom: 0,
    },
    adWrap: {
      width: "100%",
      padding: 0,
    },
    emptyState: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 60,
      gap: 12,
      paddingHorizontal: 32,
    },
    emptyTitle: {
      fontSize: 14,
      fontWeight: "600",
      color: c.muted,
      textAlign: "center",
    },
    emptyAction: {
      backgroundColor: c.primary,
      borderRadius: radius.full,
      paddingVertical: 10,
      paddingHorizontal: 22,
    },
    emptyActionText: {
      color: c.onPrimary,
      fontSize: 13,
      fontWeight: "700",
    },
    footerLoader: {
      minHeight: 64,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 20,
    },
    // ── Flash Sale strip (horizontal ProductCards, only when live deals) ───
    flashSaleSection: {
      paddingTop: 14,
      paddingBottom: 4,
    },
    flashSaleHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 14,
      paddingBottom: 10,
    },
    flashSaleTitleGroup: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    flashSaleIconBadge: {
      width: 26,
      height: 26,
      borderRadius: radius.sm,
      alignItems: "center",
      justifyContent: "center",
    },
    flashSaleTitle: {
      fontSize: 16,
      fontWeight: "900",
      color: c.dark,
      letterSpacing: 0.2,
    },
    // Pulsing-style "live" dot — flat single color (animations live in the
    // component if needed). Subtle but obvious that this is a real-time row.
    flashSaleLiveDot: {
      width: 8,
      height: 8,
      borderRadius: radius.full,
      backgroundColor: "#EF4444",
    },
    flashSaleCount: {
      fontSize: 12,
      fontWeight: "700",
      color: "#EF4444",
    },
    flashSaleRow: {
      flexDirection: "row",
      gap: 12,
      paddingHorizontal: 14,
      paddingBottom: 6,
    },
    flashSaleCardWrap: {
      width: 175,
    },
    // ── Top categories strip (ProductCard-style cards) ──────────────────────
    catSection: {
      paddingTop: 8,
    },
    catHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 14,
      paddingBottom: 10,
    },
    catSectionTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: c.dark,
    },
    seeMoreBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
    },
    seeMoreText: {
      fontSize: 13,
      fontWeight: "700",
      color: c.primary,
    },
    catRow: {
      flexDirection: "row",
      gap: 12,
      paddingHorizontal: 14,
      paddingBottom: 6,
    },
    // Mirrors ProductCard's card treatment: rounded, bordered, soft shadow
    catCard: {
      width: 170,
      height: 220,
      backgroundColor: c.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: c.border,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOpacity: 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 5,
    },
    catCardPressed: {
      opacity: 0.8,
      transform: [{ scale: 0.98 }],
    },
    catImage: {
      ...StyleSheet.absoluteFillObject,
      width: "100%",
      height: "100%",
      zIndex: 0,
    },
    catImageFallback: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: c.primary,
      alignItems: "center",
      justifyContent: "center",
      // Nudge the icon's optical center up so it sits in the open space
      // above the name/count block instead of crowding it.
      paddingBottom: 40,
      zIndex: 0,
    },
    // Bottom-weighted gradient dim — spans the whole card so image and label
    // share one continuous surface with no visible seam.
    catScrim: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 1,
    },
    // Label is a true overlay pinned to the card's bottom edge — same surface
    // as the image behind it, never a separate block.
    catInfo: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 2,
      paddingHorizontal: 12,
      paddingBottom: 10,
      gap: 1,
    },
    catName: {
      fontSize: 13,
      fontWeight: "800",
      color: "#FFFFFF",
      textShadowColor: "rgba(0, 0, 0, 0.4)",
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    catCount: {
      fontSize: 11,
      fontWeight: "600",
      color: "rgba(255, 255, 255, 0.9)",
    },
    catSkeletonBg: {
      backgroundColor: c.surfaceAlpha,
    },
    catSkeletonLine: {
      height: 8,
      borderRadius: 4,
      backgroundColor: "rgba(255, 255, 255, 0.5)",
    },
  });
