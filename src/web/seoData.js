import { supabase } from "../lib/supabase";

const PRODUCT_FIELDS =
  "id,title,description,price,thumbnail,thumbnails,seller_id(id,name)";
const STORE_FIELDS =
  "id,name,avatar,cover_image,store_description,rating,total_ratings";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return UUID_PATTERN.test(String(value || ""));
}

export async function getPublicProducts(limit = 24, sellerId) {
  let query = supabase
    .from("express_products")
    .select(PRODUCT_FIELDS)
    .eq("status", "active")
    .not("seller_id", "is", null)
    .eq("seller_id.is_active", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (sellerId) query = query.eq("seller_id", sellerId);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getPublicProduct(productId) {
  if (!isUuid(productId)) return null;

  const { data, error } = await supabase
    .from("express_products")
    .select(PRODUCT_FIELDS)
    .eq("status", "active")
    .not("seller_id", "is", null)
    .eq("seller_id.is_active", true)
    .eq("id", productId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getPublicStores(limit = 100) {
  const { data, error } = await supabase
    .from("express_sellers")
    .select(STORE_FIELDS)
    .eq("is_active", true)
    .order("rating", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function getPublicStore(sellerId) {
  if (!isUuid(sellerId)) return null;

  const { data, error } = await supabase
    .from("express_sellers")
    .select(STORE_FIELDS)
    .eq("is_active", true)
    .eq("id", sellerId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    ...data,
    products: await getPublicProducts(24, sellerId),
  };
}

export function publicImageUrl(value, folder = "express-products") {
  const image = String(value || "").trim();
  if (!image) return "";
  if (/^https?:\/\//i.test(image)) return image;
  return `https://cdn.expressmart.com/${folder}/${image.replace(/^\/+/, "")}`;
}

export function createPageMetadata({ title, description, path, image }) {
  const canonical = `https://tagitshop.online${path}`;
  const metadata = {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "ExpressMart",
      type: "website",
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
    },
  };

  if (image) {
    metadata.openGraph.images = [image];
    metadata.twitter.images = [image];
  }

  return metadata;
}
