import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * META / Meta Commerce webhook receiver.
 *
 * GET  — Meta verification handshake (hub.mode, hub.verify_token, hub.challenge).
 * POST — Signed payloads (X-Hub-Signature-256). Parses product_retailer_id
 *        from catalog-related messages, logs a catalog_interactions row, and
 *        acks 200 immediately. Slower work should be queued, not done inline.
 *
 * Required edge-function secrets (set via `supabase secrets set`):
 *   META_VERIFY_TOKEN — token configured in Meta App dashboard webhook subscription.
 *   META_APP_SECRET   — Meta App secret used for X-Hub-Signature-256 verification.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-hub-signature-256",
};

const timingSafeEqualHex = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
};

const verifySignature = async (
  payload: string,
  signatureHeader: string | null,
  appSecret: string,
): Promise<boolean> => {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const expected = signatureHeader.slice("sha256=".length);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const computed = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return timingSafeEqualHex(computed, expected);
};

/** Recursively collect product_retailer_id values from any message payload. */
const extractRetailerIds = (node: unknown, found: string[] = []): string[] => {
  if (!node || typeof node !== "object") return found;
  if (Array.isArray(node)) {
    node.forEach((item) => extractRetailerIds(item, found));
    return found;
  }
  const obj = node as Record<string, unknown>;
  if (typeof obj.product_retailer_id === "string") {
    found.push(obj.product_retailer_id);
  }
  if (typeof obj.retailer_id === "string") {
    found.push(obj.retailer_id);
  }
  Object.values(obj).forEach((value) => {
    if (value && typeof value === "object") extractRetailerIds(value, found);
  });
  return found;
};

/** Best-effort extraction of the META user phone from the payload. */
const extractUserPhone = (entry: Record<string, unknown>): string | null => {
  const value =
    (entry as any)?.changes?.[0]?.value?.messages?.[0]?.from ??
    (entry as any)?.contacts?.[0]?.wa_id ??
    null;
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Supabase not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // ── Verification handshake ────────────────────────────────────────────────
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const verifyToken = Deno.env.get("META_VERIFY_TOKEN");
    if (
      mode === "subscribe" &&
      token &&
      verifyToken &&
      timingSafeEqualHex(token, verifyToken)
    ) {
      return new Response(challenge ?? "", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // ── Event delivery ────────────────────────────────────────────────────────
  if (req.method === "POST") {
    const appSecret = Deno.env.get("META_APP_SECRET");
    if (!appSecret) {
      return new Response(JSON.stringify({ error: "App secret not set" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawBody = await req.text();
    const signature = req.headers.get("x-hub-signature-256");

    // Reject unsigned/invalid requests before doing any processing.
    const valid = await verifySignature(rawBody, signature, appSecret);
    if (!valid) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      const payload = JSON.parse(rawBody);
      const entries: Record<string, unknown>[] = Array.isArray(payload?.entry)
        ? payload.entry
        : [];

      for (const entry of entries) {
        const userPhone = extractUserPhone(entry);
        const retailerIds = extractRetailerIds(entry.changes ?? entry);
        if (retailerIds.length === 0) continue;

        // Look up matching products via meta_retailer_id (indexed).
        const { data: mappings } = await supabase
          .from("product_catalog_mappings")
          .select("product_id, meta_retailer_id")
          .in("meta_retailer_id", retailerIds);

        if (!mappings || mappings.length === 0) continue;

        const rows = mappings.map((m) => ({
          user_phone: userPhone,
          product_id: m.product_id,
          event_type: "product_query",
          payload: { meta_retailer_id: m.meta_retailer_id },
        }));
        // Fire-and-forget insert; webhook must ack fast.
        supabase.from("catalog_interactions").insert(rows).then(() => {}, () => {});
      }
    } catch (err) {
      console.error("Webhook parse error:", err);
      // Still ack 200 so Meta doesn't retry a malformed body forever.
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response("Method not allowed", { status: 405 });
});
