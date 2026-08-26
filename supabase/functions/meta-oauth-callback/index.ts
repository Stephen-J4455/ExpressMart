import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Meta Embedded Signup (OAuth) callback for WhatsApp catalog connection.
 *
 * The whole OAuth round trip runs INSIDE the app's WebView against THIS https
 * endpoint (registered once in the Meta dashboard). The flow:
 *   1. App opens its WebView here with ?launch=1&sellerId=...
 *   2. The function 302s to Meta's Facebook Login for Business dialog using
 *      the Embedded Signup config_id (App Dashboard → WhatsApp → Embedded
 *      Signup Builder), requesting Embedded Signup v4 via the `extras`
 *      payload, with this function's URL as redirect_uri and a
 *      `state` payload of { sellerId, client: "webview" }.
 *   3. Meta redirects the WebView back here (GET) with ?code=...&state=...
 *   4. This function exchanges the code for a long-lived WABA token, resolves
 *      the catalog id, and stores it in seller_meta_connections (service role).
 *   5. It responds with a small result page that hands the outcome to the app
 *      via postMessage (no custom-scheme deep link involved). When hit in a
 *      regular browser it falls back to the expressmart:// deep link.
 *
 * A POST handler is also provided for programmatic / non-browser use and
 * returns JSON instead of an HTML page.
 *
 * Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * META_APP_ID, META_APP_SECRET, META_CONFIG_ID,
 * META_GRAPH_VERSION (optional, default v21.0), META_CONFIG_ID (Embedded
 * Signup configuration id — required for the ?launch=1 flow).
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
    const raw = json.error?.message || JSON.stringify(json.error);
    // Common Meta misconfiguration: the redirect_uri domain isn't registered
    // in the app. Match both EN and FR variants of the message (FR uses
    // "Le domaine de cette URL n'est pas inscrit dans ceux de l'application").
    if (
      /domain(e)?.*(pas inscrit|not registered|not included)/i.test(raw) ||
      /URL.*(pas inscrit|not registered|not included)/i.test(raw)
    ) {
      throw new Error(
        "Meta rejected the redirect URI: its domain is not registered in " +
          "the Meta app. In the Meta App Dashboard, add " +
          "`meiljgoztnhnyvtfkzuh.supabase.co` to App Domains (Settings → " +
          "Basic) and `https://meiljgoztnhnyvtfkzuh.supabase.co/functions/v1/" +
          "meta-oauth-callback` to Facebook Login → Valid OAuth Redirect URIs.",
      );
    }
    throw new Error(`Meta API error: ${raw}`);
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
    const raw = json.error?.message || JSON.stringify(json.error);
    if (
      /domain(e)?.*(pas inscrit|not registered|not included)/i.test(raw) ||
      /URL.*(pas inscrit|not registered|not included)/i.test(raw)
    ) {
      throw new Error(
        "Meta rejected the redirect URI: its domain is not registered in " +
          "the Meta app. In the Meta App Dashboard, add " +
          "`meiljgoztnhnyvtfkzuh.supabase.co` to App Domains (Settings → " +
          "Basic) and `https://meiljgoztnhnyvtfkzuh.supabase.co/functions/v1/" +
          "meta-oauth-callback` to Facebook Login → Valid OAuth Redirect URIs.",
      );
    }
    throw new Error(`Meta API error: ${raw}`);
  }
  return json;
};

// Core OAuth handshake: exchange the code, resolve the catalog, persist.
// Returns { success, catalogId, catalogName, wabaBusinessId, error? }.
const runOAuth = async (
  sellerId: string,
  code: string,
  redirectUri: string | null = null,
) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const appId = Deno.env.get("META_APP_ID");
  const appSecret = Deno.env.get("META_APP_SECRET");
  if (!supabaseUrl || !serviceRoleKey || !appId || !appSecret) {
    return { success: false, error: "Supabase / Meta not configured" };
  }
  const graphVersion = Deno.env.get("META_GRAPH_VERSION") || "v21.0";
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // 1. Exchange the code for a token. Embedded Signup (v4) codes are
    //    exchanged with client_id/client_secret/code ONLY — no redirect_uri.
    //    Standard Login for Business codes REQUIRE the exact redirect_uri.
    const tokenParams: Record<string, string> = {
      client_id: appId,
      code,
      client_secret: appSecret,
    };
    if (redirectUri) tokenParams.redirect_uri = redirectUri;
    console.log(
      "[oauth] exchanging code:",
      JSON.stringify({ appId, sellerId, hasRedirectUri: !!redirectUri }),
    );
    const tokenRes = await graphGet(
      `${graphVersion}/oauth/access_token`,
      tokenParams,
    );
    const shortLivedToken = tokenRes?.access_token;
    if (!shortLivedToken) {
      return { success: false, error: "Meta did not return an access token" };
    }

    // 2. Try to extend to a long-lived (60-day) token. Embedded Signup v4 may
    //    already return a long-lived business integration system user token,
    //    in which case Meta rejects fb_exchange_token — tolerate that and
    //    keep the token we got in step 1.
    let accessToken = shortLivedToken;
    try {
      const longLivedRes = await graphGet(`${graphVersion}/oauth/access_token`, {
        grant_type: "fb_exchange_token",
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: shortLivedToken,
      });
      accessToken = longLivedRes?.access_token || shortLivedToken;
    } catch (e) {
      console.warn(
        "[oauth] long-lived exchange skipped:",
        e instanceof Error ? e.message : e,
      );
    }

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
      // v4 onboarding step: subscribe this app to the customer's WABA so
      // Meta delivers its webhooks to us (best-effort — not fatal).
      try {
        await graphPost(`${grantedWabaId}/subscribed_apps`, {
          access_token: accessToken,
        });
      } catch (e) {
        console.warn("[oauth] waba subscribed_apps failed:", e);
      }

      try {
        const waba = await graphGet(grantedWabaId, {
          fields: "id,name,business_id,message_template_namespace",
          access_token: accessToken,
        });
        wabaBusinessId = waba?.business_id || null;
      } catch (e) {
        console.warn("waba profile lookup failed", e);
      }

      // Resolve the WABA's phone number id (needed for messaging later).
      // NOTE: the WABA object's own id is NOT a phone number id — it has to
      // come from the /phone_numbers edge, so this is a separate call.
      try {
        const phones = await graphGet(`${grantedWabaId}/phone_numbers`, {
          fields: "id,display_phone_number,verified_name",
          access_token: accessToken,
        });
        phoneNumberId = phones?.data?.[0]?.id || null;
      } catch (e) {
        console.warn("phone number lookup failed", e);
      }
    }

    // Resolve the product catalog. Preferred source: the catalog_management
    // grant's target id — that is the catalog the seller actually picked
    // during signup. Fall back to enumerating the business's owned catalogs.
    if (!catalogId) {
      const catScope = debug?.data?.granular_scopes?.find(
        (g: any) => g.scope === "catalog_management",
      );
      catalogId = catScope?.target_ids?.[0] || null;
    }

    if (!catalogId && wabaBusinessId) {
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

    // When the id came from the scope grant we still need its display name.
    if (catalogId && !catalogName) {
      try {
        const cat = await graphGet(String(catalogId), {
          fields: "id,name",
          access_token: accessToken,
        });
        catalogName = cat?.name || null;
      } catch (e) {
        console.warn("catalog name lookup failed", e);
      }
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

const HTML_HEADERS = {
  ...corsHeaders,
  "Content-Type": "text/html; charset=utf-8",
};

// Small result page used by the in-app WebView flow. The OAuth round trip
// happens entirely inside the WebView (launcher 302 → Meta dialog → back
// here), so we report the outcome to React Native via postMessage instead of
// a custom-scheme deep link. In a normal browser we still fall back to the
// app deep link so merchants landing here directly aren't stranded.
const buildResultHtml = (result: Record<string, unknown>, deepLink: string) => {
  const payload = { type: "wa_oauth_result", ...result };
  const payloadJson = JSON.stringify(payload).replace(/</g, "\\u003c");
  const ok = payload.success === true;
  const headline = ok
    ? "✅ WhatsApp catalog connected."
    : "❌ " + String(payload.error || "Connection failed").replace(/</g, "&lt;");
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${ok ? "WhatsApp connected" : "Connection failed"}</title>
</head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#fafafa">
<p id="msg" style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;padding:24px;text-align:center;color:#333;font-size:16px;line-height:1.5">${headline}</p>
<script>
  var payload = ${payloadJson};
  if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
    window.ReactNativeWebView.postMessage(JSON.stringify(payload));
  } else {
    setTimeout(function () {
      window.location.replace(${JSON.stringify(deepLink).replace(/</g, "\\u003c")});
    }, 1200);
  }
</script>
</body>
</html>`;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const isGet = req.method === "GET";

  // ── GET: launcher (?launch=1) and Meta's redirect (?code=...&state=...) ──
  // The launcher kicks off Embedded Signup; Meta then returns the code here
  // and we either postMessage the result into the WebView or deep-link back
  // into the app (legacy browser entry point).
  if (isGet) {
    // ── Launcher (?launch=1&sellerId=...), opened in the app's WebView ──────
    // Kicks off Meta Embedded Signup as a full-page redirect to the Facebook
    // Login for Business dialog (config_id from App Dashboard → WhatsApp →
    // Embedded Signup Builder). No popup involved, so it behaves identically
    // on iOS, Android, and web. Meta returns the code HERE, so the app never
    // touches redirect URIs or deep links.
    if (url.searchParams.get("launch")) {
      const launchSellerId = (url.searchParams.get("sellerId") || "").trim();
      const appIdCfg = Deno.env.get("META_APP_ID");
      const appSecretCfg = Deno.env.get("META_APP_SECRET");
      const configId = Deno.env.get("META_CONFIG_ID");
      const graphVersionCfg =
        Deno.env.get("META_GRAPH_VERSION") || "v21.0";
      // mode=login → standard Facebook Login for Business (NO config_id).
      // Embedded Signup (config_id) is gated behind Meta Business
      // Verification — until that completes, Meta blocks the dialog even for
      // app admins with the misleading "isn't using a secure connection"
      // error. The plain login flow works in dev mode for admins and grants
      // the same scopes we need (WABA + catalog management).
      const loginMode = url.searchParams.get("mode") === "login";
      if (
        !launchSellerId ||
        !appIdCfg ||
        !appSecretCfg ||
        (!loginMode && !configId)
      ) {
        return new Response(
          `<!DOCTYPE html><meta charset="utf-8"><p style="font-family:sans-serif;padding:24px">WhatsApp connect is not configured. Required: sellerId, META_APP_ID, META_APP_SECRET${loginMode ? "" : ", META_CONFIG_ID"}.</p>`,
          { status: 500, headers: HTML_HEADERS },
        );
      }
      const launchState = encodeURIComponent(
        JSON.stringify({
          sellerId: launchSellerId,
          client: "webview",
          // Remember the mode so the code exchange knows whether to send a
          // redirect_uri (standard login) or not (Embedded Signup v4).
          mode: loginMode ? "login" : "es",
          ts: Date.now(),
        }),
      );
      const dialogUrl =
        `https://www.facebook.com/${graphVersionCfg}/dialog/oauth` +
        `?client_id=${encodeURIComponent(appIdCfg)}` +
        (loginMode
          ? // Standard login: explicit scopes, no Embedded Signup config.
            // catalog_management is REQUIRED here — without it the token cannot
            // read the seller's catalogs (owned_product_catalogs) nor can
            // sync-whatsapp-catalog pull /{catalog_id}/products afterwards.
            `&scope=${encodeURIComponent(
              "business_management,catalog_management,whatsapp_business_management,whatsapp_business_messaging",
            )}`
          : `&config_id=${encodeURIComponent(configId)}` +
            // Embedded Signup version selection (v2 is deprecated Oct 2026).
            `&extras=${encodeURIComponent(JSON.stringify({ version: "v4" }))}`) +
        `&response_type=code` +
        `&override_default_response_type=code` +
        `&redirect_uri=${encodeURIComponent(url.origin + url.pathname)}` +
        `&state=${launchState}`;
      console.log(
        "[oauth] launching embedded signup:",
        JSON.stringify({ sellerId: launchSellerId, mode: loginMode ? "login" : "es" }),
      );
      return Response.redirect(dialogUrl, 302);
    }

    // ── Callback: Meta's redirect (?code=...&state=...) ──────────────────────
    const code = url.searchParams.get("code") || "";
    const stateRaw = url.searchParams.get("state") || "{}";
    const errorParam = url.searchParams.get("error");
    let state: any = {};
    // searchParams.get() already percent-decodes once; tolerate both raw and
    // double-encoded payloads instead of silently dropping the seller context.
    try {
      state = JSON.parse(stateRaw);
    } catch {
      try {
        state = JSON.parse(decodeURIComponent(stateRaw));
      } catch {
        state = {};
      }
    }
    const sellerId = String(state?.sellerId ?? "").trim();
    const scheme = String(state?.scheme ?? "expressmart").trim();
    // WebView flow → report via postMessage page; browser flow → deep link.
    const fromWebView = state?.client === "webview";
    const respondResult = (result: Record<string, unknown>) =>
      fromWebView
        ? new Response(
            buildResultHtml(result, buildAppRedirect(scheme, result)),
            { headers: HTML_HEADERS },
          )
        : Response.redirect(buildAppRedirect(scheme, result), 302);

    if (errorParam) {
      return respondResult({
        success: false,
        error: `Meta: ${errorParam}`,
      });
    }
    if (!sellerId || !code) {
      return respondResult({
        success: false,
        error: "Missing seller or authorization code",
      });
    }

    const result = await runOAuth(
      sellerId,
      code,
      // Standard Login for Business flow (mode=login) requires the exact
      // redirect_uri in the code exchange; Embedded Signup v4 must NOT have it.
      state?.mode === "login" ? url.origin + url.pathname : null,
    );
    return respondResult(result);
  }

  // ── POST: programmatic / non-browser use → return JSON ───────────────────
  try {
    const body = await req.json().catch(() => ({}));
    const sellerId = String(body?.sellerId ?? "").trim();
    const code = String(body?.code ?? "").trim();
    if (!sellerId) throw new Error("sellerId is required");
    if (!code) throw new Error("Missing authorization code from Meta");

    const result = await runOAuth(sellerId, code);
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
