import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Image,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Platform,
  TouchableOpacity,
  Animated,
  Easing,
} from "react-native";
import { FeedVideo } from "../components/FeedVideo";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
// expo-file-system v57 deprecated createUploadTask on the main entry (it now
// throws). The working implementation lives in the legacy subpath, which is
// exactly what we need to stream the raw video bytes to R2 via a binary PUT.
import * as FileSystem from "expo-file-system/legacy";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import { supabase, callEdgeFunction, supabaseUrl } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useToast } from "../context/ToastContext";
import { notifyOrderStatusUpdate } from "../services/notificationService";
import { sellerFlashSaleService } from "../services/sellerFlashSaleService";
import { colors as brandColors, getTheme, radius } from "../theme/colors";
import { useAppStyles } from "../hooks/useAppStyles";
import { getImageContentType } from "../utils/webUpload";
import { showTabBar, updateTabBarOnScroll } from "../utils/tabBarAutoHide";
import {
  R2_FOLDERS,
  getKeyFromUrl,
  uploadToR2Presigned,
  deleteMediaByUrl,
  resolveMediaUrl,
} from "../services/r2Storage";
import { CustomerLoadingAnimation } from "../components/CustomerLoadingAnimation";
import { ProductCardPlaceholder } from "../components/ProductCardPlaceholder";

const DEFAULT_CATEGORIES = [
  { id: "default-fashion", name: "Fashion", icon: "shirt-outline" },
  { id: "default-grocery", name: "Grocery", icon: "basket-outline" },
  { id: "default-beauty", name: "Beauty", icon: "sparkles-outline" },
  {
    id: "default-electronics",
    name: "Electronics",
    icon: "hardware-chip-outline",
  },
  { id: "default-home", name: "Home", icon: "home-outline" },
];

const PRODUCT_FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "pending", label: "Pending" },
  { key: "draft", label: "Drafts" },
  { key: "rejected", label: "Rejected" },
];

const SORT_OPTIONS = [
  { key: "recent", label: "Most Recent", icon: "time-outline" },
  { key: "price-desc", label: "Price: High to Low", icon: "arrow-down-outline" },
  { key: "price-asc", label: "Price: Low to High", icon: "arrow-up-outline" },
  { key: "alpha", label: "Alphabetical (A-Z)", icon: "text-outline" },
];

// Pill colors for the redesigned catalog product cards.
const CATALOG_STATUS_COLORS = {
  active: "#10B981",
  pending: "#F59E0B",
  draft: "#6B7280",
  rejected: "#EF4444",
};

const ORDER_STATUS_FILTERS = [
  "processing",
  "packed",
  "shipped",
  "delivered",
  "canceled",
];

const AVAILABLE_COLORS = [
  { name: "Black", hex: "#000000" },
  { name: "White", hex: "#FFFFFF" },
  { name: "Red", hex: "#EF4444" },
  { name: "Blue", hex: "#3B82F6" },
  { name: "Green", hex: "#10B981" },
  { name: "Yellow", hex: "#F59E0B" },
  { name: "Purple", hex: "#8B5CF6" },
  { name: "Pink", hex: "#EC4899" },
  { name: "Orange", hex: "#F97316" },
  { name: "Brown", hex: "#92400E" },
  { name: "Gray", hex: "#6B7280" },
  { name: "Navy", hex: "#1E3A8A" },
];

const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

const MAX_VIDEO_UPLOAD_BYTES = 10 * 1024 * 1024;

const PRODUCT_FORM_STEPS = [
  { key: "basics", label: "Basics" },
  { key: "inventory", label: "Inventory" },
  { key: "media", label: "Media" },
  { key: "details", label: "Details" },
];

const getVideoUploadDetails = (uri, pickedFile = null) => {
  const nameSource = String(pickedFile?.name || uri || "").split("?")[0];
  const fileName = nameSource.split("/").pop() || "video.mp4";
  const rawExt = fileName.includes(".") ? fileName.split(".").pop() : "";
  const ext = rawExt ? rawExt.toLowerCase() : "mp4";
  const rawMimeType = String(
    pickedFile?.type || pickedFile?.mimeType || "",
  ).trim();
  const mimeType = rawMimeType.includes("/") ? rawMimeType : "";

  if (mimeType) {
    return {
      contentType: mimeType,
      extension:
        mimeType === "video/quicktime"
          ? "mov"
          : mimeType.split("/")[1] || ext || "mp4",
    };
  }

  if (ext === "mov" || ext === "qt" || ext === "m4v") {
    return {
      contentType:
        ext === "mov" || ext === "qt" ? "video/quicktime" : "video/mp4",
      extension: ext === "qt" ? "mov" : ext,
    };
  }

  return { contentType: "video/mp4", extension: ext || "mp4" };
};

const normalizePickedVideoType = (asset) => {
  const mimeType = String(asset?.mimeType || asset?.file?.type || "").trim();
  if (mimeType.includes("/")) return mimeType;

  const name = String(asset?.fileName || asset?.uri || "").split("?")[0];
  const ext = name.includes(".") ? name.split(".").pop()?.toLowerCase() : "";
  if (ext === "mov" || ext === "qt") return "video/quicktime";
  return "video/mp4";
};

const getBlobFromUri = async (uri, timeoutMs = 30000) => {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    if (blob) return blob;
  } catch (fetchError) {
    // Fall back to XHR for Android/content:// and similar local URIs.
  }

  return await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const timer = setTimeout(() => {
      xhr.abort();
      reject(new Error("Reading selected video timed out"));
    }, timeoutMs);

    xhr.open("GET", uri, true);
    xhr.responseType = "blob";
    xhr.onload = () => {
      clearTimeout(timer);
      if (xhr.status === 200 || xhr.status === 0) {
        resolve(xhr.response);
        return;
      }
      reject(new Error(`Failed to read selected video (status ${xhr.status})`));
    };
    xhr.onerror = () => {
      clearTimeout(timer);
      reject(new Error("Failed to read selected video"));
    };
    xhr.onabort = () => {
      clearTimeout(timer);
      reject(new Error("Reading selected video was aborted"));
    };
    xhr.send();
  });
};

const formatBytes = (bytes) => {
  const value = Number(bytes || 0);
  if (!value) return "0 MB";
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

// Compact count formatting for the profile stats line ("3.6K followers").
const formatCount = (value) => {
  const n = Number(value || 0);
  if (n >= 1000000)
    return `${(n / 1000000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
};

const getVideoSizeBytes = async (uri, pickedFile = null) => {
  const pickedSize = Number(pickedFile?.size || pickedFile?.fileSize || 0);
  if (pickedSize > 0) return pickedSize;

  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info?.size) return info.size;
  } catch (e) {
    console.warn("Failed to read video size", e);
  }

  return 0;
};

// Hamburger menu — mirrors the Express-Store seller/store settings surface
// (Dashboard, Catalog, Orders, Chats, Profile/theme, Paystack, StatusCreator, etc.)
// mapped onto the screens available in the merged tagit app.
const MENU_ITEMS = [
  { section: "Store" },
  { label: "Orders", icon: "receipt-outline", screen: "Orders" },
  { label: "Messages", icon: "chatbubbles-outline", screen: "Chats" },
  { label: "Create Status", icon: "create-outline", screen: "StatusCreator" },
  { section: "Store Settings" },
  // Merge store profile editing into main ProfileEdit flow for sellers
  {
    label: "Store Profile",
    icon: "storefront-outline",
    screen: "SellerProfile",
  },
  { label: "Payment Account", icon: "card-outline", screen: "Payments" },
  { label: "Coupons", icon: "ticket-outline", action: "coupons" },
  {
    label: "Account settings",
    icon: "color-palette-outline",
    screen: "Settings",
  },
  { section: "Account" },
  { label: "Security", icon: "shield-checkmark-outline", screen: "Security" },
  { label: "Privacy", icon: "lock-closed-outline", screen: "PrivacySettings" },
  {
    label: "Help & Support",
    icon: "help-circle-outline",
    screen: "HelpSupport",
  },
  { section: "Appearance" },
  { theme: true },
  { label: "Sign Out", icon: "log-out-outline", action: "signOut" },
];

// ── WhatsApp connect: Meta hard-block detection ────────────────────────────
// Meta sometimes renders OAuth hard-blocks ("…isn't using a secure connection…
// you won't be able to use Facebook to log into it") as normal 200 pages inside
// the WebView — no URL change, no error param, no postMessage — leaving the
// seller stranded. This script is injected into EVERY page the WebView loads;
// it scans the page text and, when a known block appears, reports it back so
// the app can close the flow and show the exact dashboard fix.
const WA_INJECTED_JS = `
(function () {
  if (window.__waBlockWatcher) return;
  window.__waBlockWatcher = true;
  var reSecure = /isn['\\u2019]t using a secure connection/i;
  var reBlocked = /won['\\u2019]t be able to use Facebook to log into it/i;
  var check = function () {
    try {
      var text = document.body ? (document.body.innerText || "") : "";
      if (reSecure.test(text) || reBlocked.test(text)) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: "wa_oauth_result",
            success: false,
            error: "Meta blocked login: Tagit isn't using a secure connection.",
          }));
        }
        window.clearInterval(window.__waTimer);
      }
    } catch (e) {}
  };
  window.__waTimer = setInterval(check, 400);
  // Stop watching after 45s (dialog is either through or genuinely stuck).
  setTimeout(function () { window.clearInterval(window.__waTimer); }, 45000);
  check();
})();
true;
`;

// ── Feature flags ────────────────────────────────────────────────────────────
// WhatsApp Catalog connect/sync bar on the seller dashboard — temporarily
// disabled ahead of a dedicated release. Flip to true to re-enable the bar,
// its connect modal and the sync button (all code paths remain wired up).
const FEATURE_WHATSAPP_CATALOG = false;

export const SellerAdminScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const nav = useNavigation();
  const { user, profile: customerProfile, signOut } = useAuth();
  const toast = useToast();
  const {
    theme: themeMode,
    setTheme: setThemeMode,
    colors: themeColors,
  } = useTheme();
  const styles = useAppStyles((c) => buildSellerAdminStyles(c));

  // ── Seller data layer (mirrors Express-Store SellerContext) ──────────────
  const [seller, setSeller] = useState(null);
  const [sellerId, setSellerId] = useState(null);
  // Whether the store is currently "live" (is_active). Drives the Go Live
  // toggle and is kept in sync with the seller row.
  const [isLive, setIsLive] = useState(false);
  const [togglingLive, setTogglingLive] = useState(false);
  // WhatsApp catalog sync state.
  const [waConnected, setWaConnected] = useState(false);
  const [waCatalogName, setWaCatalogName] = useState(null);
  const [waLastSynced, setWaLastSynced] = useState(null);
  const [waSyncing, setWaSyncing] = useState(false);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const theme = getTheme(seller?.theme_color) || getTheme(themeColors.primary);
  const accent = (theme && theme.accent) || themeColors.accent;

  // ── Bottom tab bar auto-hide (direction-aware) ────────────────────────────
  // Same convention as Home/Feed/Cart: swipe up hides the bottom bar, swipe
  // down or being near the top reveals it again. Focus always shows it so
  // switching into the seller admin view never starts with a hidden bar.
  const handleDashboardScroll = useCallback((e) => {
    updateTabBarOnScroll(e.nativeEvent.contentOffset.y);
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => showTabBar());
    return unsubscribe;
  }, [navigation]);

  // ── Catalog UI state ─────────────────────────────────────────────────────
  const [productFilter, setProductFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  // Categories to filter the catalog by ([] = all). Chips in the Sort &
  // Filter popup can be freely selected and deselected.
  const [selectedCategories, setSelectedCategories] = useState([]);
  // Bottom-sheet popup hosting the sort options + category toggles.
  const [sortModalVisible, setSortModalVisible] = useState(false);
  // Catalog layout: "grid" (2-column cards) or "list" (full-width rows).
  const [catalogViewMode, setCatalogViewMode] = useState("grid");
  const [modalVisible, setModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // WhatsApp catalog connect state (Meta Embedded Signup via in-app WebView).
  const [waModalVisible, setWaModalVisible] = useState(false);
  const [waConnecting, setWaConnecting] = useState(false);
  // URL of the edge-function launcher page currently loaded in the WebView
  // (null = show the intro card / "Continue with Facebook" button instead).
  const [waAuthUrl, setWaAuthUrl] = useState(null);
  // Human-readable stage shown on the save button while submitting
  // ("Uploading images…", "Saving product…", etc.) so the UI never just
  // says "Saving..." with no feedback.
  const [submitStage, setSubmitStage] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  // Platform service-fee percentage — fetched once from express_settings
  // (service_fee_percentage), the same single source of truth the payment
  // edge function uses. null = not loaded / unavailable (breakdown hidden).
  const [serviceFeePercent, setServiceFeePercent] = useState(null);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("express_settings")
          .select("value")
          .eq("key", "service_fee_percentage")
          .maybeSingle();
        if (!mounted || error || !data) return;
        const parsed = parseFloat(data.value);
        if (Number.isFinite(parsed)) setServiceFeePercent(parsed);
      } catch (e) {
        console.warn(
          "Failed to load service_fee_percentage:",
          e?.message || e,
        );
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);
  // Derived numbers for the fee breakdown under the Price input.
  const priceNum = parseFloat(price) || 0;
  const platformFee =
    serviceFeePercent != null ? (priceNum * serviceFeePercent) / 100 : 0;
  const [shippingFee, setShippingFee] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [discount, setDiscount] = useState(0);
  const [imageUris, setImageUris] = useState([]);
  const [imageFiles, setImageFiles] = useState({});
  const [existingImageUrls, setExistingImageUrls] = useState([]);
  const [removingImageUrl, setRemovingImageUrl] = useState(null);
  const [selectedSizes, setSelectedSizes] = useState([]);
  const [selectedColors, setSelectedColors] = useState([]);
  const [quantity, setQuantity] = useState("");
  const [sku, setSku] = useState("");
  const [weight, setWeight] = useState("");
  const [barcode, setBarcode] = useState("");
  const [vendor, setVendor] = useState("");
  const [compareAtPrice, setCompareAtPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [trackInventory, setTrackInventory] = useState(true);
  const [allowBackorder, setAllowBackorder] = useState(false);
  const [isPreorder, setIsPreorder] = useState(false);
  const [weightUnit, setWeightUnit] = useState("kg");
  const [slug, setSlug] = useState("");
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState("");

  // Commit whatever is currently typed in the tag field into `tags`.
  // Uses the functional updater so back-to-back calls (onSubmitEditing +
  // onBlur firing for the same text) can never duplicate or drop a tag.
  const commitPendingTag = useCallback(() => {
    const t = tagInput.trim();
    if (!t) return;
    setTags((prev) =>
      prev.length < 10 && !prev.some((x) => x.toLowerCase() === t.toLowerCase())
        ? [...prev, t]
        : prev,
    );
    setTagInput("");
  }, [tagInput]);
  const [specifications, setSpecifications] = useState([]);
  const [productFormStep, setProductFormStep] = useState(1);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [viewingProduct, setViewingProduct] = useState(null);
  const [restockModalVisible, setRestockModalVisible] = useState(false);
  const [restockQuantity, setRestockQuantity] = useState("");
  const [restockSubmitting, setRestockSubmitting] = useState(false);
  const [flashSaleModalVisible, setFlashSaleModalVisible] = useState(false);
  const [flashSalePrice, setFlashSalePrice] = useState("");
  const [flashSaleStartDate, setFlashSaleStartDate] = useState(new Date());
  const [flashSaleEndDate, setFlashSaleEndDate] = useState(
    new Date(Date.now() + 24 * 60 * 60 * 1000),
  );
  const [flashSaleMaxQty, setFlashSaleMaxQty] = useState("");
  const [menuVisible, setMenuVisible] = useState(false);
  // Drawer slide-in animation — 0 = fully off-screen LEFT, 1 = fully open.
  // The modal itself renders instantly (animationType="none") so the drawer
  // glides in from the left edge instead of fading with the old fade/slide.
  const drawerAnim = useRef(new Animated.Value(0)).current;
  const drawerSlide = drawerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["-105%", "0%"],
  });
  const openMenu = useCallback(() => setMenuVisible(true), []);
  useEffect(() => {
    if (!menuVisible) return;
    drawerAnim.setValue(0);
    Animated.timing(drawerAnim, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [menuVisible, drawerAnim]);
  const closeMenu = useCallback(() => {
    Animated.timing(drawerAnim, {
      toValue: 0,
      duration: 200,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMenuVisible(false);
    });
  }, [drawerAnim]);
  // Chevron on the profile sheet collapses/expands the store controls
  // (Go Live + WhatsApp catalog). Red dot on the chevron when not live.
  const [controlsExpanded, setControlsExpanded] = useState(true);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

  // ── Product video (attached to a product, uploaded to Cloudflare R2) ────
  const [videoUri, setVideoUri] = useState(null);
  const [videoFile, setVideoFile] = useState(null); // { file, type, name } (web)
  const [existingVideoUrl, setExistingVideoUrl] = useState(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [removingVideo, setRemovingVideo] = useState(false);
  const [videoUploadJobs, setVideoUploadJobs] = useState([]);
  // When a video is picked for attach, we hold it here and show a product
  // picker so the seller chooses the target product from a modal.
  const [pendingVideo, setPendingVideo] = useState(null); // { uri, pickedFile, title }
  const [productSelectModalVisible, setProductSelectModalVisible] =
    useState(false);
  // Per-video popup menu (kebab) — holds the reel being acted on.
  const [cardMenu, setCardMenu] = useState(null); // reel object or null
  const [deleteConfirmProduct, setDeleteConfirmProduct] = useState(null); // product awaiting delete confirmation
  const [deletingProduct, setDeletingProduct] = useState(false);
  const [deleteSteps, setDeleteSteps] = useState([]); // media-removal progress checklist
  const [createSteps, setCreateSteps] = useState([]); // product save progress checklist
  const [createFailed, setCreateFailed] = useState(false);
  const [liveSteps, setLiveSteps] = useState([]); // go-live / pause progress checklist
  const [liveToggleFailed, setLiveToggleFailed] = useState(false);
  const [couponManagerVisible, setCouponManagerVisible] = useState(false);
  const [sellerCoupons, setSellerCoupons] = useState([]);
  const [sellerCouponsLoading, setSellerCouponsLoading] = useState(false);
  const [couponFormVisible, setCouponFormVisible] = useState(false);
  const [couponSaving, setCouponSaving] = useState(false);
  const [couponForm, setCouponForm] = useState({
    code: "",
    discountType: "percentage",
    discountValue: "",
    minOrder: "",
    maxProductPrice: "",
    maxUses: "",
    userLimit: "1",
    expiresAt: "",
  });

  // ── Orders UI state ─────────────────────────────────────────────────────
  const [orderFilter, setOrderFilter] = useState("processing");
  const [orderSearch, setOrderSearch] = useState("");

  // ── Reels UI state (seller reels stored on Cloudflare R2) ──────────────
  const [reels, setReels] = useState([]);
  const [reelsLoading, setReelsLoading] = useState(false);
  const [deletingReelId, setDeletingReelId] = useState(null);

  // ── Tabs ────────────────────────────────────────────────────────────────
  const TABS = ["catalog", "orders", "flash", "reels", "insights"];
  const TAB_LABELS = {
    catalog: "Catalog",
    orders: "Orders",
    flash: "Flash",
    reels: "Reels",
    insights: "Insights",
  };
  const [activeTab, setActiveTab] = useState("catalog");

  useEffect(() => {
    // reserved
  }, []);

  const fetchSellerId = useCallback(async () => {
    if (!supabase || !user) return null;
    const { data: existing } = await supabase
      .from("express_sellers")
      .select(
        "id, name, theme_color, avatar, badges, store_description, payment_account, account_verified, is_active",
      )
      .eq("user_id", user.id)
      .maybeSingle();
    if (existing) return existing;
    const baseName =
      customerProfile?.full_name || user.email?.split("@")[0] || "Seller";
    const created = await callEdgeFunction("create_seller", {
      name: baseName,
      email: user.email,
      phone: customerProfile?.phone || null,
      store_description: customerProfile?.full_name || null,
      avatar: customerProfile?.avatar_url || null,
    });
    if (!created || !created.success || !created.data?.seller) {
      console.error("create seller error", created?.error || created);
      return null;
    }
    return created.data.seller;
  }, [user, customerProfile]);

  const loadData = useCallback(async () => {
    if (!supabase || !user) return;
    try {
      const s = await fetchSellerId();
      if (!s) {
        setLoading(false);
        return;
      }
      setSellerId(s.id);
      setSeller(s);
      setIsLive(Boolean(s.is_active));

      try {
        const [{ count: fc }, { count: ingc }] = await Promise.all([
          supabase
            .from("express_follows")
            .select("*", { count: "exact", head: true })
            .eq("seller_id", s.id),
          supabase
            .from("express_follows")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id),
        ]);
        setFollowerCount(fc || 0);
        setFollowingCount(ingc || 0);
      } catch (e) {
        console.warn("follow counts failed", e);
      }

      const [catRes, prodRes, ordRes] = await Promise.all([
        supabase.from("express_categories").select("id,name,icon,color"),
        supabase
          .from("express_products")
          .select(
            `*, flash_sale:express_flash_sales(id, flash_price, original_price, discount_percentage, start_time, end_time, max_quantity, is_active)`,
          )
          .eq("seller_id", s.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("express_orders")
          .select(
            "id, order_number, user_id, status, total, service_fee, shipping_fee, customer, shipping_address, eta, payment_status, created_at, items:express_order_items(id,title,quantity,price,thumbnail,shipping_fee)",
          )
          .eq("seller_id", s.id)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      if (catRes.error) throw catRes.error;
      if (prodRes.error) throw prodRes.error;
      if (ordRes.error) throw ordRes.error;

      setCategories(catRes.data?.length ? catRes.data : DEFAULT_CATEGORIES);
      setProducts(prodRes.data || []);
      setOrders(ordRes.data || []);

      // ── Load this seller's reels (stored on Cloudflare R2) ────────────────
      try {
        const { data: reelData, error: reelErr } = await supabase
          .from("reels")
          .select("*")
          .eq("seller_id", s.id)
          .order("created_at", { ascending: false });
        if (reelErr) throw reelErr;
        setReels(reelData || []);
      } catch (re) {
        console.warn("reels load failed", re);
      }

      // ── Load WhatsApp catalog connection (owner RLS) ──────────────────────
      try {
        const { data: wa, error: waErr } = await supabase
          .from("seller_meta_connections")
          .select("catalog_name, last_synced_at")
          .eq("seller_id", s.id)
          .maybeSingle();
        if (waErr) throw waErr;
        setWaConnected(Boolean(wa));
        setWaCatalogName(wa?.catalog_name || null);
        setWaLastSynced(wa?.last_synced_at || null);
      } catch (we) {
        console.warn("whatsapp connection load failed", we);
      }
    } catch (err) {
      console.error("SellerAdmin load error:", err);
      toast.error("Failed to load", err.message || "Please try again");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [supabase, user, fetchSellerId, toast]);

  // A store can only go live when it has a Paystack payment account that is
  // verified/synced. This mirrors the DB trigger (seller-go-live.sql) so the
  // rule is enforced both client-side and server-side.
  const canGoLive = useCallback(() => {
    const acct = seller?.payment_account;
    const verified = Boolean(seller?.account_verified);
    return Boolean(acct) && String(acct).trim().length > 0 && verified;
  }, [seller]);

  const toggleGoLive = useCallback(async () => {
    if (!supabase || !sellerId || togglingLive) return;
    const goingLive = !isLive;
    // Going live requires a synced Paystack account; going offline is always
    // allowed (so a store can pause payouts without re-verifying).
    if (goingLive && !canGoLive()) {
      toast.error(
        "Can't go live yet",
        "Link and verify a Paystack payment account first.",
      );
      navigation.navigate("Payments");
      return;
    }
    // Animated checklist (same pattern as product deletion).
    setLiveToggleFailed(false);
    setLiveSteps([
      {
        key: "check",
        label: goingLive
          ? "Verifying payout account"
          : "Checking store settings",
        status: "active",
      },
      {
        key: "update",
        label: goingLive
          ? "Switching your store to live"
          : "Pausing your store",
        status: "pending",
      },
    ]);
    const setLiveStep = makeStepSetter(setLiveSteps);
    try {
      setTogglingLive(true);
      // Brief beat so the verification step reads as a real checkpoint.
      await new Promise((resolve) => setTimeout(resolve, 450));
      setLiveStep("check", "done");
      setLiveStep("update", "active");
      const next = !isLive;
      const { error } = await supabase
        .from("express_sellers")
        .update({ is_active: next, updated_at: new Date().toISOString() })
        .eq("id", sellerId);
      if (error) throw error;
      setIsLive(next);
      setSeller((prev) => (prev ? { ...prev, is_active: next } : prev));
      setLiveStep("update", "done");
      // Let the finished checklist register before dismissing.
      await new Promise((resolve) => setTimeout(resolve, 550));
      setLiveSteps([]);
      toast.success(next ? "Store is live" : "Store paused", "");
    } catch (err) {
      // Surface the DB-level guard message if the trigger blocked it.
      const msg = err?.message || "Could not update store status";
      setLiveToggleFailed(true);
      failActiveSteps(setLiveSteps);
      toast.error("Go live failed", msg);
    } finally {
      setTogglingLive(false);
    }
  }, [supabase, sellerId, isLive, togglingLive, canGoLive, seller, toast, navigation]);

  // Paystack payout-account state drives the "not live yet" banner + badge:
  //   unlinked → no subaccount yet
  //   pending  → subaccount created, Paystack verification in progress
  //   verified → payout ready; only the Go Live toggle remains
  const paystackState = !seller
    ? "loading"
    : !(seller.payment_account || "").trim()
    ? "unlinked"
    : !seller.account_verified
    ? "pending"
    : "verified";

  const notLiveUi =
    {
      unlinked: {
        icon: "link-outline",
        tint: themeColors.muted,
        sub: "Link a Paystack account to go live.",
        badge: "Paystack · Not linked",
      },
      pending: {
        icon: "time-outline",
        tint: brandColors.accentYellow,
        sub: "Paystack is verifying your payout account.",
        badge: "Paystack · Awaiting verification",
      },
      verified: {
        icon: "rocket-outline",
        tint: brandColors.success,
        sub: "You're all set — tap to publish your store.",
        badge: "Paystack · Verified",
      },
    }[paystackState] || {
      icon: "time-outline",
      tint: themeColors.muted,
      sub: "",
      badge: "",
    };

  // Trigger the edge function that pulls this store's Meta catalog into
  // express_products. Only live stores' products appear in the buyer feed.
  const syncWhatsAppCatalog = useCallback(async () => {
    if (!sellerId || waSyncing) return;
    setWaSyncing(true);
    try {
      const res = await callEdgeFunction("sync-whatsapp-catalog", {
        sellerId,
      });
      if (!res || !res.success) {
        throw new Error(res?.error || "Sync failed");
      }
      toast.success(
        "Catalog synced",
        `${res.total || 0} item(s) imported from WhatsApp`,
      );
      setWaLastSynced(new Date().toISOString());
      // Refresh products so newly synced items show immediately.
      loadData();
    } catch (err) {
      toast.error(
        "Sync failed",
        err?.message || "Check your WhatsApp catalog connection",
      );
    } finally {
      setWaSyncing(false);
    }
  }, [sellerId, waSyncing, toast, loadData]);

  // ── Meta Embedded Signup (in-app WebView, redirect-based) ─────────────────
  // The edge function runs the whole flow: it 302s the WebView straight to
  // Meta's Facebook Login for Business dialog (config_id — the Embedded Signup
  // configuration created in App Dashboard → WhatsApp → Embedded Signup
  // Builder). No popup is involved, so it behaves identically on iOS, Android,
  // and web. Meta sends the authorization code back to the edge function,
  // which exchanges it server-side and returns a small result page reporting
  // the outcome here via postMessage. No redirect-URI handling and no
  // deep-link listener in the app.
  //
  // mode="login" → standard Facebook Login for Business (no config_id). Used
  // as an AUTOMATIC fallback when Meta blocks Embedded Signup with its
  // "isn't using a secure connection" error — that block is Meta's business-
  // verification gate, and the plain login flow works for app admins in
  // development mode without verification.
  const waFallbackRef = useRef(false);
  const connectWhatsAppCatalog = useCallback(
    (mode?: "login") => {
      if (!sellerId || waConnecting) return;
      // Fresh user-initiated attempts always start with Embedded Signup;
      // only the automatic retry passes mode="login" (and keeps the flag).
      if (mode !== "login") waFallbackRef.current = false;
      // Open the host modal first — the WebView lives inside it.
      setWaModalVisible(true);
      setWaConnecting(true);
      setWaAuthUrl(
        `${supabaseUrl}/functions/v1/meta-oauth-callback?launch=1&sellerId=${encodeURIComponent(sellerId)}${mode === "login" ? "&mode=login" : ""}`,
      );
    },
    [sellerId, waConnecting],
  );

  // Receive the outcome posted by the edge function's result page.
  const onWaWebViewMessage = useCallback(
    async (event) => {
      let data;
      try {
        data = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      if (data?.type !== "wa_oauth_result") return;
      setWaConnecting(false);
      setWaAuthUrl(null);
      if (data.success) {
        setWaConnected(true);
        setWaCatalogName(
          typeof data.catalogName === "string" ? data.catalogName : null,
        );
        setWaModalVisible(false);
        toast.success("WhatsApp connected", "Tap Sync to import your products");
        loadData();
      } else {
        let errText =
          typeof data.error === "string"
            ? data.error
            : "Could not finish WhatsApp setup";
        // Meta's "insecure connection" hard-block → give the seller the exact
        // App Dashboard checklist that resolves it.
        if (/secure connection/i.test(errText)) {
          errText =
            "Meta blocked login. Fix in developers.facebook.com → your app:\n" +
            "1. Settings → Basic → add an https Site URL + the domain " +
            "meiljgoztnhnyvtfkzuh.supabase.co under App Domains.\n" +
            "2. Facebook Login → Settings → add https://" +
            "meiljgoztnhnyvtfkzuh.supabase.co/functions/v1/meta-oauth-callback " +
            "to Valid OAuth Redirect URIs.\n" +
            "3. Turn ON Enforce HTTPS, then retry.";
        }
        // Auto-fallback: Embedded Signup is gated behind Meta Business
        // Verification. When Meta blocks it with the "secure connection"
        // error, transparently retry ONCE with standard Login for Business
        // (no config_id) — that flow works for app admins in dev mode.
        if (
          !waFallbackRef.current &&
          /secure connection|blocked login/i.test(errText)
        ) {
          waFallbackRef.current = true;
          toast.info(
            "Retrying with alternate login",
            "Meta blocked Embedded Signup — switching to standard login…",
          );
          connectWhatsAppCatalog("login");
          return;
        }
        toast.error("Connection failed", errText);
      }
    },
    [toast, loadData, connectWhatsAppCatalog],
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── CRUD helpers ────────────────────────────────────────────────────────
  const createProduct = useCallback(
    async (data) => {
      if (!sellerId) throw new Error("Seller profile missing");
      const { data: created, error } = await supabase
        .from("express_products")
        .insert({ ...data, seller_id: sellerId, status: "active" })
        .select()
        .single();
      if (error) throw error;
      setProducts((prev) => [created, ...prev]);

      // Rich-push notify this store's followers about the new product.
      // Queued for immediate delivery — the scheduled-notifications cron
      // drains it within ~5 minutes. Best-effort: never blocks creation.
      try {
        const { data: follows, error: followsErr } = await supabase
          .from("express_follows")
          .select("user_id")
          .eq("seller_id", sellerId);
        if (!followsErr && follows?.length > 0) {
          const discountNote =
            Number(created.discount) > 0
              ? ` (${Number(created.discount)}% off!)`
              : "";
          await supabase.from("express_scheduled_notifications").insert({
            title: `New in ${seller?.name || "a store you follow"} ✨`,
            body: `${created.title} — GH₵${Number(created.price).toFixed(
              2,
            )}${discountNote}`,
            // FCM requires an absolute https URL for the big picture —
            // resolve bare R2 keys first.
            image_url: created.thumbnail
              ? resolveMediaUrl(created.thumbnail, R2_FOLDERS.PRODUCTS)
              : null,
            notification_type: "promotion",
            channel_id: "promotions",
            target_type: "users",
            target_value: follows.map((f) => f.user_id),
            data: {
              screen: "ProductDetail",
              params: JSON.stringify({ productId: created.id }),
              sellerId,
            },
            send_at: new Date().toISOString(),
            repeat_interval: "none",
          });
        }
      } catch (notifyErr) {
        console.warn(
          "[createProduct] follower notification failed:",
          notifyErr?.message || notifyErr,
        );
      }

      return created;
    },
    [sellerId, seller],
  );

  const updateProduct = useCallback(async (id, updates) => {
    const { data, error } = await supabase
      .from("express_products")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    setProducts((prev) => prev.map((p) => (p.id === id ? data : p)));
    return data;
  }, []);

  const updateProductStatus = useCallback(async (id, status) => {
    const { error } = await supabase
      .from("express_products")
      .update({ status })
      .eq("id", id);
    if (error) throw error;
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status } : p)),
    );
  }, []);

  const deleteProduct = useCallback(
    // onStep(key, "active" | "done") lets the UI show live media-removal
    // progress while the deletion runs.
    async (id, onStep) => {
      // 1 ── Load the product (state first, then DB) so we know which media
      //      files belong to it before the row disappears.
      let product = products.find((p) => p.id === id) || null;
      if (!product) {
        const { data, error: fetchError } = await supabase
          .from("express_products")
          .select("id, thumbnail, thumbnails, video_url, r2_video_key")
          .eq("id", id)
          .maybeSingle();
        if (fetchError) throw fetchError;
        product = data;
      }

      // 2 ── Detach/clear rows that reference the product so its FK
      //      constraints can't block deletion (the shipped schema defines
      //      these FKs without ON DELETE actions). Cleanup steps are
      //      best-effort: a failed step is logged but never blocks the rest.
      const detachSteps = [
        ["cart items", () => supabase.from("express_cart_items").delete().eq("product_id", id)],
        ["wishlist entries", () => supabase.from("express_wishlists").delete().eq("product_id", id)],
        ["reviews", () => supabase.from("express_reviews").delete().eq("product_id", id)],
        ["flash sale", () => supabase.from("express_flash_sales").delete().eq("product_id", id)],
        // Order history and reels must survive the product — they only lose
        // the (now-dead) product link.
        [
          "order item links",
          () =>
            supabase
              .from("express_order_items")
              .update({ product_id: null })
              .eq("product_id", id),
        ],
        [
          "reel links",
          () => supabase.from("reels").update({ product_id: null }).eq("product_id", id),
        ],
      ];
      onStep?.("refs", "active");
      await Promise.all(
        detachSteps.map(async ([label, run]) => {
          try {
            const { error } = await run();
            if (error) console.warn(`[deleteProduct] clearing ${label} failed:`, error.message);
          } catch (e) {
            console.warn(`[deleteProduct] clearing ${label} failed:`, e);
          }
        }),
      );
      onStep?.("refs", "done");

      // 3 ── Delete the product images from wherever they live: legacy files
      //      sit in the Supabase Storage bucket, new uploads in R2 —
      //      deleteMediaByUrl routes each URL to the right backend.
      const imageUrls = Array.from(
        new Set(
          [
            ...(Array.isArray(product?.thumbnails) ? product.thumbnails : []),
            ...(product?.thumbnail ? [product.thumbnail] : []),
          ].filter(Boolean),
        ),
      );
      onStep?.("images", "active");
      await Promise.all(
        imageUrls.map(async (url) => {
          try {
            await deleteMediaByUrl(url);
          } catch (e) {
            console.warn(`[deleteProduct] image delete failed for ${url}:`, e);
          }
        }),
      );
      onStep?.("images", "done");

      // 4 ── Delete the attached product video from R2 using the stored key,
      //      falling back to the key derived from its public URL.
      if (product?.video_url || product?.r2_video_key) {
        onStep?.("video", "active");
        const videoKey =
          product.r2_video_key || getStoragePathFromUrl(product.video_url);
        if (videoKey) {
          try {
            await supabase.functions.invoke("delete-r2-object", {
              body: { key: videoKey },
            });
          } catch (e) {
            console.warn("[deleteProduct] R2 video delete failed (continuing)", e);
          }
        }
        onStep?.("video", "done");
      }

      // 5 ── Finally remove the product row itself. Appending .select() makes
      //      Supabase return the deleted rows so we can distinguish a real
      //      delete from an RLS-silent no-op (a blocked delete still resolves
      //      successfully but with zero rows).
      onStep?.("product", "active");
      const { data: deletedRows, error } = await supabase
        .from("express_products")
        .delete()
        .eq("id", id)
        .select();
      if (error) throw error;
      if (!deletedRows || deletedRows.length === 0) {
        throw new Error(
          "The database refused to delete this product (missing DELETE permission). " +
            "Run supabase/schema/product-delete-rls.sql and product-delete-cascade.sql in the Supabase SQL editor.",
        );
      }
      onStep?.("product", "done");
      setProducts((prev) => prev.filter((p) => p.id !== id));
    },
    [products],
  );

  // Remove a seller reel: delete the R2 object (best-effort) then the DB row.
  const deleteReel = useCallback(
    async (id) => {
      const reel = reels.find((r) => r.id === id);
      if (!reel || deletingReelId) return;
      setDeletingReelId(`reel-${id}`);
      try {
        if (reel.r2_key) {
          try {
            await supabase.functions.invoke("delete-r2-object", {
              body: { key: reel.r2_key },
            });
          } catch (e) {
            console.warn("R2 object delete failed (continuing)", e);
          }
        }
        const { error } = await supabase.from("reels").delete().eq("id", id);
        if (error) throw error;
        setReels((prev) => prev.filter((r) => r.id !== id));
        toast.success("Reel deleted", "Removed from your store");
      } catch (e) {
        toast.error("Delete failed", e.message || "Could not delete reel");
      } finally {
        setDeletingReelId(null);
      }
    },
    [reels, deletingReelId, toast],
  );

  const deleteProductVideo = useCallback(
    async (product) => {
      if (!product?.video_url || deletingReelId) return;
      const key =
        product.r2_video_key || getStoragePathFromUrl(product.video_url);
      if (!key) {
        throw new Error("Could not determine product video key");
      }
      setDeletingReelId(`product-${product.id}`);
      try {
        try {
          await supabase.functions.invoke("delete-r2-object", {
            body: { key },
          });
        } catch (e) {
          console.warn("R2 object delete failed (continuing)", e);
        }

        await updateProduct(product.id, {
          video_url: null,
          r2_video_key: null,
        });
        toast.success("Video deleted", "Removed from R2 and product listing");
      } finally {
        setDeletingReelId(null);
      }
    },
    [deletingReelId, toast, updateProduct],
  );

  const advanceOrderStatus = useCallback(
    async (orderId, status) => {
      const existing = orders.find((o) => o.id === orderId);
      const updates = { status, updated_at: new Date().toISOString() };
      if (status === "shipped") updates.shipped_at = new Date().toISOString();
      if (status === "delivered")
        updates.delivered_at = new Date().toISOString();

      const { error } = await supabase
        .from("express_orders")
        .update(updates)
        .eq("id", orderId);
      if (error) throw error;
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, ...updates } : o)),
      );

      try {
        let customerId = existing?.user_id;
        let orderNumber = existing?.order_number;
        if (!customerId) {
          const { data: fresh } = await supabase
            .from("express_orders")
            .select("user_id, order_number")
            .eq("id", orderId)
            .single();
          customerId = fresh?.user_id;
          orderNumber = fresh?.order_number;
        }
        if (customerId)
          await notifyOrderStatusUpdate(
            customerId,
            orderId,
            status,
            orderNumber,
          );
      } catch (e) {
        console.warn("order notify failed", e);
      }
    },
    [orders],
  );

  // ── Product form ────────────────────────────────────────────────────────
  const resetProductFormState = () => {
    setTitle("");
    setPrice("");
    setShippingFee("");
    setCategory("");
    setDescription("");
    setDiscount(0);
    setImageUris([]);
    setImageFiles({});
    setExistingImageUrls([]);
    setRemovingImageUrl(null);
    setSelectedSizes([]);
    setSelectedColors([]);
    setQuantity("");
    setSku("");
    setWeight("");
    setBarcode("");
    setVendor("");
    setCompareAtPrice("");
    setCostPrice("");
    setTrackInventory(true);
    setAllowBackorder(false);
    setIsPreorder(false);
    setWeightUnit("kg");
    setSlug("");
    setTags([]);
    setTagInput("");
    setSpecifications([]);
    setProductFormStep(1);
    setVideoUri(null);
    setVideoFile(null);
    setExistingVideoUrl(null);
    setUploadingVideo(false);
    setRemovingVideo(false);
    setEditingProduct(null);
  };

  const openCreateModal = () => {
    resetProductFormState();
    setModalVisible(true);
  };

  const openEditModal = (product) => {
    setEditingProduct(product);
    setTitle(product.title || "");
    setPrice(product.price?.toString() || "");
    setShippingFee(product.shipping_fee?.toString() || "");
    setCategory(product.category || "");
    setDescription(product.description || "");
    setDiscount(product.discount || 0);
    setQuantity(product.quantity?.toString() || "");
    setSku(product.sku || "");
    setWeight(product.weight?.toString() || "");
    setBarcode(product.barcode || "");
    setVendor(product.vendor || "");
    setCompareAtPrice(product.compare_at_price?.toString() || "");
    setCostPrice(product.cost_price?.toString() || "");
    setSelectedSizes(product.sizes || []);
    // Legacy rows may store plain strings — normalize to {name, hex} objects.
    setSelectedColors(
      (Array.isArray(product.colors) ? product.colors : [])
        .map((c) =>
          typeof c === "string"
            ? AVAILABLE_COLORS.find((a) => a.name === c) || {
                name: c,
                hex: "#CCC",
              }
            : c,
        )
        .filter((c) => c?.name),
    );
    setWeightUnit(product.weight_unit || "kg");
    setSlug(product.slug || "");
    setTags(Array.isArray(product.tags) ? product.tags.filter(Boolean) : []);
    setTagInput("");
    setTrackInventory(product.track_inventory ?? true);
    setAllowBackorder(product.allow_backorder ?? false);
    setIsPreorder(!!product.is_preorder);
    setProductFormStep(1);
    if (product.specifications && typeof product.specifications === "object") {
      setSpecifications(
        Object.entries(product.specifications).map(([k, v]) => ({
          key: k,
          value: v,
        })),
      );
    } else {
      setSpecifications([]);
    }
    const current =
      Array.isArray(product.thumbnails) &&
      product.thumbnails.filter(Boolean).length
        ? product.thumbnails.filter(Boolean)
        : product.thumbnail
          ? [product.thumbnail]
          : [];
    setExistingImageUrls(current);
    setRemovingImageUrl(null);
    setImageUris([]);
    setImageFiles({});
    setVideoUri(null);
    setVideoFile(null);
    setExistingVideoUrl(product.video_url || null);
    setModalVisible(true);
  };

  const getStoragePathFromUrl = (url) => getKeyFromUrl(url);

  const deleteProductImageFromStorage = async (url) => {
    // Legacy files live in Supabase Storage, new ones in R2 — route by URL.
    await deleteMediaByUrl(url);
  };

  const handleRemoveExistingImage = async (url) => {
    if (!editingProduct || removingImageUrl) return;
    const next = existingImageUrls.filter((u) => u !== url);
    setRemovingImageUrl(url);
    try {
      await deleteProductImageFromStorage(url);
      await updateProduct(editingProduct.id, {
        thumbnail: next[0] || null,
        thumbnails: next.length ? next : null,
        status: "active",
      });
      setExistingImageUrls(next);
      setEditingProduct((p) =>
        p ? { ...p, thumbnail: next[0] || null, thumbnails: next } : p,
      );
      setViewingProduct((p) =>
        p && p.id === editingProduct.id
          ? {
              ...p,
              thumbnail: next[0] || null,
              thumbnails: next,
              status: "active",
            }
          : p,
      );
      toast.success("Image removed", "Image deleted from storage");
    } catch (e) {
      toast.error("Delete failed", e.message || "Could not delete image");
    } finally {
      setRemovingImageUrl(null);
    }
  };

  const pickImage = async () => {
    const count = imageUris.length + existingImageUrls.length;
    if (count >= 5) {
      toast.warning("Maximum images", "You can upload up to 5 images");
      return;
    }
    if (Platform.OS !== "web") {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        toast.error(
          "Permission needed",
          "Please grant camera roll permissions",
        );
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1,
      allowsMultipleSelection: true,
      selectionLimit: 5 - count,
    });
    if (!result.canceled) {
      const uris = result.assets.map((a) => a.uri);
      setImageUris((prev) => [...prev, ...uris]);
      if (Platform.OS === "web") {
        setImageFiles((prev) => {
          const next = { ...prev };
          result.assets.forEach((a) => {
            if (a?.uri && a?.file) {
              next[a.uri] = {
                file: a.file,
                type: a.mimeType || a.file?.type || null,
                name: a.fileName || a.file?.name || null,
              };
            }
          });
          return next;
        });
      }
    }
  };

  const uploadImage = async (uri) => {
    const getExt = (u) => {
      const seg = u?.split("?")[0]?.split("/").pop() || "";
      const ext = seg.includes(".")
        ? seg.split(".").pop()?.toLowerCase()
        : null;
      if (!ext || ext.length > 5) return "jpg";
      return ext === "jpeg" ? "jpg" : ext;
    };
    const ext = getExt(uri);
    const fileName = `product-${Date.now()}-${Math.random()
      .toString(36)
      .substring(7)}.${ext}`;
    const folder = sellerId || "unknown";
    const r2Folder = `${R2_FOLDERS.PRODUCTS}/products/${folder}`;

    // Upload to Cloudflare R2 via presigned URL (web Blob / native bytes).
    const picked =
      Platform.OS === "web" ? imageFiles?.[uri]?.file || null : null;
    const pickedType =
      Platform.OS === "web" ? imageFiles?.[uri]?.type || null : null;

    const { publicUrl } = await uploadToR2Presigned({
      uri,
      pickedFile: picked,
      folder: r2Folder,
      fileName,
    });
    return publicUrl;
  };

  const uploadImages = async (uris) =>
    Promise.all(uris.map((u) => uploadImage(u)));

  // ── Product video: pick + upload to Cloudflare R2 ──────────────────────
  const pickVideo = async () => {
    if (Platform.OS !== "web") {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        toast.error(
          "Permission needed",
          "Please grant camera roll permissions",
        );
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      allowsEditing: true,
      videoMaxDuration: 180,
      quality: 1,
    });
    if (!result.canceled && result.assets?.length) {
      const asset = result.assets[0];
      const sizeBytes = Number(
        asset?.fileSize || asset?.size || asset?.file?.size || 0,
      );
      if (sizeBytes > MAX_VIDEO_UPLOAD_BYTES) {
        toast.error(
          "Video too large",
          `Choose a video smaller than ${formatBytes(MAX_VIDEO_UPLOAD_BYTES)}.`,
        );
        return;
      }
      setVideoUri(asset.uri);
      if (Platform.OS === "web") {
        const type = normalizePickedVideoType(asset);
        setVideoFile({
          file: asset.file || null,
          type,
          name: asset.fileName || asset.uri?.split("/").pop() || "video.mp4",
        });
      } else {
        setVideoFile(null);
      }
    }
  };

  const pickVideoForProductAttach = async () => {
    if (Platform.OS !== "web") {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        toast.error(
          "Permission needed",
          "Please grant camera roll permissions",
        );
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      allowsEditing: true,
      videoMaxDuration: 180,
      quality: 1,
    });

    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    const sizeBytes = Number(
      asset?.fileSize || asset?.size || asset?.file?.size || 0,
    );
    if (sizeBytes > MAX_VIDEO_UPLOAD_BYTES) {
      toast.error(
        "Video too large",
        `Choose a video smaller than ${formatBytes(MAX_VIDEO_UPLOAD_BYTES)}.`,
      );
      return;
    }

    // Hold the picked video and show the product picker so the seller can
    // choose which product to attach it to from a modal.
    setPendingVideo({
      uri: asset.uri,
      pickedFile: Platform.OS === "web" ? asset.file || null : null,
      title: asset.fileName || asset.uri?.split("/").pop() || "Product video",
    });
    setProductSelectModalVisible(true);
  };

  // Attach the previously picked video to the chosen product.
  const attachPendingVideoToProduct = useCallback(
    (product) => {
      if (!pendingVideo || !product) return;
      setProductSelectModalVisible(false);
      void startBackgroundVideoUpload({
        productId: product.id,
        productTitle: product.title,
        uri: pendingVideo.uri,
        pickedFile: pendingVideo.pickedFile,
      });
      setPendingVideo(null);
    },
    [pendingVideo],
  );

  // Uploads a local video file to Cloudflare R2 via the get-r2-upload-url edge
  // function, then returns the public URL + R2 object key.
  //
  // On native we use expo-file-system's createUploadTask with BINARY_CONTENT so
  // the raw file bytes are streamed straight to R2 (the reliable React Native
  // path — reading a local file into a Blob via fetch/XHR is unsupported and was
  // silently storing empty/garbage objects). On web we PUT the picked Blob.
  const uploadVideoToR2 = async (uri, pickedFile, onProgress) => {
    const { contentType, extension } = getVideoUploadDetails(uri, pickedFile);
    const fileName = `product-video-${Date.now()}-${Math.random()
      .toString(36)
      .substring(7)}.${extension}`;
    const uploadFolderOwnerId = sellerId || user?.id;
    if (!uploadFolderOwnerId) {
      throw new Error("Could not resolve upload folder owner id");
    }

    // ── 1. Request a presigned PUT URL from the edge function ────────────────
    let presigned;
    try {
      const { data, error } = await supabase.functions.invoke(
        "get-r2-upload-url",
        {
          body: {
            fileName,
            fileType: contentType,
            folder: `products/${uploadFolderOwnerId}`,
          },
        },
      );
      if (error) throw new Error(error.message || "Failed to get upload URL");
      if (!data?.uploadUrl || !data?.publicUrl) {
        throw new Error("Edge function returned an invalid response");
      }
      presigned = data;
    } catch (err) {
      console.error("[uploadVideoToR2] get-r2-upload-url failed:", err);
      throw new Error(`Could not prepare video upload: ${err.message}`);
    }

    const { uploadUrl, publicUrl, key } = presigned;

    // ── 2. PUT the video bytes directly to R2 ────────────────────────────────
    try {
      if (Platform.OS === "web") {
        const body =
          pickedFile instanceof Blob ? pickedFile : await getBlobFromUri(uri);
        if (!body) throw new Error("Could not read the selected video file");

        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", uploadUrl, true);
          xhr.setRequestHeader("Content-Type", contentType);
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              onProgress?.(Math.min(1, event.loaded / event.total));
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              onProgress?.(1);
              resolve();
              return;
            }
            reject(
              new Error(`R2 video upload failed with status ${xhr.status}`),
            );
          };
          xhr.onerror = () => reject(new Error("R2 video upload failed"));
          xhr.send(body);
        });
      } else {
        // expo-file-system progress callback gives us upload progress on native.
        const totalBytes = await getVideoSizeBytes(uri, pickedFile);
        const uploadTask = FileSystem.createUploadTask(
          uploadTaskUrl(uploadUrl),
          uri,
          {
            httpMethod: "PUT",
            headers: { "Content-Type": contentType },
            uploadType: 0, // FileSystemUploadType.BINARY_CONTENT
          },
          (event) => {
            if (event?.totalBytesSent && totalBytes > 0) {
              onProgress?.(Math.min(1, event.totalBytesSent / totalBytes));
            }
          },
        );
        const result = await uploadTask.uploadAsync();
        if (!result) {
          throw new Error("R2 video upload failed: no response returned");
        }
        if (result.status !== 200) {
          console.error(
            "[uploadVideoToR2] R2 upload failed:",
            result.status,
            result.body,
          );
          throw new Error(
            `R2 video upload failed with status ${result.status}`,
          );
        }
        onProgress?.(1);
      }
    } catch (err) {
      console.error("[uploadVideoToR2] upload to R2 failed:", err);
      throw err;
    }

    return { publicUrl, key };
  };

  // expo-file-system expects a string URL; guard against accidental undefined.
  const uploadTaskUrl = (url) => {
    if (!url || typeof url !== "string") {
      throw new Error("Missing R2 upload URL");
    }
    return url;
  };

  const goToNextProductStep = () => {
    if (productFormStep === 1) {
      if (!title || !price || !category) {
        toast.warning(
          "Missing info",
          "Please fill title, price, and category before continuing.",
        );
        return;
      }
    }

    if (productFormStep === 2 && !isPreorder && !quantity) {
      toast.warning(
        "Missing info",
        "Please add a quantity or mark the product as preorder.",
      );
      return;
    }

    setProductFormStep((current) =>
      Math.min(PRODUCT_FORM_STEPS.length, current + 1),
    );
  };

  const goToPreviousProductStep = () => {
    setProductFormStep((current) => Math.max(1, current - 1));
  };

  // Remove an existing (already-saved) product video from R2-backed URL.
  // The R2 key is stored on the product so we can delete the object later;
  // for now we simply clear the reference and let it be overwritten.
  const handleRemoveExistingVideo = async () => {
    if (!editingProduct || removingVideo || !existingVideoUrl) return;
    setRemovingVideo(true);
    try {
      await updateProduct(editingProduct.id, {
        video_url: null,
        r2_video_key: null,
        status: "active",
      });
      setExistingVideoUrl(null);
      setEditingProduct((p) =>
        p ? { ...p, video_url: null, r2_video_key: null } : p,
      );
      toast.success("Video removed", "Product video cleared");
    } catch (e) {
      toast.error("Remove failed", e.message || "Could not remove video");
    } finally {
      setRemovingVideo(false);
    }
  };

  const handleActionSheet = (action) => {
    setActionSheetVisible(false);
    if (!selectedProduct) return;
    switch (action) {
      case "view":
        setViewingProduct(selectedProduct);
        setDetailModalVisible(true);
        break;
      case "edit":
        openEditModal(selectedProduct);
        break;
      case "duplicate":
        updateProductStatus(selectedProduct.id, "draft");
        break;
      case "toggle_status":
        updateProductStatus(
          selectedProduct.id,
          selectedProduct.status === "active" ? "draft" : "pending",
        );
        break;
      case "restock":
        setRestockQuantity("");
        setRestockModalVisible(true);
        break;
      case "flash_sale":
        setFlashSalePrice("");
        setFlashSaleMaxQty("");
        setFlashSaleStartDate(new Date());
        setFlashSaleEndDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
        setFlashSaleModalVisible(true);
        break;
      case "delete":
        // Ask before destroying: opens the confirmation dialog; the actual
        // delete runs from confirmDeleteProduct().
        setDeleteSteps([]);
        setDeleteConfirmProduct(selectedProduct);
        break;
    }
  };

  const handleRestock = async () => {
    if (!selectedProduct) return;
    const qty = parseInt(restockQuantity, 10);
    if (Number.isNaN(qty) || qty <= 0) {
      toast.warning("Invalid quantity", "Enter a positive amount");
      return;
    }
    setRestockSubmitting(true);
    try {
      const current = parseInt(selectedProduct.quantity || 0, 10) || 0;
      const nextQty = current + qty;
      await updateProduct(selectedProduct.id, { quantity: nextQty });
      setSelectedProduct((p) => (p ? { ...p, quantity: nextQty } : p));
      setViewingProduct((p) =>
        p && p.id === selectedProduct.id ? { ...p, quantity: nextQty } : p,
      );
      setRestockModalVisible(false);
      setRestockQuantity("");
      toast.success("Restocked", `Stock updated to ${nextQty}`);
    } catch (e) {
      toast.error("Restock Failed", e.message || "Please try again");
    } finally {
      setRestockSubmitting(false);
    }
  };

  const handleCreateFlashSale = async () => {
    if (!selectedProduct || !flashSalePrice) {
      toast.warning("Missing Info", "Please enter a flash sale price");
      return;
    }
    const fPrice = parseFloat(flashSalePrice);
    const oPrice = parseFloat(selectedProduct.price);
    if (fPrice >= oPrice) {
      toast.error("Invalid Price", "Flash price must be lower than original");
      return;
    }
    if (flashSaleEndDate <= flashSaleStartDate) {
      toast.error("Invalid Dates", "End date must be after start date");
      return;
    }
    setSubmitting(true);
    const { success, error } = await sellerFlashSaleService.createFlashSale({
      productId: selectedProduct.id,
      sellerId,
      flashPrice: fPrice,
      originalPrice: oPrice,
      startTime: flashSaleStartDate.toISOString(),
      endTime: flashSaleEndDate.toISOString(),
      maxQuantity: flashSaleMaxQty ? parseInt(flashSaleMaxQty) : null,
    });
    setSubmitting(false);
    if (success) {
      toast.success(
        "Flash Sale Created",
        `Flash sale for ${selectedProduct.title}`,
      );
      setFlashSaleModalVisible(false);
      setSelectedProduct(null);
    } else {
      toast.error("Error", error || "Failed to create flash sale");
    }
  };

  const upsertVideoUploadJob = useCallback((jobId, patch) => {
    setVideoUploadJobs((prev) => {
      const next = prev.some((job) => job.id === jobId)
        ? prev.map((job) => (job.id === jobId ? { ...job, ...patch } : job))
        : [{ id: jobId, ...patch }, ...prev];
      return next.slice(0, 8);
    });
  }, []);

  const startBackgroundVideoUpload = useCallback(
    async ({ productId, productTitle, uri, pickedFile }) => {
      const jobId = `video-upload-${productId || Date.now()}`;
      upsertVideoUploadJob(jobId, {
        productId,
        title: productTitle || "Product video",
        progress: 0,
        status: "queued",
        message: "Queued for upload",
      });

      try {
        const sizeBytes = await getVideoSizeBytes(uri, pickedFile);
        if (sizeBytes > MAX_VIDEO_UPLOAD_BYTES) {
          throw new Error(
            `Video is ${formatBytes(sizeBytes)}. Limit is ${formatBytes(MAX_VIDEO_UPLOAD_BYTES)}.`,
          );
        }

        upsertVideoUploadJob(jobId, {
          status: "uploading",
          message: "Preparing upload URL",
        });

        const { publicUrl, key } = await uploadVideoToR2(
          uri,
          pickedFile,
          (progress) => {
            upsertVideoUploadJob(jobId, {
              status: "uploading",
              progress,
              message:
                progress >= 1
                  ? "Finalizing upload"
                  : `Uploading ${Math.round(progress * 100)}%`,
            });
          },
        );

        upsertVideoUploadJob(jobId, {
          status: "saving",
          progress: 1,
          message: "Saving video reference",
        });

        await updateProduct(productId, {
          video_url: publicUrl,
          r2_video_key: key,
        });

        try {
          await supabase.functions.invoke("transcode-reel", {
            body: {
              sourceKey: key,
              ownerTable: "express_products",
              ownerId: productId,
              hlsUrlColumn: "video_hls_url",
            },
          });
        } catch (transcodeErr) {
          console.warn(
            "Failed to enqueue product video transcode:",
            transcodeErr,
          );
        }

        upsertVideoUploadJob(jobId, {
          status: "done",
          progress: 1,
          message: "Uploaded and saved",
          publicUrl,
          r2Key: key,
        });
        toast.success(
          "Video uploaded",
          `${productTitle || "Product"} video is now live`,
        );
      } catch (error) {
        upsertVideoUploadJob(jobId, {
          status: "error",
          progress: 0,
          message: error.message || "Upload failed",
        });
        toast.error(
          "Video upload failed",
          error.message || "Could not upload the video",
        );
      }
    },
    [toast, updateProduct, upsertVideoUploadJob],
  );

  const submitProduct = async () => {
    if (!title || !price || !category || (!isPreorder && !quantity)) {
      toast.warning(
        "Missing info",
        isPreorder
          ? "Please fill title, price, and category."
          : "Please fill title, price, category, and quantity.",
      );
      return;
    }
    setSubmitting(true);
    setSubmitStage(null);
    // Animated checklist (same pattern as product deletion).
    setCreateFailed(false);
    setCreateSteps([
      ...(imageUris.length
        ? [
            {
              key: "images",
              label: `Uploading ${imageUris.length} image${
                imageUris.length > 1 ? "s" : ""
              }`,
              status: "pending",
            },
          ]
        : []),
      {
        key: "save",
        label: editingProduct ? "Saving changes" : "Publishing product",
        status: "pending",
      },
    ]);
    const setCreateStep = makeStepSetter(setCreateSteps);
    try {
      let imageUrls = [];
      if (imageUris.length > 0) {
        setSubmitStage(
          `Uploading ${imageUris.length} image${imageUris.length > 1 ? "s" : ""}…`,
        );
        setCreateStep("images", "active");
        console.log(
          `[submitProduct] uploading ${imageUris.length} image(s) to R2`,
        );
        try {
          imageUrls = await uploadImages(imageUris);
          console.log(
            `[submitProduct] image upload done: ${imageUrls.length} url(s)`,
            imageUrls,
          );
          setCreateStep("images", "done");
        } catch (imgErr) {
          console.error("[submitProduct] image upload failed:", imgErr);
          if (imgErr?.stack) {
            console.error("[submitProduct] image upload stack:", imgErr.stack);
          }
          throw new Error(
            `Image upload failed: ${imgErr?.message || "Unknown error"}`,
          );
        }
      }
      const merged = editingProduct
        ? [...existingImageUrls, ...imageUrls]
        : imageUrls;

      const specsObj = {};
      specifications.forEach((s) => {
        if (s.key && s.value) specsObj[s.key] = s.value;
      });

      // A tag typed right before tapping Save is committed via onBlur, but
      // this handler closed over the previous render's `tags` — so merge any
      // still-pending tagInput here or the last tag would never be uploaded.
      const pendingTag = tagInput.trim();
      const tagsToSave = [
        ...tags,
        ...(pendingTag &&
        !tags.some((x) => x.toLowerCase() === pendingTag.toLowerCase())
          ? [pendingTag]
          : []),
      ]
        .map((t) => String(t).trim())
        .filter(Boolean);

      const productData = {
        title,
        price: parseFloat(price),
        shipping_fee: shippingFee ? parseFloat(shippingFee) : 0,
        category,
        category_id:
          categories.find((c) => c.name === category || c.id === category)
            ?.id || null,
        description,
        discount,
        sizes: selectedSizes,
        badges: [
          ...(!shippingFee || parseFloat(shippingFee) === 0
            ? ["free_shipping"]
            : []),
          ...(!isPreorder && quantity && parseInt(quantity) > 0
            ? ["limited_stock"]
            : []),
        ],
        // selectedColors holds {name, hex} objects — persist only the names
        // so the customer app (which expects plain strings) renders correctly.
        colors: selectedColors
          .map((c) => (typeof c === "string" ? c : c?.name))
          .filter(Boolean),
        quantity: quantity ? parseInt(quantity) : 0,
        sku: sku || null,
        weight: weight ? parseFloat(weight) : null,
        weight_unit: weightUnit || "kg",
        barcode: barcode || null,
        vendor: vendor || null,
        slug: slug || null,
        tags: tagsToSave,
        compare_at_price: compareAtPrice ? parseFloat(compareAtPrice) : null,
        cost_price: costPrice ? parseFloat(costPrice) : null,
        track_inventory: trackInventory,
        allow_backorder: allowBackorder,
        is_preorder: isPreorder,
        specifications: Object.keys(specsObj).length ? specsObj : null,
      };
      productData.thumbnail = merged[0] || null;
      productData.thumbnails = merged.length ? merged : null;
      productData.video_url = editingProduct ? existingVideoUrl || null : null;
      productData.r2_video_key = editingProduct
        ? editingProduct.r2_video_key || null
        : null;

      let savedProductId = editingProduct?.id ?? null;

      setSubmitStage(
        editingProduct ? "Updating product…" : "Creating product…",
      );
      setCreateStep("save", "active");
      console.log(
        `[submitProduct] ${editingProduct ? "updating" : "creating"} product:`,
        JSON.stringify({
          ...productData,
          thumbnails: productData.thumbnails?.length,
          specifications: "object",
        }),
      );

      if (editingProduct) {
        productData.status = "active";
        await updateProduct(editingProduct.id, productData);
        toast.success("Updated", "Product updated and is now live");
      } else {
        const created = await createProduct(productData);
        savedProductId = created?.id ?? null;
        console.log("[submitProduct] created product id:", savedProductId);
        toast.success("Created", "Product created and is now live");
      }

      setCreateStep("save", "done");
      if (videoUri && savedProductId) {
        void startBackgroundVideoUpload({
          productId: savedProductId,
          productTitle: title,
          uri: videoUri,
          pickedFile: videoFile?.file || null,
        });
        setCreateSteps((prev) => [
          ...prev,
          {
            key: "video",
            label: "Video uploading in background",
            status: "done",
          },
        ]);
      }

      // Give the finished checklist a beat before the form closes.
      await new Promise((resolve) => setTimeout(resolve, 700));
      setCreateSteps([]);
      setCreateFailed(false);
      resetProductFormState();
      setModalVisible(false);
    } catch (e) {
      console.error("[submitProduct] failed:", e);
      setCreateFailed(true);
      failActiveSteps(setCreateSteps);
      toast.error("Save failed", e?.message || "Could not save the product");
    } finally {
      setSubmitting(false);
      setSubmitStage(null);
    }
  };

  // ── Derived data ────────────────────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    let filtered = products;
    if (productFilter !== "all")
      filtered = filtered.filter((p) => p.status === productFilter);
    if (selectedCategories.length > 0)
      filtered = filtered.filter((p) =>
        selectedCategories.includes(p.category),
      );
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(
        (p) =>
          p.title?.toLowerCase().includes(q) ||
          p.category?.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q),
      );
    }
    if (sortBy === "price-desc")
      filtered = [...filtered].sort(
        (a, b) => Number(b.price || 0) - Number(a.price || 0),
      );
    else if (sortBy === "price-asc")
      filtered = [...filtered].sort(
        (a, b) => Number(a.price || 0) - Number(b.price || 0),
      );
    else if (sortBy === "alpha")
      filtered = [...filtered].sort((a, b) => a.title.localeCompare(b.title));
    return filtered;
  }, [products, productFilter, selectedCategories, searchQuery, sortBy]);

  const inventorySummary = useMemo(
    () =>
      ["active", "pending", "draft", "rejected"].map((status) => ({
        status,
        total: products.filter((p) => p.status === status).length,
      })),
    [products],
  );

  const activeFlashSales = useMemo(() => {
    const now = new Date().toISOString();
    return products.flatMap((p) => {
      const sales = Array.isArray(p.flash_sale) ? p.flash_sale : [];
      return sales
        .filter(
          (fs) =>
            fs.is_active &&
            (!fs.start_time || fs.start_time <= now) &&
            fs.end_time > now,
        )
        .map((fs) => ({ ...fs, product: p }));
    });
  }, [products]);

  const statusSummary = useMemo(
    () =>
      ORDER_STATUS_FILTERS.map((status) => ({
        status,
        total: orders.filter((o) => o.status === status).length,
      })),
    [orders],
  );

  const filteredOrders = useMemo(() => {
    let filtered = orders.filter((o) => o.status === orderFilter);
    if (orderSearch.trim()) {
      const q = orderSearch.toLowerCase().trim();
      filtered = filtered.filter(
        (o) =>
          o.order_number?.toLowerCase().includes(q) ||
          o.customer?.name?.toLowerCase().includes(q) ||
          o.customer?.email?.toLowerCase().includes(q),
      );
    }
    return filtered;
  }, [orders, orderFilter, orderSearch]);

  const nextStatusMap = {
    processing: "packed",
    packed: "shipped",
    shipped: "delivered",
  };

  const metrics = useMemo(() => {
    const revenue = orders
      .filter((o) => o.payment_status === "success")
      .reduce((s, o) => s + Number(o.total || 0), 0);
    const netRevenue = orders
      .filter((o) => o.payment_status === "success")
      .reduce(
        (s, o) => s + (Number(o.total || 0) - Number(o.service_fee || 0)),
        0,
      );
    const inProgress = orders.filter((o) =>
      ["processing", "packed"].includes(o.status),
    ).length;
    return {
      revenue,
      netRevenue,
      inProgress,
      totalSold: products.reduce((s, p) => s + (p.sold_count || 0), 0),
      activeProducts: products.filter((p) => p.status === "active").length,
      totalProducts: products.length,
    };
  }, [orders, products]);

  const sellerName =
    seller?.name || customerProfile?.full_name || user?.email || "Seller";
  const avatarUri = seller?.avatar || customerProfile?.avatar_url;

  const formatPrice = (v) => `GH₵${Number(v || 0).toLocaleString()}`;

  // Currently active flash sale for a product, if any. "Active" means the
  // flag is on AND we're inside the sale's time window.
  const getCatalogFlashSale = useCallback((p) => {
    const now = new Date().toISOString();
    return (
      (Array.isArray(p?.flash_sale) ? p.flash_sale : []).find(
        (fs) =>
          fs.is_active &&
          (!fs.start_time || fs.start_time <= now) &&
          fs.end_time > now,
      ) || null
    );
  }, []);

  const getFlashDiscountPct = (fs) =>
    fs.discount_percentage ||
    (Number(fs.original_price) > 0
      ? Math.round(
          ((fs.original_price - fs.flash_price) / fs.original_price) * 100,
        )
      : 0);

  const activeSortLabel =
    SORT_OPTIONS.find((o) => o.key === sortBy)?.label || "Sort";

  // Select/deselect a category chip inside the Sort & Filter popup.
  const toggleCategorySelection = (name) =>
    setSelectedCategories((prev) =>
      prev.includes(name)
        ? prev.filter((cName) => cName !== name)
        : [...prev, name],
    );

  // ── Redesigned catalog product card (grid mode) ──────────────────────────
  const renderCatalogGridCard = (p) => {
    const flashSale = getCatalogFlashSale(p);
    const statusColor = CATALOG_STATUS_COLORS[p.status] || "#6B7280";
    return (
      <Pressable
        key={p.id}
        style={({ pressed }) => [
          styles.catalogCard,
          pressed && { opacity: 0.85 },
        ]}
        onPress={() => {
          setSelectedProduct(p);
          setActionSheetVisible(true);
        }}
      >
        <View style={styles.catalogCardMedia}>
          {p.thumbnail ? (
            <Image
              source={{ uri: p.thumbnail }}
              style={styles.catalogCardImage}
            />
          ) : (
            <View
              style={[
                styles.catalogCardImage,
                styles.catalogCardImagePlaceholder,
              ]}
            >
              <Ionicons name="cube" size={28} color="#fff" />
            </View>
          )}
          <View
            style={[styles.catalogStatusPill, { backgroundColor: statusColor }]}
          >
            <Text style={styles.catalogStatusPillText}>{p.status}</Text>
          </View>
          {flashSale && (
            <View style={styles.catalogFlashPill}>
              <Ionicons name="flash" size={9} color="#fff" />
              <Text style={styles.catalogFlashPillText}>
                -{getFlashDiscountPct(flashSale)}%
              </Text>
            </View>
          )}
        </View>
        <View style={styles.catalogCardBody}>
          <Text style={styles.catalogCardCategory} numberOfLines={1}>
            {p.category || "Uncategorized"}
          </Text>
          <Text style={styles.catalogCardTitle} numberOfLines={2}>
            {p.title}
          </Text>
          <View style={styles.catalogCardPriceRow}>
            <Text style={[styles.catalogCardPrice, { color: accent }]}>
              {formatPrice(flashSale ? flashSale.flash_price : p.price)}
            </Text>
            {flashSale &&
            Number(flashSale.original_price) >
              Number(flashSale.flash_price) ? (
              <Text style={styles.catalogCardOriginal}>
                {formatPrice(flashSale.original_price)}
              </Text>
            ) : null}
          </View>
          <View style={styles.catalogCardMetaRow}>
            <View style={styles.catalogCardMeta}>
              <Ionicons
                name="trending-up"
                size={11}
                color={themeColors.muted}
              />
              <Text style={styles.catalogCardMetaText}>
                {p.sold_count || 0} sold
              </Text>
            </View>
            <Text style={styles.catalogCardMetaText}>
              {p.is_preorder ? "Preorder" : `${p.quantity || 0} in stock`}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  };

  // ── Redesigned catalog product row (list mode) ───────────────────────────
  const renderCatalogListRow = (p) => {
    const flashSale = getCatalogFlashSale(p);
    const statusColor = CATALOG_STATUS_COLORS[p.status] || "#6B7280";
    return (
      <Pressable
        key={p.id}
        style={({ pressed }) => [
          styles.catalogListCard,
          pressed && { opacity: 0.85 },
        ]}
        onPress={() => {
          setSelectedProduct(p);
          setActionSheetVisible(true);
        }}
      >
        {p.thumbnail ? (
          <Image
            source={{ uri: p.thumbnail }}
            style={styles.catalogListThumb}
          />
        ) : (
          <View
            style={[
              styles.catalogListThumb,
              styles.catalogCardImagePlaceholder,
            ]}
          >
            <Ionicons name="cube" size={22} color="#fff" />
          </View>
        )}
        <View style={styles.catalogListBody}>
          <View style={styles.catalogListTopRow}>
            <Text style={styles.catalogCardCategory} numberOfLines={1}>
              {p.category || "Uncategorized"}
            </Text>
            <View
              style={[
                styles.catalogStatusPillInline,
                { backgroundColor: statusColor },
              ]}
            >
              <Text style={styles.catalogStatusPillText}>{p.status}</Text>
            </View>
          </View>
          <Text style={styles.catalogCardTitle} numberOfLines={2}>
            {p.title}
          </Text>
          <View style={styles.catalogCardPriceRow}>
            <Text style={[styles.catalogCardPrice, { color: accent }]}>
              {formatPrice(flashSale ? flashSale.flash_price : p.price)}
            </Text>
            {flashSale && (
              <View style={styles.catalogFlashPillInline}>
                <Ionicons name="flash" size={9} color="#fff" />
                <Text style={styles.catalogFlashPillText}>
                  -{getFlashDiscountPct(flashSale)}%
                </Text>
              </View>
            )}
          </View>
          <View style={styles.catalogCardMeta}>
            <Ionicons name="trending-up" size={11} color={themeColors.muted} />
            <Text style={styles.catalogCardMetaText}>
              {p.sold_count || 0} sold ·{" "}
              {p.is_preorder ? "Preorder" : `${p.quantity || 0} in stock`}
            </Text>
          </View>
        </View>
        <Ionicons
          name="chevron-forward"
          size={16}
          color={themeColors.muted}
          style={styles.catalogListChevron}
        />
      </Pressable>
    );
  };

  // ── Catalog tab ─────────────────────────────────────────────────────────
  const renderCatalog = () => (
    <View>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Store Catalog</Text>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: accent }]}
          onPress={openCreateModal}
        >
          <Ionicons name="add-circle-outline" size={18} color="#fff" />
          <Text style={styles.primaryButtonText}>Add New</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipRow}
      >
        {inventorySummary.map(({ status, total }) => (
          <View key={status} style={styles.summaryChip}>
            <Text style={styles.summaryChipLabel}>{status}</Text>
            <Text style={styles.summaryChipValue}>{total}</Text>
          </View>
        ))}
        <View style={styles.summaryChip}>
          <Text style={styles.summaryChipLabel}>Categories</Text>
          <Text style={styles.summaryChipValue}>{categories.length}</Text>
        </View>
      </ScrollView>

      {activeFlashSales.length > 0 && (
        <View style={styles.flashBanner}>
          <View style={styles.flashBannerHead}>
            <Ionicons name="flash" size={16} color="#EF4444" />
            <Text style={styles.flashBannerTitle}>Active Flash Sales</Text>
            <View style={styles.flashCountPill}>
              <Text style={styles.flashCountText}>
                {activeFlashSales.length} live
              </Text>
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {activeFlashSales.map((fs) => {
              const thumb = fs.product.thumbnails?.[0] || null;
              const pct =
                fs.discount_percentage ||
                Math.round(
                  ((fs.original_price - fs.flash_price) / fs.original_price) *
                    100,
                );
              const hrs = Math.max(
                0,
                Math.round(
                  (new Date(fs.end_time) - new Date()) / (1000 * 60 * 60),
                ),
              );
              return (
                <Pressable
                  key={fs.id}
                  style={styles.flashCard}
                  onPress={() => {
                    setSelectedProduct(fs.product);
                    setActionSheetVisible(true);
                  }}
                >
                  {thumb ? (
                    <Image source={{ uri: thumb }} style={styles.flashThumb} />
                  ) : (
                    <View
                      style={[styles.flashThumb, styles.flashThumbPlaceholder]}
                    >
                      <Ionicons
                        name="image-outline"
                        size={20}
                        color={themeColors.muted}
                      />
                    </View>
                  )}
                  <Text style={styles.flashName} numberOfLines={1}>
                    {fs.product.title}
                  </Text>
                  <Text style={styles.flashPrice}>
                    {formatPrice(fs.flash_price)}
                  </Text>
                  <Text style={styles.flashDiscount}>
                    {pct}% off · {hrs}h left
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={themeColors.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search products..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor={themeColors.muted}
        />
        {searchQuery ? (
          <Pressable onPress={() => setSearchQuery("")}>
            <Ionicons name="close-circle" size={18} color={themeColors.muted} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipRow}
      >
        <Pressable
          style={[
            styles.filterChip,
            productFilter === "all" && styles.filterChipActive,
          ]}
          onPress={() => setProductFilter("all")}
        >
          <Text
            style={[
              styles.filterChipText,
              productFilter === "all" && styles.filterChipTextActive,
            ]}
          >
            All
          </Text>
        </Pressable>
        {PRODUCT_FILTERS.slice(1).map((f) => (
          <Pressable
            key={f.key}
            style={[
              styles.filterChip,
              productFilter === f.key && styles.filterChipActive,
            ]}
            onPress={() => setProductFilter(f.key)}
          >
            <Text
              style={[
                styles.filterChipText,
                productFilter === f.key && styles.filterChipTextActive,
              ]}
            >
              {f.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Toolbar: Sort & Filter popup trigger + grid/list view switch */}
      <View style={styles.catalogToolbar}>
        <Pressable
          style={styles.catalogSortButton}
          onPress={() => setSortModalVisible(true)}
        >
          <Ionicons name="swap-vertical" size={16} color="#fff" />
          <Text style={styles.catalogSortButtonText} numberOfLines={1}>
            {activeSortLabel}
          </Text>
          {selectedCategories.length > 0 && (
            <View style={styles.catalogFilterBadge}>
              <Text style={styles.catalogFilterBadgeText}>
                {selectedCategories.length}
              </Text>
            </View>
          )}
          <Ionicons name="chevron-down" size={14} color="#fff" />
        </Pressable>
        <View style={styles.catalogViewToggle}>
          <Pressable
            style={[
              styles.catalogViewToggleBtn,
              catalogViewMode === "grid" && styles.catalogViewToggleBtnActive,
            ]}
            onPress={() => setCatalogViewMode("grid")}
            accessibilityRole="button"
            accessibilityLabel="Grid view"
          >
            <Ionicons
              name="grid-outline"
              size={16}
              color={catalogViewMode === "grid" ? "#fff" : themeColors.muted}
            />
          </Pressable>
          <Pressable
            style={[
              styles.catalogViewToggleBtn,
              catalogViewMode === "list" && styles.catalogViewToggleBtnActive,
            ]}
            onPress={() => setCatalogViewMode("list")}
            accessibilityRole="button"
            accessibilityLabel="List view"
          >
            <Ionicons
              name="list-outline"
              size={16}
              color={catalogViewMode === "list" ? "#fff" : themeColors.muted}
            />
          </Pressable>
        </View>
      </View>

      {loading ? (
        catalogViewMode === "grid" ? (
          <View style={styles.catalogGrid}>
            {Array.from({ length: 4 }).map((_, i) => (
              <View key={`ph-${i}`} style={styles.catalogGridItem}>
                <ProductCardPlaceholder />
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.catalogList}>
            {Array.from({ length: 3 }).map((_, i) => (
              <View key={`lph-${i}`} style={styles.catalogListSkeleton}>
                <View style={styles.catalogListThumbSkeleton} />
                <View style={{ flex: 1 }}>
                  <View style={styles.catalogListLine} />
                  <View
                    style={[
                      styles.catalogListLine,
                      { width: "60%", marginTop: 10 },
                    ]}
                  />
                </View>
              </View>
            ))}
          </View>
        )
      ) : filteredProducts.length === 0 ? (
        <Text style={styles.emptyNote}>No products found.</Text>
      ) : catalogViewMode === "grid" ? (
        <View style={styles.catalogGrid}>
          {filteredProducts.map(renderCatalogGridCard)}
        </View>
      ) : (
        <View style={styles.catalogList}>
          {filteredProducts.map(renderCatalogListRow)}
        </View>
      )}
    </View>
  );

  // ── Orders tab ──────────────────────────────────────────────────────────
  const renderOrders = () => (
    <View>
      <Text style={styles.sectionTitle}>Store Orders</Text>

      {orders.length > 0 && (
        <View style={styles.pipeline}>
          <View style={styles.pipelineBar}>
            {statusSummary
              .filter(({ total }) => total > 0)
              .map(({ status, total }) => (
                <View
                  key={status}
                  style={[
                    styles.pipelineSegment,
                    {
                      flex:
                        total /
                        Math.max(
                          statusSummary.reduce((s, x) => s + x.total, 0),
                          1,
                        ),
                      backgroundColor:
                        status === "processing"
                          ? themeColors.primary
                          : status === "packed"
                            ? "#F59E0B"
                            : status === "shipped"
                              ? "#06B6D4"
                              : status === "delivered"
                                ? themeColors.success
                                : "#EF4444",
                    },
                  ]}
                />
              ))}
          </View>
          <View style={styles.pipelineLegend}>
            {statusSummary.map(({ status, total }) => (
              <Text key={status} style={styles.legendText}>
                {status.charAt(0).toUpperCase() + status.slice(1)}: {total}
              </Text>
            ))}
          </View>
        </View>
      )}

      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={themeColors.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by order # or customer..."
          value={orderSearch}
          onChangeText={setOrderSearch}
          placeholderTextColor={themeColors.muted}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipRow}
      >
        {ORDER_STATUS_FILTERS.map((status) => (
          <Pressable
            key={status}
            style={[
              styles.filterChip,
              orderFilter === status && styles.filterChipActive,
            ]}
            onPress={() => setOrderFilter(status)}
          >
            <Text
              style={[
                styles.filterChipText,
                orderFilter === status && styles.filterChipTextActive,
              ]}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? (
        <>
          {Array.from({ length: 3 }).map((_, i) => (
            <View key={`oph-${i}`} style={styles.orderSkeleton}>
              <View style={styles.orderSkeletonIcon} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={styles.orderSkeletonLine} />
                <View
                  style={[
                    styles.orderSkeletonLine,
                    { width: "60%", marginTop: 8 },
                  ]}
                />
              </View>
            </View>
          ))}
        </>
      ) : filteredOrders.length === 0 ? (
        <Text style={styles.emptyNote}>No orders in this lane.</Text>
      ) : (
        filteredOrders.map((o) => (
          <Pressable
            key={o.id}
            style={styles.orderCard}
            onPress={() =>
              nav.navigate("OrderDetail", { order: o, isSeller: true })
            }
          >
            <View style={styles.orderIconBox}>
              <Ionicons name="receipt-outline" size={20} color={accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.orderNo}>#{o.order_number}</Text>
              <Text style={styles.orderMeta}>
                {o.customer?.name || "Guest"}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 6 }}>
              <Text style={styles.orderTotal}>{formatPrice(o.total)}</Text>
              <Text style={[styles.orderStatus, { color: accent }]}>
                {o.status}
              </Text>
            </View>
            {nextStatusMap[o.status] ? (
              <TouchableOpacity
                style={[
                  styles.progressButton,
                  { backgroundColor: accent + "14" },
                ]}
                onPress={() =>
                  advanceOrderStatus(o.id, nextStatusMap[o.status])
                }
              >
                <Text style={[styles.progressText, { color: accent }]}>
                  Move to {nextStatusMap[o.status]}
                </Text>
              </TouchableOpacity>
            ) : o.status === "delivered" ? (
              <View style={styles.successBadge}>
                <Ionicons
                  name="checkmark-circle"
                  size={14}
                  color={themeColors.success}
                />
                <Text style={styles.successText}>Delivered</Text>
              </View>
            ) : null}
          </Pressable>
        ))
      )}
    </View>
  );

  // ── Flash sales tab ─────────────────────────────────────────────────────
  // Only products with a CURRENTLY ACTIVE flash sale are listed here (flag on
  // AND inside the time window). Create new sales via Catalog → product menu
  // → "Flash sale"; tap a card below to tweak the running sale.
  const renderFlash = () => {
    const activeSales = products
      .map((p) => ({ p, sale: getCatalogFlashSale(p) }))
      .filter((entry) => entry.sale);

    return (
      <View>
        <Text style={styles.sectionTitle}>Active Flash Sales</Text>
        {activeSales.length === 0 ? (
          <Text style={styles.emptyNote}>
            No active flash sales. Use the Catalog tab → product menu → "Flash
            sale" to create one.
          </Text>
        ) : (
          <View style={styles.productGrid}>
            {activeSales.map(({ p, sale }) => {
              const endsAt = sale.end_time ? new Date(sale.end_time) : null;
              return (
                <Pressable
                  key={`${p.id}-${sale.id}`}
                  style={styles.productCard}
                  onPress={() => {
                    setSelectedProduct(p);
                    setFlashSalePrice(String(sale.flash_price ?? ""));
                    setFlashSaleMaxQty(
                      sale.max_quantity != null
                        ? String(sale.max_quantity)
                        : "",
                    );
                    setFlashSaleModalVisible(true);
                  }}
                >
                  {p.thumbnail ? (
                    <Image
                      source={{ uri: p.thumbnail }}
                      style={styles.productImage}
                    />
                  ) : (
                    <View
                      style={[
                        styles.productImage,
                        styles.productImagePlaceholder,
                      ]}
                    >
                      <Ionicons name="flash" size={28} color="#fff" />
                    </View>
                  )}
                  <View style={styles.productBody}>
                    <Text style={styles.productTitle} numberOfLines={1}>
                      {p.title}
                    </Text>
                    <Text style={[styles.productStatus, { color: accent }]}>
                      {formatPrice(sale.flash_price)} ·{" "}
                      {getFlashDiscountPct(sale)}% off
                    </Text>
                    {endsAt && !isNaN(endsAt.getTime()) && (
                      <Text style={styles.productStatus} numberOfLines={1}>
                        Ends {endsAt.toLocaleDateString()}{" "}
                        {endsAt.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Text>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  // ── Insights tab ────────────────────────────────────────────────────────
  const renderInsights = () => (
    <View>
      <Text style={styles.sectionTitle}>Insights</Text>
      <View style={styles.insightCards}>
        <View style={styles.insightCard}>
          <Ionicons name="cash-outline" size={20} color="#10B981" />
          <Text style={styles.insightValue}>
            {formatPrice(metrics.revenue)}
          </Text>
          <Text style={styles.insightLabel}>Total Revenue</Text>
        </View>
        <View style={styles.insightCard}>
          <Ionicons name="receipt-outline" size={20} color="#F59E0B" />
          <Text style={styles.insightValue}>{metrics.inProgress}</Text>
          <Text style={styles.insightLabel}>In Progress</Text>
        </View>
        <View style={styles.insightCard}>
          <Ionicons name="cube-outline" size={20} color={accent} />
          <Text style={styles.insightValue}>{metrics.activeProducts}</Text>
          <Text style={styles.insightLabel}>Active Products</Text>
        </View>
      </View>
      <Text style={styles.insightSummary}>
        You have {metrics.totalProducts} product
        {metrics.totalProducts === 1 ? "" : "s"} and {orders.length} order
        {orders.length === 1 ? "" : "s"}, generating{" "}
        {formatPrice(metrics.netRevenue)} in net revenue after fees.
      </Text>
    </View>
  );

  // The reels grid shows store reels AND product videos. Product videos are
  // attached from the "Add video" flow where a product is chosen from a modal
  // after the video is selected. Both kinds are deletable from the card menu.
  const videoGallery = useMemo(() => {
    const reelItems = reels.map((reel) => ({
      id: `reel-${reel.id}`,
      kind: "reel",
      title: reel.title || "Reel",
      created_at: reel.created_at,
      thumbnail_url: reel.thumbnail_url || null,
      video_url: reel.video_url || null,
      r2_key: reel.r2_key || null,
      source: reel,
    }));

    const productItems = products
      .filter((product) => product.video_url)
      .map((product) => ({
        id: `product-${product.id}`,
        kind: "product",
        title: product.title || "Product video",
        created_at: product.created_at,
        thumbnail_url: product.thumbnail || product.thumbnails?.[0] || null,
        video_url: product.video_url || null,
        r2_key: product.r2_video_key || null,
        source: product,
      }));

    return [...reelItems, ...productItems].sort((a, b) => {
      const aTime = new Date(a.created_at || 0).getTime();
      const bTime = new Date(b.created_at || 0).getTime();
      return bTime - aTime;
    });
  }, [products, reels]);

  const renderUploadJobs = () =>
    videoUploadJobs.length > 0 ? (
      <View style={styles.uploadQueueSection}>
        <View style={styles.uploadQueueHeader}>
          <Text style={styles.uploadQueueTitle}>Video uploads</Text>
          <Text style={styles.uploadQueueSub}>
            {videoUploadJobs.length} queued
          </Text>
        </View>
        {videoUploadJobs.map((job) => (
          <View key={job.id} style={styles.uploadJobCard}>
            <View style={styles.uploadJobTopRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.uploadJobTitle} numberOfLines={1}>
                  {job.title}
                </Text>
                <Text style={styles.uploadJobMeta} numberOfLines={1}>
                  {job.message}
                </Text>
              </View>
              <Text style={styles.uploadJobPct}>
                {job.status === "error"
                  ? "!"
                  : `${Math.round((job.progress || 0) * 100)}%`}
              </Text>
            </View>
            <View style={styles.uploadJobBarTrack}>
              <View
                style={[
                  styles.uploadJobBarFill,
                  {
                    width:
                      job.status === "error"
                        ? "100%"
                        : `${Math.max(4, Math.round((job.progress || 0) * 100))}%`,
                    backgroundColor:
                      job.status === "error"
                        ? "#EF4444"
                        : job.status === "done"
                          ? themeColors.success
                          : accent,
                  },
                ]}
              />
            </View>
          </View>
        ))}
      </View>
    ) : null;

  const renderVideoAttachPanel = () => (
    <View style={styles.attachVideoCard}>
      <View style={styles.attachVideoHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.attachVideoTitle}>Attach video to a product</Text>
          <Text style={styles.attachVideoSubtitle}>
            Choose a video, then pick the product to attach it to. Uploads
            continue in the background.
          </Text>
        </View>
        <View style={styles.attachVideoActions}>
          <Pressable
            style={[styles.attachVideoButton, { backgroundColor: accent }]}
            onPress={pickVideoForProductAttach}
          >
            <Ionicons name="videocam-outline" size={18} color="#fff" />
            <Text style={styles.attachVideoButtonText}>Add video</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  // Delete confirmation popup (triggered from a video card's menu icon).
  // Routes to the correct deleter based on the card kind:
  //  - "reel"      → deleteReel (removes R2 object + reels row)
  //  - "product"   → deleteProductVideo (removes R2 object + clears product link)
  const confirmDeleteCard = useCallback(() => {
    const target = cardMenu;
    setCardMenu(null);
    if (!target) return;
    if (target.kind === "product") {
      deleteProductVideo(target.source).catch((e) =>
        toast.error("Delete failed", e.message || "Could not delete video"),
      );
    } else {
      deleteReel(target.source.id).catch((e) =>
        toast.error("Delete failed", e.message || "Could not delete reel"),
      );
    }
  }, [cardMenu, deleteReel, deleteProductVideo, toast]);

  // ── Reels tab (seller reels stored on Cloudflare R2) ─────────────────────
  // Tapping a reel/product video card opens it in a full-screen player.
  const [playingVideo, setPlayingVideo] = useState(null);

  const renderReels = () => (
    <View>
      <Text style={styles.sectionTitle}>Store Reels</Text>
      {renderVideoAttachPanel()}
      {renderUploadJobs()}
      {reelsLoading ? (
        <Text style={styles.emptyNote}>Loading reels…</Text>
      ) : videoGallery.length === 0 ? (
        <Text style={styles.emptyNote}>
          No reels yet. Create reels from the app to showcase your products.
        </Text>
      ) : (
        <View style={styles.reelsGrid}>
          {videoGallery.map((item) => {
            const isDeleting = deletingReelId === item.id;
            return (
              <View key={item.id} style={styles.reelCard}>
                <Pressable
                  style={styles.reelThumb}
                  disabled={!item.video_url}
                  onPress={() => setPlayingVideo(item)}
                >
                  {item.thumbnail_url ? (
                    <Image
                      source={{ uri: item.thumbnail_url }}
                      style={styles.reelThumbInner}
                    />
                  ) : (
                    <FeedVideo
                      source={{ uri: item.video_url }}
                      style={styles.reelThumbInner}
                      resizeMode="cover"
                      paused
                      muted
                    />
                  )}
                  {item.video_url && (
                    <View style={styles.reelPlayBadge} pointerEvents="none">
                      <Ionicons name="play" size={20} color="#fff" />
                    </View>
                  )}
                </Pressable>
                <View style={styles.reelOverlay}>
                  <Text style={styles.reelTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                </View>
                <Pressable
                  style={styles.reelMenuButton}
                  hitSlop={10}
                  disabled={isDeleting}
                  onPress={() => setCardMenu(item)}
                >
                  {isDeleting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="ellipsis-vertical" size={18} color="#fff" />
                  )}
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      {/* Full-screen video player */}
      <Modal
        visible={!!playingVideo}
        transparent
        animationType="fade"
        onRequestClose={() => setPlayingVideo(null)}
      >
        <View style={styles.reelPlayerBackdrop}>
          <View style={styles.reelPlayerHeader}>
            <Text style={styles.reelPlayerTitle} numberOfLines={1}>
              {playingVideo?.title || ""}
            </Text>
            <Pressable
              style={styles.reelPlayerClose}
              hitSlop={8}
              onPress={() => setPlayingVideo(null)}
            >
              <Ionicons name="close" size={26} color="#fff" />
            </Pressable>
          </View>
          {playingVideo?.video_url ? (
            <FeedVideo
              source={{ uri: playingVideo.video_url }}
              style={styles.reelPlayerSurface}
              resizeMode="contain"
              paused={false}
              controls
            />
          ) : (
            <View
              style={[styles.reelPlayerSurface, styles.reelPlayerFallback]}
            >
              <Ionicons name="alert-circle-outline" size={28} color="#fff" />
              <Text style={styles.reelPlayerFallbackText}>
                No video available for this item.
              </Text>
            </View>
          )}
        </View>
      </Modal>

      {renderCardMenu()}
    </View>
  );

  // Per-video popup menu (shown above the reels grid) with a delete option.
  // ── Sort & Filter popup (catalog tab) ────────────────────────────────────
  // Bottom sheet with radio-style sort options and multi-select category
  // chips. Changes apply live; "Clear" deselects all categories.
  const renderCatalogSortModal = () => (
    <Modal
      visible={sortModalVisible}
      transparent
      animationType="slide"
      onRequestClose={() => setSortModalVisible(false)}
    >
      <Pressable
        style={styles.modalBackdrop}
        onPress={() => setSortModalVisible(false)}
      >
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <LinearGradient
            colors={[themeColors.primary, themeColors.accent]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.modalHeader}
          >
            <Ionicons name="swap-vertical" size={20} color="#fff" />
            <Text style={styles.modalHeaderTitle}>Sort &amp; Filter</Text>
            <Pressable
              style={styles.catalogSheetClose}
              onPress={() => setSortModalVisible(false)}
            >
              <Ionicons name="close" size={22} color="#fff" />
            </Pressable>
          </LinearGradient>

          <Text style={styles.catalogSectionLabel}>Sort by</Text>
          {SORT_OPTIONS.map((opt) => (
            <Pressable
              key={opt.key}
              style={styles.catalogSortOption}
              onPress={() => setSortBy(opt.key)}
            >
              <View style={styles.catalogSortOptionLeft}>
                <Ionicons
                  name={opt.icon}
                  size={18}
                  color={
                    sortBy === opt.key ? themeColors.primary : themeColors.muted
                  }
                />
                <Text
                  style={[
                    styles.catalogSortOptionText,
                    sortBy === opt.key && { color: themeColors.primary },
                  ]}
                >
                  {opt.label}
                </Text>
              </View>
              {sortBy === opt.key && (
                <Ionicons
                  name="checkmark-circle"
                  size={20}
                  color={themeColors.primary}
                />
              )}
            </Pressable>
          ))}

          <View style={styles.catalogDivider} />

          <View style={styles.catalogSectionHead}>
            <Text style={styles.catalogSectionLabel}>Categories</Text>
            {selectedCategories.length > 0 && (
              <Pressable onPress={() => setSelectedCategories([])}>
                <Text style={styles.catalogClearText}>Clear all</Text>
              </Pressable>
            )}
          </View>
          <View style={styles.catalogCategoryWrap}>
            {categories.map((c) => {
              const selected = selectedCategories.includes(c.name);
              return (
                <Pressable
                  key={c.id}
                  style={[
                    styles.catalogCategoryChip,
                    selected && styles.catalogCategoryChipActive,
                  ]}
                  onPress={() => toggleCategorySelection(c.name)}
                >
                  <Ionicons
                    name={selected ? "checkmark" : c.icon || "pricetag-outline"}
                    size={13}
                    color={selected ? "#fff" : themeColors.muted}
                  />
                  <Text
                    style={[
                      styles.catalogCategoryChipText,
                      selected && styles.catalogCategoryChipTextActive,
                    ]}
                  >
                    {c.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <TouchableOpacity
            style={[
              styles.primaryButton,
              { backgroundColor: accent, marginHorizontal: 18, marginTop: 18 },
            ]}
            onPress={() => setSortModalVisible(false)}
          >
            <Text style={styles.primaryButtonText}>
              Show {filteredProducts.length} product
              {filteredProducts.length === 1 ? "" : "s"}
            </Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );

  // ── Animated task-progress checklists (delete / create / go-live) ─────────
  const makeStepSetter = (setter) => (key, status) =>
    setter((prev) => prev.map((s) => (s.key === key ? { ...s, status } : s)));

  const failActiveSteps = (setter) =>
    setter((prev) =>
      prev.map((s) => (s.status === "active" ? { ...s, status: "error" } : s)),
    );

  const renderStepChecklist = (steps) => (
    <View style={styles.progressList}>
      {steps.map((step) => (
        <View key={step.key} style={styles.progressRow}>
          {step.status === "done" ? (
            <Ionicons name="checkmark-circle" size={20} color="#10B981" />
          ) : step.status === "error" ? (
            <Ionicons name="close-circle" size={20} color="#EF4444" />
          ) : step.status === "active" ? (
            <ActivityIndicator size="small" color="#EF4444" />
          ) : (
            <Ionicons
              name="ellipse-outline"
              size={20}
              color={themeColors.muted}
            />
          )}
          <Text
            style={[
              styles.progressLabel,
              step.status === "pending" && { color: themeColors.muted },
            ]}
          >
            {step.label}
          </Text>
        </View>
      ))}
    </View>
  );

  const renderProgressModal = ({
    icon,
    runningTitle,
    failedTitle,
    steps,
    failed,
    onClose,
  }) => (
    <Modal
      visible={steps.length > 0}
      transparent
      animationType="fade"
      onRequestClose={failed ? onClose : undefined}
    >
      <View style={styles.menuBackdrop}>
        <View style={styles.confirmCard}>
          <View style={styles.confirmIconWrap}>
            <Ionicons
              name={failed ? "alert-circle-outline" : icon}
              size={26}
              color={failed ? "#EF4444" : accent}
            />
          </View>
          <Text style={styles.confirmTitle}>
            {failed ? failedTitle : runningTitle}
          </Text>
          {renderStepChecklist(steps)}
          {failed && (
            <View style={styles.confirmButtonRow}>
              <Pressable
                style={[styles.confirmButton, styles.confirmCancelButton]}
                onPress={onClose}
              >
                <Text style={styles.confirmCancelText}>Close</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );

  // ── Seller coupons: store-scoped promo management ──────────────────────────
  const loadSellerCoupons = useCallback(async () => {
    if (!supabase || !sellerId) return;
    setSellerCouponsLoading(true);
    try {
      const { data, error } = await supabase
        .from("express_coupons")
        .select("*")
        .or(`seller_id.eq.${sellerId},seller_ids.cs.{${sellerId}}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setSellerCoupons(data || []);
    } catch (e) {
      toast.error("Coupons", e?.message || "Could not load your coupons");
    } finally {
      setSellerCouponsLoading(false);
    }
  }, [supabase, sellerId, toast]);

  const openCouponManager = useCallback(() => {
    setCouponManagerVisible(true);
    loadSellerCoupons();
  }, [loadSellerCoupons]);

  const createSellerCoupon = async () => {
    const f = couponForm;
    if (!f.code.trim() || !f.discountValue.trim()) {
      toast.warning("Missing info", "Code and discount value are required.");
      return;
    }
    if (!sellerId) {
      toast.error("No store", "Your store profile is still loading.");
      return;
    }
    setCouponSaving(true);
    try {
      const expiry = f.expiresAt ? new Date(f.expiresAt).toISOString() : null;
      const { error } = await supabase.from("express_coupons").insert({
        code: f.code.trim().toUpperCase(),
        discount_type: f.discountType,
        discount_value: parseFloat(f.discountValue),
        min_order_amount: f.minOrder ? parseFloat(f.minOrder) : null,
        max_product_price: f.maxProductPrice
          ? parseFloat(f.maxProductPrice)
          : null,
        max_uses: f.maxUses ? parseInt(f.maxUses) : null,
        usage_limit: f.maxUses ? parseInt(f.maxUses) : null,
        user_limit: f.userLimit ? Math.max(parseInt(f.userLimit) || 1, 1) : 1,
        valid_until: expiry,
        expires_at: expiry,
        seller_id: sellerId,
        seller_ids: [sellerId],
        is_active: true,
        current_uses: 0,
      });
      if (error) throw error;
      toast.success(
        "Coupon created",
        `${f.code.trim().toUpperCase()} is now live for your store.`,
      );
      setCouponForm({
        code: "",
        discountType: "percentage",
        discountValue: "",
        minOrder: "",
        maxProductPrice: "",
        maxUses: "",
        userLimit: "1",
        expiresAt: "",
      });
      setCouponFormVisible(false);
      loadSellerCoupons();
    } catch (e) {
      toast.error("Create failed", e?.message || "Could not create coupon");
    } finally {
      setCouponSaving(false);
    }
  };

  const toggleSellerCouponActive = async (coupon) => {
    try {
      const next = !coupon.is_active;
      const { error } = await supabase
        .from("express_coupons")
        .update({ is_active: next })
        .eq("id", coupon.id);
      if (error) throw error;
      setSellerCoupons((prev) =>
        prev.map((c) => (c.id === coupon.id ? { ...c, is_active: next } : c)),
      );
    } catch (e) {
      toast.error("Update failed", e?.message || "Could not update coupon");
    }
  };

  const deleteSellerCoupon = async (coupon) => {
    try {
      const { error } = await supabase
        .from("express_coupons")
        .delete()
        .eq("id", coupon.id);
      if (error) throw error;
      setSellerCoupons((prev) => prev.filter((c) => c.id !== coupon.id));
      toast.success("Deleted", `${coupon.code} removed`);
    } catch (e) {
      toast.error("Delete failed", e?.message || "Could not delete coupon");
    }
  };

  const renderCouponManager = () => (
    <Modal
      visible={couponManagerVisible}
      transparent
      animationType="slide"
      onRequestClose={() => setCouponManagerVisible(false)}
    >
      <View style={styles.menuBackdrop}>
        {/* Keyboard-aware so the coupon form fields stay visible above the
            keyboard (react-native-keyboard-controller). */}
        <KeyboardAvoidingView
          style={styles.couponSheet}
          behavior="padding"
          keyboardVerticalOffset={0}
        >
          <View style={styles.couponSheetTitleRow}>
            <Ionicons
              name="ticket-outline"
              size={20}
              color={themeColors.primary}
            />
            <Text style={styles.couponSheetTitle}>Store Coupons</Text>
            <Pressable onPress={() => setCouponManagerVisible(false)} hitSlop={8}>
              <Ionicons name="close" size={22} color={themeColors.muted} />
            </Pressable>
          </View>

          {!couponFormVisible ? (
            <>
              <Pressable
                style={styles.couponPrimaryBtn}
                onPress={() => setCouponFormVisible(true)}
              >
                <Text style={styles.couponPrimaryBtnText}>+ New Coupon</Text>
              </Pressable>
              <ScrollView
                style={{ marginTop: 10 }}
                showsVerticalScrollIndicator={false}
              >
                {sellerCouponsLoading ? (
                  <ActivityIndicator style={{ paddingVertical: 24 }} />
                ) : sellerCoupons.length === 0 ? (
                  <Text
                    style={[
                      styles.couponItemMeta,
                      { textAlign: "center", paddingVertical: 24 },
                    ]}
                  >
                    No coupons yet — create your first store promo above.
                  </Text>
                ) : (
                  sellerCoupons.map((cpn) => (
                    <View key={cpn.id} style={styles.couponItem}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.couponItemCode}>
                          {cpn.code}
                          {!cpn.is_active && " (paused)"}
                        </Text>
                        <Text style={styles.couponItemMeta}>
                          {cpn.discount_type === "fixed"
                            ? `GH₵${Number(cpn.discount_value).toFixed(2)} off`
                            : `${Number(cpn.discount_value)}% off`}
                          {` · ${cpn.current_uses || cpn.usage_count || 0} uses`}
                          {cpn.max_product_price != null
                            ? ` · items ≤ GH₵${Number(cpn.max_product_price)}`
                            : ""}
                          {cpn.user_limit != null && cpn.user_limit > 0
                            ? ` · ${cpn.user_limit}/account`
                            : ""}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => toggleSellerCouponActive(cpn)}
                        hitSlop={6}
                        style={{ padding: 6 }}
                      >
                        <Ionicons
                          name={
                            cpn.is_active
                              ? "pause-circle-outline"
                              : "play-circle-outline"
                          }
                          size={22}
                          color={themeColors.muted}
                        />
                      </Pressable>
                      <Pressable
                        onPress={() => deleteSellerCoupon(cpn)}
                        hitSlop={6}
                        style={{ padding: 6 }}
                      >
                        <Ionicons name="trash-outline" size={20} color="#EF4444" />
                      </Pressable>
                    </View>
                  ))
                )}
              </ScrollView>
            </>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Coupon creation form */}
              <Text style={styles.couponLabel}>Coupon Code *</Text>
              <TextInput
                style={styles.couponInput}
                value={couponForm.code}
                onChangeText={(t) =>
                  setCouponForm((f) => ({ ...f, code: t.toUpperCase() }))
                }
                placeholder="e.g. STORE10"
                autoCapitalize="characters"
                placeholderTextColor={themeColors.muted}
              />
              <Text style={styles.couponLabel}>Discount Type</Text>
              <View style={styles.couponChipRow}>
                {[
                  ["percentage", "% Off"],
                  ["fixed", "GH₵ Off"],
                ].map(([id, label]) => (
                  <Pressable
                    key={id}
                    style={[
                      styles.couponChip,
                      couponForm.discountType === id && styles.couponChipActive,
                    ]}
                    onPress={() =>
                      setCouponForm((f) => ({ ...f, discountType: id }))
                    }
                  >
                    <Text
                      style={[
                        styles.couponChipText,
                        couponForm.discountType === id &&
                          styles.couponChipTextActive,
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.couponLabel}>Discount Value *</Text>
              <TextInput
                style={styles.couponInput}
                value={couponForm.discountValue}
                onChangeText={(t) =>
                  setCouponForm((f) => ({ ...f, discountValue: t }))
                }
                placeholder={
                  couponForm.discountType === "percentage" ? "e.g. 15" : "e.g. 20.00"
                }
                keyboardType="decimal-pad"
                placeholderTextColor={themeColors.muted}
              />
              <Text style={styles.couponLabel}>Minimum Order (GH₵)</Text>
              <TextInput
                style={styles.couponInput}
                value={couponForm.minOrder}
                onChangeText={(t) => setCouponForm((f) => ({ ...f, minOrder: t }))}
                placeholder="Blank = no minimum"
                keyboardType="decimal-pad"
                placeholderTextColor={themeColors.muted}
              />
              <Text style={styles.couponLabel}>Max Product Price (GH₵)</Text>
              <TextInput
                style={styles.couponInput}
                value={couponForm.maxProductPrice}
                onChangeText={(t) =>
                  setCouponForm((f) => ({ ...f, maxProductPrice: t }))
                }
                placeholder="Skip pricier items — blank = no cap"
                keyboardType="decimal-pad"
                placeholderTextColor={themeColors.muted}
              />
              <Text style={styles.couponLabel}>Max Total Uses</Text>
              <TextInput
                style={styles.couponInput}
                value={couponForm.maxUses}
                onChangeText={(t) => setCouponForm((f) => ({ ...f, maxUses: t }))}
                placeholder="Blank = unlimited"
                keyboardType="number-pad"
                placeholderTextColor={themeColors.muted}
              />
              <Text style={styles.couponLabel}>Uses Per Account</Text>
              <TextInput
                style={styles.couponInput}
                value={couponForm.userLimit}
                onChangeText={(t) =>
                  setCouponForm((f) => ({ ...f, userLimit: t }))
                }
                placeholder="1"
                keyboardType="number-pad"
                placeholderTextColor={themeColors.muted}
              />
              <Text style={styles.couponLabel}>Expiry (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.couponInput}
                value={couponForm.expiresAt}
                onChangeText={(t) =>
                  setCouponForm((f) => ({ ...f, expiresAt: t }))
                }
                placeholder="e.g. 2026-12-31 — blank = no expiry"
                autoCapitalize="none"
                placeholderTextColor={themeColors.muted}
              />
              <Pressable
                style={[
                  styles.couponPrimaryBtn,
                  couponSaving && { opacity: 0.6 },
                ]}
                onPress={createSellerCoupon}
                disabled={couponSaving}
              >
                {couponSaving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.couponPrimaryBtnText}>Create Coupon</Text>
                )}
              </Pressable>
              <Pressable
                style={[
                  styles.couponPrimaryBtn,
                  { backgroundColor: themeColors.border, marginTop: 8 },
                ]}
                onPress={() => setCouponFormVisible(false)}
              >
                <Text
                  style={[
                    styles.couponPrimaryBtnText,
                    { color: themeColors.dark },
                  ]}
                >
                  Cancel
                </Text>
              </Pressable>
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );

  // ── Product delete confirmation dialog ────────────────────────────────────
  const confirmDeleteProduct = async () => {
    const product = deleteConfirmProduct;
    if (!product || deletingProduct) return;
    const hasImages =
      (Array.isArray(product.thumbnails) &&
        product.thumbnails.filter(Boolean).length > 0) ||
      !!product.thumbnail;
    const hasVideo = !!product.video_url || !!product.r2_video_key;
    // Checklist shown in the dialog while deletion runs; deleteProduct()
    // flips each step to "active"/"done" via setStep.
    setDeleteSteps([
      { key: "refs", label: "Clearing linked records", status: "pending" },
      ...(hasImages
        ? [{ key: "images", label: "Removing images from storage", status: "pending" }]
        : []),
      ...(hasVideo
        ? [{ key: "video", label: "Removing video from R2", status: "pending" }]
        : []),
      { key: "product", label: "Deleting product", status: "pending" },
    ]);
    setDeletingProduct(true);
    const setStep = (key, status) =>
      setDeleteSteps((prev) =>
        prev.map((s) => (s.key === key ? { ...s, status } : s)),
      );
    try {
      await deleteProduct(product.id, setStep);
      toast.success("Deleted", "Product removed");
      setDeleteConfirmProduct(null);
      setDeleteSteps([]);
    } catch (e) {
      toast.error("Delete failed", e.message || "Could not delete product");
      // Keep the dialog open on failure so the user sees where it stopped,
      // but re-enable Cancel so they can back out.
      setDeleteSteps((prev) =>
        prev.map((s) => (s.status === "active" ? { ...s, status: "pending" } : s)),
      );
    } finally {
      setDeletingProduct(false);
    }
  };

  const renderDeleteConfirmModal = () => (
    <Modal
      visible={Boolean(deleteConfirmProduct)}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!deletingProduct) setDeleteConfirmProduct(null);
      }}
    >
      <Pressable
        style={styles.menuBackdrop}
        onPress={() => {
          if (!deletingProduct) setDeleteConfirmProduct(null);
        }}
      >
        <Pressable style={styles.confirmCard} onPress={() => {}}>
          <View style={styles.confirmIconWrap}>
            <Ionicons name="trash-outline" size={26} color="#EF4444" />
          </View>
          <Text style={styles.confirmTitle}>
            {deletingProduct ? "Deleting…" : "Delete product?"}
          </Text>
          {deletingProduct ? (
            <View style={styles.progressList}>
              {deleteSteps.map((step) => (
                <View key={step.key} style={styles.progressRow}>
                  {step.status === "done" ? (
                    <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                  ) : step.status === "active" ? (
                    <ActivityIndicator size="small" color="#EF4444" />
                  ) : (
                    <Ionicons
                      name="ellipse-outline"
                      size={20}
                      color={themeColors.muted}
                    />
                  )}
                  <Text
                    style={[
                      styles.progressLabel,
                      step.status === "pending" && { color: themeColors.muted },
                    ]}
                  >
                    {step.label}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <>
              <Text style={styles.confirmMessage} numberOfLines={3}>
                "{deleteConfirmProduct?.title || "This product"}" will be
                permanently removed, along with its images and video from
                storage. This action cannot be undone.
              </Text>
              <View style={styles.confirmButtonRow}>
                <Pressable
                  style={[styles.confirmButton, styles.confirmCancelButton]}
                  onPress={() => setDeleteConfirmProduct(null)}
                >
                  <Text style={styles.confirmCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.confirmButton, styles.confirmDeleteButton]}
                  onPress={confirmDeleteProduct}
                >
                  <Text style={styles.confirmDeleteText}>Delete</Text>
                </Pressable>
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );

  const renderCardMenu = () => (
    <Modal
      visible={Boolean(cardMenu)}
      transparent
      animationType="fade"
      onRequestClose={() => setCardMenu(null)}
    >
      <Pressable style={styles.menuBackdrop} onPress={() => setCardMenu(null)}>
        <Pressable style={styles.menuCard} onPress={() => {}}>
          <Text style={styles.menuTitle} numberOfLines={1}>
            {cardMenu?.title || "Reel"}
          </Text>
          <Pressable
            style={styles.menuItemRow}
            disabled={deletingReelId === cardMenu?.id}
            onPress={confirmDeleteCard}
          >
            <Ionicons
              name="trash-outline"
              size={20}
              color={
                deletingReelId === cardMenu?.id ? themeColors.muted : "#EF4444"
              }
            />
            <Text
              style={[
                styles.menuItemText,
                deletingReelId === cardMenu?.id && { color: themeColors.muted },
              ]}
            >
              {deletingReelId === cardMenu?.id ? "Deleting…" : "Delete"}
            </Text>
          </Pressable>
          <Pressable
            style={styles.menuItemRow}
            onPress={() => setCardMenu(null)}
          >
            <Ionicons name="close-outline" size={20} color={themeColors.dark} />
            <Text style={styles.menuItemText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );

  // ── Product picker modal (shown after picking a video to attach) ────────
  const renderProductSelectModal = () => (
    <Modal
      visible={productSelectModalVisible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        setProductSelectModalVisible(false);
        setPendingVideo(null);
      }}
    >
      <Pressable
        style={styles.modalBackdrop}
        onPress={() => {
          setProductSelectModalVisible(false);
          setPendingVideo(null);
        }}
      >
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <LinearGradient
            colors={[themeColors.primary, themeColors.accent]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.modalHeader}
          >
            <Ionicons name="cube-outline" size={20} color="#fff" />
            <Text style={styles.modalHeaderTitle}>Select a product</Text>
          </LinearGradient>
          <ScrollView
            style={styles.videoDeleteList}
            showsVerticalScrollIndicator={false}
          >
            {products.length === 0 ? (
              <Text style={styles.videoDeleteEmpty}>
                No products available yet.
              </Text>
            ) : (
              products.map((product) => {
                const thumb =
                  product.thumbnail || product.thumbnails?.[0] || null;
                return (
                  <Pressable
                    key={product.id}
                    style={styles.sortOption}
                    onPress={() => attachPendingVideoToProduct(product)}
                  >
                    <View style={styles.sortOptionLeft}>
                      {thumb ? (
                        <Image
                          source={{ uri: thumb }}
                          style={styles.videoDeleteThumb}
                        />
                      ) : (
                        <View style={styles.videoDeleteThumbFallback}>
                          <Ionicons
                            name="cube-outline"
                            size={16}
                            color={themeColors.primary}
                          />
                        </View>
                      )}
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.sortOptionText} numberOfLines={1}>
                          {product.title}
                        </Text>
                        <Text style={styles.videoDeleteMeta} numberOfLines={1}>
                          {product.status || "active"}
                        </Text>
                      </View>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={themeColors.muted}
                    />
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );

  // ── Hamburger menu drawer ───────────────────────────────────────────────
  const renderMenuDrawer = () => (
    <Modal
      visible={menuVisible}
      transparent
      animationType="none"
      onRequestClose={closeMenu}
    >
      <Animated.View style={[styles.drawerOverlay, { opacity: drawerAnim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu} />
        <Animated.View
          style={[
            styles.drawer,
            { transform: [{ translateX: drawerSlide }] },
          ]}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.drawerHeader}>
            <Text style={styles.drawerTitle}>Store Menu</Text>
            <Pressable onPress={closeMenu} hitSlop={8}>
              <Ionicons name="close" size={24} color={themeColors.dark} />
            </Pressable>
          </View>
          <ScrollView
            style={styles.drawerScroll}
            showsVerticalScrollIndicator={false}
          >
            {MENU_ITEMS.map((item, i) =>
              item.section ? (
                <Text key={`sec-${i}`} style={styles.menuSection}>
                  {item.section}
                </Text>
              ) : item.theme ? (
                <View key="theme-options" style={styles.themeOptions}>
                  {[
                    { key: "light", label: "Light", icon: "sunny-outline" },
                    { key: "dark", label: "Dark", icon: "moon-outline" },
                    {
                      key: "system",
                      label: "System",
                      icon: "phone-portrait-outline",
                    },
                  ].map((opt) => {
                    const selected = themeMode === opt.key;
                    return (
                      <Pressable
                        key={opt.key}
                        style={[
                          styles.themeOption,
                          selected && styles.themeOptionActive,
                        ]}
                        onPress={() => setThemeMode(opt.key)}
                      >
                        <Ionicons
                          name={opt.icon}
                          size={18}
                          color={
                            selected ? themeColors.primary : themeColors.muted
                          }
                        />
                        <Text
                          style={[
                            styles.themeOptionText,
                            selected && styles.themeOptionTextActive,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <Pressable
                  key={item.screen || item.label}
                  style={styles.menuItem}
                  onPress={() => {
                    closeMenu();
                    if (item.action === "signOut") {
                      try {
                        signOut?.();
                      } catch (e) {
                        console.warn("Sign out failed", e);
                      }
                      return;
                    }
                    if (item.action === "coupons") {
                      openCouponManager();
                      return;
                    }
                    if (item.screen)
                      nav.navigate(
                        item.screen,
                        item.screen === "StatusViewer" && sellerId
                          ? { sellerId }
                          : undefined,
                      );
                  }}
                >
                  <Ionicons
                    name={item.icon}
                    size={20}
                    color={
                      item.action === "signOut" ? "#EF4444" : themeColors.muted
                    }
                  />
                  <Text
                    style={[
                      styles.menuItemText,
                      item.action === "signOut" && { color: "#EF4444" },
                    ]}
                  >
                    {item.label}
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={themeColors.muted}
                    style={{ marginLeft: "auto" }}
                  />
                </Pressable>
              ),
            )}
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );

  return (
    <View style={styles.container}>
      {/* Elastic-overscroll backdrop: iOS rubber-banding reveals whatever sits
          behind the scroll view, which flashed a blank gap above the cover
          when flung hard. A cover-colored strip up top blends the bounce into
          the cover; the rest stays the page background. */}
      <View pointerEvents="none" style={styles.bounceWrap}>
        <View
          style={[styles.bounceTop, { backgroundColor: themeColors.gradientStart }]}
        />
      </View>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={handleDashboardScroll}
        scrollEventThrottle={16}
        // Android's native stretch-overscroll can get stuck mid-animation
        // after a very hard fling, leaving a permanent blank gap above the
        // cover until the next touch. Disabling the native effect removes
        // the artifact; pull-to-refresh still works (RefreshControl drives
        // its own gesture) and iOS keeps its rubber-band bounce.
        overScrollMode="never"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadData();
            }}
            tintColor={accent}
            colors={[accent]}
          />
        }
      >
        {/* ── Cover ──────────────────────────────────────────────────── */}
        <View style={[styles.cover, { paddingTop: insets.top }]}>
          {avatarUri ? (
            <Image
              source={{ uri: avatarUri }}
              style={styles.coverImage}
              resizeMode="cover"
            />
          ) : (
            <LinearGradient
              style={styles.coverImage}
              colors={[themeColors.gradientStart, themeColors.gradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
          )}
          <View style={styles.coverOverlay} />

          {/* Floating top action row — menu / edit / search / refresh */}
          <View style={[styles.topBar, { top: insets.top + 8 }]}>
            <Pressable
              style={styles.topBarBtn}
              onPress={openMenu}
              hitSlop={10}
            >
              <Ionicons name="menu-outline" size={24} color="#fff" />
            </Pressable>
            <View style={styles.topBarRight}>
              <Pressable
                style={styles.topBarBtn}
                onPress={() => nav.navigate("SellerProfile")}
                hitSlop={10}
              >
                <Ionicons name="create-outline" size={20} color="#fff" />
              </Pressable>
              {/* Three-dots → quick dashboard refresh (pulls products, reels,
                  orders and stats without leaving the screen). Previously this
                  duplicated the hamburger menu. */}
              <Pressable
                style={styles.topBarBtn}
                onPress={() => {
                  setRefreshing(true);
                  loadData();
                }}
                hitSlop={10}
              >
                <Ionicons name="refresh" size={20} color="#fff" />
              </Pressable>
            </View>
          </View>

          {/* Camera button (post a status — like "Share a note…") */}
          <Pressable
            style={styles.coverCameraBtn}
            onPress={() => nav.navigate("StatusCreator")}
            hitSlop={10}
          >
            <Ionicons name="camera-outline" size={20} color="#fff" />
          </Pressable>
        </View>

        {/* ── Profile sheet ──────────────────────────────────────────── */}
        <View style={styles.profileSheet}>
          <View style={styles.profileRow}>
            <Pressable
              style={styles.avatarWrap}
              onPress={() => nav.navigate("SellerProfile")}
            >
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Ionicons name="storefront" size={40} color="#fff" />
                </View>
              )}
              <View
                style={[
                  styles.avatarCameraBadge,
                  { backgroundColor: themeColors.surface },
                ]}
              >
                <Ionicons name="camera" size={13} color={themeColors.dark} />
              </View>
            </Pressable>
            <View style={styles.profileInfoCol}>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>
                  {sellerName}
                </Text>
                <Pressable
                  style={styles.chevronBtn}
                  onPress={() => setControlsExpanded((v) => !v)}
                  hitSlop={8}
                >
                  {!isLive && <View style={styles.chevronDot} />}
                  <Ionicons
                    name={controlsExpanded ? "chevron-up" : "chevron-down"}
                    size={20}
                    color={themeColors.dark}
                  />
                </Pressable>
              </View>
              <Text style={styles.statLine} numberOfLines={1}>
                <Text style={styles.statBold}>{formatCount(followerCount)}</Text>
                {" followers"}
                <Text style={styles.statDot}>{" · "}</Text>
                <Text style={styles.statBold}>
                  {formatCount(followingCount)}
                </Text>
                {" following"}
                <Text style={styles.statDot}>{" · "}</Text>
                <Text style={styles.statBold}>{products.length}</Text>
                {" products"}
              </Text>
            </View>
          </View>

          {/* Info line — mirrors "Digital creator · Self-Employed" */}
          <View style={styles.infoRow}>
            <Ionicons
              name="storefront-outline"
              size={15}
              color={themeColors.dark}
            />
            <Text style={styles.infoText}>Store</Text>
            <Text style={styles.infoDot}>{"·"}</Text>
            <View
              style={[
                styles.liveDot,
                {
                  backgroundColor: isLive
                    ? themeColors.success
                    : themeColors.muted,
                },
              ]}
            />
            <Text
              style={[
                styles.infoText,
                {
                  color: isLive ? themeColors.success : themeColors.muted,
                  fontWeight: "800",
                },
              ]}
            >
              {isLive ? "Open" : "Closed"}
            </Text>
          </View>

          {/* Dormant-store banner — makes the not-live state obvious at a glance.
              Reflects the Paystack payout state (unlinked / awaiting
              verification / verified) via tint, copy and badge. Taps through to
              the Go Live controls when ready, or Payments when setup is missing. */}
          {seller && !isLive && (
            <Pressable
              style={({ pressed }) => [
                styles.notLiveBanner,
                {
                  backgroundColor: `${notLiveUi.tint}14`,
                  borderColor: `${notLiveUi.tint}3d`,
                },
                pressed && styles.notLiveBannerPressed,
              ]}
              onPress={() => {
                if (paystackState === "verified") {
                  setControlsExpanded(true);
                } else {
                  nav.navigate("Payments");
                }
              }}
            >
              <View
                style={[
                  styles.notLiveIconWrap,
                  { backgroundColor: notLiveUi.tint },
                ]}
              >
                <Ionicons name={notLiveUi.icon} size={18} color="#fff" />
              </View>
              <View style={styles.notLiveCopy}>
                <Text style={styles.notLiveTitle}>
                  Your store isn't live yet
                </Text>
                <Text style={styles.notLiveSub}>{notLiveUi.sub}</Text>
                {/* Payment verification badge */}
                <View
                  style={[
                    styles.payBadge,
                    {
                      borderColor: `${notLiveUi.tint}55`,
                      backgroundColor: `${notLiveUi.tint}1a`,
                    },
                  ]}
                >
                  <Ionicons
                    name={
                      paystackState === "verified"
                        ? "shield-checkmark"
                        : notLiveUi.icon
                    }
                    size={11}
                    color={notLiveUi.tint}
                  />
                  <Text style={[styles.payBadgeText, { color: notLiveUi.tint }]}>
                    {notLiveUi.badge}
                  </Text>
                </View>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={notLiveUi.tint}
              />
            </Pressable>
          )}

          {controlsExpanded && (
            <>
          {/* Go Live toggle — only enabled when a verified Paystack account exists */}
          <Pressable
            style={[
              styles.goLiveRow,
              isLive && styles.goLiveRowActive,
              !canGoLive() && !isLive && styles.goLiveRowDisabled,
            ]}
            onPress={toggleGoLive}
            disabled={togglingLive}
          >
            <View style={styles.goLiveLeft}>
              <Ionicons
                name={isLive ? "radio-button-on" : "radio-button-off"}
                size={20}
                color={isLive ? "#fff" : themeColors.muted}
              />
              <View style={styles.goLiveTextWrap}>
                <Text
                  style={[
                    styles.goLiveTitle,
                    isLive && styles.goLiveTitleActive,
                  ]}
                >
                  {isLive ? "Store is Live" : "Go Live"}
                </Text>
                <Text
                  style={[styles.goLiveSub, isLive && styles.goLiveSubActive]}
                >
                  {isLive
                    ? "Customers can browse and buy"
                    : canGoLive()
                      ? "Tap to publish your store"
                      : "Link a verified Paystack account"}
                </Text>
              </View>
            </View>
            {togglingLive ? (
              <ActivityIndicator
                size="small"
                color={isLive ? "#fff" : accent}
              />
            ) : (
              <View
                style={[styles.goLiveSwitch, isLive && styles.goLiveSwitchOn]}
              >
                <View style={styles.goLiveKnob} />
              </View>
            )}
          </Pressable>

          {/* WhatsApp catalog sync — import products from a Meta catalog.
              Hidden behind FEATURE_WHATSAPP_CATALOG for now; ships in a
              later update. */}
          {FEATURE_WHATSAPP_CATALOG && (
          <>
          <Pressable
            style={[styles.waRow, waConnected && styles.waRowActive]}
            onPress={() =>
              waConnected ? setWaModalVisible(true) : connectWhatsAppCatalog()
            }
            disabled={waConnecting}
          >
            <View style={styles.waLeft}>
              <Ionicons
                name="logo-whatsapp"
                size={20}
                color={waConnected ? "#fff" : "#25D366"}
              />
              <View style={styles.waTextWrap}>
                <Text
                  style={[styles.waTitle, waConnected && styles.waTitleActive]}
                >
                  {waConnected
                    ? "WhatsApp Catalog Linked"
                    : "Link WhatsApp Catalog"}
                </Text>
                <Text style={[styles.waSub, waConnected && styles.waSubActive]}>
                  {waConnected
                    ? waCatalogName
                      ? `Synced from ${waCatalogName}`
                      : "Import products from your Meta catalog"
                    : "Connect a WABA catalog to auto-import products"}
                </Text>
              </View>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={waConnected ? "#fff" : themeColors.muted}
            />
          </Pressable>

          {waConnected && (
            <Pressable
              style={styles.waSyncButton}
              onPress={syncWhatsAppCatalog}
              disabled={waSyncing}
            >
              {waSyncing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="refresh" size={16} color="#fff" />
              )}
              <Text style={styles.waSyncText}>
                {waSyncing
                  ? "Syncing…"
                  : waLastSynced
                    ? "Sync now"
                    : "Sync catalog"}
              </Text>
            </Pressable>
          )}
          </>
          )}
            </>
          )}

          {/* Action buttons — Dashboard / Create */}
          <View style={styles.actionRow}>
            <Pressable
              style={[styles.actionBtn, styles.actionBtnPrimary]}
              onPress={() => setActiveTab("insights")}
            >
              <Ionicons name="bar-chart" size={20} color="#fff" />
              <Text style={styles.actionBtnPrimaryText}>Dashboard</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, styles.actionBtnSecondary]}
              onPress={openCreateModal}
            >
              <Ionicons name="add" size={22} color={themeColors.dark} />
              <Text style={styles.actionBtnSecondaryText}>Create</Text>
            </Pressable>
          </View>
        </View>

        {/* ── Tab pills ──────────────────────────────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabBar}
          contentContainerStyle={styles.tabBarContent}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <Pressable
                key={tab}
                style={[
                  styles.tabPill,
                  isActive && { backgroundColor: accent + "1A" },
                ]}
                onPress={() => setActiveTab(tab)}
              >
                <Text
                  style={[
                    styles.tabPillText,
                    isActive && { color: accent },
                  ]}
                >
                  {TAB_LABELS[tab]}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.tabContent}>
          {activeTab === "catalog" && renderCatalog()}
          {activeTab === "orders" && renderOrders()}
          {activeTab === "flash" && renderFlash()}
          {activeTab === "reels" && renderReels()}
          {activeTab === "insights" && renderInsights()}
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>

      {/* Product create/edit modal */}
      <Modal visible={modalVisible} animationType="slide" statusBarTranslucent>
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior="padding"
          keyboardVerticalOffset={0}
        >
          <View
            style={[
              styles.modalHeader,
              {
                paddingTop: insets.top + 8,
                borderBottomColor: themeColors.surface,
              },
            ]}
          >
            <Pressable
              style={styles.modalHeaderBtn}
              onPress={() => setModalVisible(false)}
              hitSlop={8}
            >
              <Ionicons name="close" size={22} color={themeColors.dark} />
            </Pressable>
            <View style={styles.modalHeaderCenter}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {editingProduct ? "Edit Product" : "New Product"}
              </Text>
              <Text style={styles.modalSubtitle}>
                {PRODUCT_FORM_STEPS[productFormStep - 1]?.label} · Step{" "}
                {productFormStep} of {PRODUCT_FORM_STEPS.length}
              </Text>
            </View>
            <View style={styles.modalHeaderBtn}>
              {submitting ? (
                <ActivityIndicator size="small" color={accent} />
              ) : null}
            </View>
          </View>

          {/* Progress rail */}
          <View style={styles.progressRail}>
            {PRODUCT_FORM_STEPS.map((step, index) => {
              const stepNumber = index + 1;
              const isActive = productFormStep === stepNumber;
              const isCompleted = productFormStep > stepNumber;
              return (
                <Pressable
                  key={step.key}
                  style={styles.progressSegmentWrap}
                  onPress={() => {
                    if (!submitting && stepNumber < productFormStep)
                      setProductFormStep(stepNumber);
                  }}
                  disabled={stepNumber >= productFormStep}
                >
                  <View
                    style={[
                      styles.progressSegment,
                      isActive && { backgroundColor: accent },
                      isCompleted && { backgroundColor: accent + "55" },
                    ]}
                  />
                  <Text
                    style={[
                      styles.progressLabel,
                      isActive && { color: accent },
                      isCompleted && { color: themeColors.dark },
                    ]}
                    numberOfLines={1}
                  >
                    {step.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {productFormStep === 1 && (
              <>
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Product info</Text>
                  <Text style={styles.label}>Title *</Text>
                  <TextInput
                    style={styles.input}
                    value={title}
                    onChangeText={setTitle}
                    placeholder="e.g. Ankara two-piece set"
                    placeholderTextColor={themeColors.muted}
                    returnKeyType="next"
                  />

                  <View style={styles.row}>
                    <View style={styles.col}>
                      <Text style={styles.label}>Price (GH₵) *</Text>
                      <TextInput
                        style={styles.input}
                        value={price}
                        onChangeText={setPrice}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        placeholderTextColor={themeColors.muted}
                      />
                    </View>
                    <View style={styles.col}>
                      <Text style={styles.label}>Shipping (GH₵)</Text>
                      <TextInput
                        style={styles.input}
                        value={shippingFee}
                        onChangeText={setShippingFee}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        placeholderTextColor={themeColors.muted}
                      />
                    </View>
                  </View>
                  {/* Platform fee transparency — shows the exact cut the
                      platform takes (from express_settings →
                      service_fee_percentage, the same source the payment
                      edge function uses) and what the seller receives. */}
                  {serviceFeePercent != null && priceNum > 0 ? (
                    <View style={styles.feeBreakdown}>
                      <View style={styles.feeRow}>
                        <Text style={styles.feeLabel}>
                          Platform fee ({serviceFeePercent}%)
                        </Text>
                        <Text style={styles.feeValue}>
                          GH₵{platformFee.toFixed(2)}
                        </Text>
                      </View>
                      <View style={styles.feeRow}>
                        <Text
                          style={[styles.feeLabel, styles.feeLabelStrong]}
                        >
                          You receive
                        </Text>
                        <Text
                          style={[styles.feeValue, styles.feeValueStrong]}
                        >
                          GH₵{(priceNum - platformFee).toFixed(2)}
                        </Text>
                      </View>
                    </View>
                  ) : null}
                  {!shippingFee || parseFloat(shippingFee) === 0 ? (
                    <View style={styles.hintRow}>
                      <Ionicons
                        name="checkmark-circle"
                        size={14}
                        color="#10B981"
                      />
                      <Text style={styles.hintText}>
                        Free shipping badge will be applied
                      </Text>
                    </View>
                  ) : null}

                </View>

                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Category *</Text>
                  <View style={styles.categoryRow}>
                    {categories.map((c) => {
                      const selected = category === c.name;
                      return (
                        <Pressable
                          key={c.id}
                          style={[
                            styles.catChip,
                            selected && {
                              backgroundColor: accent,
                              borderColor: accent,
                            },
                          ]}
                          onPress={() => setCategory(c.name)}
                        >
                          <Ionicons
                            name={c.icon || "pricetag-outline"}
                            size={14}
                            color={
                              selected ? themeColors.light : themeColors.muted
                            }
                          />
                          <Text
                            style={[
                              styles.catChipText,
                              selected && { color: themeColors.light },
                            ]}
                          >
                            {c.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Description</Text>
                  <TextInput
                    style={[styles.textArea]}
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Describe materials, fit, care instructions…"
                    placeholderTextColor={themeColors.muted}
                    multiline
                    textAlignVertical="top"
                  />
                </View>
              </>
            )}

            {productFormStep === 2 && (
              <>
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Stock & pricing</Text>
                  <View style={styles.row}>
                    <View style={styles.col}>
                      <Text style={styles.label}>Quantity *</Text>
                      <TextInput
                        style={styles.input}
                        value={quantity}
                        onChangeText={setQuantity}
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor={themeColors.muted}
                      />
                    </View>
                    <View style={styles.col}>
                      <Text style={styles.label}>Discount %</Text>
                      <TextInput
                        style={styles.input}
                        value={String(discount)}
                        onChangeText={(t) => setDiscount(Number(t) || 0)}
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor={themeColors.muted}
                      />
                    </View>
                  </View>

                  <View style={styles.row}>
                    <View style={styles.col}>
                      <Text style={styles.label}>Compare-at price</Text>
                      <TextInput
                        style={styles.input}
                        value={compareAtPrice}
                        onChangeText={setCompareAtPrice}
                        keyboardType="decimal-pad"
                        placeholder="Optional"
                        placeholderTextColor={themeColors.muted}
                      />
                    </View>
                    <View style={styles.col}>
                      <Text style={styles.label}>Cost per item</Text>
                      <TextInput
                        style={styles.input}
                        value={costPrice}
                        onChangeText={setCostPrice}
                        keyboardType="decimal-pad"
                        placeholder="Optional"
                        placeholderTextColor={themeColors.muted}
                      />
                    </View>
                  </View>
                </View>

                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Variants</Text>
                  <Text style={styles.label}>Sizes</Text>
                  <View style={styles.categoryRow}>
                    {SIZES.map((s) => {
                      const selected = selectedSizes.includes(s);
                      return (
                        <Pressable
                          key={s}
                          style={[
                            styles.catChip,
                            selected && {
                              backgroundColor: accent,
                              borderColor: accent,
                            },
                          ]}
                          onPress={() =>
                            setSelectedSizes((prev) =>
                              prev.includes(s)
                                ? prev.filter((x) => x !== s)
                                : [...prev, s],
                            )
                          }
                        >
                          <Text
                            style={[
                              styles.catChipText,
                              selected && { color: themeColors.light },
                            ]}
                          >
                            {s}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Text style={styles.label}>Colors</Text>
                  <View style={styles.colorRow}>
                    {AVAILABLE_COLORS.map((c) => {
                      const selected = selectedColors.some(
                        (x) => x.name === c.name,
                      );
                      return (
                        <Pressable
                          key={c.name}
                          style={[
                            styles.colorDot,
                            { backgroundColor: c.hex },
                            selected && styles.colorDotActive,
                          ]}
                          onPress={() =>
                            setSelectedColors((prev) =>
                              prev.some((x) => x.name === c.name)
                                ? prev.filter((x) => x.name !== c.name)
                                : [...prev, c],
                            )
                          }
                        >
                          {selected ? (
                            <Ionicons
                              name="checkmark"
                              size={14}
                              color={
                                c.name === "White" || c.name === "Yellow"
                                  ? "#111827"
                                  : "#FFFFFF"
                              }
                            />
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Inventory options</Text>
                  <Pressable
                    style={styles.checkRowItem}
                    onPress={() => setIsPreorder((v) => !v)}
                  >
                    <Ionicons
                      name={isPreorder ? "checkbox" : "square-outline"}
                      size={20}
                      color={isPreorder ? accent : themeColors.muted}
                    />
                    <View style={styles.checkTextWrap}>
                      <Text style={styles.checkLabel}>Preorder</Text>
                      <Text style={styles.checkHint}>
                        Customers can order before stock arrives
                      </Text>
                    </View>
                  </Pressable>
                  <Pressable
                    style={styles.checkRowItem}
                    onPress={() => setTrackInventory((v) => !v)}
                  >
                    <Ionicons
                      name={trackInventory ? "checkbox" : "square-outline"}
                      size={20}
                      color={trackInventory ? accent : themeColors.muted}
                    />
                    <View style={styles.checkTextWrap}>
                      <Text style={styles.checkLabel}>Track inventory</Text>
                      <Text style={styles.checkHint}>
                        Reduce quantity automatically on each sale
                      </Text>
                    </View>
                  </Pressable>
                  <Pressable
                    style={styles.checkRowItem}
                    onPress={() => setAllowBackorder((v) => !v)}
                  >
                    <Ionicons
                      name={allowBackorder ? "checkbox" : "square-outline"}
                      size={20}
                      color={allowBackorder ? accent : themeColors.muted}
                    />
                    <View style={styles.checkTextWrap}>
                      <Text style={styles.checkLabel}>Allow backorder</Text>
                      <Text style={styles.checkHint}>
                        Keep selling after stock runs out
                      </Text>
                    </View>
                  </Pressable>
                </View>
              </>
            )}

            {productFormStep === 3 && (
              <>
                <View style={styles.card}>
                  <View style={styles.cardTitleRow}>
                    <Text style={styles.cardTitle}>Photos</Text>
                    <Text style={styles.cardCounter}>
                      {imageUris.length + existingImageUrls.length}/5
                    </Text>
                  </View>
                  <View style={styles.imageGrid}>
                    {existingImageUrls.map((u) => (
                      <View key={u} style={styles.imageWrap}>
                        <Image source={{ uri: u }} style={styles.imageThumb} />
                        <Pressable
                          style={styles.imageRemove}
                          onPress={() => handleRemoveExistingImage(u)}
                          disabled={!!removingImageUrl}
                        >
                          <Ionicons
                            name="close-circle"
                            size={20}
                            color="#EF4444"
                          />
                        </Pressable>
                      </View>
                    ))}
                    {imageUris.map((u) => (
                      <View key={u} style={styles.imageWrap}>
                        <Image source={{ uri: u }} style={styles.imageThumb} />
                        <Pressable
                          style={styles.imageRemove}
                          onPress={() =>
                            setImageUris((prev) => prev.filter((x) => x !== u))
                          }
                        >
                          <Ionicons
                            name="close-circle"
                            size={20}
                            color="#EF4444"
                          />
                        </Pressable>
                      </View>
                    ))}
                    {imageUris.length + existingImageUrls.length < 5 && (
                      <Pressable style={styles.imageAdd} onPress={pickImage}>
                        <Ionicons
                          name="camera-outline"
                          size={26}
                          color={accent}
                        />
                        <Text style={[styles.imageAddText, { color: accent }]}>
                          Add photo
                        </Text>
                      </Pressable>
                    )}
                  </View>
                  <Text style={styles.hintText}>
                    The first photo becomes the cover image.
                  </Text>
                </View>

                <View style={styles.card}>
                  <View style={styles.cardTitleRow}>
                    <Text style={styles.cardTitle}>Video</Text>
                    <Text style={styles.cardCounter}>Optional · max 10 MB</Text>
                  </View>
                  <View style={styles.videoGrid}>
                    {existingVideoUrl || videoUri ? (
                      <View style={styles.videoWrap}>
                        <FeedVideo
                          source={{ uri: videoUri || existingVideoUrl }}
                          style={styles.videoThumb}
                          resizeMode="cover"
                          repeat
                          muted
                          paused
                        />
                        <Pressable
                          style={styles.videoRemove}
                          onPress={
                            videoUri
                              ? () => {
                                  setVideoUri(null);
                                  setVideoFile(null);
                                }
                              : handleRemoveExistingVideo
                          }
                          disabled={removingVideo}
                        >
                          <Ionicons
                            name="close-circle"
                            size={20}
                            color="#EF4444"
                          />
                        </Pressable>
                        <View style={styles.videoBadge}>
                          <Ionicons name="videocam" size={14} color="#fff" />
                          <Text style={styles.videoBadgeText}>
                            {videoUri ? "New video" : "Current video"}
                          </Text>
                        </View>
                      </View>
                    ) : null}
                    {!videoUri && (
                      <Pressable
                        style={styles.videoAdd}
                        onPress={pickVideo}
                        disabled={uploadingVideo}
                      >
                        {uploadingVideo ? (
                          <ActivityIndicator size="small" color={accent} />
                        ) : (
                          <>
                            <Ionicons
                              name="videocam-outline"
                              size={26}
                              color={accent}
                            />
                            <Text
                              style={[styles.imageAddText, { color: accent }]}
                            >
                              Add video
                            </Text>
                          </>
                        )}
                      </Pressable>
                    )}
                  </View>
                </View>
              </>
            )}

            {productFormStep === 4 && (
              <>
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Specifications</Text>
                  <View style={styles.specList}>
                    {specifications.map((spec, index) => (
                      <View key={index} style={styles.specRow}>
                        <TextInput
                          style={[styles.input, styles.specKey]}
                          value={spec.key}
                          onChangeText={(text) => {
                            const updated = [...specifications];
                            updated[index].key = text;
                            setSpecifications(updated);
                          }}
                          placeholder="Name (e.g. Material)"
                          placeholderTextColor={themeColors.muted}
                          returnKeyType="next"
                        />
                        <TextInput
                          style={[styles.input, styles.specValue]}
                          value={spec.value}
                          onChangeText={(text) => {
                            const updated = [...specifications];
                            updated[index].value = text;
                            setSpecifications(updated);
                          }}
                          placeholder="Value (e.g. Cotton)"
                          placeholderTextColor={themeColors.muted}
                        />
                        <Pressable
                          style={styles.specRemove}
                          onPress={() =>
                            setSpecifications(
                              specifications.filter((_, i) => i !== index),
                            )
                          }
                        >
                          <Ionicons
                            name="close-circle"
                            size={22}
                            color="#EF4444"
                          />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                  <TouchableOpacity
                    style={styles.addSpecButton}
                    onPress={() =>
                      setSpecifications([
                        ...specifications,
                        { key: "", value: "" },
                      ])
                    }
                  >
                    <Ionicons
                      name="add-circle-outline"
                      size={18}
                      color={accent}
                    />
                    <Text style={[styles.addSpecText, { color: accent }]}>
                      Add specification
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.card}>
                  <View style={styles.cardTitleRow}>
                    <Text style={styles.cardTitle}>Tags</Text>
                    <Text style={styles.cardCounter}>
                      Help customers find this in search
                    </Text>
                  </View>
                  <View style={[styles.input, styles.tagInputWrap]}>
                    <TextInput
                      style={styles.tagInput}
                      value={tagInput}
                      onChangeText={setTagInput}
                      placeholder="Type a tag and press enter"
                      placeholderTextColor={themeColors.muted}
                      returnKeyType="done"
                      blurOnSubmit={false}
                      onSubmitEditing={commitPendingTag}
                      onBlur={commitPendingTag}
                    />
                  </View>
                  {tags.length > 0 && (
                    <View style={styles.categoryRow}>
                      {tags.map((t) => (
                        <Pressable
                          key={t}
                          style={styles.catChip}
                          onPress={() =>
                            setTags((prev) => prev.filter((x) => x !== t))
                          }
                        >
                          <Text style={styles.catChipText}>{t}</Text>
                          <Ionicons
                            name="close-circle"
                            size={14}
                            color={themeColors.muted}
                          />
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>

                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Organization</Text>
                  <View style={styles.row}>
                    <View style={styles.col}>
                      <Text style={styles.label}>SKU</Text>
                      <TextInput
                        style={styles.input}
                        value={sku}
                        onChangeText={setSku}
                        placeholder="e.g. ANK-001"
                        placeholderTextColor={themeColors.muted}
                        autoCapitalize="characters"
                      />
                    </View>
                    <View style={styles.col}>
                      <Text style={styles.label}>Barcode</Text>
                      <TextInput
                        style={styles.input}
                        value={barcode}
                        onChangeText={setBarcode}
                        placeholder="Optional"
                        placeholderTextColor={themeColors.muted}
                      />
                    </View>
                  </View>
                  <View style={styles.row}>
                    <View style={styles.col}>
                      <Text style={styles.label}>Vendor</Text>
                      <TextInput
                        style={styles.input}
                        value={vendor}
                        onChangeText={setVendor}
                        placeholder="Optional"
                        placeholderTextColor={themeColors.muted}
                      />
                    </View>
                    <View style={styles.col}>
                      <Text style={styles.label}>Weight ({weightUnit})</Text>
                      <TextInput
                        style={styles.input}
                        value={weight}
                        onChangeText={setWeight}
                        keyboardType="decimal-pad"
                        placeholder="0.0"
                        placeholderTextColor={themeColors.muted}
                      />
                    </View>
                  </View>
                </View>

                <View style={styles.summaryCard}>
                  <Text style={styles.cardTitle}>Review</Text>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Title</Text>
                    <Text style={styles.summaryValue} numberOfLines={1}>
                      {title || "—"}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Price</Text>
                    <Text style={styles.summaryValue}>
                      {price ? `GH₵${price}` : "—"}
                      {compareAtPrice ? `  (was GH₵${compareAtPrice})` : ""}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Stock</Text>
                    <Text style={styles.summaryValue}>
                      {isPreorder ? "Preorder" : quantity || "—"}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Media</Text>
                    <Text style={styles.summaryValue}>
                      {existingImageUrls.length + imageUris.length} photo
                      {existingImageUrls.length + imageUris.length === 1
                        ? ""
                        : "s"}
                      {videoUri || existingVideoUrl ? " · 1 video" : ""}
                    </Text>
                  </View>
                </View>
              </>
            )}

            <View style={{ height: 12 }} />
          </ScrollView>

          {/* Sticky footer actions */}
          <View
            style={[
              styles.stepActions,
              {
                paddingBottom: Math.max(insets.bottom, 12) + 8,
                borderTopColor: themeColors.surface,
              },
            ]}
          >
            {productFormStep > 1 ? (
              <TouchableOpacity
                style={[styles.stepButton, styles.stepButtonSecondary]}
                onPress={goToPreviousProductStep}
                disabled={submitting}
              >
                <Ionicons
                  name="chevron-back"
                  size={16}
                  color={themeColors.dark}
                />
                <Text style={styles.stepButtonSecondaryText}>Back</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.stepSpacer} />
            )}
            {productFormStep < PRODUCT_FORM_STEPS.length ? (
              <TouchableOpacity
                style={[
                  styles.stepButton,
                  { backgroundColor: accent, flex: 1 },
                ]}
                onPress={goToNextProductStep}
                disabled={submitting}
              >
                <Text style={styles.stepButtonText}>Continue</Text>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={themeColors.light}
                />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[
                  styles.stepButton,
                  { backgroundColor: accent, flex: 1 },
                  submitting && { opacity: 0.6 },
                ]}
                onPress={submitProduct}
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <ActivityIndicator size="small" color={themeColors.light} />
                    <Text style={styles.stepButtonText}>
                      {submitStage || "Saving…"}
                    </Text>
                  </>
                ) : (
                  <>
                    <Ionicons
                      name={
                        editingProduct
                          ? "checkmark-circle-outline"
                          : "add-circle-outline"
                      }
                      size={18}
                      color={themeColors.light}
                    />
                    <Text style={styles.stepButtonText}>
                      {editingProduct ? "Save Changes" : "Publish Product"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* WhatsApp catalog connect modal */}
      <Modal
        visible={waModalVisible}
        animationType="slide"
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior="padding"
          keyboardVerticalOffset={0}
        >
          <View
            style={[
              styles.modalHeader,
              {
                paddingTop: insets.top + 8,
                borderBottomColor: themeColors.surface,
              },
            ]}
          >
            <Pressable
              style={styles.modalHeaderBtn}
              onPress={() => {
                setWaModalVisible(false);
                setWaAuthUrl(null);
                setWaConnecting(false);
              }}
              hitSlop={8}
            >
              <Ionicons name="close" size={22} color={themeColors.dark} />
            </Pressable>
            <View style={styles.modalHeaderCenter}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                Connect WhatsApp Catalog
              </Text>
              <Text style={styles.modalSubtitle}>
                Sign in with your Meta account
              </Text>
            </View>
            <View style={styles.modalHeaderBtn}>
              {waConnecting ? (
                <ActivityIndicator size="small" color={accent} />
              ) : null}
            </View>
          </View>

          {waAuthUrl ? (
            // Embedded Signup runs entirely inside this WebView: the edge
            // function 302s to Meta's dialog, Meta redirects back with the
            // code, and the function's result page postMessages us the
            // outcome (handled by onWaWebViewMessage). No popups needed.
            <WebView
              source={{ uri: waAuthUrl }}
              style={{ flex: 1, backgroundColor: "#fff" }}
              javaScriptEnabled
              domStorageEnabled
              thirdPartyCookiesEnabled
              sharedCookiesEnabled
              originWhitelist={["*"]}
              setSupportMultipleWindows={false}
              injectedJavaScript={WA_INJECTED_JS}
              injectedJavaScriptBeforeContentLoaded={WA_INJECTED_JS}
              onMessage={onWaWebViewMessage}
              onError={() => {
                setWaConnecting(false);
                setWaAuthUrl(null);
                toast.error(
                  "Connection failed",
                  "Could not load the Meta signup page",
                );
              }}
            />
          ) : (
            <>
              <ScrollView
                style={styles.modalBody}
                contentContainerStyle={styles.modalBodyContent}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.waOauthCard}>
                  <Ionicons name="logo-whatsapp" size={40} color="#25D366" />
                  <Text style={styles.waOauthTitle}>Connect with Facebook</Text>
                  <Text style={styles.waHint}>
                    Tap below to securely sign in to your Meta Business account.
                    Select your Business Portfolio, WhatsApp Business Account,
                    and Catalog — we'll import your products automatically.
                    You'll never need to copy or paste a token.
                  </Text>
                </View>
              </ScrollView>

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={[
                    styles.waFacebookButton,
                    waConnecting && styles.waFacebookButtonDisabled,
                  ]}
                  onPress={connectWhatsAppCatalog}
                  disabled={waConnecting}
                >
                  {waConnecting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="logo-facebook" size={20} color="#fff" />
                  )}
                  <Text style={styles.waFacebookText}>
                    {waConnecting ? "Connecting…" : "Continue with Facebook"}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </KeyboardAvoidingView>
      </Modal>

      {/* Action sheet */}
      <Modal visible={actionSheetVisible} transparent animationType="fade">
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => setActionSheetVisible(false)}
        >
          <View style={styles.sheet}>
            <Pressable
              style={styles.sheetItem}
              onPress={() => handleActionSheet("view")}
            >
              <Ionicons name="eye-outline" size={20} color={themeColors.dark} />
              <Text style={styles.sheetText}>View</Text>
            </Pressable>
            <Pressable
              style={styles.sheetItem}
              onPress={() => handleActionSheet("edit")}
            >
              <Ionicons
                name="create-outline"
                size={20}
                color={themeColors.dark}
              />
              <Text style={styles.sheetText}>Edit</Text>
            </Pressable>
            <Pressable
              style={styles.sheetItem}
              onPress={() => handleActionSheet("restock")}
            >
              <Ionicons
                name="add-circle-outline"
                size={20}
                color={themeColors.dark}
              />
              <Text style={styles.sheetText}>Restock</Text>
            </Pressable>
            <Pressable
              style={styles.sheetItem}
              onPress={() => handleActionSheet("flash_sale")}
            >
              <Ionicons
                name="flash-outline"
                size={20}
                color={themeColors.dark}
              />
              <Text style={styles.sheetText}>Flash Sale</Text>
            </Pressable>
            <Pressable
              style={styles.sheetItem}
              onPress={() => handleActionSheet("duplicate")}
            >
              <Ionicons
                name="copy-outline"
                size={20}
                color={themeColors.dark}
              />
              <Text style={styles.sheetText}>Duplicate as draft</Text>
            </Pressable>
            <Pressable
              style={styles.sheetItem}
              onPress={() => handleActionSheet("toggle_status")}
            >
              <Ionicons
                name="swap-horizontal-outline"
                size={20}
                color={themeColors.dark}
              />
              <Text style={styles.sheetText}>Toggle status</Text>
            </Pressable>
            <Pressable
              style={[styles.sheetItem, styles.sheetItemDanger]}
              onPress={() => handleActionSheet("delete")}
            >
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
              <Text style={[styles.sheetText, { color: "#EF4444" }]}>
                Delete
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Product delete confirmation + media-removal progress */}
      {renderDeleteConfirmModal()}

      {/* Detail modal */}
      <Modal visible={detailModalVisible} animationType="slide">
        <View style={styles.modalContainer}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{viewingProduct?.title}</Text>
              <Pressable onPress={() => setDetailModalVisible(false)}>
                <Ionicons name="close" size={24} color={themeColors.dark} />
              </Pressable>
            </View>
            {viewingProduct?.thumbnail ? (
              <Image
                source={{ uri: viewingProduct.thumbnail }}
                style={styles.detailImage}
              />
            ) : null}
            <Text style={styles.detailPrice}>
              {formatPrice(viewingProduct?.price)}
            </Text>
            <Text style={styles.detailStatus}>
              Status: {viewingProduct?.status}
            </Text>
            <Text style={styles.detailDesc}>{viewingProduct?.description}</Text>
            <Text style={styles.detailMeta}>
              Quantity: {viewingProduct?.quantity || 0}
            </Text>
          </ScrollView>
        </View>
      </Modal>

      {/* Restock modal */}
      <Modal visible={restockModalVisible} transparent animationType="fade">
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => setRestockModalVisible(false)}
        >
          <View style={styles.innerModal}>
            <Text style={styles.modalTitle}>Restock</Text>
            <TextInput
              style={styles.input}
              value={restockQuantity}
              onChangeText={setRestockQuantity}
              keyboardType="numeric"
              placeholder="Quantity to add"
              placeholderTextColor={themeColors.muted}
            />
            <TouchableOpacity
              style={[
                styles.submitButton,
                { backgroundColor: accent },
                restockSubmitting && { opacity: 0.6 },
              ]}
              onPress={handleRestock}
              disabled={restockSubmitting}
            >
              <Text style={styles.submitButtonText}>
                {restockSubmitting ? "Updating..." : "Confirm Restock"}
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Flash sale modal */}
      <Modal visible={flashSaleModalVisible} animationType="slide">
        <View style={styles.modalContainer}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Create Flash Sale</Text>
              <Pressable onPress={() => setFlashSaleModalVisible(false)}>
                <Ionicons name="close" size={24} color={themeColors.dark} />
              </Pressable>
            </View>
            <Text style={styles.detailPrice}>
              Original: {formatPrice(selectedProduct?.price)}
            </Text>
            <Text style={styles.label}>Flash Price (GH₵) *</Text>
            <TextInput
              style={styles.input}
              value={flashSalePrice}
              onChangeText={setFlashSalePrice}
              keyboardType="numeric"
              placeholder="0.00"
              placeholderTextColor={themeColors.muted}
            />
            <Text style={styles.label}>Max Quantity (optional)</Text>
            <TextInput
              style={styles.input}
              value={flashSaleMaxQty}
              onChangeText={setFlashSaleMaxQty}
              keyboardType="numeric"
              placeholder="Unlimited"
              placeholderTextColor={themeColors.muted}
            />
            <TouchableOpacity
              style={[
                styles.submitButton,
                { backgroundColor: accent },
                submitting && { opacity: 0.6 },
              ]}
              onPress={handleCreateFlashSale}
              disabled={submitting}
            >
              <Text style={styles.submitButtonText}>
                {submitting ? "Creating..." : "Create Flash Sale"}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
      {renderMenuDrawer()}
      {renderProductSelectModal()}
      {renderCatalogSortModal()}

      {/* Task progress checklists — product save + store live/pause toggle */}
      {renderProgressModal({
        icon: "cube-outline",
        runningTitle: editingProduct
          ? "Updating product…"
          : "Creating product…",
        failedTitle: "Couldn't save product",
        steps: createSteps,
        failed: createFailed,
        onClose: () => {
          setCreateSteps([]);
          setCreateFailed(false);
        },
      })}
      {renderProgressModal({
        icon: "radio-outline",
        runningTitle: liveSteps[0]?.label?.includes("Pausing")
          ? "Pausing store…"
          : "Going live…",
        failedTitle: "Couldn't update store",
        steps: liveSteps,
        failed: liveToggleFailed,
        onClose: () => setLiveSteps([]),
      })}
      {renderCouponManager()}
    </View>
  );
};

const buildSellerAdminStyles = (c) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    center: { alignItems: "center", justifyContent: "center" },
    scrollContent: {
      flexGrow: 1,
      paddingBottom: 20,
      // Opaque so the bounce backdrop behind the scroll view only shows
      // during overscroll, never between cards while scrolling normally.
      backgroundColor: c.background,
    },
    // ── Elastic-overscroll backdrop (see return) ────────────────────────────
    bounceWrap: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    bounceTop: { height: 600 },
    // ── Cover (full-bleed store banner) ────────────────────────────────────
    cover: {
      height: 220,
      position: "relative",
      overflow: "hidden",
      backgroundColor: c.primary,
    },
    coverImage: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
    coverOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0,0,0,0.25)",
    },
    topBar: {
      position: "absolute",
      left: 16,
      right: 16,
      zIndex: 5,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    topBarRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    topBarBtn: {
      width: 38,
      height: 38,
      borderRadius: radius.full,
      backgroundColor: "rgba(0,0,0,0.22)",
      alignItems: "center",
      justifyContent: "center",
    },
    coverCameraBtn: {
      position: "absolute",
      right: 16,
      bottom: 34,
      width: 42,
      height: 42,
      borderRadius: radius.full,
      backgroundColor: "rgba(0,0,0,0.28)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.35)",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 5,
    },

    // ── Profile sheet (rounded card overlapping the cover) ────────────────
    profileSheet: {
      backgroundColor: c.light,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      marginTop: -24,
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 18,
    },
    profileRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
    },
    avatarWrap: {
      width: 92,
      height: 92,
      borderRadius: radius.full,
      position: "relative",
    },
    avatar: {
      width: 92,
      height: 92,
      borderRadius: radius.full,
      backgroundColor: c.surface,
    },
    avatarPlaceholder: {
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.primary,
    },
    avatarCameraBadge: {
      position: "absolute",
      right: -2,
      bottom: -2,
      width: 30,
      height: 30,
      borderRadius: radius.full,
      borderWidth: 2.5,
      borderColor: c.light,
      alignItems: "center",
      justifyContent: "center",
    },
    profileInfoCol: {
      flex: 1,
      minWidth: 0,
    },
    nameRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    name: {
      flex: 1,
      fontSize: 22,
      fontWeight: "800",
      color: c.dark,
    },
    chevronBtn: {
      width: 34,
      height: 34,
      borderRadius: radius.full,
      backgroundColor: c.surface,
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
    },
    chevronDot: {
      position: "absolute",
      top: 2,
      right: 2,
      width: 10,
      height: 10,
      borderRadius: radius.full,
      backgroundColor: c.badgeDanger,
      borderWidth: 1.5,
      borderColor: c.light,
    },
    statLine: {
      fontSize: 14,
      color: c.muted,
      marginTop: 4,
    },
    statBold: {
      fontWeight: "800",
      color: c.dark,
    },
    statDot: {
      color: c.muted,
    },
    infoRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 14,
    },
    infoText: {
      fontSize: 14,
      fontWeight: "600",
      color: c.dark,
    },
    infoDot: {
      fontSize: 14,
      fontWeight: "700",
      color: c.muted,
      marginHorizontal: 2,
    },
    liveDot: {
      width: 8,
      height: 8,
      borderRadius: radius.full,
      marginHorizontal: 2,
    },

    // ── Action buttons (Dashboard / Create) ───────────────────────────────
    actionRow: {
      flexDirection: "row",
      gap: 10,
      marginTop: 16,
    },
    actionBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 13,
      borderRadius: radius.xl,
    },
    actionBtnPrimary: {
      backgroundColor: c.primary,
    },
    actionBtnPrimaryText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "700",
    },
    actionBtnSecondary: {
      backgroundColor: c.surface,
    },
    actionBtnSecondaryText: {
      color: c.dark,
      fontSize: 16,
      fontWeight: "700",
    },

    // ── Tab pills ──────────────────────────────────────────────────────────
    tabBar: {
      marginTop: 14,
      flexGrow: 0,
    },
    tabBarContent: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 16,
    },
    tabPill: {
      paddingHorizontal: 16,
      paddingVertical: 9,
      borderRadius: radius.full,
    },
    tabPillText: {
      fontSize: 14,
      fontWeight: "700",
      color: c.muted,
    },
    tabContent: {
      borderRadius: radius.lg,
      marginTop: 16,
      paddingHorizontal: 16,
    },
    reelsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
    reelCard: {
      width: "47%",
      backgroundColor: c.light,
      borderRadius: radius.md,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: c.surface,
      height: 200,
      position: "relative",
    },
    reelThumb: { width: "100%", height: "100%" },
    reelThumbInner: { width: "100%", height: "100%" },
    reelPlayBadge: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: "center",
      justifyContent: "center",
    },
    reelPlayerBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.96)",
      paddingTop: 44,
      paddingBottom: 24,
    },
    reelPlayerHeader: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingBottom: 10,
      gap: 12,
    },
    reelPlayerTitle: {
      flex: 1,
      fontSize: 15,
      fontWeight: "800",
      color: "#fff",
    },
    reelPlayerClose: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: "rgba(255,255,255,0.15)",
      alignItems: "center",
      justifyContent: "center",
    },
    reelPlayerSurface: {
      flex: 1,
      backgroundColor: "#000",
    },
    reelPlayerFallback: {
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    reelPlayerFallbackText: {
      fontSize: 13,
      fontWeight: "600",
      color: "rgba(255,255,255,0.85)",
    },
    reelOverlay: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: c.overlay,
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
    reelTitle: { color: c.light, fontSize: 12, fontWeight: "700" },
    reelDelete: {
      position: "absolute",
      top: 8,
      right: 8,
      backgroundColor: "rgba(239,68,68,0.92)",
      borderRadius: radius.lg,
      width: 34,
      height: 34,
      alignItems: "center",
      justifyContent: "center",
    },
    reelMenuButton: {
      position: "absolute",
      top: 8,
      right: 8,
      width: 34,
      height: 34,
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
      borderRadius: radius.lg,
      padding: 10,
      shadowColor: "#000",
      shadowOpacity: 0.18,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    menuTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: c.dark,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    menuItemRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: 12,
      borderRadius: radius.sm,
    },
    menuItemText: { fontSize: 15, fontWeight: "600", color: c.dark },
    confirmCard: {
      width: "85%",
      maxWidth: 340,
      backgroundColor: c.light,
      borderRadius: radius.lg,
      padding: 20,
      alignItems: "center",
      shadowColor: "#000",
      shadowOpacity: 0.18,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    confirmIconWrap: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: "rgba(239,68,68,0.12)",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    confirmTitle: {
      fontSize: 17,
      fontWeight: "800",
      color: c.dark,
      marginBottom: 6,
    },
    confirmMessage: {
      fontSize: 14,
      lineHeight: 20,
      color: c.muted,
      textAlign: "center",
      marginBottom: 18,
    },
    confirmButtonRow: {
      flexDirection: "row",
      width: "100%",
      gap: 10,
    },
    confirmButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: radius.sm,
      alignItems: "center",
    },
    confirmCancelButton: { backgroundColor: c.border },
    confirmCancelText: { fontSize: 15, fontWeight: "700", color: c.dark },
    confirmDeleteButton: { backgroundColor: "#EF4444" },
    confirmDeleteText: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
    progressList: {
      width: "100%",
      alignSelf: "stretch",
      gap: 12,
      paddingVertical: 6,
      marginBottom: 6,
    },
    progressRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    progressLabel: {
      flex: 1,
      fontSize: 14,
      fontWeight: "600",
      color: c.dark,
    },
    couponSheet: {
      width: "92%",
      maxWidth: 420,
      maxHeight: "85%",
      backgroundColor: c.light,
      borderRadius: radius.lg,
      padding: 16,
    },
    couponSheetTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 12,
    },
    couponSheetTitle: { fontSize: 16, fontWeight: "800", color: c.dark, flex: 1 },
    couponItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    couponItemCode: { fontSize: 14, fontWeight: "800", color: c.dark },
    couponItemMeta: { fontSize: 12, color: c.muted, marginTop: 2 },
    couponLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: c.muted,
      textTransform: "uppercase",
      marginTop: 8,
      marginBottom: 4,
    },
    couponInput: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.sm,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: c.dark,
      backgroundColor: c.light,
      marginBottom: 10,
    },
    couponChipRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
    couponChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: c.border,
    },
    couponChipActive: { backgroundColor: c.primary, borderColor: c.primary },
    couponChipText: { fontSize: 13, fontWeight: "600", color: c.dark },
    couponChipTextActive: { color: "#fff" },
    couponPrimaryBtn: {
      backgroundColor: c.primary,
      borderRadius: radius.sm,
      alignItems: "center",
      paddingVertical: 12,
      marginTop: 6,
    },
    couponPrimaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
    uploadQueueSection: {
      marginBottom: 14,
      gap: 10,
    },
    uploadQueueHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    uploadQueueTitle: {
      fontSize: 14,
      fontWeight: "800",
      color: c.dark,
    },
    uploadQueueSub: {
      fontSize: 12,
      color: c.muted,
    },
    uploadJobCard: {
      backgroundColor: c.light,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      padding: 12,
      gap: 8,
    },
    uploadJobTopRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
    },
    uploadJobTitle: {
      fontSize: 13,
      fontWeight: "800",
      color: c.dark,
    },
    uploadJobMeta: {
      fontSize: 12,
      color: c.muted,
      marginTop: 2,
    },
    uploadJobPct: {
      fontSize: 12,
      fontWeight: "800",
      color: c.primary,
    },
    uploadJobBarTrack: {
      height: 8,
      borderRadius: radius.full,
      backgroundColor: c.border,
      overflow: "hidden",
    },
    uploadJobBarFill: {
      height: "100%",
      borderRadius: radius.full,
    },
    attachVideoCard: {
      backgroundColor: c.light,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: 14,
      marginBottom: 14,
      gap: 12,
    },
    attachVideoHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
    },
    attachVideoActions: {
      gap: 8,
      alignItems: "flex-end",
    },
    attachVideoTitle: {
      fontSize: 15,
      fontWeight: "800",
      color: c.dark,
    },
    attachVideoSubtitle: {
      marginTop: 4,
      fontSize: 12,
      color: c.muted,
      lineHeight: 17,
    },
    attachVideoButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: radius.xl,
    },
    attachVideoButtonText: {
      color: c.light,
      fontWeight: "800",
      fontSize: 13,
    },
    attachVideoLabel: {
      fontSize: 12,
      fontWeight: "700",
      color: c.muted,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    attachProductRow: {
      gap: 10,
    },
    attachProductChip: {
      width: 140,
      padding: 10,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.light,
      gap: 8,
    },
    attachProductChipText: {
      fontSize: 13,
      fontWeight: "800",
      color: c.dark,
    },
    attachProductChipMeta: {
      fontSize: 11,
      color: c.muted,
      marginTop: 4,
    },
    deleteVideosButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: c.primary,
      backgroundColor: c.light,
    },
    deleteVideosButtonText: {
      color: c.primary,
      fontWeight: "800",
      fontSize: 13,
    },
    attachProductChipMeta: {
      fontSize: 11,
      color: c.muted,
      marginTop: 4,
    },
    attachProductThumb: {
      width: "100%",
      height: 84,
      borderRadius: radius.sm,
      backgroundColor: c.border,
    },
    attachProductThumbFallback: {
      width: "100%",
      height: 84,
      borderRadius: radius.sm,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.border,
    },
    primaryButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 16,
      paddingVertical: 9,
      borderRadius: radius.pill,
      elevation: 3,
      shadowColor: "#000",
      shadowOpacity: 0.12,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
    },
    primaryButtonText: { color: c.light, fontWeight: "700", fontSize: 13 },
    sectionHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
      borderRadius: radius.md,
    },
    chipRow: {
      borderRadius: radius.xl,
      marginBottom: 12,
    },
    videoDeleteList: {
      maxHeight: 460,
    },
    videoDeleteEmpty: {
      padding: 24,
      textAlign: "center",
      color: c.muted,
      fontSize: 14,
    },
    videoDeleteThumb: {
      width: 56,
      height: 56,
      borderRadius: radius.md,
      backgroundColor: c.border,
    },
    videoDeleteThumbFallback: {
      width: 56,
      height: 56,
      borderRadius: radius.md,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(239,68,68,0.10)",
    },
    // ── Select-a-product sheet (video attach flow) ─────────────────────────
    modalBackdrop: {
      flex: 1,
      backgroundColor: c.overlay,
      justifyContent: "flex-end",
    },
    modalCard: {
      backgroundColor: c.light,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      maxHeight: "88%",
      paddingBottom: 24,
      shadowColor: "#000",
      shadowOpacity: 0.18,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: -4 },
      elevation: 10,
    },
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 18,
      paddingVertical: 18,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
    },
    modalHeaderTitle: {
      fontSize: 18,
      fontWeight: "800",
      color: c.light,
    },
    sortOption: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 14,
      paddingHorizontal: 18,
      gap: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.surface,
    },
    sortOptionLeft: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      minWidth: 0,
    },
    sortOptionText: {
      fontSize: 15,
      fontWeight: "700",
      color: c.dark,
    },
    videoDeleteMeta: {
      fontSize: 12,
      color: c.muted,
      marginTop: 2,
      textTransform: "capitalize",
    },
    summaryChip: {
      backgroundColor: c.light,
      borderRadius: radius.xl,
      paddingHorizontal: 14,
      paddingVertical: 8,
      marginRight: 8,
      borderWidth: 1,
      borderColor: c.surface,
    },
    summaryChipLabel: {
      color: c.muted,
      fontSize: 10,
      fontWeight: "700",
      textTransform: "uppercase",
    },
    summaryChipValue: {
      fontWeight: "900",
      color: c.dark,
      fontSize: 16,
      marginTop: 2,
    },
    flashBanner: {
      backgroundColor: "rgba(239,68,68,0.08)",
      borderRadius: radius.md,
      padding: 12,
      marginBottom: 12,
    },
    flashBannerHead: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 8,
    },
    flashBannerTitle: { fontWeight: "800", color: "#EF4444", fontSize: 14 },
    flashCountPill: {
      backgroundColor: "#EF4444",
      borderRadius: radius.sm,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    flashCountText: { color: c.light, fontSize: 11, fontWeight: "700" },
    flashCard: {
      width: 120,
      marginRight: 10,
      backgroundColor: c.light,
      borderRadius: radius.md,
      padding: 8,
      borderWidth: 1,
      borderColor: c.surface,
    },
    flashThumb: { width: "100%", height: 70, borderRadius: radius.xs },
    flashThumbPlaceholder: {
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.primary,
    },
    flashName: { fontSize: 12, fontWeight: "700", color: c.dark, marginTop: 6 },
    flashPrice: {
      fontSize: 13,
      fontWeight: "800",
      color: "#EF4444",
      marginTop: 2,
    },
    flashDiscount: { fontSize: 10, color: c.muted, marginTop: 2 },
    searchBox: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.light,
      borderRadius: radius.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: c.surface,
    },
    searchInput: { flex: 1, marginLeft: 8, color: c.dark, fontSize: 14 },
    filterChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: radius.lg,
      backgroundColor: c.light,
      borderWidth: 1,
      borderColor: c.surface,
      marginRight: 8,
    },
    filterChipActive: { backgroundColor: c.dark, borderColor: c.dark },
    filterChipText: { color: c.muted, fontWeight: "600", fontSize: 12 },
    filterChipTextActive: { color: c.light, fontWeight: "700" },
    productGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
    productCard: {
      width: "47%",
      backgroundColor: c.light,
      borderRadius: radius.md,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: c.surface,
    },
    productPlaceholderCard: {
      width: "47%",
      borderRadius: radius.md,
      overflow: "hidden",
    },
    productImage: { width: "100%", height: 110 },
    productImagePlaceholder: {
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.primary,
    },
    productBody: { padding: 10 },
    productTitle: { fontSize: 13, fontWeight: "700", color: c.dark },
    productRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 4,
    },
    productPrice: { fontSize: 13, fontWeight: "800" },
    productStatus: {
      fontSize: 10,
      fontWeight: "700",
      textTransform: "capitalize",
      color: c.muted,
    },
    emptyNote: {
      textAlign: "center",
      color: c.muted,
      fontSize: 14,
      marginTop: 20,
    },
    pipeline: { marginBottom: 12 },
    pipelineBar: {
      flexDirection: "row",
      height: 8,
      borderRadius: radius.xxs,
      overflow: "hidden",
      backgroundColor: c.surface,
    },
    pipelineSegment: { height: "100%" },
    pipelineLegend: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginTop: 6,
    },
    legendText: { fontSize: 11, color: c.muted, fontWeight: "600" },
    orderCard: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      backgroundColor: c.light,
      borderRadius: radius.md,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: c.surface,
    },
    orderIconBox: {
      width: 40,
      height: 40,
      borderRadius: radius.sm,
      backgroundColor: c.surface,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
    },
    orderNo: { fontSize: 14, fontWeight: "700", color: c.dark },
    orderMeta: { fontSize: 12, color: c.muted, marginTop: 2 },
    orderTotal: { fontSize: 14, fontWeight: "800", color: c.dark },
    orderStatus: {
      fontSize: 11,
      fontWeight: "700",
      textTransform: "capitalize",
      marginTop: 2,
    },
    progressButton: {
      marginTop: 10,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: radius.lg,
    },
    progressText: { fontWeight: "700", fontSize: 13 },
    successBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginTop: 10,
    },
    successText: { color: c.success, fontWeight: "700", fontSize: 13 },
    insightCards: { flexDirection: "row", gap: 12 },
    insightCard: {
      flex: 1,
      backgroundColor: c.light,
      borderRadius: radius.md,
      padding: 14,
      alignItems: "center",
      borderWidth: 1,
      borderColor: c.surface,
    },
    insightValue: {
      fontSize: 18,
      fontWeight: "900",
      color: c.dark,
      marginTop: 6,
    },
    insightLabel: {
      fontSize: 11,
      color: c.muted,
      marginTop: 4,
      fontWeight: "600",
      textAlign: "center",
    },
    insightSummary: {
      borderRadius: radius.md,
      fontSize: 13,
      color: c.muted,
      marginTop: 14,
      lineHeight: 19,
      textAlign: "center",
    },
    modalContainer: { flex: 1, backgroundColor: c.background },
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingBottom: 10,
      borderBottomWidth: 1,
      backgroundColor: c.background,
    },
    modalHeaderBtn: {
      width: 36,
      height: 36,
      borderRadius: radius.full,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.light,
    },
    modalHeaderCenter: {
      flex: 1,
      alignItems: "center",
      marginHorizontal: 8,
    },
    modalTitle: { fontSize: 17, fontWeight: "800", color: c.dark },
    modalSubtitle: {
      fontSize: 11,
      fontWeight: "600",
      color: c.muted,
      marginTop: 1,
    },
    progressRail: {
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: c.background,
    },
    progressSegmentWrap: { flex: 1, alignItems: "center", gap: 5 },
    progressSegment: {
      height: 4,
      width: "100%",
      borderRadius: radius.full,
      backgroundColor: c.surface,
    },
    progressLabel: { fontSize: 10, fontWeight: "700", color: c.muted },
    modalScroll: { flex: 1 },
    modalContent: { padding: 16, paddingBottom: 24 },
    card: {
      backgroundColor: c.light,
      borderRadius: radius.lg,
      padding: 14,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: c.surface,
    },
    cardTitle: { fontSize: 14, fontWeight: "800", color: c.dark },
    cardTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    cardCounter: { fontSize: 11, fontWeight: "600", color: c.muted },
    summaryCard: {
      backgroundColor: c.light,
      borderRadius: radius.lg,
      padding: 14,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: c.border,
    },
    summaryRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 10,
    },
    summaryLabel: { fontSize: 13, color: c.muted, fontWeight: "600" },
    summaryValue: {
      fontSize: 13,
      color: c.dark,
      fontWeight: "700",
      flexShrink: 1,
      marginLeft: 12,
      textAlign: "right",
    },
    hintRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      marginTop: 8,
    },
    // ── Platform fee breakdown (product form, under Price) ────────────────
    feeBreakdown: {
      marginTop: 8,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: radius.md,
      backgroundColor: c.surfaceAlpha,
      gap: 4,
    },
    feeRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    feeLabel: { fontSize: 12.5, color: c.muted },
    feeLabelStrong: { color: c.dark, fontWeight: "700" },
    feeValue: { fontSize: 12.5, color: c.muted, fontVariant: ["tabular-nums"] },
    feeValueStrong: { color: c.dark, fontWeight: "800" },
    hintText: { fontSize: 11.5, color: c.muted, marginTop: 8, lineHeight: 16 },
    label: {
      fontSize: 12.5,
      fontWeight: "700",
      color: c.dark,
      marginBottom: 6,
      marginTop: 12,
    },
    input: {
      backgroundColor: c.background,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.full,
      paddingHorizontal: 12,
      paddingVertical: 11,
      fontSize: 14,
      color: c.dark,
    },
    textArea: { height: 100, backgroundColor: c.background,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.xl,
      paddingHorizontal: 12,
      paddingVertical: 11,
      fontSize: 14,
      color: c.dark, },
    tagInputWrap: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 12,
      paddingVertical: 0,
      marginTop: 10,
    },
    tagInput: {
      flex: 1,
      fontSize: 14,
      color: c.dark,
      paddingVertical: 11,
    },
    row: {
      borderRadius: radius.md,
      flexDirection: "row",
      gap: 12,
    },
    col: {
      borderRadius: radius.md,
      flex: 1,
    },
    categoryRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 4,
    },
    catChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: radius.full,
      backgroundColor: c.background,
      borderWidth: 1,
      borderColor: c.border,
    },
    catChipText: { fontSize: 12.5, fontWeight: "700", color: c.muted },
    colorRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginTop: 4,
    },
    colorDot: {
      width: 32,
      height: 32,
      borderRadius: radius.full,
      borderWidth: 2,
      borderColor: "transparent",
      alignItems: "center",
      justifyContent: "center",
    },
    colorDotActive: { borderColor: c.dark, transform: [{ scale: 1.12 }] },
    checkRowItem: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      marginTop: 14,
    },
    checkTextWrap: { flex: 1, gap: 2 },
    checkLabel: { fontSize: 13.5, fontWeight: "700", color: c.dark },
    checkHint: { fontSize: 11.5, color: c.muted, lineHeight: 15 },
    imageGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginTop: 10,
    },
    imageWrap: {
      position: "relative",
    },
    imageThumb: { width: 84, height: 84, borderRadius: radius.md },
    imageRemove: {
      position: "absolute",
      top: -6,
      right: -6,
      backgroundColor: c.light,
      borderRadius: radius.md,
    },
    imageAdd: {
      width: 84,
      height: 84,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderStyle: "dashed",
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
    },
    imageAddText: { fontSize: 11, fontWeight: "700" },
    videoGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginTop: 10,
    },
    videoWrap: {
      position: "relative",
      width: 140,
      height: 140,
      borderRadius: radius.md,
      overflow: "hidden",
      backgroundColor: c.dark,
    },
    videoThumb: { width: "100%", height: "100%" },
    videoRemove: {
      position: "absolute",
      top: 6,
      right: 6,
      backgroundColor: c.light,
      borderRadius: radius.md,
    },
    videoBadge: {
      position: "absolute",
      left: 6,
      bottom: 6,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: "rgba(0,0,0,0.55)",
      borderRadius: radius.xs,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    videoBadgeText: { color: c.light, fontSize: 10, fontWeight: "700" },
    videoAdd: {
      width: 140,
      height: 140,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderStyle: "dashed",
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
    },
    stepActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 16,
      paddingTop: 12,
      borderTopWidth: 1,
      backgroundColor: c.background,
    },
    stepSpacer: { flex: 1 },
    stepButton: {
      minWidth: 110,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: radius.xl,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 6,
    },
    stepButtonSecondary: {
      backgroundColor: c.light,
      borderWidth: 1,
      borderColor: c.border,
    },
    stepButtonText: { color: c.light, fontWeight: "800", fontSize: 15 },
    stepButtonSecondaryText: { color: c.dark, fontWeight: "800", fontSize: 15 },
    submitButton: {
      marginTop: 20,
      paddingVertical: 14,
      borderRadius: radius.xl,
      alignItems: "center",
    },
    submitButtonText: { color: c.light, fontWeight: "700", fontSize: 15 },
    detailImage: {
      width: "100%",
      height: 200,
      borderRadius: radius.md,
      marginBottom: 12,
    },
    detailPrice: {
      fontSize: 20,
      fontWeight: "800",
      color: c.accent,
      marginBottom: 4,
    },
    detailStatus: { fontSize: 14, color: c.muted, marginBottom: 8 },
    detailDesc: { fontSize: 14, color: c.dark, lineHeight: 20 },
    detailMeta: { fontSize: 13, color: c.muted, marginTop: 8 },
    sheetOverlay: {
      flex: 1,
      backgroundColor: c.overlay,
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: c.light,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 16,
      paddingBottom: 30,
    },
    sheetItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 14,
    },
    sheetText: { fontSize: 15, fontWeight: "600", color: c.dark },
    sheetItemDanger: { borderTopWidth: 1, borderTopColor: c.surface },
    innerModal: {
      backgroundColor: c.light,
      borderRadius: radius.lg,
      padding: 20,
      margin: 24,
    },
    drawerOverlay: {
      flex: 1,
      flexDirection: "row",
      backgroundColor: c.overlay,
    },
    drawer: {
      borderRadius: radius.lg,
      width: "78%",
      maxWidth: 320,
      backgroundColor: c.light,
      paddingTop: 12,
      paddingBottom: 24,
      shadowColor: "#000",
      shadowOpacity: 0.2,
      shadowRadius: 12,
      shadowOffset: { width: 2, height: 0 },
      elevation: 8,
    },
    drawerHeader: {
      borderRadius: radius.md,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.surface,
    },
    drawerTitle: { fontSize: 18, fontWeight: "800", color: c.dark },
    drawerScroll: {
      borderRadius: radius.md,
      flex: 1,
      paddingHorizontal: 8,
      paddingTop: 8,
    },
    menuSection: {
      fontSize: 11,
      fontWeight: "800",
      textTransform: "uppercase",
      color: c.muted,
      marginTop: 16,
      marginBottom: 4,
      marginLeft: 12,
    },
    menuItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: radius.sm,
    },
    menuItemText: { fontSize: 15, fontWeight: "600", color: c.dark },
    themeOptions: {
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    themeOption: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 10,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.light,
    },
    themeOptionActive: {
      borderColor: c.primary,
      backgroundColor: "rgba(255, 90, 121, 0.10)",
    },
    themeOptionText: {
      fontSize: 13,
      fontWeight: "600",
      color: c.muted,
    },
    themeOptionTextActive: {
      color: c.primary,
      fontWeight: "700",
    },
    // Go Live toggle
    goLiveRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 18,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 16,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    goLiveRowActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    goLiveRowDisabled: {
      opacity: 0.85,
    },
    goLiveLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      flex: 1,
    },
    goLiveTextWrap: {
      flex: 1,
    },
    goLiveTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: c.dark,
    },
    goLiveTitleActive: {
      color: c.light,
    },
    goLiveSub: {
      fontSize: 12,
      color: c.muted,
      marginTop: 2,
    },
    goLiveSubActive: {
      color: "rgba(255,255,255,0.85)",
    },
    goLiveSwitch: {
      width: 46,
      height: 26,
      borderRadius: 13,
      backgroundColor: c.border,
      padding: 3,
      justifyContent: "center",
    },
    goLiveSwitchOn: {
      backgroundColor: "rgba(255,255,255,0.4)",
      alignItems: "flex-end",
    },
    goLiveKnob: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: c.light,
    },
    // "Your store isn't live yet" banner
    notLiveBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginTop: 14,
      padding: 12,
      borderRadius: radius.lg,
      backgroundColor: `${brandColors.accentYellow}18`,
      borderWidth: 1,
      borderColor: `${brandColors.accentYellow}45`,
    },
    notLiveBannerPressed: {
      opacity: 0.75,
    },
    notLiveIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: brandColors.accentYellow,
      alignItems: "center",
      justifyContent: "center",
    },
    notLiveCopy: {
      flex: 1,
    },
    notLiveTitle: {
      fontSize: 13,
      fontWeight: "800",
      color: c.dark,
    },
    notLiveSub: {
      fontSize: 11,
      lineHeight: 15,
      color: c.muted,
      marginTop: 2,
    },
    // Payment verification badge (inside the not-live banner)
    payBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      alignSelf: "flex-start",
      marginTop: 8,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: radius.pill,
      borderWidth: 1,
    },
    payBadgeText: {
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 0.2,
    },
    // WhatsApp catalog sync
    waRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: c.surface,
      borderRadius: radius.md,
      paddingHorizontal: 16,
      paddingVertical: 14,
      marginTop: 10,
      borderWidth: 1,
      borderColor: c.border,
    },
    waRowActive: {
      backgroundColor: "#25D366",
      borderColor: "#25D366",
    },
    waLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      flex: 1,
    },
    waTextWrap: { flex: 1 },
    waTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: c.dark,
    },
    waTitleActive: { color: "#fff" },
    waSub: {
      fontSize: 12,
      color: c.muted,
      marginTop: 2,
    },
    waSubActive: { color: "rgba(255,255,255,0.85)" },
    waSyncButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: c.primary,
      borderRadius: radius.xl,
      paddingVertical: 12,
      marginTop: 10,
    },
    waSyncText: {
      fontSize: 14,
      fontWeight: "700",
      color: "#fff",
    },
    waOauthCard: {
      alignItems: "center",
      backgroundColor: c.light,
      borderRadius: radius.md,
      padding: 24,
      marginTop: 8,
      borderWidth: 1,
      borderColor: c.border,
    },
    waOauthTitle: {
      fontSize: 18,
      fontWeight: "800",
      color: c.dark,
      marginTop: 12,
      marginBottom: 8,
    },
    waHint: {
      fontSize: 13,
      color: c.muted,
      lineHeight: 19,
      textAlign: "center",
      marginTop: 4,
    },
    waFacebookButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      backgroundColor: "#1877F2",
      borderRadius: radius.xl,
      paddingVertical: 14,
    },
    waFacebookButtonDisabled: {
      opacity: 0.6,
    },
    waFacebookText: {
      fontSize: 15,
      fontWeight: "700",
      color: "#fff",
    },
    orderSkeleton: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.light,
      borderRadius: radius.md,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: c.surface,
    },
    orderSkeletonIcon: {
      width: 40,
      height: 40,
      borderRadius: radius.sm,
      backgroundColor: c.border,
    },
    orderSkeletonLine: {
      height: 12,
      borderRadius: radius.xxs,
      backgroundColor: c.border,
      width: "80%",
    },
    specList: {
      gap: 12,
      marginTop: 4,
    },
    specRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    specKey: {
      flex: 1,
    },
    specValue: {
      flex: 1,
    },
    specRemove: {
      padding: 2,
    },
    addSpecButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 12,
      alignSelf: "flex-start",
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: radius.full,
      backgroundColor: c.background,
      borderWidth: 1,
      borderColor: c.border,
    },
    addSpecText: { fontSize: 14, fontWeight: "700" },
    // ── Catalog toolbar / redesigned product cards ───────────────────────────
    catalogToolbar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
    },
    catalogSortButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginRight: 12,
      backgroundColor: c.dark,
      borderRadius: radius.full,
      paddingVertical: 10,
      paddingHorizontal: 14,
    },
    catalogSortButtonText: {
      flexShrink: 1,
      fontSize: 13,
      fontWeight: "700",
      color: c.light,
    },
    catalogFilterBadge: {
      minWidth: 18,
      height: 18,
      paddingHorizontal: 4,
      borderRadius: radius.full,
      backgroundColor: "#EF4444",
      alignItems: "center",
      justifyContent: "center",
    },
    catalogFilterBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
    catalogViewToggle: {
      flexDirection: "row",
      backgroundColor: c.light,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.full,
      overflow: "hidden",
    },
    catalogViewToggleBtn: {
      width: 38,
      height: 34,
      alignItems: "center",
      justifyContent: "center",
    },
    catalogViewToggleBtnActive: { backgroundColor: c.dark },
    catalogGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
    catalogGridItem: { width: "47%" },
    catalogList: { gap: 10 },
    catalogCard: {
      width: "47%",
      backgroundColor: c.light,
      borderRadius: radius.md,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: c.surface,
    },
    catalogCardMedia: {
      width: "100%",
      height: 130,
      backgroundColor: c.surface,
    },
    catalogCardImage: { width: "100%", height: "100%" },
    catalogCardImagePlaceholder: {
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.primary,
    },
    catalogStatusPill: {
      position: "absolute",
      top: 8,
      left: 8,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: radius.full,
    },
    catalogStatusPillInline: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: radius.full,
    },
    catalogStatusPillText: {
      color: "#fff",
      fontSize: 9,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    catalogFlashPill: {
      position: "absolute",
      bottom: 8,
      right: 8,
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: radius.full,
      backgroundColor: "#EF4444",
    },
    catalogFlashPillInline: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: radius.full,
      backgroundColor: "#EF4444",
    },
    catalogFlashPillText: { color: "#fff", fontSize: 9, fontWeight: "800" },
    catalogCardBody: { padding: 10, gap: 3 },
    catalogCardCategory: {
      fontSize: 10,
      fontWeight: "700",
      color: c.muted,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    catalogCardTitle: {
      fontSize: 13,
      fontWeight: "700",
      color: c.dark,
      lineHeight: 17,
      minHeight: 34,
    },
    catalogCardPriceRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 2,
      flexWrap: "wrap",
    },
    catalogCardPrice: { fontSize: 14, fontWeight: "800" },
    catalogCardOriginal: {
      fontSize: 11,
      color: c.muted,
      textDecorationLine: "line-through",
    },
    catalogCardMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 4,
    },
    catalogCardMeta: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginTop: 2,
    },
    catalogCardMetaText: { fontSize: 10, color: c.muted, fontWeight: "600" },
    catalogListCard: {
      flexDirection: "row",
      alignItems: "stretch",
      gap: 12,
      backgroundColor: c.light,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.surface,
      padding: 10,
      overflow: "hidden",
    },
    catalogListThumb: {
      width: 86,
      height: 86,
      borderRadius: radius.sm,
      backgroundColor: c.surface,
    },
    catalogListBody: { flex: 1, minWidth: 0, justifyContent: "center", gap: 3 },
    catalogListTopRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    catalogListChevron: { alignSelf: "center" },
    catalogListSkeleton: {
      flexDirection: "row",
      gap: 12,
      backgroundColor: c.light,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.surface,
      padding: 10,
    },
    catalogListThumbSkeleton: {
      width: 86,
      height: 86,
      borderRadius: radius.sm,
      backgroundColor: c.surface,
    },
    catalogListLine: {
      height: 12,
      borderRadius: radius.xxs,
      backgroundColor: c.surface,
    },
    // ── Sort & Filter popup ──────────────────────────────────────────────────
    catalogSheetClose: { marginLeft: "auto", padding: 2 },
    catalogSectionLabel: {
      fontSize: 12,
      fontWeight: "800",
      color: c.muted,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      paddingHorizontal: 18,
      marginTop: 14,
    },
    catalogSectionHead: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingRight: 18,
    },
    catalogClearText: { fontSize: 12, fontWeight: "700", color: "#EF4444" },
    catalogSortOption: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      paddingHorizontal: 18,
      marginTop: 4,
    },
    catalogSortOptionLeft: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    catalogSortOptionText: { fontSize: 15, fontWeight: "600", color: c.dark },
    catalogDivider: { height: 1, backgroundColor: c.surface, marginTop: 8 },
    catalogCategoryWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      paddingHorizontal: 18,
      marginTop: 10,
    },
    catalogCategoryChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.background || c.light,
    },
    catalogCategoryChipActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    catalogCategoryChipText: { fontSize: 12, fontWeight: "600", color: c.muted },
    catalogCategoryChipTextActive: { color: c.light, fontWeight: "700" },
  });

export default SellerAdminScreen;
