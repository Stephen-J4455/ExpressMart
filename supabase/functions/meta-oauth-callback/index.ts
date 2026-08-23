import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Meta Embedded Signup (OAuth) callback for WhatsApp catalog connection.
 *
 * Meta's dashboard rejects custom URL schemes (expressmart://...) in the
 * "Valid OAuth Redirect URIs" field, so we register THIS https edge-function
 * URL there instead. The flow:
 *   1. App opens Meta's Embedded Signup with redirect_uri = this function's
 *      https URL, and a `state` payload carrying { sellerId, scheme }.
 *   2. Meta redirects the browser here (GET) with ?code=...&state=...
 *   3. This function exchanges the code for a long-lived WABA token, resolves
 *      the catalog id, and stores it in seller_meta_connections (service role).
 *   4. It then 302-redirects back into the app via the custom scheme
 *      (expressmart://wa/callback?result=...), which the app's Linking
 *      listener picks up. The merchant never sees a raw token.
 *
 * A POST handler is also provided for programmatic / non-browser use and
 * returns JSON instead of redirecting.
 *
 * Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * META_APP_ID, META_APP_SECRET, META_GRAPH_VERSION (optional, default v19.0).
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GRAPH_BASE = "https://graph.facebook.com";

const graphGet = async (path: string, params: Record<string, string>) => {
  const url = new URL(`${GRAPH_BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  const json: any = await res.json();
  if (json?.error) {
    throw new Error(
      `Meta API error: ${json.error?.message || JSON.stringify(json.error)}`,
    );
  }
  return json;
};

const graphPost = async (path: string, params: Record<string, string>) => {
  const url = new URL(`${GRAPH_BASE}/${path}`);
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) body.set(k, v);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json: any = await res.json();
  if (json?.error) {
    throw new Error(
      `Meta API error: ${json.error?.message || JSON.stringify(json.error)}`,
    );
  }
  return json;
};

// Core OAuth handshake: exchange the code, resolve the catalog, persist.
// Returns { success, catalogId, catalogName, wabaBusinessId, error? }.
const runOAuth = async (
  sellerId: string,
  code: string,
  redirectUri: string,
) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const appId = Deno.env.get("META_APP_ID");
  const appSecret = Deno.env.get("META_APP_SECRET");
  if (!supabaseUrl || !serviceRoleKey || !appId || !appSecret) {
    return { success: false, error: "Supabase / Meta not configured" };
  }
  const graphVersion = Deno.env.get("META_GRAPH_VERSION") || "v19.0";
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // 1. Exchange the Embedded Signup code for a short-lived access token.
    const tokenRes = await graphGet(`${graphVersion}/oauth/access_token`, {
      client_id: appId,
      redirect_uri: redirectUri,
      code,
      client_secret: appSecret,
    });
    const shortLivedToken = tokenRes?.access_token;
    if (!shortLivedToken) {
      return { success: false, error: "Meta did not return an access token" };
    }

    // 2. Exchange the short-lived token for a long-lived (60-day) token.
    const longLivedRes = await graphGet(`${graphVersion}/oauth/access_token`, {
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortLivedToken,
    });
    const accessToken = longLivedRes?.access_token || shortLivedToken;

    // 3. Resolve the WABA id, business id, and catalog id from the token.
    const debug = await graphGet(`${graphVersion}/debug_token`, {
      input_token: accessToken,
      access_token: `${appId}|${appSecret}`,
    });
    const grantedWabaId =
      debug?.data?.granular_scopes?.find(
        (g: any) => g.scope === "whatsapp_business_management",
      )?.target_ids?.[0] ||
      debug?.data?.granular_scopes?.[0]?.target_ids?.[0] ||
      null;

    let wabaBusinessId = null as string | null;
    let catalogId = null as string | null;
    let catalogName = null as string | null;
    let phoneNumberId = null as string | null;

    if (grantedWabaId) {
      try {
        const waba = await graphGet(grantedWabaId, {
          fields: "id,name,business_id,message_template_namespace",
          access_token: accessToken,
        });
        wabaBusinessId = waba?.business_id || null;
        phoneNumberId = waba?.id || null;
      } catch (e) {
        console.warn("waba profile lookup failed", e);
      }

      if (wabaBusinessId) {
        try {
          const catalogs = await graphGet(
            `${wabaBusinessId}/owned_product_catalogs`,
            {
              fields: "id,name",
              access_token: accessToken,
            },
          );
          const first = catalogs?.data?.[0];
          if (first) {
            catalogId = first.id;
            catalogName = first.name || null;
          }
        } catch (e) {
          console.warn("catalog lookup failed", e);
        }
      }
    }

    if (!catalogId) {
      const catScope = debug?.data?.granular_scopes?.find(
        (g: any) => g.scope === "catalog_management",
      );
      catalogId = catScope?.target_ids?.[0] || null;
    }

    if (!catalogId) {
      return {
        success: false,
        error:
          "No product catalog found for this WhatsApp Business account. " +
          "Create a catalog in Meta Commerce Manager and link it to your WABA.",
      };
    }

    // 4. Persist the connection (service role, RLS bypassed).
    const { error: upsertErr } = await supabase
      .from("seller_meta_connections")
      .upsert(
        {
          seller_id: sellerId,
          waba_access_token: accessToken,
          meta_catalog_id: catalogId,
          waba_business_id: wabaBusinessId,
          waba_phone_number_id: phoneNumberId,
          meta_app_id: appId,
          catalog_name: catalogName,
          last_sync_status: "pending",
          last_sync_error: null,
        },
        { onConflict: "seller_id" },
      );
    if (upsertErr) return { success: false, error: upsertErr.message };

    return { success: true, catalogId, catalogName, wabaBusinessId };
  } catch (error) {
    console.error("runOAuth error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unexpected error",
    };
  }
};

// Build the app deep-link that the browser is redirected to after the
// server-side exchange. `scheme` comes from the state payload (default
// expressmart). We encode the outcome so the app can show success/error.
const buildAppRedirect = (scheme: string, result: Record<string, unknown>) => {
  const base = `${scheme}://wa/callback`;
  const params = new URLSearchParams();
  if (result.success) {
    params.set("result", "success");
    if (result.catalogName)
      params.set("catalogName", String(result.catalogName));
  } else {
    params.set("result", "error");
    params.set("error", String(result.error || "Connection failed"));
  }
  return `${base}?${params.toString()}`;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const isGet = req.method === "GET";

  // ── GET: Meta's browser redirect (?code=...&state=...) ──────────────────
  // Meta only accepts https redirect URIs in its dashboard, so the app sends
  // this function's https URL as the OAuth redirect_uri. After the exchange we
  // 302 back into the app via the custom scheme carried in `state`.
  if (isGet) {
    const code = url.searchParams.get("code") || "";
    const stateRaw = url.searchParams.get("state") || "{}";
    const errorParam = url.searchParams.get("error");
    let state: any = {};
    try {
      state = JSON.parse(decodeURIComponent(stateRaw));
    } catch {
      state = {};
    }
    const sellerId = String(state?.sellerId ?? "").trim();
    const scheme = String(state?.scheme ?? "expressmart").trim();

    if (errorParam) {
      return Response.redirect(
        buildAppRedirect(scheme, {
          success: false,
          error: `Meta: ${errorParam}`,
        }),
        302,
      );
    }
    if (!sellerId || !code) {
      return Response.redirect(
        buildAppRedirect(scheme, {
          success: false,
          error: "Missing seller or authorization code",
        }),
        302,
      );
    }

    const result = await runOAuth(sellerId, code, url.origin + url.pathname);
    return Response.redirect(buildAppRedirect(scheme, result), 302);
  }

  // ── POST: programmatic / non-browser use → return JSON ───────────────────
  try {
    const body = await req.json().catch(() => ({}));
    const sellerId = String(body?.sellerId ?? "").trim();
    const code = String(body?.code ?? "").trim();
    if (!sellerId) throw new Error("sellerId is required");
    if (!code) throw new Error("Missing authorization code from Meta");

    const result = await runOAuth(sellerId, code, body?.redirectUri || "");
    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("meta-oauth-callback error:", error);
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
