import { supabase } from "../lib/supabase";

export const SITE_URL = "https://www.tagitshop.online";
const PAGE_SIZE = 1000;
const PRODUCT_FIELDS =
  "id,slug,title,description,price,sku,vendor,category,category_id,quantity,track_inventory,allow_backorder,thumbnail,thumbnails,seller_id!inner(id,name,slug,avatar,cover_image,store_description,description,location,is_active)";
const STORE_FIELDS =
  "id,name,slug,avatar,cover_image,description,store_description,location,is_active";
const CATEGORY_FIELDS = "id,name,slug,image_url,parent_id";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value) => UUID_PATTERN.test(String(value || ""));

export function slugOrId(entity) {
  return String(entity?.slug || entity?.id || "");
}

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function productPath(product) {
  const slug = slugify(product?.slug || product?.title) || "product";
  const productId = String(product?.id || "");
  return `/products/${encodeURIComponent(
    productId ? `${slug}-${productId}` : slugOrId(product),
  )}`;
}

export function storePath(store) {
  return `/stores/${encodeURIComponent(slugOrId(store))}`;
}

export function categoryPath(category) {
  return `/categories/${encodeURIComponent(slugOrId(category))}`;
}

export function plainText(value, maxLength = 300) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_>#~-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export async function getPublicProducts(limit = 24, filters = {}) {
  let query = supabase
    .from("express_products")
    .select(PRODUCT_FIELDS)
    .eq("status", "active")
    .eq("seller_id.is_active", true)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(Number(limit) || 24, 5000)));

  if (filters.sellerId) query = query.eq("seller_id", filters.sellerId);
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getPublicProduct(productIdOrSlug) {
  const value = String(productIdOrSlug || "");
  if (!value || value.includes(",")) return null;

  let query = supabase
    .from("express_products")
    .select(PRODUCT_FIELDS)
    .eq("status", "active")
    .eq("seller_id.is_active", true);
  const uuidSuffix = value.match(
    /-([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i,
  );
  const productId = isUuid(value) ? value : uuidSuffix?.[1];
  query = productId ? query.eq("id", productId) : query.eq("slug", value);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

export async function getPublicStores(limit = 100) {
  const { data, error } = await supabase
    .from("express_sellers")
    .select(STORE_FIELDS)
    .eq("is_active", true)
    .order("name", { ascending: true })
    .limit(Math.max(1, Math.min(Number(limit) || 100, 5000)));

  if (error) throw error;
  return data || [];
}

export async function getPublicStore(sellerIdOrSlug) {
  const value = String(sellerIdOrSlug || "");
  if (!value || value.includes(",")) return null;

  let query = supabase
    .from("express_sellers")
    .select(STORE_FIELDS)
    .eq("is_active", true);
  query = isUuid(value) ? query.eq("id", value) : query.eq("slug", value);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    ...data,
    products: await getPublicProducts(24, { sellerId: data.id }),
  };
}

export async function getPublicCategories(limit = 500) {
  const { data, error } = await supabase
    .from("express_categories")
    .select(CATEGORY_FIELDS)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .limit(Math.max(1, Math.min(Number(limit) || 500, 5000)));

  if (error) throw error;
  return data || [];
}

export async function getPublicCategory(categoryIdOrSlug) {
  const value = String(categoryIdOrSlug || "");
  if (!value || value.includes(",")) return null;

  let query = supabase
    .from("express_categories")
    .select(CATEGORY_FIELDS)
    .eq("is_active", true);
  query = isUuid(value) ? query.eq("id", value) : query.eq("slug", value);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    ...data,
    products: await getPublicProducts(24, { categoryId: data.id }),
  };
}

async function getAllPublicRows(table, select, filters = []) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = supabase
      .from(table)
      .select(select)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    for (const [column, value] of filters) query = query.eq(column, value);

    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

export async function getPublicSitemapEntries() {
  const [products, stores, categories] = await Promise.all([
    (async () => {
      const rows = [];
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data, error } = await supabase
          .from("express_products")
          .select(
            "id,slug,title,updated_at,category_id,seller_id!inner(id,is_active)",
          )
          .eq("status", "active")
          .eq("seller_id.is_active", true)
          .order("id", { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < PAGE_SIZE) return rows;
      }
    })(),
    getAllPublicRows("express_sellers", "id,slug,updated_at", [
      ["is_active", true],
    ]),
    getAllPublicRows("express_categories", "id,slug", [["is_active", true]]),
  ]);

  const publicSellerIds = new Set(
    products.map((product) => product.seller_id?.id).filter(Boolean),
  );
  const publicCategoryIds = new Set(
    products.map((product) => product.category_id).filter(Boolean),
  );

  return {
    products,
    stores: stores.filter((store) => publicSellerIds.has(store.id)),
    categories: categories.filter((category) =>
      publicCategoryIds.has(category.id),
    ),
  };
}

export function publicImageUrl(value, folder = "express-products") {
  const image = String(value || "").trim();
  if (!image) return "";
  if (image.startsWith("//")) return `https:${image}`;
  if (/^https?:\/\//i.test(image)) return image;
  if (/^[a-z][a-z\d+.-]*:/i.test(image)) return "";
  if (image.startsWith("/")) return `${SITE_URL}${image}`;
  const publicCdn = "https://cdn.expressmart.com";
  const path = image.replace(/^\/+/, "");
  return `${publicCdn}/${path.startsWith(`${folder}/`) ? path : `${folder}/${path}`}`;
}

export function createPageMetadata({
  title,
  description,
  path,
  image,
  type = "website",
  indexable = true,
}) {
  const canonical = `${SITE_URL}${path}`;
  const cleanDescription = plainText(description);
  const metadata = {
    title,
    description: cleanDescription,
    alternates: { canonical },
    robots: indexable
      ? {
          index: true,
          follow: true,
          googleBot: { index: true, follow: true, "max-image-preview": "large" },
        }
      : { index: false, follow: true },
    icons: {
      icon: "/favicon.ico",
      apple: "/favicon.ico",
    },
    openGraph: {
      title,
      description: cleanDescription,
      url: canonical,
      siteName: "Tagit",
      locale: "en_GH",
      type,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description: cleanDescription,
    },
  };

  if (image) {
    metadata.openGraph.images = [{ url: image, alt: title }];
    metadata.twitter.images = [{ url: image, alt: title }];
  }

  return metadata;
}

export function getOrganizationStructuredData() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Tagit",
    url: `${SITE_URL}/`,
    logo: `${SITE_URL}/favicon.ico`,
  };
}

export function getWebsiteStructuredData() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Tagit",
    url: `${SITE_URL}/`,
    inLanguage: "en-GH",
  };
}

export function getBreadcrumbStructuredData(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
}

export function getProductStructuredData(product) {
  const image = publicImageUrl(
    product.thumbnail || product.thumbnails?.[0],
  );
  const quantity =
    product.quantity == null ? null : Number(product.quantity);
  const availability =
    product.track_inventory === true &&
    quantity !== null &&
    Number.isFinite(quantity)
      ? quantity > 0
        ? "https://schema.org/InStock"
        : product.allow_backorder
          ? "https://schema.org/BackOrder"
          : "https://schema.org/OutOfStock"
      : undefined;
  const url = `${SITE_URL}${productPath(product)}`;
  const price = product.price == null ? NaN : Number(product.price);
  const seller = product.seller_id?.name
    ? {
        "@type": "Organization",
        name: product.seller_id.name,
        url: `${SITE_URL}${storePath(product.seller_id)}`,
      }
    : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    ...(plainText(product.description)
      ? { description: plainText(product.description) }
      : {}),
    ...(image ? { image: [image] } : {}),
    ...(product.sku ? { sku: product.sku } : {}),
    ...(product.id ? { productID: product.id } : {}),
    ...(product.vendor ? { brand: { "@type": "Brand", name: product.vendor } } : {}),
    url,
    ...(Number.isFinite(price)
      ? {
          offers: {
            "@type": "Offer",
            url,
            price: price.toFixed(2),
            priceCurrency: "GHS",
            ...(availability ? { availability } : {}),
            ...(seller ? { seller } : {}),
          },
        }
      : {}),
  };
}

export function getStoreStructuredData(store) {
  const image = publicImageUrl(
    store.cover_image || store.avatar,
    "profile",
  );
  return {
    "@context": "https://schema.org",
    "@type": "Store",
    name: store.name,
    ...(plainText(store.store_description || store.description)
      ? { description: plainText(store.store_description || store.description) }
      : {}),
    ...(image ? { image } : {}),
    url: `${SITE_URL}${storePath(store)}`,
  };
}

export function getCategoryStructuredData(category) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: category.name,
    ...(category.image_url
      ? { image: publicImageUrl(category.image_url) }
      : {}),
    url: `${SITE_URL}${categoryPath(category)}`,
  };
}

export function getItemListStructuredData(items, getName, getPath) {
  const safeItems = Array.isArray(items) ? items : [];
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: safeItems.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: getName(item),
      url: `${SITE_URL}${getPath(item)}`,
    })),
  };
}
