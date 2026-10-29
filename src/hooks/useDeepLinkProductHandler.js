import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import * as Linking from "expo-linking";
import { supabase } from "../lib/supabase";

/**
 * Parses a deep-link URL and returns { productId, sku, action } or null.
 *
 * Supported formats:
 *   tagit://product/[sku]                      (custom scheme)
 *   expressmart://product/[id]                 (legacy custom scheme)
 *   https://expressmart.me/product/[id]        (universal link — product id)
 *   https://expressmart.me/p/[sku]             (universal link — SKU)
 *   /product/[id]?action=add_to_cart           (web path)
 *   /p/[sku]?action=add_to_cart                (web path — SKU)
 */
export const parseProductLink = (url) => {
  if (!url) return null;

  let path = "";
  let queryParams = new URLSearchParams();

  try {
    const raw = String(url);

    // Custom schemes (tagit://product/x, expressmart://product/x) can't be
    // parsed as regular URLs on all platforms, so handle them by hand.
    const schemeMatch = raw.match(/^(tagit|expressmart):\/\/([^?#]*)(\?[^#]*)?/i);
    if (schemeMatch) {
      path = schemeMatch[2] || "";
      queryParams = new URLSearchParams(schemeMatch[3] || "");
    } else {
      const parsed = Linking.parse(raw);
      path = `${parsed.hostname ? parsed.hostname + "/" : ""}${parsed.path || ""}`.replace(/\/+$/, "");
      queryParams = new URLSearchParams(
        Object.entries(parsed.queryParams || {})
          .filter(([, v]) => v != null)
          .map(([k, v]) => [k, Array.isArray(v) ? String(v[0]) : String(v)]),
      );
    }
  } catch {
    return null;
  }

  const normalizedPath = String(path || "").toLowerCase();

  // SKU-based links: /p/[sku] or product/p/[sku]
  const skuMatch =
    normalizedPath.match(/(?:^|\/)p\/([^/?#]+)/i) ||
    normalizedPath.match(/product\/p\/([^/?#]+)/i);
  if (skuMatch) {
    return {
      sku: decodeURIComponent(skuMatch[1]),
      productId: null,
      action: queryParams.get("action") || null,
    };
  }

  // Product-id links: /product/[uuid]
  const idMatch = normalizedPath.match(/product\/([^/?#]+)/i);
  if (idMatch && !normalizedPath.includes("products")) {
    return {
      sku: null,
      productId: decodeURIComponent(idMatch[1]),
      action: queryParams.get("action") || null,
    };
  }

  return null;
};

/**
 * Resolves a product by SKU from Supabase. Returns the mapped product object
 * in the same shape ProductDetailScreen expects, or null when not found.
 */
export const fetchProductBySku = async (sku) => {
  if (!supabase || !sku) return null;
  try {
    const { data, error } = await supabase
      .from("express_products")
      .select("*, seller_id(id,name,avatar,rating,total_ratings,badges)")
      .eq("sku", sku)
      .not("status", "in", "(draft,rejected,archived)")
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return {
      ...data,
      seller: data.seller_id,
      quantity: data.quantity ?? data.stock ?? data.stock_quantity ?? 0,
      stock: data.stock ?? data.quantity ?? data.stock_quantity ?? 0,
    };
  } catch (err) {
    console.warn("fetchProductBySku failed:", err);
    return null;
  }
};

/**
 * Determines whether a product can be auto-added to cart.
 * Mirrors ProductDetailScreen's stock logic so both paths agree.
 */
export const isProductOutOfStock = (product) => {
  if (!product) return true;
  const toBoolean = (value) =>
    value === true ||
    value === 1 ||
    ["true", "1", "yes"].includes(String(value).trim().toLowerCase());
  const isPreorder = toBoolean(product.is_preorder);
  const allowsBackorder = toBoolean(product.allow_backorder);
  const hasInventoryValue =
    product.quantity != null ||
    product.stock != null ||
    product.stock_quantity != null;
  const availableStock = Number(
    product.quantity ?? product.stock ?? product.stock_quantity ?? 0,
  );
  return (
    !isPreorder && hasInventoryValue && availableStock <= 0 && !allowsBackorder
  );
};

/**
 * useDeepLinkProductHandler
 *
 * Handles `?action=add_to_cart` deep links for the PDP:
 *  - Resolves a SKU param to a full product record (when needed).
 *  - Auto-adds the item to cart once details resolve, respecting stock checks.
 *  - Navigates to Cart on success.
 *  - Guards against double-adds across effect re-runs and warm-start
 *    re-foregrounds of the same link.
 *
 * @param {object} options
 * @param {object|null} options.product       - Loaded product (may be null while loading).
 * @param {string|null} options.skuParam      - SKU from route params (SKU deep link).
 * @param {string|null} options.actionParam   - Query action, e.g. "add_to_cart".
 * @param {boolean}     options.loading       - Whether the screen is still resolving the product.
 * @param {function}    options.addToCart     - From useCart().
 * @param {object}      options.navigation    - React Navigation navigation prop.
 * @param {object}      options.toast         - From useToast().
 * @returns {{ resolvedProduct: object|null, resolvingSku: boolean }}
 */
export const useDeepLinkProductHandler = ({
  product,
  skuParam,
  actionParam,
  loading = false,
  addToCart,
  navigation,
  toast,
}) => {
  // Dedup guard: only ever process one add-to-cart per mounted handler /
  // incoming link. Covers effect re-runs and background→foreground replays.
  const handledRef = useRef(false);
  const [resolvingSku, setResolvingSku] = useState(false);
  const [resolvedProduct, setResolvedProduct] = useState(null);
  const lastUrlRef = useRef(null);

  // Warm-start support: when the app is already open and receives a link via
  // Linking.addEventListener, re-arm the guard only when it is genuinely a new
  // URL (not the same one replayed by the OS).
  useEffect(() => {
    if (Platform.OS === "web") return undefined;
    const subscription = Linking.addEventListener("url", ({ url }) => {
      if (!url) return;
      const parsed = parseProductLink(url);
      if (!parsed?.action) return;
      const key = `${parsed.productId || parsed.sku}:${parsed.action}`;
      if (lastUrlRef.current === key && handledRef.current) return;
      lastUrlRef.current = key;
      handledRef.current = false; // allow this new link to be handled below
    });
    return () => subscription?.remove?.();
  }, []);

  useEffect(() => {
    if (handledRef.current) return;
    if (!actionParam || actionParam !== "add_to_cart") return;
    if (loading) return;
    if (!product && !skuParam) return;

    handledRef.current = true;

    let cancelled = false;

    const run = async () => {
      try {
        // Resolve by SKU when we don't have a loaded product yet.
        let target = product;
        if (!target && skuParam) {
          setResolvingSku(true);
          target = await fetchProductBySku(skuParam);
          if (cancelled) return;
          setResolvingSku(false);
          if (!target) {
            toast?.error?.(
              "Product not found",
              "This item is no longer available.",
            );
            return;
          }
          setResolvedProduct(target);
        }
        if (!target) return;

        // Stock check before mutating the cart.
        if (isProductOutOfStock(target)) {
          toast?.warning?.(
            "Out of stock",
            "This product is currently unavailable.",
          );
          return;
        }

        await addToCart(target, 1, target.sizes?.[0] || null, target.colors?.[0] || null, null);
        toast?.success?.("Added to Cart", `${target.title} has been added to your cart`);
        navigation?.navigate?.("Cart");
      } catch (err) {
        console.warn("useDeepLinkProductHandler error:", err);
        if (!cancelled) {
          toast?.error?.("Something went wrong", "Could not complete the add to cart.");
        }
      } finally {
        if (!cancelled) setResolvingSku(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [product, skuParam, actionParam, loading, addToCart, navigation, toast]);

  return { resolvedProduct, resolvingSku };
};

export default useDeepLinkProductHandler;
