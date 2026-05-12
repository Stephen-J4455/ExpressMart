import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const toBoolean = (value: unknown) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }
  return false;
};

const redisRequest = async (
  url: string,
  token: string,
  command: string[],
): Promise<any> => {
  const response = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([command]),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Redis request failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  return Array.isArray(data) ? data[0] : data;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Supabase environment not configured");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const offset = Math.max(0, Number(body?.offset ?? 0) || 0);
    const limit = Math.min(100, Math.max(1, Number(body?.limit ?? 24) || 24));
    const sellerId = String(body?.sellerId ?? "").trim();
    const includeOutOfStock = toBoolean(body?.includeOutOfStock);

    const { data: cacheSetting, error: cacheSettingError } = await supabase
      .from("express_settings")
      .select("value")
      .eq("key", "redis_products_cache_enabled")
      .maybeSingle();

    if (cacheSettingError) throw cacheSettingError;

    const redisEnabled = toBoolean(cacheSetting?.value);

    const queryProducts = async () => {
      let productsQuery = supabase
        .from("express_products")
        .select(
          "*, seller_id(id,name,avatar,rating,total_ratings,badges,store_description,social_facebook,social_instagram,social_twitter,social_whatsapp,social_website,theme_color,theme_apply_customer)",
         )
        .eq("status", "active");

      if (sellerId) {
        productsQuery = productsQuery.eq("seller_id", sellerId);
      }

      if (!includeOutOfStock) {
        productsQuery = productsQuery.or("quantity.gt.0,is_preorder.eq.true");
      }

      const { data, error } = await productsQuery
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      return data || [];
    };

    const redisUrl = Deno.env.get("UPSTASH_REDIS_REST_URL");
    const redisToken = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");
    const redisTtlSeconds = Math.max(
      30,
      Number(Deno.env.get("REDIS_PRODUCTS_CACHE_TTL_SECONDS") ?? 120) || 120,
    );
    const sellerCacheSegment = encodeURIComponent(sellerId || "all");
    const stockCacheSegment = includeOutOfStock ? "all_stock" : "in_stock_only";
    const cacheKey = `expressmart:products:active:v2:${sellerCacheSegment}:${stockCacheSegment}:${offset}:${limit}`;

    if (!redisEnabled || !redisUrl || !redisToken) {
      const products = await queryProducts();
      console.info(
        `[cached-products] source=database reason=${!redisEnabled ? "cache_disabled" : "redis_not_configured"} seller_id=${sellerId || "all"} include_out_of_stock=${includeOutOfStock} offset=${offset} limit=${limit}`,
      );
      return new Response(
        JSON.stringify({
          products,
          cache: {
            enabled: redisEnabled,
            source: "database",
          },
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    try {
      const redisGet = await redisRequest(redisUrl, redisToken, ["GET", cacheKey]);
      const cachedValue = redisGet?.result;
      if (typeof cachedValue === "string" && cachedValue.trim()) {
        console.info(
          `[cached-products] source=redis cache_hit=true seller_id=${sellerId || "all"} include_out_of_stock=${includeOutOfStock} offset=${offset} limit=${limit}`,
        );
        return new Response(
          JSON.stringify({
            products: JSON.parse(cachedValue),
            cache: {
              enabled: true,
              source: "redis",
            },
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    } catch (cacheReadError) {
      console.warn("Redis read failed, falling back to database:", cacheReadError);
    }

    const products = await queryProducts();
    console.info(
      `[cached-products] source=database cache_hit=false seller_id=${sellerId || "all"} include_out_of_stock=${includeOutOfStock} offset=${offset} limit=${limit}`,
    );

    try {
      await redisRequest(redisUrl, redisToken, [
        "SETEX",
        cacheKey,
        String(redisTtlSeconds),
        JSON.stringify(products),
      ]);
    } catch (cacheWriteError) {
      console.warn("Redis write failed:", cacheWriteError);
    }

    return new Response(
      JSON.stringify({
        products,
        cache: {
          enabled: true,
          source: "database",
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("cached-products function error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unexpected error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
