import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Sync a seller's WhatsApp Business / Meta Commerce catalog into express_products.
 *
 * Body: { sellerId: string }
 * - Reads the seller's WABA token + catalog id from seller_meta_connections
 *   (service-role only; never exposed to the anon client).
 * - Pulls catalog items from the Meta Graph API, keyed by retailer_id (= SKU).
 * - Upserts each item into express_products (matched on sku), tagging the
 *   seller_id and status "active". Only live stores' products are shown in the
 *   buyer feed (enforced by the cached-products filter on seller_id.is_active).
 * - Writes product_catalog_mappings rows so deep links + future webhooks resolve.
 *
 * Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, META_GRAPH_VERSION
 * (optional, defaults to v19.0).
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GRAPH_BASE = "https://graph.facebook.com";

const touch = async (
  supabase: any,
  sellerId: string,
  patch: Record<string, unknown>,
) => {
  await supabase
    .from("seller_meta_connections")
    .update(patch)
    .eq("seller_id", sellerId);
};

const mapCatalogItem = (item: any, sellerId: string) => {
  const retailerId = String(item.retailer_id || item.id || "").trim();
  const priceRaw = Number(item.price || item.price_info?.price || 0);
  const availability = String(item.availability || "in stock").toLowerCase();
  const imageUrl =
    Array.isArray(item.image_url) && item.image_url.length
      ? item.image_url[0]
      : typeof item.image_url === "string"
        ? item.image_url
        : null;
  const quantity = availability.includes("out of stock") ? 0 : 1;

  return {
    seller_id: sellerId,
    sku: retailerId,
    vendor: String(item.brand || "").trim() || null,
    title: String(item.name || item.title || retailerId || "Untitled").trim(),
    description: String(item.description || "").trim(),
    price: Number.isFinite(priceRaw) ? priceRaw : 0,
    thumbnail: imageUrl,
    thumbnails: imageUrl ? [imageUrl] : [],
    quantity,
    track_inventory: true,
    allow_backorder: false,
    status: "active",
    category: null,
    category_id: null,
    badges: [],
    tags: [],
    sizes: [],
    colors: [],
    variants: [],
    specifications: {},
    shipping_fee: 0,
    is_preorder: false,
  };
};

const fetchCatalogPage = async (
  catalogId: string,
  token: string,
  version: string,
  after: string | null,
): Promise<{ items: any[]; next: string | null }> => {
  const params = new URLSearchParams({
    fields:
      "id,retailer_id,name,description,price,price_info,currency,availability,brand,image_url",
    access_token: token,
    limit: "100",
  });
  if (after) params.set("after", after);
  const url = `${GRAPH_BASE}/${version}/${catalogId}/products?${params}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Meta catalog fetch failed (${res.status}): ${text}`);
  }
  const json: any = await res.json();
  const items: any[] = Array.isArray(json?.data) ? json.data : [];
  const next: string | null = json?.paging?.cursors?.after ?? null;
  return { items, next };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Supabase not configured");
    }
    const graphVersion = Deno.env.get("META_GRAPH_VERSION") || "v19.0";

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const sellerId = String(body?.sellerId ?? "").trim();
    if (!sellerId) throw new Error("sellerId is required");

    // Load the seller's Meta connection (service-role read).
    const { data: conn, error: connErr } = await supabase
      .from("seller_meta_connections")
      .select("waba_access_token, meta_catalog_id, catalog_name")
      .eq("seller_id", sellerId)
      .maybeSingle();
    if (connErr) throw connErr;
    if (!conn || !conn.waba_access_token || !conn.meta_catalog_id) {
      await touch(supabase, sellerId, {
        last_sync_status: "error",
        last_sync_error: "No Meta catalog connection configured for this store.",
        last_synced_at: new Date().toISOString(),
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: "No Meta catalog connection configured for this store.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Verify the seller exists and is active (only live stores get products).
    const { data: seller, error: sellerErr } = await supabase
      .from("express_sellers")
      .select("id, is_active")
      .eq("id", sellerId)
      .maybeSingle();
    if (sellerErr) throw sellerErr;
    if (!seller) {
      throw new Error("Seller not found");
    }

    await touch(supabase, sellerId, { last_sync_status: "syncing" });

    // Paginate the full catalog.
    let after: string | null = null;
    let total = 0;
    let created = 0;
    let updated = 0;
    const seenSkus: string[] = [];

    do {
      const { items, next } = await fetchCatalogPage(
        conn.meta_catalog_id,
        conn.waba_access_token,
        graphVersion,
        after,
      );
      for (const item of items) {
        const mapped = mapCatalogItem(item, sellerId);
        if (!mapped.sku) continue;
        seenSkus.push(mapped.sku);

        // Upsert on (seller_id, sku) — keep existing product ids stable.
        const { data: existing } = await supabase
          .from("express_products")
          .select("id")
          .eq("seller_id", sellerId)
          .eq("sku", mapped.sku)
          .maybeSingle();

        if (existing?.id) {
          const { error: updErr } = await supabase
            .from("express_products")
            .update({ ...mapped, updated_at: new Date().toISOString() })
            .eq("id", existing.id);
          if (updErr) throw updErr;
          updated += 1;
        } else {
          const { data: inserted, error: insErr } = await supabase
            .from("express_products")
            .insert({ ...mapped, created_at: new Date().toISOString() })
            .select("id")
            .single();
          if (insErr) throw insErr;
          created += 1;

          // Record the catalog mapping for deep links / webhooks.
          if (inserted?.id) {
            await supabase.from("product_catalog_mappings").upsert(
              {
                product_id: inserted.id,
                meta_retailer_id: mapped.sku,
                meta_catalog_id: conn.meta_catalog_id,
                synced_at: new Date().toISOString(),
              },
              { onConflict: "meta_retailer_id" },
            );
          }
        }
        total += 1;
      }
      after = next;
    } while (after);

    await touch(supabase, sellerId, {
      last_sync_status: "success",
      last_sync_error: null,
      last_synced_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({
        success: true,
        total,
        created,
        updated,
        catalogName: conn.catalog_name || null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("sync-whatsapp-catalog error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unexpected error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
