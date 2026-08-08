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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { notifyOrderStatusUpdate } from "../services/notificationService";
import { sellerFlashSaleService } from "../services/sellerFlashSaleService";
import { colors, getTheme } from "../theme/colors";
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

// Hamburger menu — mirrors the Express-Store seller/store settings surface
// (Dashboard, Catalog, Orders, Chats, Profile/theme, Paystack, StatusCreator, etc.)
// mapped onto the screens available in the merged ExpressMart app.
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
  const [tags, setTags] = useState("");
  const [trackInventory, setTrackInventory] = useState(true);
  const [allowBackorder, setAllowBackorder] = useState(false);
  const [isPreorder, setIsPreorder] = useState(false);
  const [weightUnit, setWeightUnit] = useState("kg");
  const [slug, setSlug] = useState("");
  const [specifications, setSpecifications] = useState([]);
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

  // ── Orders UI state ─────────────────────────────────────────────────────
  const [orderFilter, setOrderFilter] = useState("processing");
  const [orderSearch, setOrderSearch] = useState("");

  // ── Tabs ────────────────────────────────────────────────────────────────
  const TABS = ["catalog", "orders", "flash", "insights"];
  const [activeTab, setActiveTab] = useState("catalog");

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
    const { data: created, error } = await supabase
      .from("express_sellers")
      .insert({
        user_id: user.id,
        name: baseName,
        email: user.email,
        phone: customerProfile?.phone || null,
      })
      .select("id, name, theme_color, avatar, badges, store_description")
      .single();
    if (error) {
      console.error("create seller error", error);
      return null;
    }
    return created;
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
        .insert({ ...data, seller_id: sellerId, status: "pending" })
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
    setTags("");
    setTrackInventory(true);
    setAllowBackorder(false);
    setIsPreorder(false);
    setWeightUnit("kg");
    setSlug("");
    setSpecifications([]);
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
    setTags(product.tags?.join(", ") || "");
    setSelectedSizes(product.sizes || []);
    setSelectedColors(product.colors || []);
    setWeightUnit(product.weight_unit || "kg");
    setSlug(product.slug || "");
    setTrackInventory(product.track_inventory ?? true);
    setAllowBackorder(product.allow_backorder ?? false);
    setIsPreorder(!!product.is_preorder);
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
        status: "pending",
      });
      setExistingImageUrls(next);
      setEditingProduct((p) =>
        p ? { ...p, thumbnail: next[0] || null, thumbnails: next } : p,
      );
      setViewingProduct((p) =>
        p && p.id === editingProduct.id
          ? { ...p, thumbnail: next[0] || null, thumbnails: next, status: "pending" }
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
        tags: tags
          ? tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : [],
        track_inventory: trackInventory,
        allow_backorder: allowBackorder,
        is_preorder: isPreorder,
        specifications: Object.keys(specsObj).length ? specsObj : null,
      };
      productData.thumbnail = merged[0] || null;
      productData.thumbnails = merged.length ? merged : null;

      if (editingProduct) {
        productData.status = "pending";
        await updateProduct(editingProduct.id, productData);
        toast.success("Updated", "Product submitted for review");
      } else {
        await createProduct(productData);
        toast.success("Created", "Product submitted for review");
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
          {TABS.map((tab) => (
            <Pressable
              key={tab}
              style={[
                styles.tab,
                activeTab === tab && { backgroundColor: accent + "14" },
              ]}
              onPress={() => setActiveTab(tab)}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === tab && { color: accent, fontWeight: "800" },
                ]}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.tabContent}>
          {activeTab === "catalog" && renderCatalog()}
          {activeTab === "orders" && renderOrders()}
          {activeTab === "flash" && renderFlash()}
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

            <Text style={styles.label}>Title *</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Product title" placeholderTextColor={colors.muted} />

            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.label}>Price (GH₵) *</Text>
                <TextInput style={styles.input} value={price} onChangeText={setPrice} keyboardType="numeric" placeholder="0.00" placeholderTextColor={colors.muted} />
              </View>
              <View style={styles.col}>
                <Text style={styles.label}>Shipping (GH₵)</Text>
                <TextInput style={styles.input} value={shippingFee} onChangeText={setShippingFee} keyboardType="numeric" placeholder="0.00" placeholderTextColor={colors.muted} />
              </View>
            </View>

            <Text style={styles.label}>Category *</Text>
            <View style={styles.categoryRow}>
              {categories.map((c) => (
                <Pressable
                  key={c.id}
                  style={[
                    styles.catChip,
                    category === c.name && { backgroundColor: accent, borderColor: accent },
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
            <TextInput style={[styles.input, styles.textArea]} value={description} onChangeText={setDescription} placeholder="Describe the product..." placeholderTextColor={colors.muted} multiline numberOfLines={4} />

            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.label}>Quantity *</Text>
                <TextInput style={styles.input} value={quantity} onChangeText={setQuantity} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.muted} />
              </View>
              <View style={styles.col}>
                <Text style={styles.label}>Discount %</Text>
                <TextInput style={styles.input} value={String(discount)} onChangeText={(t) => setDiscount(Number(t) || 0)} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.muted} />
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
                      setSpecifications(specifications.filter((_, i) => i !== index))
                    }
                  >
                    <Ionicons name="close-circle" size={22} color="#EF4444" />
                  </Pressable>
                </View>
              ))}
            </View>
            <TouchableOpacity
              style={styles.addSpecButton}
              onPress={() => setSpecifications([...specifications, { key: "", value: "" }])}
            >
              <Ionicons name="add" size={18} color={accent} />
              <Text style={[styles.addSpecText, { color: accent }]}>Add Specification</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.submitButton, { backgroundColor: accent }, submitting && { opacity: 0.6 }]}
              onPress={submitProduct}
              disabled={submitting}
            >
              <Text style={styles.submitButtonText}>
                {submitting ? "Saving..." : editingProduct ? "Save Changes" : "Create Product"}
              </Text>
            </TouchableOpacity>
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: "center", justifyContent: "center" },
  scrollContent: { flexGrow: 1, paddingBottom: 20 },
  cover: { height: 160, position: "relative", overflow: "hidden" },
  coverImage: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  coverOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  profileBlock: { alignItems: "center", marginTop: -50, paddingHorizontal: 20 },
  avatarWrap: {
    borderRadius: 64,
    borderWidth: 4,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  avatar: { width: 100, height: 100, borderRadius: 60 },
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
    borderRadius: 14,
    padding: 4,
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10 },
  tabText: { fontSize: 13, fontWeight: "700", color: colors.muted },
  tabContent: { marginTop: 16, paddingHorizontal: 16 },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: colors.dark, marginBottom: 12 },
  sectionHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  chipRow: { marginBottom: 12 },
  summaryChip: {
    backgroundColor: "#fff",
    borderRadius: 12,
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
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  flashBannerHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  flashBannerTitle: { fontWeight: "800", color: "#EF4444", fontSize: 14 },
  flashCountPill: { backgroundColor: "#EF4444", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  flashCountText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  flashCard: { width: 120, marginRight: 10, backgroundColor: "#fff", borderRadius: 12, padding: 8, borderWidth: 1, borderColor: "#F1F5F9" },
  flashThumb: { width: "100%", height: 70, borderRadius: 8 },
  flashThumbPlaceholder: { alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  flashName: { fontSize: 12, fontWeight: "700", color: colors.dark, marginTop: 6 },
  flashPrice: { fontSize: 13, fontWeight: "800", color: "#EF4444", marginTop: 2 },
  flashDiscount: { fontSize: 10, color: colors.muted, marginTop: 2 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
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
    borderRadius: 10,
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
  sortChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: "#fff", borderWidth: 1, borderColor: "#F1F5F9" },
  sortChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  sortChipText: { fontSize: 11, fontWeight: "600", color: colors.muted },
  sortChipTextActive: { color: "#fff", fontWeight: "700" },
  productGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  productCard: { width: "47%", backgroundColor: "#fff", borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: "#F1F5F9" },
  productImage: { width: "100%", height: 110 },
  productImagePlaceholder: { alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  productBody: { padding: 10 },
  productTitle: { fontSize: 13, fontWeight: "700", color: colors.dark },
  productRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  productPrice: { fontSize: 13, fontWeight: "800" },
  productStatus: { fontSize: 10, fontWeight: "700", textTransform: "capitalize", color: colors.muted },
  emptyNote: { textAlign: "center", color: colors.muted, fontSize: 14, marginTop: 20 },
  pipeline: { marginBottom: 12 },
  pipelineBar: { flexDirection: "row", height: 8, borderRadius: 6, overflow: "hidden", backgroundColor: "#F1F5F9" },
  pipelineSegment: { height: "100%" },
  pipelineLegend: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 },
  legendText: { fontSize: 11, color: colors.muted, fontWeight: "600" },
  orderCard: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  orderIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  orderNo: { fontSize: 14, fontWeight: "700", color: colors.dark },
  orderMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  orderTotal: { fontSize: 14, fontWeight: "800", color: colors.dark },
  orderStatus: { fontSize: 11, fontWeight: "700", textTransform: "capitalize", marginTop: 2 },
  progressButton: { marginTop: 10, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  progressText: { fontWeight: "700", fontSize: 13 },
  successBadge: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 10 },
  successText: { color: colors.success, fontWeight: "700", fontSize: 13 },
  insightCards: { flexDirection: "row", gap: 12 },
  insightCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  insightValue: { fontSize: 18, fontWeight: "900", color: colors.dark, marginTop: 6 },
  insightLabel: { fontSize: 11, color: colors.muted, marginTop: 4, fontWeight: "600", textAlign: "center" },
  insightSummary: { fontSize: 13, color: colors.muted, marginTop: 14, lineHeight: 19, textAlign: "center" },
  modalContainer: { flex: 1, backgroundColor: colors.background, paddingTop: 40 },
  modalScroll: { flex: 1 },
  modalContent: { padding: 16, paddingBottom: 40 },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: colors.dark },
  label: { fontSize: 13, fontWeight: "700", color: colors.dark, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#F1F5F9",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.dark,
  },
  textArea: { height: 90, textAlignVertical: "top" },
  row: { flexDirection: "row", gap: 12 },
  col: { flex: 1 },
  categoryRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  catChipText: { fontSize: 12, fontWeight: "600", color: colors.muted },
  colorRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  colorDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: "transparent",
  },
  colorDotActive: { borderColor: colors.dark, transform: [{ scale: 1.1 }] },
  checkRow: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 12 },
  checkbox: { flexDirection: "row", alignItems: "center", gap: 6 },
  checkLabel: { fontSize: 13, fontWeight: "600", color: colors.dark },
  imageGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8 },
  imageWrap: { position: "relative" },
  imageThumb: { width: 80, height: 80, borderRadius: 10 },
  imageRemove: { position: "absolute", top: -6, right: -6, backgroundColor: "#fff", borderRadius: 12 },
  imageAdd: {
    width: 80,
    height: 80,
    borderRadius: 10,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  submitButton: { marginTop: 20, paddingVertical: 14, borderRadius: 14, alignItems: "center" },
  submitButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  detailImage: { width: "100%", height: 200, borderRadius: 14, marginBottom: 12 },
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
    borderRadius: 16,
    padding: 20,
    margin: 24,
  },
  menuButton: {
    position: "absolute",
    right: 16,
    zIndex: 5,
    padding: 6,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  drawerOverlay: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  drawer: {
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  drawerTitle: { fontSize: 18, fontWeight: "800", color: colors.dark },
  drawerScroll: { flex: 1, paddingHorizontal: 8, paddingTop: 8 },
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
    borderRadius: 10,
  },
  menuItemText: { fontSize: 15, fontWeight: "600", color: colors.dark },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 22,
  },
  statItemSeller: { alignItems: "center", paddingHorizontal: 14 },
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
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  orderSkeletonIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#E2E8F0",
  },
  orderSkeletonLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: "#E2E8F0",
    width: "80%",
  },
  specList: { gap: 12, marginTop: 4 },
  specRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  specKey: { flex: 1 },
  specValue: { flex: 1 },
  specRemove: { padding: 2 },
  addSpecButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    alignSelf: "flex-start",
  },
  addSpecText: { fontSize: 14, fontWeight: "700" },
});

export default SellerAdminScreen;