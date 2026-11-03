import { supabase } from "../src/lib/supabase";

const SITE_URL = "https://tagitshop.online";

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (character) => {
    const entities: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&apos;",
      '"': "&quot;",
    };
    return entities[character];
  });
}

export async function GET() {
  const [
    { data: products, error: productsError },
    { data: stores, error: storesError },
  ] = await Promise.all([
    supabase
      .from("express_products")
      .select("id")
      .eq("status", "active")
      .not("seller_id", "is", null)
      .eq("seller_id.is_active", true)
      .limit(5000),
    supabase
      .from("express_sellers")
      .select("id")
      .eq("is_active", true)
      .limit(5000),
  ]);

  if (productsError) throw productsError;
  if (storesError) throw storesError;

  const urls = [
    "/",
    "/products",
    "/store",
    "/stores",
    "/feed",
    "/ai",
    "/storefront",
    ...(products || []).map(
      (product) => `/product/${encodeURIComponent(product.id)}`,
    ),
    ...(stores || []).map(
      (store) => `/store/${encodeURIComponent(store.id)}`,
    ),
  ];
  const entries = urls
    .map(
      (path) =>
        `<url><loc>${escapeXml(`${SITE_URL}${path}`)}</loc></url>`,
    )
    .join("");
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
