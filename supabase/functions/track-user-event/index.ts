// track-user-event
// ----------------------------------------------------------------------------
// Receives a batch of user events from the ExpressMart client and inserts
// them into `express_user_events` using the service role key. Also
// invalidates the per-user "For You" feed cache so the next refresh picks
// up the new signal.
//
// Auth: the call must include a valid user JWT. We extract the user id
// from the JWT (NOT from the body) so the client can never log events on
// behalf of another user, even by mistake.
//
// Anonymous users (no JWT) get a 204 — the client is supposed to skip
// tracking for them, but the server is the source of truth.
// ----------------------------------------------------------------------------

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Constants ──────────────────────────────────────────────────────────────
const ALLOWED_EVENT_TYPES = new Set([
  "view",
  "like",
  "unlike",
  "cart_add",
  "search",
  "tag_click",
  "category_view",
  "follow",
  "unfollow",
  "purchase",
]);

// Caps protect the table from runaway writes; values chosen to be much
// larger than any legitimate use but small enough to be defended against
// a malicious or buggy client.
const MAX_EVENTS_PER_BATCH = 50;
const MAX_STRING_LEN = 200;
const MAX_WEIGHT = 100;

// Default weight per event type. The client is allowed to override weight
// explicitly, but most calls omit it. Unfollow / unlike are negative so
// the scoring math decays the relevant dimension.
const DEFAULT_WEIGHT: Record<string, number> = {
  view: 1,
  search: 2,
  tag_click: 3,
  follow: 4,
  unfollow: -2,
  like: 5,
  unlike: -3,
  cart_add: 8,
  category_view: 2,
  purchase: 10,
};

// Per-user "For You" cache key prefix. Kept in sync with cached-products.
const FORYOU_CACHE_PREFIX = "expressmart:feed:foryou:v1:";

const clampString = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
};

const toPositiveInt = (value: unknown): number | null => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  return i > 0 ? i : null;
};

const clampWeight = (value: unknown, fallback: number): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n > MAX_WEIGHT) return MAX_WEIGHT;
  if (n < -MAX_WEIGHT) return -MAX_WEIGHT;
  return n;
};
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const redisUrl = Deno.env.get("UPSTASH_REDIS_REST_URL");
    const redisToken = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Supabase environment not configured");
    }

    // ── 1. Auth: pull the user id from the JWT. ───────────────────────
    // getUser() verifies the token signature against the project's JWT
    // secret, so this is the authoritative user id.
    const supabaseAuth = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser(jwt);

    if (userError || !user) {
      // Anonymous (or bad token) — accept the call but insert nothing.
      // The client is supposed to skip tracking for anonymous users;
      // this 204 is the server-side backstop.
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // ── 2. Parse and validate the batch. ──────────────────────────────
    const body = await req.json().catch(() => ({}));
    const rawEvents = Array.isArray(body?.events) ? body.events : [];

    if (rawEvents.length === 0) {
      return new Response(
        JSON.stringify({ inserted: 0, dropped: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (rawEvents.length > MAX_EVENTS_PER_BATCH) {
      return new Response(
        JSON.stringify({
          error: `Batch too large; max ${MAX_EVENTS_PER_BATCH} events per call`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const rows: Record<string, unknown>[] = [];
    let dropped = 0;

    for (const raw of rawEvents) {
      if (!raw || typeof raw !== "object") {
        dropped++;
        continue;
      }
      const eventType = String((raw as any).event_type || "").trim();
      if (!ALLOWED_EVENT_TYPES.has(eventType)) {
        dropped++;
        continue;
      }

      const productId = toPositiveInt((raw as any).product_id);
      const categoryId = toPositiveInt((raw as any).category_id);
      const sellerId = toPositiveInt((raw as any).seller_id);
      const tag = clampString((raw as any).tag, 64);
      const query = clampString((raw as any).query, MAX_STRING_LEN);
      const category = clampString((raw as any).category, 64);
      const weight = clampWeight(
        (raw as any).weight,
        DEFAULT_WEIGHT[eventType] ?? 1,
      );

      // Drop events that have no signal at all. search and tag_click are
      // allowed without product_id since the signal is the query/tag.
      const hasSignal =
        productId !== null ||
        categoryId !== null ||
        category !== null ||
        sellerId !== null ||
        tag !== null ||
        query !== null;
      if (!hasSignal) {
        dropped++;
        continue;
      }

      const metadata = (raw as any).metadata;
      const safeMetadata =
        metadata && typeof metadata === "object" && !Array.isArray(metadata)
          ? metadata
          : {};

      rows.push({
        user_id: user.id,
        event_type: eventType,
        product_id: productId,
        category_id: categoryId,
        category,
        seller_id: sellerId,
        tag,
        query: query ? query.toLowerCase() : null,
        weight,
        metadata: safeMetadata,
      });
    }


    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ inserted: 0, dropped }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 3. Insert via service role. ───────────────────────────────────
    const { error: insertError } = await supabaseAuth
      .from("express_user_events")
      .insert(rows);

    if (insertError) {
      console.error("track-user-event insert failed:", insertError);
      return new Response(
        JSON.stringify({ error: insertError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ── 4. Invalidate the per-user "For You" cache so the next refresh
    //       re-scores with the new signal. Best-effort: a Redis failure
    //       just means the user sees a slightly stale personalization
    //       for up to 5 minutes (the cache TTL) instead of an outright
    //       error.
    if (redisUrl && redisToken) {
      try {
        const key = `${FORYOU_CACHE_PREFIX}${user.id}:p0`;
        await fetch(`${redisUrl}/pipeline`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${redisToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify([["DEL", key]]),
        });
      } catch (cacheErr) {
        console.warn(
          "track-user-event redis invalidate failed (non-fatal):",
          cacheErr,
        );
      }
    }

    console.info(
      `[track-user-event] user=${user.id} inserted=${rows.length} dropped=${dropped}`,
    );

    return new Response(
      JSON.stringify({ inserted: rows.length, dropped }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("track-user-event function error:", error);
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
