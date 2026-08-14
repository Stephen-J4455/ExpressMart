import React, { useEffect, useState, useCallback, useMemo } from "react";
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
} from "react-native";
import { Video } from "react-native-video";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
// expo-file-system v57 deprecated createUploadTask on the main entry (it now
// throws). The working implementation lives in the legacy subpath, which is
// exactly what we need to stream the raw video bytes to R2 via a binary PUT.
import * as FileSystem from "expo-file-system/legacy";
import { Ionicons } from "@expo/vector-icons";
import { supabase, callEdgeFunction } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { notifyOrderStatusUpdate } from "../services/notificationService";
import { sellerFlashSaleService } from "../services/sellerFlashSaleService";
import { colors, getTheme, radius } from "../theme/colors";
import { getImageContentType, getWebUploadPayload } from "../utils/webUpload";
import { CustomerLoadingAnimation } from "../components/CustomerLoadingAnimation";
import { ProductCardPlaceholder } from "../components/ProductCardPlaceholder";

const DEFAULT_CATEGORIES = [
  { id: "default-fashion", name: "Fashion", icon: "shirt-outline" },
  { id: "default-grocery", name: "Grocery", icon: "basket-outline" },
  { id: "default-beauty", name: "Beauty", icon: "sparkles-outline" },
  { id: "default-electronics", name: "Electronics", icon: "hardware-chip-outline" },
  { id: "default-home", name: "Home", icon: "home-outline" },
];

const PRODUCT_FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "pending", label: "Pending" },
  { key: "draft", label: "Drafts" },
  { key: "rejected", label: "Rejected" },
];

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
      contentType: ext === "mov" || ext === "qt" ? "video/quicktime" : "video/mp4",
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
  { label: "My Statuses", icon: "megaphone-outline", screen: "StatusViewer" },
  { label: "Create Status", icon: "create-outline", screen: "StatusCreator" },
  { section: "Store Settings" },
  // Merge store profile editing into main ProfileEdit flow for sellers
  { label: "Store Profile", icon: "storefront-outline", screen: "SellerProfile" },
  { label: "Payment Account", icon: "card-outline", screen: "Payments" },
  { label: "Account settings", icon: "color-palette-outline", screen: "Settings" },
  { section: "Account" },
  { label: "Security", icon: "shield-checkmark-outline", screen: "Security" },
  { label: "Privacy", icon: "lock-closed-outline", screen: "PrivacySettings" },
  { label: "Help & Support", icon: "help-circle-outline", screen: "HelpSupport" },
  { label: "Sign Out", icon: "log-out-outline", action: "signOut" },
];

export const SellerAdminScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const nav = useNavigation();
  const { user, profile: customerProfile, signOut } = useAuth();
  const toast = useToast();

  // ── Seller data layer (mirrors Express-Store SellerContext) ──────────────
  const [seller, setSeller] = useState(null);
  const [sellerId, setSellerId] = useState(null);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const theme =
    getTheme(seller?.theme_color) ||
    getTheme(colors.primary);
  const accent = (theme && theme.accent) || colors.accent;

  // ── Catalog UI state ─────────────────────────────────────────────────────
  const [productFilter, setProductFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [modalVisible, setModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
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
  const [productSelectModalVisible, setProductSelectModalVisible] = useState(false);
  // Per-video popup menu (kebab) — holds the reel being acted on.
  const [cardMenu, setCardMenu] = useState(null); // reel object or null

  // ── Orders UI state ─────────────────────────────────────────────────────
  const [orderFilter, setOrderFilter] = useState("processing");
  const [orderSearch, setOrderSearch] = useState("");

  // ── Reels UI state (seller reels stored on Cloudflare R2) ──────────────
  const [reels, setReels] = useState([]);
  const [reelsLoading, setReelsLoading] = useState(false);
  const [deletingReelId, setDeletingReelId] = useState(null);

  // ── Tabs ────────────────────────────────────────────────────────────────
  const TABS = ["catalog", "orders", "flash", "reels", "insights"];
  const TAB_ICONS = {
    catalog: "grid-outline",
    orders: "receipt-outline",
    flash: "flash-outline",
    reels: "videocam-outline",
    insights: "bar-chart-outline",
  };
  const [activeTab, setActiveTab] = useState("catalog");

  useEffect(() => {
    // reserved
  }, []);

  const fetchSellerId = useCallback(async () => {
    if (!supabase || !user) return null;
    const { data: existing } = await supabase
      .from("express_sellers")
      .select("id, name, theme_color, avatar, badges, store_description")
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
        supabase
          .from("express_categories")
          .select("id,name,icon,color"),
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
    } catch (err) {
      console.error("SellerAdmin load error:", err);
      toast.error("Failed to load", err.message || "Please try again");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [supabase, user, fetchSellerId, toast]);

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
      return created;
    },
    [sellerId],
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
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
  }, []);

  const deleteProduct = useCallback(async (id) => {
    const { error } = await supabase
      .from("express_products")
      .delete()
      .eq("id", id);
    if (error) throw error;
    setProducts((prev) => prev.filter((p) => p.id !== id));
  }, []);

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
        const { error } = await supabase
          .from("reels")
          .delete()
          .eq("id", id);
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
      const key = product.r2_video_key || getStoragePathFromUrl(product.video_url);
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
      if (status === "delivered") updates.delivered_at = new Date().toISOString();

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
          await notifyOrderStatusUpdate(customerId, orderId, status, orderNumber);
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
    setSelectedColors(product.colors || []);
    setWeightUnit(product.weight_unit || "kg");
    setSlug(product.slug || "");
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
      Array.isArray(product.thumbnails) && product.thumbnails.filter(Boolean).length
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

  const getStoragePathFromUrl = (url) => {
    if (!url || typeof url !== "string") return null;
    const clean = url.split("?")[0];
    const pub = "/storage/v1/object/public/express-products/";
    const signed = "/storage/v1/object/sign/express-products/";
    if (clean.includes(pub)) return decodeURIComponent(clean.split(pub)[1] || "");
    if (clean.includes(signed))
      return decodeURIComponent(clean.split(signed)[1] || "");
    if (clean.startsWith("products/")) return clean;
    return null;
  };

  const deleteProductImageFromStorage = async (url) => {
    const path = getStoragePathFromUrl(url);
    if (!path) throw new Error("Could not determine image storage path");
    const { error } = await supabase.storage
      .from("express-products")
      .remove([path]);
    if (error) throw new Error(error.message || "Failed to remove image");
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
          ? { ...p, thumbnail: next[0] || null, thumbnails: next, status: "active" }
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
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        toast.error("Permission needed", "Please grant camera roll permissions");
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
      const ext = seg.includes(".") ? seg.split(".").pop()?.toLowerCase() : null;
      if (!ext || ext.length > 5) return "jpg";
      return ext === "jpeg" ? "jpg" : ext;
    };
    const ext = getExt(uri);
    const fileName = `product-${Date.now()}-${Math.random()
      .toString(36)
      .substring(7)}.${ext}`;
    const folder = sellerId || "unknown";
    const objectPath = `products/${folder}/${fileName}`;
    const contentType = getImageContentType(uri);

    // Read the asset into a Blob — the reliable cross-platform upload payload
    // for supabase-js v2 (the old FormData/{uri,type,name} approach fails on
    // React Native). Mirrors the avatar upload fix.
    let fileBody;
    let finalContentType = contentType;
    if (Platform.OS === "web") {
      const picked = imageFiles?.[uri]?.file || null;
      const pickedType = imageFiles?.[uri]?.type || null;
      const payload = await getWebUploadPayload({
        uri,
        pickedFile: picked,
        preferredContentType: pickedType || contentType,
      });
      fileBody = payload.fileBody;
      finalContentType = payload.contentType || contentType;
    } else {
      const response = await fetch(uri);
      const blob = await response.blob();
      if (!blob) throw new Error("Could not read the selected image");
      fileBody = blob;
      finalContentType = blob.type || contentType;
    }

    const uploadRes = await Promise.race([
      supabase.storage.from("express-products").upload(objectPath, fileBody, {
        contentType: finalContentType,
        cacheControl: "3600",
        upsert: false,
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Upload timed out")), 45000),
      ),
    ]);
    if (uploadRes.error) throw uploadRes.error;
    const { data: urlData } = supabase.storage
      .from("express-products")
      .getPublicUrl(objectPath);
    return urlData.publicUrl;
  };

  const uploadImages = async (uris) =>
    Promise.all(uris.map((u) => uploadImage(u)));

  // ── Product video: pick + upload to Cloudflare R2 ──────────────────────
  const pickVideo = async () => {
    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        toast.error("Permission needed", "Please grant camera roll permissions");
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
      const sizeBytes = Number(asset?.fileSize || asset?.size || asset?.file?.size || 0);
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
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        toast.error("Permission needed", "Please grant camera roll permissions");
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
    const sizeBytes = Number(asset?.fileSize || asset?.size || asset?.file?.size || 0);
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
      const { data, error } = await supabase.functions.invoke("get-r2-upload-url", {
        body: { fileName, fileType: contentType, folder: `products/${uploadFolderOwnerId}` },
      });
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
            reject(new Error(`R2 video upload failed with status ${xhr.status}`));
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
          throw new Error(`R2 video upload failed with status ${result.status}`);
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
        deleteProduct(selectedProduct.id)
          .then(() => toast.success("Deleted", "Product removed"))
          .catch((e) => toast.error("Delete failed", e.message));
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
      toast.success("Flash Sale Created", `Flash sale for ${selectedProduct.title}`);
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

        const { publicUrl, key } = await uploadVideoToR2(uri, pickedFile, (progress) => {
          upsertVideoUploadJob(jobId, {
            status: "uploading",
            progress,
            message:
              progress >= 1 ? "Finalizing upload" : `Uploading ${Math.round(progress * 100)}%`,
          });
        });

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
          console.warn("Failed to enqueue product video transcode:", transcodeErr);
        }

        upsertVideoUploadJob(jobId, {
          status: "done",
          progress: 1,
          message: "Uploaded and saved",
          publicUrl,
          r2Key: key,
        });
        toast.success("Video uploaded", `${productTitle || "Product"} video is now live`);
      } catch (error) {
        upsertVideoUploadJob(jobId, {
          status: "error",
          progress: 0,
          message: error.message || "Upload failed",
        });
        toast.error("Video upload failed", error.message || "Could not upload the video");
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
    try {
      let imageUrls = [];
      if (imageUris.length > 0) imageUrls = await uploadImages(imageUris);
      const merged = editingProduct
        ? [...existingImageUrls, ...imageUrls]
        : imageUrls;

      const specsObj = {};
      specifications.forEach((s) => {
        if (s.key && s.value) specsObj[s.key] = s.value;
      });

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
        colors: selectedColors,
        quantity: quantity ? parseInt(quantity) : 0,
        sku: sku || null,
        weight: weight ? parseFloat(weight) : null,
        weight_unit: weightUnit || "kg",
        barcode: barcode || null,
        vendor: vendor || null,
        slug: slug || null,
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
      productData.r2_video_key = editingProduct ? editingProduct.r2_video_key || null : null;

      let savedProductId = editingProduct?.id ?? null;

      if (editingProduct) {
        productData.status = "active";
        await updateProduct(editingProduct.id, productData);
        toast.success("Updated", "Product updated and is now live");
      } else {
        const created = await createProduct(productData);
        savedProductId = created?.id ?? null;
        toast.success("Created", "Product created and is now live");
      }

      if (videoUri && savedProductId) {
        void startBackgroundVideoUpload({
          productId: savedProductId,
          productTitle: title,
          uri: videoUri,
          pickedFile: videoFile?.file || null,
        });
      }

      resetProductFormState();
      setModalVisible(false);
    } catch (e) {
      toast.error("Error", e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Derived data ────────────────────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    let filtered = products;
    if (productFilter !== "all")
      filtered = filtered.filter((p) => p.status === productFilter);
    if (categoryFilter !== "all")
      filtered = filtered.filter((p) => p.category === categoryFilter);
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
  }, [products, productFilter, categoryFilter, searchQuery, sortBy]);

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
        .filter((fs) => fs.is_active && fs.end_time > now)
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
      .reduce((s, o) => s + (Number(o.total || 0) - Number(o.service_fee || 0)), 0);
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

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
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
              <Text style={styles.flashCountText}>{activeFlashSales.length} live</Text>
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {activeFlashSales.map((fs) => {
              const thumb = fs.product.thumbnails?.[0] || null;
              const pct =
                fs.discount_percentage ||
                Math.round(
                  ((fs.original_price - fs.flash_price) / fs.original_price) * 100,
                );
              const hrs = Math.max(
                0,
                Math.round((new Date(fs.end_time) - new Date()) / (1000 * 60 * 60)),
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
                    <View style={[styles.flashThumb, styles.flashThumbPlaceholder]}>
                      <Ionicons name="image-outline" size={20} color={colors.muted} />
                    </View>
                  )}
                  <Text style={styles.flashName} numberOfLines={1}>
                    {fs.product.title}
                  </Text>
                  <Text style={styles.flashPrice}>
                    {formatPrice(fs.flash_price)}
                  </Text>
                  <Text style={styles.flashDiscount}>{pct}% off · {hrs}h left</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search products..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor={colors.muted}
        />
        {searchQuery ? (
          <Pressable onPress={() => setSearchQuery("")}>
            <Ionicons name="close-circle" size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
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
        {categories.map((c) => (
          <Pressable
            key={c.id}
            style={[
              styles.filterChip,
              categoryFilter === c.name && styles.filterChipActive,
            ]}
            onPress={() => setCategoryFilter(c.name)}
          >
            <Text
              style={[
                styles.filterChipText,
                categoryFilter === c.name && styles.filterChipTextActive,
              ]}
            >
              {c.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.sortRow}>
        <Text style={styles.sortLabel}>Sort</Text>
        {["recent", "price-desc", "price-asc", "alpha"].map((key) => (
          <Pressable
            key={key}
            style={[styles.sortChip, sortBy === key && styles.sortChipActive]}
            onPress={() => setSortBy(key)}
          >
            <Text
              style={[
                styles.sortChipText,
                sortBy === key && styles.sortChipTextActive,
              ]}
            >
              {key === "recent"
                ? "Recent"
                : key === "alpha"
                  ? "A-Z"
                  : key === "price-desc"
                    ? "Price ↓"
                    : "Price ↑"}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.productGrid}>
          {Array.from({ length: 4 }).map((_, i) => (
            <ProductCardPlaceholder key={`ph-${i}`} />
          ))}
        </View>
      ) : filteredProducts.length === 0 ? (
        <Text style={styles.emptyNote}>No products found.</Text>
      ) : (
        <View style={styles.productGrid}>
          {filteredProducts.map((p) => (
            <Pressable
              key={p.id}
              style={styles.productCard}
              onPress={() => {
                setSelectedProduct(p);
                setActionSheetVisible(true);
              }}
            >
              {p.thumbnail ? (
                <Image source={{ uri: p.thumbnail }} style={styles.productImage} />
              ) : (
                <View style={[styles.productImage, styles.productImagePlaceholder]}>
                  <Ionicons name="cube" size={28} color="#fff" />
                </View>
              )}
              <View style={styles.productBody}>
                <Text style={styles.productTitle} numberOfLines={1}>
                  {p.title}
                </Text>
                <View style={styles.productRow}>
                  <Text style={[styles.productPrice, { color: accent }]}>
                    {formatPrice(p.price)}
                  </Text>
                  <Text style={styles.productStatus}>{p.status}</Text>
                </View>
              </View>
            </Pressable>
          ))}
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
                      flex: total / Math.max(statusSummary.reduce((s, x) => s + x.total, 0), 1),
                      backgroundColor:
                        status === "processing"
                          ? colors.primary
                          : status === "packed"
                            ? "#F59E0B"
                            : status === "shipped"
                              ? "#06B6D4"
                              : status === "delivered"
                                ? colors.success
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
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by order # or customer..."
          value={orderSearch}
          onChangeText={setOrderSearch}
          placeholderTextColor={colors.muted}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
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
                  style={[styles.orderSkeletonLine, { width: "60%", marginTop: 8 }]}
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
              <Text style={styles.orderMeta}>{o.customer?.name || "Guest"}</Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 6 }}>
              <Text style={styles.orderTotal}>{formatPrice(o.total)}</Text>
              <Text style={[styles.orderStatus, { color: accent }]}>
                {o.status}
              </Text>
            </View>
            {nextStatusMap[o.status] ? (
              <TouchableOpacity
                style={[styles.progressButton, { backgroundColor: accent + "14" }]}
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
                <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                <Text style={styles.successText}>Delivered</Text>
              </View>
            ) : null}
          </Pressable>
        ))
      )}
    </View>
  );

  // ── Flash sales tab ─────────────────────────────────────────────────────
  const renderFlash = () => (
    <View>
      <Text style={styles.sectionTitle}>Flash Sales</Text>
      {products.length === 0 ? (
        <Text style={styles.emptyNote}>Add products to run flash sales.</Text>
      ) : (
        <View style={styles.productGrid}>
          {products.map((p) => {
            const sale = Array.isArray(p.flash_sale)
              ? p.flash_sale.find((fs) => fs.is_active)
              : null;
            return (
              <Pressable
                key={p.id}
                style={styles.productCard}
                onPress={() => {
                  setSelectedProduct(p);
                  setFlashSaleModalVisible(true);
                  setFlashSalePrice("");
                  setFlashSaleMaxQty("");
                }}
              >
                {p.thumbnail ? (
                  <Image source={{ uri: p.thumbnail }} style={styles.productImage} />
                ) : (
                  <View style={[styles.productImage, styles.productImagePlaceholder]}>
                    <Ionicons name="cube" size={28} color="#fff" />
                  </View>
                )}
                <View style={styles.productBody}>
                  <Text style={styles.productTitle} numberOfLines={1}>
                    {p.title}
                  </Text>
                  <Text style={[styles.productStatus, { color: accent }]}>
                    {sale ? "Flash sale active" : "Tap to create"}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );

  // ── Insights tab ────────────────────────────────────────────────────────
  const renderInsights = () => (
    <View>
      <Text style={styles.sectionTitle}>Insights</Text>
      <View style={styles.insightCards}>
        <View style={styles.insightCard}>
          <Ionicons name="cash-outline" size={20} color="#10B981" />
          <Text style={styles.insightValue}>{formatPrice(metrics.revenue)}</Text>
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
        {orders.length === 1 ? "" : "s"}, generating {formatPrice(metrics.netRevenue)}{" "}
        in net revenue after fees.
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
          <Text style={styles.uploadQueueSub}>{videoUploadJobs.length} queued</Text>
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
                {job.status === "error" ? "!" : `${Math.round((job.progress || 0) * 100)}%`}
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
                          ? colors.success
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
            Choose a video, then pick the product to attach it to. Uploads continue in the background.
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
                {item.thumbnail_url ? (
                  <Image source={{ uri: item.thumbnail_url }} style={styles.reelThumb} />
                ) : (
                  <Video
                    source={{ uri: item.video_url }}
                    style={styles.reelThumb}
                    resizeMode="cover"
                    paused
                    muted
                  />
                )}
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
      {renderCardMenu()}
    </View>
  );

  // Per-video popup menu (shown above the reels grid) with a delete option.
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
              color={deletingReelId === cardMenu?.id ? colors.muted : "#EF4444"}
            />
            <Text
              style={[
                styles.menuItemText,
                deletingReelId === cardMenu?.id && { color: colors.muted },
              ]}
            >
              {deletingReelId === cardMenu?.id ? "Deleting…" : "Delete"}
            </Text>
          </Pressable>
          <Pressable style={styles.menuItemRow} onPress={() => setCardMenu(null)}>
            <Ionicons name="close-outline" size={20} color={colors.dark} />
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
            colors={[colors.primary, colors.accent]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.modalHeader}
          >
            <Ionicons name="cube-outline" size={20} color="#fff" />
            <Text style={styles.modalHeaderTitle}>Select a product</Text>
          </LinearGradient>
          <ScrollView style={styles.videoDeleteList} showsVerticalScrollIndicator={false}>
            {products.length === 0 ? (
              <Text style={styles.videoDeleteEmpty}>No products available yet.</Text>
            ) : (
              products.map((product) => {
                const thumb = product.thumbnail || product.thumbnails?.[0] || null;
                return (
                  <Pressable
                    key={product.id}
                    style={styles.sortOption}
                    onPress={() => attachPendingVideoToProduct(product)}
                  >
                    <View style={styles.sortOptionLeft}>
                      {thumb ? (
                        <Image source={{ uri: thumb }} style={styles.videoDeleteThumb} />
                      ) : (
                        <View style={styles.videoDeleteThumbFallback}>
                          <Ionicons name="cube-outline" size={16} color={colors.primary} />
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
                    <Ionicons name="chevron-forward" size={18} color={colors.muted} />
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
      animationType="fade"
      onRequestClose={() => setMenuVisible(false)}
    >
      <Pressable
        style={styles.drawerOverlay}
        onPress={() => setMenuVisible(false)}
      >
        <View
          style={styles.drawer}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.drawerHeader}>
            <Text style={styles.drawerTitle}>Store Menu</Text>
            <Pressable onPress={() => setMenuVisible(false)} hitSlop={8}>
              <Ionicons name="close" size={24} color={colors.dark} />
            </Pressable>
          </View>
          <ScrollView style={styles.drawerScroll} showsVerticalScrollIndicator={false}>
            {MENU_ITEMS.map((item, i) =>
              item.section ? (
                <Text key={`sec-${i}`} style={styles.menuSection}>
                  {item.section}
                </Text>
              ) : (
                <Pressable
                  key={item.screen || item.label}
                  style={styles.menuItem}
                  onPress={() => {
                    setMenuVisible(false);
                    if (item.action === "signOut") {
                      try {
                        signOut?.();
                      } catch (e) {
                        console.warn("Sign out failed", e);
                      }
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
                      item.action === "signOut" ? "#EF4444" : colors.muted
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
                    color={colors.muted}
                    style={{ marginLeft: "auto" }}
                  />
                </Pressable>
              ),
            )}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
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
        <View
          style={[
            styles.cover,
            {
              paddingTop: insets.top,
              backgroundColor: avatarUri ? "transparent" : accent,
            },
          ]}
        >
          <Pressable
            style={[styles.menuButton, { top: insets.top + 12 }]}
            onPress={() => setMenuVisible(true)}
            hitSlop={12}
          >
            <Ionicons name="menu-outline" size={26} color="#fff" />
          </Pressable>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.coverImage} resizeMode="cover" />
          ) : null}
          <View style={styles.coverOverlay} />
        </View>

        <View style={styles.profileBlock}>
          <View style={[styles.avatarWrap, { borderColor: accent }]}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Ionicons name="storefront" size={48} color="#fff" />
              </View>
            )}
          </View>
          <Text style={styles.name}>{sellerName}</Text>
          <View style={styles.statRow}>
            <View style={styles.statItemSeller}>
              <Text style={styles.statValueSeller}>{followerCount}</Text>
              <Text style={styles.statLabelSeller}>Followers</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItemSeller}>
              <Text style={styles.statValueSeller}>{followingCount}</Text>
              <Text style={styles.statLabelSeller}>Following</Text>
            </View>
          </View>
        </View>

        <View style={styles.tabBar}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <Pressable
                key={tab}
                style={[
                  styles.tab,
                  isActive && { backgroundColor: accent + "14" },
                ]}
                onPress={() => setActiveTab(tab)}
              >
                <Ionicons
                  name={TAB_ICONS[tab]}
                  size={22}
                  color={isActive ? accent : colors.muted}
                />
              </Pressable>
            );
          })}
        </View>

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
      <Modal visible={modalVisible} animationType="slide">
        <View style={styles.modalContainer}>
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>
                {editingProduct ? "Edit Product" : "New Product"}
              </Text>
              <Pressable onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.dark} />
              </Pressable>
            </View>

            <View style={styles.stepper}>
              {PRODUCT_FORM_STEPS.map((step, index) => {
                const stepNumber = index + 1;
                const isActive = productFormStep === stepNumber;
                const isCompleted = productFormStep > stepNumber;
                return (
                  <View key={step.key} style={styles.stepperItem}>
                    <View
                      style={[
                        styles.stepperCircle,
                        isActive && styles.stepperCircleActive,
                        isCompleted && styles.stepperCircleDone,
                      ]}
                    >
                      <Text
                        style={[
                          styles.stepperCircleText,
                          (isActive || isCompleted) && styles.stepperCircleTextActive,
                        ]}
                      >
                        {stepNumber}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.stepperLabel,
                        isActive && styles.stepperLabelActive,
                      ]}
                    >
                      {step.label}
                    </Text>
                  </View>
                );
              })}
            </View>

            <Text style={styles.stepHint}>
              Step {productFormStep} of {PRODUCT_FORM_STEPS.length}
            </Text>

            {productFormStep === 1 && (
              <>
                <Text style={styles.label}>Title *</Text>
                <TextInput
                  style={styles.input}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Product title"
                  placeholderTextColor={colors.muted}
                />

                <View style={styles.row}>
                  <View style={styles.col}>
                    <Text style={styles.label}>Price (GH₵) *</Text>
                    <TextInput
                      style={styles.input}
                      value={price}
                      onChangeText={setPrice}
                      keyboardType="numeric"
                      placeholder="0.00"
                      placeholderTextColor={colors.muted}
                    />
                  </View>
                  <View style={styles.col}>
                    <Text style={styles.label}>Shipping (GH₵)</Text>
                    <TextInput
                      style={styles.input}
                      value={shippingFee}
                      onChangeText={setShippingFee}
                      keyboardType="numeric"
                      placeholder="0.00"
                      placeholderTextColor={colors.muted}
                    />
                  </View>
                </View>

                <Text style={styles.label}>Category *</Text>
                <View style={styles.categoryRow}>
                  {categories.map((c) => (
                    <Pressable
                      key={c.id}
                      style={[
                        styles.catChip,
                        category === c.name && {
                          backgroundColor: accent,
                          borderColor: accent,
                        },
                      ]}
                      onPress={() => setCategory(c.name)}
                    >
                      <Text
                        style={[
                          styles.catChipText,
                          category === c.name && { color: "#fff" },
                        ]}
                      >
                        {c.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.label}>Description</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Describe the product..."
                  placeholderTextColor={colors.muted}
                  multiline
                  numberOfLines={4}
                />

                <View style={styles.stepActions}>
                  <View style={styles.stepSpacer} />
                  <TouchableOpacity
                    style={[styles.stepButton, { backgroundColor: accent }]}
                    onPress={goToNextProductStep}
                  >
                    <Text style={styles.stepButtonText}>Next</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {productFormStep === 2 && (
              <>
                <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.label}>Quantity *</Text>
                <TextInput
                  style={styles.input}
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={colors.muted}
                />
              </View>
              <View style={styles.col}>
                <Text style={styles.label}>Discount %</Text>
                <TextInput
                  style={styles.input}
                  value={String(discount)}
                  onChangeText={(t) => setDiscount(Number(t) || 0)}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={colors.muted}
                />
              </View>
            </View>

            <Text style={styles.label}>Sizes</Text>
            <View style={styles.categoryRow}>
              {SIZES.map((s) => (
                <Pressable
                  key={s}
                  style={[
                    styles.catChip,
                    selectedSizes.includes(s) && { backgroundColor: accent, borderColor: accent },
                  ]}
                  onPress={() =>
                    setSelectedSizes((prev) =>
                      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
                    )
                  }
                >
                  <Text style={[styles.catChipText, selectedSizes.includes(s) && { color: "#fff" }]}>{s}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Colors</Text>
            <View style={styles.colorRow}>
              {AVAILABLE_COLORS.map((c) => (
                <Pressable
                  key={c.name}
                  style={[
                    styles.colorDot,
                    { backgroundColor: c.hex },
                    selectedColors.some((x) => x.name === c.name) && styles.colorDotActive,
                  ]}
                  onPress={() =>
                    setSelectedColors((prev) =>
                      prev.some((x) => x.name === c.name)
                        ? prev.filter((x) => x.name !== c.name)
                        : [...prev, c],
                    )
                  }
                />
              ))}
            </View>

            <View style={styles.checkRow}>
              <Pressable
                style={styles.checkbox}
                onPress={() => setIsPreorder((v) => !v)}
              >
                <Ionicons
                  name={isPreorder ? "checkbox" : "square-outline"}
                  size={20}
                  color={isPreorder ? accent : colors.muted}
                />
                <Text style={styles.checkLabel}>Preorder</Text>
              </Pressable>
              <Pressable
                style={styles.checkbox}
                onPress={() => setTrackInventory((v) => !v)}
              >
                <Ionicons
                  name={trackInventory ? "checkbox" : "square-outline"}
                  size={20}
                  color={trackInventory ? accent : colors.muted}
                />
                <Text style={styles.checkLabel}>Track inventory</Text>
              </Pressable>
              <Pressable
                style={styles.checkbox}
                onPress={() => setAllowBackorder((v) => !v)}
              >
                <Ionicons
                  name={allowBackorder ? "checkbox" : "square-outline"}
                  size={20}
                  color={allowBackorder ? accent : colors.muted}
                />
                <Text style={styles.checkLabel}>Allow backorder</Text>
              </Pressable>
            </View>

                <View style={styles.stepActions}>
                  <TouchableOpacity
                    style={[styles.stepButton, styles.stepButtonSecondary]}
                    onPress={goToPreviousProductStep}
                  >
                    <Text style={styles.stepButtonSecondaryText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.stepButton, { backgroundColor: accent }]}
                    onPress={goToNextProductStep}
                  >
                    <Text style={styles.stepButtonText}>Next</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {productFormStep === 3 && (
              <>
            <Text style={styles.label}>Images (max 5)</Text>
            <View style={styles.imageGrid}>
              {existingImageUrls.map((u) => (
                <View key={u} style={styles.imageWrap}>
                  <Image source={{ uri: u }} style={styles.imageThumb} />
                  <Pressable
                    style={styles.imageRemove}
                    onPress={() => handleRemoveExistingImage(u)}
                    disabled={!!removingImageUrl}
                  >
                    <Ionicons name="close-circle" size={20} color="#EF4444" />
                  </Pressable>
                </View>
              ))}
              {imageUris.map((u) => (
                <View key={u} style={styles.imageWrap}>
                  <Image source={{ uri: u }} style={styles.imageThumb} />
                  <Pressable
                    style={styles.imageRemove}
                    onPress={() => setImageUris((prev) => prev.filter((x) => x !== u))}
                  >
                    <Ionicons name="close-circle" size={20} color="#EF4444" />
                  </Pressable>
                </View>
              ))}
              {imageUris.length + existingImageUrls.length < 5 && (
                <Pressable style={styles.imageAdd} onPress={pickImage}>
                  <Ionicons name="add" size={28} color={accent} />
                </Pressable>
              )}
            </View>

            <Text style={styles.label}>Product Video (optional)</Text>
            <View style={styles.videoGrid}>
              {existingVideoUrl || videoUri ? (
                <View style={styles.videoWrap}>
                  {videoUri ? (
                    <Video
                      source={{ uri: videoUri }}
                      style={styles.videoThumb}
                      resizeMode="cover"
                      repeat
                      muted
                      paused
                    />
                  ) : (
                    <Video
                      source={{ uri: existingVideoUrl }}
                      style={styles.videoThumb}
                      resizeMode="cover"
                      repeat
                      muted
                      paused
                    />
                  )}
                  <Pressable
                    style={styles.videoRemove}
                    onPress={
                      videoUri
                        ? () => setVideoUri(null)
                        : handleRemoveExistingVideo
                    }
                    disabled={removingVideo}
                  >
                    <Ionicons name="close-circle" size={20} color="#EF4444" />
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
                      <Ionicons name="videocam-outline" size={28} color={accent} />
                      <Text style={[styles.videoAddText, { color: accent }]}>
                        Add video
                      </Text>
                    </>
                  )}
                </Pressable>
              )}
            </View>

            <View style={styles.stepActions}>
              <TouchableOpacity
                style={[styles.stepButton, styles.stepButtonSecondary]}
                onPress={goToPreviousProductStep}
              >
                <Text style={styles.stepButtonSecondaryText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.stepButton, { backgroundColor: accent }]}
                onPress={goToNextProductStep}
              >
                <Text style={styles.stepButtonText}>Next</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

            {productFormStep === 4 && (
              <>
                <Text style={styles.label}>Specifications</Text>
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
                        placeholderTextColor={colors.muted}
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
                        placeholderTextColor={colors.muted}
                      />
                      <Pressable
                        style={styles.specRemove}
                        onPress={() =>
                          setSpecifications(
                            specifications.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <Ionicons name="close-circle" size={22} color="#EF4444" />
                      </Pressable>
                    </View>
                  ))}
                </View>
                <TouchableOpacity
                  style={styles.addSpecButton}
                  onPress={() =>
                    setSpecifications([...specifications, { key: "", value: "" }])
                  }
                >
                  <Ionicons name="add" size={18} color={accent} />
                  <Text style={[styles.addSpecText, { color: accent }]}>Add Specification</Text>
                </TouchableOpacity>

                <View style={styles.stepActions}>
                  <TouchableOpacity
                    style={[styles.stepButton, styles.stepButtonSecondary]}
                    onPress={goToPreviousProductStep}
                  >
                    <Text style={styles.stepButtonSecondaryText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.stepButton,
                      { backgroundColor: accent },
                      submitting && { opacity: 0.6 },
                    ]}
                    onPress={submitProduct}
                    disabled={submitting}
                  >
                    <Text style={styles.stepButtonText}>
                      {submitting
                        ? "Saving..."
                        : editingProduct
                          ? "Save Changes"
                          : "Create Product"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Action sheet */}
      <Modal visible={actionSheetVisible} transparent animationType="fade">
        <Pressable style={styles.sheetOverlay} onPress={() => setActionSheetVisible(false)}>
          <View style={styles.sheet}>
            <Pressable style={styles.sheetItem} onPress={() => handleActionSheet("view")}>
              <Ionicons name="eye-outline" size={20} color={colors.dark} />
              <Text style={styles.sheetText}>View</Text>
            </Pressable>
            <Pressable style={styles.sheetItem} onPress={() => handleActionSheet("edit")}>
              <Ionicons name="create-outline" size={20} color={colors.dark} />
              <Text style={styles.sheetText}>Edit</Text>
            </Pressable>
            <Pressable style={styles.sheetItem} onPress={() => handleActionSheet("restock")}>
              <Ionicons name="add-circle-outline" size={20} color={colors.dark} />
              <Text style={styles.sheetText}>Restock</Text>
            </Pressable>
            <Pressable style={styles.sheetItem} onPress={() => handleActionSheet("flash_sale")}>
              <Ionicons name="flash-outline" size={20} color={colors.dark} />
              <Text style={styles.sheetText}>Flash Sale</Text>
            </Pressable>
            <Pressable style={styles.sheetItem} onPress={() => handleActionSheet("duplicate")}>
              <Ionicons name="copy-outline" size={20} color={colors.dark} />
              <Text style={styles.sheetText}>Duplicate as draft</Text>
            </Pressable>
            <Pressable style={styles.sheetItem} onPress={() => handleActionSheet("toggle_status")}>
              <Ionicons name="swap-horizontal-outline" size={20} color={colors.dark} />
              <Text style={styles.sheetText}>Toggle status</Text>
            </Pressable>
            <Pressable style={[styles.sheetItem, styles.sheetItemDanger]} onPress={() => handleActionSheet("delete")}>
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
              <Text style={[styles.sheetText, { color: "#EF4444" }]}>Delete</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Detail modal */}
      <Modal visible={detailModalVisible} animationType="slide">
        <View style={styles.modalContainer}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{viewingProduct?.title}</Text>
              <Pressable onPress={() => setDetailModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.dark} />
              </Pressable>
            </View>
            {viewingProduct?.thumbnail ? (
              <Image source={{ uri: viewingProduct.thumbnail }} style={styles.detailImage} />
            ) : null}
            <Text style={styles.detailPrice}>{formatPrice(viewingProduct?.price)}</Text>
            <Text style={styles.detailStatus}>Status: {viewingProduct?.status}</Text>
            <Text style={styles.detailDesc}>{viewingProduct?.description}</Text>
            <Text style={styles.detailMeta}>Quantity: {viewingProduct?.quantity || 0}</Text>
          </ScrollView>
        </View>
      </Modal>

      {/* Restock modal */}
      <Modal visible={restockModalVisible} transparent animationType="fade">
        <Pressable style={styles.sheetOverlay} onPress={() => setRestockModalVisible(false)}>
          <View style={styles.innerModal}>
            <Text style={styles.modalTitle}>Restock</Text>
            <TextInput style={styles.input} value={restockQuantity} onChangeText={setRestockQuantity} keyboardType="numeric" placeholder="Quantity to add" placeholderTextColor={colors.muted} />
            <TouchableOpacity
              style={[styles.submitButton, { backgroundColor: accent }, restockSubmitting && { opacity: 0.6 }]}
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
                <Ionicons name="close" size={24} color={colors.dark} />
              </Pressable>
            </View>
            <Text style={styles.detailPrice}>Original: {formatPrice(selectedProduct?.price)}</Text>
            <Text style={styles.label}>Flash Price (GH₵) *</Text>
            <TextInput style={styles.input} value={flashSalePrice} onChangeText={setFlashSalePrice} keyboardType="numeric" placeholder="0.00" placeholderTextColor={colors.muted} />
            <Text style={styles.label}>Max Quantity (optional)</Text>
            <TextInput style={styles.input} value={flashSaleMaxQty} onChangeText={setFlashSaleMaxQty} keyboardType="numeric" placeholder="Unlimited" placeholderTextColor={colors.muted} />
            <TouchableOpacity
              style={[styles.submitButton, { backgroundColor: accent }, submitting && { opacity: 0.6 }]}
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: "center", justifyContent: "center" },
  scrollContent: { flexGrow: 1, paddingBottom: 20 },
  cover: {
    borderRadius: radius.lg, height: 160, position: "relative", overflow: "hidden" },
  coverImage: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  coverOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  profileBlock: {
    borderRadius: radius.lg, alignItems: "center", marginTop: -50, paddingHorizontal: 20 },
  avatarWrap: {
    borderRadius: radius.full,
    borderWidth: 4,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  avatar: { width: 100, height: 100, borderRadius: radius.full },
  avatarPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  name: { fontSize: 20, fontWeight: "800", color: colors.dark, marginTop: 12, textAlign: "center" },
  tabBar: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: "#EEF2FF",
    borderRadius: radius.full,
    padding: 4,
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 10, borderRadius: radius.full },
  tabContent: {
    borderRadius: radius.lg, marginTop: 16, paddingHorizontal: 16 },
  reelsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  reelCard: {
    width: "47%",
    backgroundColor: "#fff",
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#F1F5F9",
    height: 200,
    position: "relative",
  },
  reelThumb: { width: "100%", height: "100%" },
  reelOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  reelTitle: { color: "#fff", fontSize: 12, fontWeight: "700" },
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
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  menuCard: {
    width: "80%",
    maxWidth: 320,
    backgroundColor: "#fff",
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
    color: colors.dark,
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
  menuItemText: { fontSize: 15, fontWeight: "600", color: colors.dark },
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
    color: colors.dark,
  },
  uploadQueueSub: {
    fontSize: 12,
    color: colors.muted,
  },
  uploadJobCard: {
    backgroundColor: "#fff",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#E2E8F0",
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
    color: colors.dark,
  },
  uploadJobMeta: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  uploadJobPct: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.primary,
  },
  uploadJobBarTrack: {
    height: 8,
    borderRadius: radius.full,
    backgroundColor: "#E2E8F0",
    overflow: "hidden",
  },
  uploadJobBarFill: {
    height: "100%",
    borderRadius: radius.full,
  },
  attachVideoCard: {
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#E2E8F0",
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
    color: colors.dark,
  },
  attachVideoSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: colors.muted,
    lineHeight: 17,
  },
  attachVideoButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  attachVideoButtonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 13,
  },
  attachVideoLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  attachProductRow: {
    gap: 10,
  },
  attachProductChip: {
    width: 140,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    gap: 8,
  },
  attachProductChipText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.dark,
  },
  attachProductChipMeta: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 4,
  },
  deleteVideosButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: "#fff",
  },
  deleteVideosButtonText: {
    color: colors.primary,
    fontWeight: "800",
    fontSize: 13,
  },
  attachProductChipMeta: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 4,
  },
  attachProductThumb: {
    width: "100%",
    height: 84,
    borderRadius: radius.sm,
    backgroundColor: "#E2E8F0",
  },
  attachProductThumbFallback: {
    width: "100%",
    height: 84,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E2E8F0",
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
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    borderRadius: radius.md,
  },
  chipRow: {
    borderRadius: radius.md, marginBottom: 12 },
  videoDeleteList: {
    maxHeight: 460,
  },
  videoDeleteEmpty: {
    padding: 24,
    textAlign: "center",
    color: colors.muted,
    fontSize: 14,
  },
  videoDeleteThumb: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: "#E2E8F0",
  },
  videoDeleteThumbFallback: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FDE8E8",
  },
  // ── Select-a-product sheet (video attach flow) ─────────────────────────
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#fff",
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
    color: "#fff",
  },
  sortOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 18,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
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
    color: colors.dark,
  },
  videoDeleteMeta: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
    textTransform: "capitalize",
  },
  summaryChip: {
    backgroundColor: "#fff",
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  summaryChipLabel: { color: colors.muted, fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  summaryChipValue: { fontWeight: "900", color: colors.dark, fontSize: 16, marginTop: 2 },
  flashBanner: {
    backgroundColor: "#FFF5F5",
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 12,
  },
  flashBannerHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  flashBannerTitle: { fontWeight: "800", color: "#EF4444", fontSize: 14 },
  flashCountPill: { backgroundColor: "#EF4444", borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 2 },
  flashCountText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  flashCard: { width: 120, marginRight: 10, backgroundColor: "#fff", borderRadius: radius.md, padding: 8, borderWidth: 1, borderColor: "#F1F5F9" },
  flashThumb: { width: "100%", height: 70, borderRadius: radius.xs },
  flashThumbPlaceholder: { alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  flashName: { fontSize: 12, fontWeight: "700", color: colors.dark, marginTop: 6 },
  flashPrice: { fontSize: 13, fontWeight: "800", color: "#EF4444", marginTop: 2 },
  flashDiscount: { fontSize: 10, color: colors.muted, marginTop: 2 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  searchInput: { flex: 1, marginLeft: 8, color: colors.dark, fontSize: 14 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#F1F5F9",
    marginRight: 8,
  },
  filterChipActive: { backgroundColor: colors.dark, borderColor: colors.dark },
  filterChipText: { color: colors.muted, fontWeight: "600", fontSize: 12 },
  filterChipTextActive: { color: "#fff", fontWeight: "700" },
  sortRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  sortLabel: { fontSize: 12, fontWeight: "700", color: colors.muted },
  sortChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.xs, backgroundColor: "#fff", borderWidth: 1, borderColor: "#F1F5F9" },
  sortChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  sortChipText: { fontSize: 11, fontWeight: "600", color: colors.muted },
  sortChipTextActive: { color: "#fff", fontWeight: "700" },
  productGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  productCard: { width: "47%", backgroundColor: "#fff", borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: "#F1F5F9" },
  productImage: { width: "100%", height: 110 },
  productImagePlaceholder: { alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  productBody: { padding: 10 },
  productTitle: { fontSize: 13, fontWeight: "700", color: colors.dark },
  productRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  productPrice: { fontSize: 13, fontWeight: "800" },
  productStatus: { fontSize: 10, fontWeight: "700", textTransform: "capitalize", color: colors.muted },
  emptyNote: { textAlign: "center", color: colors.muted, fontSize: 14, marginTop: 20 },
  pipeline: { marginBottom: 12 },
  pipelineBar: { flexDirection: "row", height: 8, borderRadius: radius.xxs, overflow: "hidden", backgroundColor: "#F1F5F9" },
  pipelineSegment: { height: "100%" },
  pipelineLegend: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 },
  legendText: { fontSize: 11, color: colors.muted, fontWeight: "600" },
  orderCard: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    backgroundColor: "#fff",
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  orderIconBox: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  orderNo: { fontSize: 14, fontWeight: "700", color: colors.dark },
  orderMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  orderTotal: { fontSize: 14, fontWeight: "800", color: colors.dark },
  orderStatus: { fontSize: 11, fontWeight: "700", textTransform: "capitalize", marginTop: 2 },
  progressButton: { marginTop: 10, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.sm },
  progressText: { fontWeight: "700", fontSize: 13 },
  successBadge: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 10 },
  successText: { color: colors.success, fontWeight: "700", fontSize: 13 },
  insightCards: { flexDirection: "row", gap: 12 },
  insightCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: radius.md,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  insightValue: { fontSize: 18, fontWeight: "900", color: colors.dark, marginTop: 6 },
  insightLabel: { fontSize: 11, color: colors.muted, marginTop: 4, fontWeight: "600", textAlign: "center" },
  insightSummary: {
    borderRadius: radius.md, fontSize: 13, color: colors.muted, marginTop: 14, lineHeight: 19, textAlign: "center" },
  modalContainer: { flex: 1, backgroundColor: colors.background, paddingTop: 40 },
  modalScroll: { flex: 1 },
  modalContent: {
    borderRadius: radius.md, padding: 16, paddingBottom: 40 },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: colors.dark },
  stepper: {
    borderRadius: radius.md,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 10,
  },
  stepperItem: {
    borderRadius: radius.sm,
    alignItems: "center",
    minWidth: 68,
  },
  stepperCircle: {
    width: 28,
    height: 28,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  stepperCircleActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  stepperCircleDone: {
    backgroundColor: colors.dark,
    borderColor: colors.dark,
  },
  stepperCircleText: { fontSize: 11, fontWeight: "800", color: colors.muted },
  stepperCircleTextActive: { color: "#fff" },
  stepperLabel: { fontSize: 10, fontWeight: "700", color: colors.muted, marginTop: 4, textAlign: "center" },
  stepperLabelActive: { color: colors.dark },
  stepHint: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
    marginBottom: 8,
  },
  label: { fontSize: 13, fontWeight: "700", color: colors.dark, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#F1F5F9",
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.dark,
  },
  textArea: { height: 90, textAlignVertical: "top" },
  row: {
    borderRadius: radius.md, flexDirection: "row", gap: 12 },
  col: {
    borderRadius: radius.md, flex: 1 },
  categoryRow: {
    borderRadius: radius.md, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  catChipText: { fontSize: 12, fontWeight: "600", color: colors.muted },
  colorRow: {
    borderRadius: radius.md, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  colorDot: {
    width: 30,
    height: 30,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: "transparent",
  },
  colorDotActive: { borderColor: colors.dark, transform: [{ scale: 1.1 }] },
  checkRow: {
    borderRadius: radius.md, flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 12 },
  checkbox: {
    borderRadius: radius.sm, flexDirection: "row", alignItems: "center", gap: 6 },
  checkLabel: { fontSize: 13, fontWeight: "600", color: colors.dark },
  imageGrid: {
    borderRadius: radius.md, flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8 },
  imageWrap: {
    borderRadius: radius.sm, position: "relative" },
  imageThumb: { width: 80, height: 80, borderRadius: radius.sm },
  imageRemove: { position: "absolute", top: -6, right: -6, backgroundColor: "#fff", borderRadius: radius.md },
  imageAdd: {
    width: 80,
    height: 80,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  videoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8 },
  videoWrap: {
    position: "relative",
    width: 140,
    height: 140,
    borderRadius: radius.sm,
    overflow: "hidden",
    backgroundColor: colors.dark,
  },
  videoThumb: { width: "100%", height: "100%" },
  videoRemove: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "#fff",
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
  videoBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  videoAdd: {
    width: 140,
    height: 140,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  videoAddText: { fontSize: 13, fontWeight: "700" },
  stepActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 18,
  },
  stepSpacer: { flex: 1 },
  stepButton: {
    minWidth: 110,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    alignItems: "center",
  },
  stepButtonSecondary: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  stepButtonText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  stepButtonSecondaryText: { color: colors.dark, fontWeight: "800", fontSize: 15 },
  submitButton: { marginTop: 20, paddingVertical: 14, borderRadius: radius.md, alignItems: "center" },
  submitButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  detailImage: { width: "100%", height: 200, borderRadius: radius.md, marginBottom: 12 },
  detailPrice: { fontSize: 20, fontWeight: "800", color: colors.accent, marginBottom: 4 },
  detailStatus: { fontSize: 14, color: colors.muted, marginBottom: 8 },
  detailDesc: { fontSize: 14, color: colors.dark, lineHeight: 20 },
  detailMeta: { fontSize: 13, color: colors.muted, marginTop: 8 },
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 30,
  },
  sheetItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 },
  sheetText: { fontSize: 15, fontWeight: "600", color: colors.dark },
  sheetItemDanger: { borderTopWidth: 1, borderTopColor: "#F1F5F9" },
  innerModal: {
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    padding: 20,
    margin: 24,
  },
  menuButton: {
    position: "absolute",
    right: 16,
    zIndex: 5,
    width: 38,
    height: 38,
    borderRadius: radius.full,
    backgroundColor: "rgba(0,0,0,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  drawerOverlay: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  drawer: {
    borderRadius: radius.lg,
    width: "78%",
    maxWidth: 320,
    backgroundColor: "#fff",
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
    borderBottomColor: "#F1F5F9",
  },
  drawerTitle: { fontSize: 18, fontWeight: "800", color: colors.dark },
  drawerScroll: {
    borderRadius: radius.md, flex: 1, paddingHorizontal: 8, paddingTop: 8 },
  menuSection: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    color: colors.muted,
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
  menuItemText: { fontSize: 15, fontWeight: "600", color: colors.dark },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: radius.lg,
    paddingVertical: 10,
    paddingHorizontal: 22,
  },
  statItemSeller: {
    borderRadius: radius.sm, alignItems: "center", paddingHorizontal: 14 },
  statValueSeller: { fontSize: 18, fontWeight: "900", color: colors.dark },
  statLabelSeller: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
    marginTop: 2,
  },
  statDivider: { width: 1, height: 30, backgroundColor: "#E2E8F0" },
  orderSkeleton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  orderSkeletonIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: "#E2E8F0",
  },
  orderSkeletonLine: {
    height: 12,
    borderRadius: radius.xxs,
    backgroundColor: "#E2E8F0",
    width: "80%",
  },
  specList: {
    borderRadius: radius.md, gap: 12, marginTop: 4 },
  specRow: {
    borderRadius: radius.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  specKey: {
    borderRadius: radius.sm, flex: 1 },
  specValue: {
    borderRadius: radius.sm, flex: 1 },
  specRemove: {
    borderRadius: radius.sm, padding: 2 },
  addSpecButton: {
    borderRadius: radius.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    alignSelf: "flex-start",
  },
  addSpecText: { fontSize: 14, fontWeight: "700" },
});

export default SellerAdminScreen;