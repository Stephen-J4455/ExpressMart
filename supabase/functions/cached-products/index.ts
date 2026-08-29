// cached-products
// ----------------------------------------------------------------------------
// Active-product feed for ExpressMart, with optional per-user personalization
// on page 0 of the "For You" feed.
//
// Behavior:
//   1. Anonymous / no userId → identical to the previous recency-sorted feed.
//   2. Signed-in user, page 0:
//        - First check the per-user "For You" Redis cache.
//        - On miss, load the global Upstash product set, fetch the last 500
//          rows from express_user_events, build a decayed interest vector
//          (category / tag / seller / like), re-order, and store the result
//          in the per-user cache for 5 minutes.
//        - Followed-seller products are interleaved every Nth slot so the
//          user's own network is never crowded out.
//   3. Signed-in user, page >= 1 → identical to the previous recency-sorted
//      feed. (Personalization only runs on page 0; deeper pages are a plain
//      pagination of the same global set.)
//
// The personalization layer is invisible when there's no signal: a brand-new
// user with zero events gets the recency-sorted feed unchanged.
// ----------------------------------------------------------------------------

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

// ── Personalization knobs ──────────────────────────────────────────────────
// Bumping `v1` in the cache key prefix below invalidates every user's
// personalized cache in one go — useful when tuning the scorer.
const PERSONALIZATION_TTL_SECONDS = 300;
const SIGNAL_HALF_LIFE_DAYS = 14;       // event weight halves every 14d
const RECENT_BOOST_WINDOW_MINUTES = 5;  // tag_click boost window
const FOLLOWED_SELLER_INTERLEAVE = 6;   // every Nth slot is a followed seller
const MS_PER_DAY = 1000 * 60 * 60 * 24;

const SCORE_CATEGORY = 1.0;
const SCORE_TAG = 0.8;
const SCORE_SELLER = 0.5;
const SCORE_FRESHNESS = 0.3;
const SCORE_POPULARITY = 0.2;
const SCORE_RECENT_BOOST = 1.0;
const SCORE_LIKE_BOOST = 0.4; // per "like" the user gave this product

type UserSignal = {
  event_type: string;
  product_id: string | null;
  category_id: string | null;
  category: string | null;
  seller_id: string | null;
  tag: string | null;
  weight: number;
  created_at: string;
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

    // Personalization inputs. userId is taken from the body's userId field
    // when present, but the more secure path is the JWT — we accept either.
    // `page` is the 0-based page index; personalization only runs on page 0
    // so the Upstash-cached product set stays hot for deeper pages.
    const bodyUserId = String(body?.userId ?? "").trim();
    const page = Math.max(
      0,
      Math.trunc(Number(body?.page ?? offset / Math.max(1, limit)) || 0),
    );
    const personalizationEnabled = toBoolean(body?.personalize ?? true);

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
        .eq("status", "active")
        .not("seller_id", "is", null)
        .eq("seller_id.is_active", true);

      if (sellerId) {
        productsQuery = productsQuery.eq("seller_id", sellerId);
      }

      if (!includeOutOfStock) {
        productsQuery = productsQuery.or(
          "quantity.gt.0,is_preorder.eq.true",
        );
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
    const cacheKey = `expressmart:products:active:v4:${sellerCacheSegment}:${stockCacheSegment}:${offset}:${limit}`;

    // Per-user "For You" cache key.
    const forYouCacheKey = (uid: string) =>
      `expressmart:feed:foryou:v1:${uid}:p0`;

    // Load the user's interest vector from `express_user_events`. The query
    // is bounded by the (user_id, created_at DESC) index and capped at 500
    // rows so it stays fast even for power users.
    const loadUserSignals = async (uid: string): Promise<UserSignal[] | null> => {
      try {
        const { data, error } = await supabase
          .from("express_user_events")
          .select(
            "event_type, product_id, category_id, category, seller_id, tag, weight, created_at",
          )
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(500);
        if (error) {
          console.warn(
            "[cached-products] user signal query failed:",
            error.message,
          );
          return null;
        }
        return (data || []) as UserSignal[];
      } catch (e) {
        console.warn("[cached-products] user signal query threw:", e);
        return null;
      }
    };

    // Load the user's followed sellers so we can interleave them into the
    // personalized feed. The "Following" tab already filters to this set
    // explicitly; here we just sprinkle a couple in so the relationship is
    // visible on the home tab too.
    const loadFollowedSellers = async (uid: string): Promise<string[]> => {
      try {
        const { data, error } = await supabase
          .from("express_follows")
          .select("seller_id")
          .eq("user_id", uid);
        if (error) return [];
        return (data || []).map((r) => r.seller_id).filter(Boolean);
      } catch {
        return [];
      }
    };

    // Re-rank the products list using the user's interest vector.
    // `signals` is the rows from express_user_events; `followedSellers` is
    // the set of seller ids the user follows; `now` is the current time in
    // ms, injected so tests can pass a fixed clock.
    const rerank = (
      products: any[],
      signals: UserSignal[],
      followedSellers: string[],
      now: number,
    ): any[] => {
      if (!products?.length) return products;
      if (!signals?.length) return products;

      const followedSet = new Set(followedSellers);

      // Per-dimension decayed weight maps.
      const catScore = new Map<string, number>();
      const tagScore = new Map<string, number>();
      const sellerScore = new Map<string, number>();
      const likedProductScore = new Map<string, number>();
      const recentBoosts = new Set<string>();

      for (const s of signals) {
        const ageDays = Math.max(
          0,
          (now - new Date(s.created_at).getTime()) / MS_PER_DAY,
        );
        const decay = Math.pow(0.5, ageDays / SIGNAL_HALF_LIFE_DAYS);
        const w = Number(s.weight || 0) * decay;
        if (w === 0) continue;

        if (s.category_id) {
          catScore.set(s.category_id, (catScore.get(s.category_id) || 0) + w);
        } else if (s.category) {
          const key = `name:${s.category.toLowerCase()}`;
          catScore.set(key, (catScore.get(key) || 0) + w);
        }
        if (s.tag) {
          const key = s.tag.toLowerCase();
          tagScore.set(key, (tagScore.get(key) || 0) + w);
        }
        if (s.seller_id) {
          sellerScore.set(s.seller_id, (sellerScore.get(s.seller_id) || 0) + w);
        }
        if (s.event_type === "like" && s.product_id) {
          likedProductScore.set(
            s.product_id,
            (likedProductScore.get(s.product_id) || 0) + w,
          );
        }
        if (
          s.event_type === "tag_click" &&
          ageDays * 24 * 60 < RECENT_BOOST_WINDOW_MINUTES &&
          s.product_id
        ) {
          recentBoosts.add(s.product_id);
        }
      }

      // Top category name fallback for matching against the product's
      // `category` text column when the row has no category_id.
      let topCategoryNameKey: string | null = null;
      let bestScore = 0;
      for (const [key, score] of catScore.entries()) {
        if (key.startsWith("name:") && score > bestScore) {
          bestScore = score;
          topCategoryNameKey = key.slice("name:".length);
        }
      }

      const scored = products.map((p) => {
        const cat = p.category_id;
        let catMatch = 0;
        if (cat && catScore.has(cat)) {
          catMatch = catScore.get(cat)!;
        } else if (
          topCategoryNameKey &&
          typeof p.category === "string" &&
          p.category.toLowerCase() === topCategoryNameKey
        ) {
          catMatch = catScore.get(`name:${topCategoryNameKey}`) || 0;
        }

        let tagMatch = 0;
        if (Array.isArray(p.tags)) {
          for (const t of p.tags) {
            if (!t) continue;
            const v = tagScore.get(String(t).toLowerCase());
            if (v) tagMatch += v;
          }
        }

        const seller = p.seller_id?.id ?? p.seller_id;
        const sellerMatch = seller ? (sellerScore.get(seller) || 0) : 0;

        const ageDays = p.created_at
          ? Math.max(0, (now - new Date(p.created_at).getTime()) / MS_PER_DAY)
          : 30;
        const freshness = Math.max(0, 1 - ageDays / 30);

        const likes = Number(p.likes_count || 0);
        const rating = Number(p.rating || 0);
        const popularity = Math.min(1, likes / 100) * 0.5 + (rating / 5) * 0.5;

        const likeBoost = p.id
          ? (likedProductScore.get(p.id) || 0) * SCORE_LIKE_BOOST
          : 0;
        const recentBoost =
          p.id && recentBoosts.has(p.id) ? SCORE_RECENT_BOOST : 0;

        const score =
          SCORE_CATEGORY * catMatch +
          SCORE_TAG * tagMatch +
          SCORE_SELLER * sellerMatch +
          SCORE_FRESHNESS * freshness +
          SCORE_POPULARITY * popularity +
          likeBoost +
          recentBoost;

        return {
          product: p,
          score,
          isFollowedSeller: seller ? followedSet.has(seller) : false,
        };
      });

      // Sort by score desc, then recency desc as a stable tiebreaker.
      scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const at = a.product.created_at
          ? new Date(a.product.created_at).getTime()
          : 0;
        const bt = b.product.created_at
          ? new Date(b.product.created_at).getTime()
          : 0;
        return bt - at;
      });

      // Interleave followed-seller products every FOLLOWED_SELLER_INTERLEAVE
      // slots so the user's own network is never crowded out.
      const followed = scored.filter((s) => s.isFollowedSeller);
      const others = scored.filter((s) => !s.isFollowedSeller);

      if (followed.length === 0) {
        return scored.map((s) => s.product);
      }

      const interleaved: any[] = [];
      let fIdx = 0;
      let oIdx = 0;
      let slot = 0;
      while (oIdx < others.length || fIdx < followed.length) {
        if (
          slot > 0 &&
          slot % FOLLOWED_SELLER_INTERLEAVE === 0 &&
          fIdx < followed.length &&
          oIdx < others.length
        ) {
          interleaved.push(followed[fIdx++].product);
        } else if (oIdx < others.length) {
          interleaved.push(others[oIdx++].product);
        } else if (fIdx < followed.length) {
          interleaved.push(followed[fIdx++].product);
        }
        slot++;
      }
      return interleaved;
    };

    // Resolve the effective userId for personalization. We trust the
    // body's userId only when the JWT in the Authorization header matches
    // it; otherwise we fall back to the JWT subject. This prevents the
    // client from asking for someone else's personalized feed.
    const resolveUserId = async (): Promise<string | null> => {
      const authHeader = req.headers.get("Authorization") ?? "";
      const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
      if (!jwt) {
        // No JWT — only trust the body's userId when personalization is
        // explicitly disabled by the client. Otherwise refuse to score.
        return personalizationEnabled ? null : bodyUserId || null;
      }
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser(jwt);
        if (error || !user) return null;
        // If the client passed a userId, it must match the JWT. If it
        // didn't, use the JWT subject.
        if (bodyUserId && bodyUserId !== user.id) return null;
        return user.id;
      } catch {
        return null;
      }
    };

    // Run the personalized re-rank on a product list. Returns the same
    // list (re-ordered) or the input unchanged if anything goes wrong.
    const applyPersonalization = async (
      products: any[],
      uid: string,
    ): Promise<any[]> => {
      if (!personalizationEnabled) return products;
      if (page !== 0) return products;
      if (sellerId) return products;
      if (!products?.length) return products;
      try {
        const [signals, followedSellers] = await Promise.all([
          loadUserSignals(uid),
          loadFollowedSellers(uid),
        ]);
        if (!signals || signals.length === 0) {
          return products;
        }
        return rerank(products, signals, followedSellers, Date.now());
      } catch (e) {
        console.warn(
          "[cached-products] personalization failed (non-fatal):",
          e,
        );
        return products;
      }
    };

    const effectiveUserId = await resolveUserId();
    const canPersonalize = !!effectiveUserId && page === 0 && !sellerId &&
      personalizationEnabled;

    // ── Fresh engagement counts ──────────────────────────────────────────
    // The Redis snapshot only holds product rows, which is why feed cards
    // showed "Q&A"/0 until opened. Counts are ALWAYS recomputed live here —
    // even on cache hits — so cards start with accurate numbers, while the
    // app's realtime subscriptions keep them current afterwards.
    const attachEngagementCounts = async (products: any[]) => {
      if (!products || products.length === 0) return products || [];

      const productIds = products
        .map((p) => p?.id)
        .filter((id) => typeof id === "string" && id.length > 0);

      if (productIds.length === 0) {
        return products.map((p) => ({
          ...p,
          comments_count: 0,
          likes_count: 0,
        }));
      }

      const [reviewsRes, wishesRes] = await Promise.all([
        supabase
          .from("express_reviews")
          .select("product_id")
          .in("product_id", productIds),
        supabase
          .from("express_wishlists")
          .select("product_id")
          .in("product_id", productIds),
      ]);

      if (reviewsRes.error) console.warn("attachEngagementCounts reviews:", reviewsRes.error);
      if (wishesRes.error) console.warn("attachEngagementCounts wishes:", wishesRes.error);

      const countByProduct = (rows: any[] | null | undefined) => {
        const map = new Map<string, number>();
        (rows || []).forEach((row) => {
          if (!row?.product_id) return;
          map.set(row.product_id, (map.get(row.product_id) || 0) + 1);
        });
        return map;
      };

      const reviewMap = countByProduct(reviewsRes.data);
      const wishMap = countByProduct(wishesRes.data);

      return products.map((p) => ({
        ...p,
        comments_count: reviewMap.get(p.id) || 0,
        likes_count: wishMap.get(p.id) || 0,
      }));
    };

    // Helper to wrap a final product list with a response and the right
    // cache metadata. Used by all three return paths.
    const respondWithProducts = (
      products: any[],
      cacheSource: "redis" | "database",
      personalized: boolean,
    ) =>
      new Response(
        JSON.stringify({
          products,
          cache: {
            enabled: redisEnabled,
            source: cacheSource,
            personalized,
          },
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );

    // ── Path A: per-user "For You" cache hit. ────────────────────────────
    if (canPersonalize && redisEnabled && redisUrl && redisToken) {
      try {
        const fyGet = await redisRequest(redisUrl, redisToken, [
          "GET",
          forYouCacheKey(effectiveUserId as string),
        ]);
        const cached = fyGet?.result;
        if (typeof cached === "string" && cached.trim()) {
          console.info(
            `[cached-products] source=redis_foryou cache_hit=true user=${effectiveUserId} offset=${offset} limit=${limit}`,
          );
          const products = await attachEngagementCounts(JSON.parse(cached));
          return respondWithProducts(products, "redis", true);
        }
      } catch (e) {
        console.warn(
          "[cached-products] foryou cache read failed (non-fatal):",
          e,
        );
      }
    }

    // ── Path B: cache disabled or Redis not configured. ──────────────────
    if (!redisEnabled || !redisUrl || !redisToken) {
      let products = await attachEngagementCounts(await queryProducts());
      const personalized = canPersonalize &&
        await applyPersonalization(products, effectiveUserId as string);
      if (personalized && Array.isArray(personalized)) {
        products = personalized;
      }
      console.info(
        `[cached-products] source=database reason=${!redisEnabled ? "cache_disabled" : "redis_not_configured"} seller_id=${sellerId || "all"} include_out_of_stock=${includeOutOfStock} offset=${offset} limit=${limit} personalized=${canPersonalize}`,
      );
      return respondWithProducts(products, "database", canPersonalize);
    }

    // ── Path C: global Upstash cache for the product set. ────────────────
    try {
      const redisGet = await redisRequest(redisUrl, redisToken, [
        "GET",
        cacheKey,
      ]);
      const cachedValue = redisGet?.result;
      if (typeof cachedValue === "string" && cachedValue.trim()) {
        console.info(
          `[cached-products] source=redis cache_hit=true seller_id=${sellerId || "all"} include_out_of_stock=${includeOutOfStock} offset=${offset} limit=${limit}`,
        );
        let products = await attachEngagementCounts(JSON.parse(cachedValue));
        const personalized = canPersonalize &&
          await applyPersonalization(products, effectiveUserId as string);
        if (personalized && Array.isArray(personalized)) {
          products = personalized;
          // Re-rank result gets cached per-user for 5 minutes. Best-effort.
          if (canPersonalize) {
            try {
              await redisRequest(redisUrl, redisToken, [
                "SETEX",
                forYouCacheKey(effectiveUserId as string),
                String(PERSONALIZATION_TTL_SECONDS),
                JSON.stringify(products),
              ]);
            } catch (e) {
              console.warn(
                "[cached-products] foryou cache write failed (non-fatal):",
                e,
              );
            }
          }
        }
        return respondWithProducts(products, "redis", canPersonalize);
      }
    } catch (cacheReadError) {
      console.warn(
        "Redis read failed, falling back to database:",
        cacheReadError,
      );
    }

    const products = await attachEngagementCounts(await queryProducts());
    console.info(
      `[cached-products] source=database cache_hit=false seller_id=${sellerId || "all"} include_out_of_stock=${includeOutOfStock} offset=${offset} limit=${limit} personalized=${canPersonalize}`,
    );

    // Populate the global Upstash cache so the next call hits Redis.
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

    // Apply personalization on top of the freshly fetched list, and cache
    // the re-ranked result per-user.
    let finalProducts = products;
    const personalized = canPersonalize &&
      await applyPersonalization(products, effectiveUserId as string);
    if (personalized && Array.isArray(personalized)) {
      finalProducts = personalized;
      if (canPersonalize && redisUrl && redisToken) {
        try {
          await redisRequest(redisUrl, redisToken, [
            "SETEX",
            forYouCacheKey(effectiveUserId as string),
            String(PERSONALIZATION_TTL_SECONDS),
            JSON.stringify(finalProducts),
          ]);
        } catch (e) {
          console.warn(
            "[cached-products] foryou cache write failed (non-fatal):",
            e,
          );
        }
      }
    }

    return respondWithProducts(finalProducts, "database", canPersonalize);
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
