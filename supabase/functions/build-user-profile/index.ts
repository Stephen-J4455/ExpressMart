// build-user-profile
// ----------------------------------------------------------------------------
// Computes a per-user algorithmic profile from express_user_events and
// upserts it into express_user_algorithmic_profiles.
//
// Called by track-user-event after inserting new events (best-effort — a
// profile rebuild failure must never break event tracking).
//
// Auth: service role only. The caller passes { user_id } in the body; the
// function verifies the JWT subject matches user_id when a JWT is present.
//
// Profile dimensions:
//   • category_scores  — decayed weight per category from category_view/view events
//   • tag_scores       — decayed weight per tag from tag_click/search events
//   • seller_scores    — decayed weight per seller from view/follow/purchase events
//   • price_band       — budget/mid/premium derived from cart_add/purchase amounts
//   • avg_order_value  — mean of purchase event metadata.amount
//   • preferred_tags/categories/sellers — top-N by score
//   • version          — schema version (bump when computation changes)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PROFILE_VERSION = 2;
const MAX_EVENTS = 500;
const SIGNAL_HALF_LIFE_DAYS = 14;
const MS_PER_DAY = 1000 * 60 * 60 * 24;
const TOP_N = 12;

// Price band thresholds (in GHS, based on avg order value).
const PRICE_BANDS = {
  budget: { max: 150 },
  mid: { min: 150, max: 600 },
  premium: { min: 600 },
} as const;

type UserEvent = {
  event_type: string;
  product_id: string | null;
  category_id: string | null;
  category: string | null;
  seller_id: string | null;
  tag: string | null;
  query: string | null;
  weight: number;
  metadata: Record<string, unknown>;
  created_at: string;
};

const decay = (createdAt: string, now: number): number => {
  const ageDays = Math.max(
    0,
    (now - new Date(createdAt).getTime()) / MS_PER_DAY,
  );
  return Math.pow(0.5, ageDays / SIGNAL_HALF_LIFE_DAYS);
};

const priceBandFor = (avgOrderValue: number): string => {
  if (avgOrderValue <= PRICE_BANDS.budget.max) return "budget";
  if (
    avgOrderValue >= (PRICE_BANDS.mid.min ?? 0) &&
    avgOrderValue <= (PRICE_BANDS.mid.max ?? Infinity)
  ) {
    return "mid";
  }
  return "premium";
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Supabase environment not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // ── Auth: resolve user id from JWT when present. ─────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    let jwtUserId: string | null = null;
    if (jwt) {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(jwt);
      if (!error && user) jwtUserId = user.id;
    }

    // ── Parse body. ──────────────────────────────────────────────────
    const body = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const requestedUserId = String(body?.user_id || "").trim();

    // The JWT subject is authoritative. If the client passed a user_id it
    // must match the JWT; otherwise we use the JWT subject. No JWT → no
    // profile (anonymous users don't get algorithmic profiles).
    const userId = jwtUserId || null;
    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (requestedUserId && requestedUserId !== userId) {
      return new Response(
        JSON.stringify({ error: "user_id does not match authenticated user" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ── Load recent events. ──────────────────────────────────────────
    const now = Date.now();
    const { data: events, error: eventsError } = await supabase
      .from("express_user_events")
      .select(
        "event_type, product_id, category_id, category, seller_id, tag, weight, metadata, created_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(MAX_EVENTS);

    if (eventsError) {
      console.error("[build-user-profile] event query failed:", eventsError);
      return new Response(
        JSON.stringify({ error: eventsError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const rows = (events || []) as UserEvent[];
    if (rows.length === 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          message: "No events to build profile from",
          user_id: userId,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Compute scores. ──────────────────────────────────────────────
    const categoryScores = new Map<string, number>();
    const tagScores = new Map<string, number>();
    const sellerScores = new Map<string, number>();
    let orderValueSum = 0;
    let orderCount = 0;
    let lastEventAt = rows[0].created_at;

    for (const ev of rows) {
      const w = Number(ev.weight || 0) * decay(ev.created_at, now);
      if (w === 0) continue;

      lastEventAt =
        new Date(ev.created_at) > new Date(lastEventAt)
          ? ev.created_at
          : lastEventAt;

      // Category signal.
      if (ev.category_id) {
        categoryScores.set(
          ev.category_id,
          (categoryScores.get(ev.category_id) || 0) + w,
        );
      } else if (ev.category) {
        const key = `name:${ev.category.toLowerCase()}`;
        categoryScores.set(
          key,
          (categoryScores.get(key) || 0) + w,
        );
      }

      // Tag signal.
      if (ev.tag) {
        const key = ev.tag.toLowerCase();
        tagScores.set(key, (tagScores.get(key) || 0) + w);
      }

      // Seller signal.
      if (ev.seller_id) {
        sellerScores.set(
          ev.seller_id,
          (sellerScores.get(ev.seller_id) || 0) + w,
        );
      }

      // Purchase / cart_add → price band signal.
      if (
        (ev.event_type === "purchase" || ev.event_type === "cart_add") &&
        ev.metadata &&
        typeof ev.metadata === "object" &&
        !Array.isArray(ev.metadata)
      ) {
        const amount = Number((ev.metadata as Record<string, unknown>).amount);
        if (Number.isFinite(amount) && amount > 0) {
          orderValueSum += amount;
          orderCount += 1;
        }
      }
    }

    // Top-N by score.
    const topEntries = <T>(map: Map<string, number>, n: number): string[] =>
      [...map.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([k]) => k);

    const preferredCategories = topEntries(categoryScores, TOP_N).filter(
      (k) => !k.startsWith("name:"),
    );
    const preferredTags = topEntries(tagScores, TOP_N);
    const preferredSellers = topEntries(sellerScores, TOP_N);

    const avgOrderValue =
      orderCount > 0 ? orderValueSum / orderCount : null;
    const priceBand = avgOrderValue != null ? priceBandFor(avgOrderValue) : null;

    // ── Upsert profile. ──────────────────────────────────────────────
    const profile = {
      id: userId,
      category_scores: Object.fromEntries(categoryScores),
      tag_scores: Object.fromEntries(tagScores),
      seller_scores: Object.fromEntries(sellerScores),
      price_band: priceBand,
      avg_order_value: avgOrderValue != null ? avgOrderValue : null,
      preferred_tags: preferredTags,
      preferred_categories: preferredCategories,
      preferred_sellers: preferredSellers,
      last_event_at: lastEventAt,
      event_count: rows.length,
      version: PROFILE_VERSION,
      updated_at: new Date().toISOString(),
    };

    const { error: upsertError } = await supabase
      .from("express_user_algorithmic_profiles")
      .upsert(profile, { onConflict: "id" });

    if (upsertError) {
      console.error("[build-user-profile] upsert failed:", upsertError);
      return new Response(
        JSON.stringify({ error: upsertError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        user_id: userId,
        event_count: rows.length,
        price_band: priceBand,
        avg_order_value: avgOrderValue,
        preferred_tags: preferredTags,
        preferred_categories: preferredCategories,
        preferred_sellers: preferredSellers,
        version: PROFILE_VERSION,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    // Best-effort: never break the caller (track-user-event) on profile
    // rebuild failure.
    console.warn("[build-user-profile] failed (non-fatal):", e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
