import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const bankListCache: Record<string, { expiresAt: number; data: any[] }> = {};
const BANK_LIST_TTL_MS = 1000 * 60 * 10;

const getCountryFromCurrency = (currency: string): string => {
  const normalized = String(currency || "").toUpperCase();
  if (normalized && normalized !== "GHS") {
    console.warn(
      `[create_subaccount] unsupported currency '${normalized}', defaulting country to ghana`,
    );
  }
  return "ghana";
};

const isSubaccountVerified = (sub: any): boolean => {
  if (!sub || typeof sub !== "object") return false;
  if (
    sub.active === true ||
    sub.is_verified === true ||
    sub.verified === true
  ) {
    return true;
  }

  const status = String(
    sub.verification_status || sub.account_verification_status || "",
  )
    .trim()
    .toLowerCase();

  return ["verified", "active", "approved", "success"].includes(status);
};

const getEffectiveVerificationState = (sub: any): boolean => {
  // Paystack's `active` is the canonical toggle we set from admin.
  if (sub && typeof sub.active === "boolean") return sub.active;
  return isSubaccountVerified(sub);
};

const normalizeBanks = (banks: any[]): any[] => {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const b of banks || []) {
    if (!b) continue;
    if (b.active === false || b.is_deleted === true) continue;
    const code = String(b.code || "").trim();
    const name = String(b.name || "").trim();
    if (!code || !name) continue;
    const key = `${code}:${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...b, code, name });
  }
  return out;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const parseAuthDebug = (req: Request) => {
  const auth = req.headers.get("authorization") || "";
  const hasBearer = auth.toLowerCase().startsWith("bearer ");
  const token = hasBearer ? auth.slice(7).trim() : "";

  if (!token) {
    return {
      has_authorization_header: Boolean(auth),
      has_bearer_token: false,
      jwt_role: null,
      jwt_sub: null,
      jwt_exp: null,
      jwt_iss: null,
    };
  }

  try {
    const parts = token.split(".");
    const payloadRaw = parts.length >= 2 ? parts[1] : "";
    const normalized = payloadRaw.replace(/-/g, "+").replace(/_/g, "/");
    const padded =
      normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
    const payloadText = atob(padded);
    const payload = JSON.parse(payloadText);

    return {
      has_authorization_header: Boolean(auth),
      has_bearer_token: true,
      jwt_role: payload?.role || null,
      jwt_sub: payload?.sub || null,
      jwt_exp: payload?.exp || null,
      jwt_iss: payload?.iss || null,
    };
  } catch (_err) {
    return {
      has_authorization_header: Boolean(auth),
      has_bearer_token: true,
      jwt_role: "decode_failed",
      jwt_sub: null,
      jwt_exp: null,
      jwt_iss: null,
    };
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const authDebug = parseAuthDebug(req);

  try {
    const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!PAYSTACK_SECRET_KEY)
      throw new Error("PAYSTACK_SECRET_KEY not configured");
    if (!SUPABASE_URL) throw new Error("SUPABASE_URL not configured");

    const body = await req.json();
    const action = body?.action ?? null;

    console.log("[create_subaccount] request.start", {
      request_id: requestId,
      action,
      method: req.method,
      auth: authDebug,
      has_service_role_key: Boolean(SUPABASE_SERVICE_ROLE_KEY),
      has_paystack_secret: Boolean(PAYSTACK_SECRET_KEY),
    });

    if (action === "list_banks") {
      const requestedCountry = String(body?.country || "")
        .trim()
        .toLowerCase();
      const countryParam = "ghana";
      if (requestedCountry && requestedCountry !== "ghana") {
        console.warn(
          `[create_subaccount] unsupported country '${requestedCountry}' requested for list_banks, forcing ghana`,
        );
      }
      const now = Date.now();

      const cacheEntry = bankListCache[countryParam];
      if (cacheEntry && cacheEntry.expiresAt > now) {
        return new Response(
          JSON.stringify({ success: true, data: cacheEntry.data }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          },
        );
      }

      const banksRes = await fetch(
        "https://api.paystack.co/bank?country=" + countryParam,
        { headers: { Authorization: "Bearer " + PAYSTACK_SECRET_KEY } },
      );
      const banksJson = await banksRes.json();

      if (!banksRes.ok || banksJson.status !== true) {
        throw new Error(banksJson.message || "failed_fetch_banks");
      }

      const banks = normalizeBanks(banksJson.data || []);
      bankListCache[countryParam] = {
        expiresAt: now + BANK_LIST_TTL_MS,
        data: banks,
      };

      return new Response(JSON.stringify({ success: true, data: banks }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (action === "get_subaccount") {
      const subaccountCode = String(body?.subaccount_code || "").trim();
      if (!subaccountCode) {
        throw new Error("subaccount_code is required for get_subaccount");
      }

      const detailsRes = await fetch(
        "https://api.paystack.co/subaccount/" +
          encodeURIComponent(subaccountCode),
        { headers: { Authorization: "Bearer " + PAYSTACK_SECRET_KEY } },
      );
      const detailsJson = await detailsRes.json();

      if (!detailsRes.ok || detailsJson.status !== true) {
        throw new Error(detailsJson.message || "failed_fetch_subaccount");
      }

      return new Response(
        JSON.stringify({ success: true, data: detailsJson.data }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    if (action === "set_account_verification") {
      const sellerId = body?.seller_id;
      const requestedVerified = Boolean(body?.verified);
      let subaccountCode = String(body?.subaccount_code || "").trim();

      console.log("[create_subaccount] set_account_verification.input", {
        request_id: requestId,
        seller_id: sellerId,
        requested_verified: requestedVerified,
        has_subaccount_code: Boolean(subaccountCode),
        auth: authDebug,
      });

      if (!sellerId) {
        throw new Error("seller_id is required for set_account_verification");
      }
      if (!SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error(
          "SUPABASE_SERVICE_ROLE_KEY is required for set_account_verification",
        );
      }

      const writeClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      if (!subaccountCode) {
        const { data: sellerRow, error: sellerLookupErr } = await writeClient
          .from("express_sellers")
          .select("payment_account")
          .eq("id", sellerId)
          .maybeSingle();

        if (sellerLookupErr) {
          throw new Error(sellerLookupErr.message || "failed_lookup_seller");
        }

        subaccountCode = String(sellerRow?.payment_account || "").trim();
      }

      if (!subaccountCode) {
        throw new Error("seller has no paystack subaccount code");
      }

      // Fetch current details first and reuse them in the update payload.
      // Sending only `active` can be risky with providers that treat PUT as full update.
      const currentDetailsRes = await fetch(
        "https://api.paystack.co/subaccount/" +
          encodeURIComponent(subaccountCode),
        { headers: { Authorization: "Bearer " + PAYSTACK_SECRET_KEY } },
      );
      const currentDetailsJson = await currentDetailsRes.json();
      console.log(
        "[create_subaccount] set_account_verification.fetch_current",
        {
          request_id: requestId,
          seller_id: sellerId,
          subaccount_code: subaccountCode,
          paystack_http_status: currentDetailsRes.status,
          paystack_status: currentDetailsJson?.status,
          paystack_message: currentDetailsJson?.message || null,
          paystack_active: currentDetailsJson?.data?.active ?? null,
        },
      );
      if (!currentDetailsRes.ok || currentDetailsJson.status !== true) {
        throw new Error(
          currentDetailsJson.message || "failed_fetch_subaccount",
        );
      }

      const currentSub = currentDetailsJson.data || {};
      const canonicalSubaccountCode =
        String(currentSub.subaccount_code || subaccountCode).trim() ||
        subaccountCode;

      const updatePayload: Record<string, any> = {
        active: requestedVerified,
      };

      // Preserve existing mutable fields to avoid accidental data loss.
      const preservedFields = [
        "business_name",
        "settlement_bank",
        "account_number",
        "percentage_charge",
        "description",
        "primary_contact_name",
        "primary_contact_email",
        "primary_contact_phone",
        "metadata",
      ];

      for (const key of preservedFields) {
        const value = currentSub?.[key];
        if (value !== undefined && value !== null && value !== "") {
          updatePayload[key] = value;
        }
      }

      const updateRes = await fetch(
        "https://api.paystack.co/subaccount/" +
          encodeURIComponent(canonicalSubaccountCode),
        {
          method: "PUT",
          headers: {
            Authorization: "Bearer " + PAYSTACK_SECRET_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updatePayload),
        },
      );

      const updateJson = await updateRes.json();
      console.log(
        "[create_subaccount] set_account_verification.paystack_update",
        {
          request_id: requestId,
          seller_id: sellerId,
          subaccount_code: canonicalSubaccountCode,
          requested_verified: requestedVerified,
          paystack_http_status: updateRes.status,
          paystack_status: updateJson?.status,
          paystack_message: updateJson?.message || null,
          paystack_active: updateJson?.data?.active ?? null,
        },
      );
      if (!updateRes.ok || updateJson.status !== true) {
        throw new Error(
          updateJson.message || "failed_update_subaccount_verification",
        );
      }

      const detailsRes = await fetch(
        "https://api.paystack.co/subaccount/" +
          encodeURIComponent(canonicalSubaccountCode),
        { headers: { Authorization: "Bearer " + PAYSTACK_SECRET_KEY } },
      );
      const detailsJson = await detailsRes.json();
      console.log(
        "[create_subaccount] set_account_verification.fetch_after_update",
        {
          request_id: requestId,
          seller_id: sellerId,
          subaccount_code: canonicalSubaccountCode,
          paystack_http_status: detailsRes.status,
          paystack_status: detailsJson?.status,
          paystack_message: detailsJson?.message || null,
          paystack_active: detailsJson?.data?.active ?? null,
        },
      );
      if (!detailsRes.ok || detailsJson.status !== true) {
        throw new Error(detailsJson.message || "failed_fetch_subaccount");
      }

      const sub = detailsJson.data || {};
      const paystackActive =
        typeof sub?.active === "boolean" ? sub.active : undefined;
      const accountVerified = getEffectiveVerificationState(sub);

      if (
        typeof paystackActive === "boolean" &&
        paystackActive !== requestedVerified
      ) {
        throw new Error(
          `Paystack state mismatch: requested ${requestedVerified ? "verified" : "unverified"} but subaccount is ${paystackActive ? "verified" : "unverified"}`,
        );
      }
      const finalSubaccountCode =
        String(sub.subaccount_code || canonicalSubaccountCode).trim() ||
        canonicalSubaccountCode;

      const { error: dbErr } = await writeClient
        .from("express_sellers")
        .update({
          payment_platform: "paystack",
          payment_account: finalSubaccountCode,
          account_verified: accountVerified,
        })
        .eq("id", sellerId);

      console.log("[create_subaccount] set_account_verification.db_update", {
        request_id: requestId,
        seller_id: sellerId,
        final_subaccount_code: finalSubaccountCode,
        account_verified: accountVerified,
        db_error: dbErr ? String(dbErr.message || dbErr) : null,
      });

      if (dbErr) {
        throw new Error(dbErr.message || "failed_update_seller_verification");
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            seller_id: sellerId,
            requested_verified: requestedVerified,
            account_verified: accountVerified,
            paystack_active:
              typeof sub?.active === "boolean" ? sub.active : null,
            subaccount: sub,
          },
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    if (action === "sync_subaccount_status") {
      const sellerId = body?.seller_id;
      let subaccountCode = String(body?.subaccount_code || "").trim();

      if (!sellerId) {
        throw new Error("seller_id is required for sync_subaccount_status");
      }
      if (!SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error(
          "SUPABASE_SERVICE_ROLE_KEY is required for sync_subaccount_status",
        );
      }

      const writeClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: sellerRow, error: sellerErr } = await writeClient
        .from("express_sellers")
        .select(
          "id,payment_platform,payment_account,account_code,payment_provider,payment_currency,account_verified",
        )
        .eq("id", sellerId)
        .maybeSingle();

      if (sellerErr) {
        throw new Error(sellerErr.message || "failed_lookup_seller");
      }
      if (!sellerRow) {
        throw new Error("seller not found");
      }

      if (!subaccountCode) {
        subaccountCode = String(sellerRow.payment_account || "").trim();
      }

      if (!subaccountCode) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              seller_id: sellerId,
              skipped: true,
              reason: "missing_subaccount_code",
              in_sync: false,
            },
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          },
        );
      }

      const detailsRes = await fetch(
        "https://api.paystack.co/subaccount/" +
          encodeURIComponent(subaccountCode),
        { headers: { Authorization: "Bearer " + PAYSTACK_SECRET_KEY } },
      );
      const detailsJson = await detailsRes.json();
      if (!detailsRes.ok || detailsJson.status !== true) {
        throw new Error(detailsJson.message || "failed_fetch_subaccount");
      }

      const sub = detailsJson.data || {};
      const paystackActive =
        typeof sub?.active === "boolean" ? sub.active : null;
      const normalizedSubaccountCode =
        String(sub.subaccount_code || subaccountCode).trim() || subaccountCode;
      const accountVerified = getEffectiveVerificationState(sub);
      const nextPlatform = "paystack";

      const inSync =
        String(sellerRow.payment_platform || "").toLowerCase() ===
          nextPlatform &&
        String(sellerRow.payment_account || "").trim() ===
          normalizedSubaccountCode &&
        Boolean(sellerRow.account_verified) === accountVerified;

      let updated = false;
      if (!inSync) {
        const dbPatch: Record<string, any> = {
          payment_platform: nextPlatform,
          payment_account: normalizedSubaccountCode,
          account_verified: accountVerified,
        };

        // Keep DB payout account aligned when available from Paystack.
        const paystackAccountNumber = String(sub.account_number || "").trim();
        if (paystackAccountNumber) {
          dbPatch.account_code = paystackAccountNumber;
        }

        const { error: updateErr } = await writeClient
          .from("express_sellers")
          .update(dbPatch)
          .eq("id", sellerId);

        if (updateErr) {
          throw new Error(updateErr.message || "failed_update_seller");
        }
        updated = true;
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            seller_id: sellerId,
            subaccount_code: normalizedSubaccountCode,
            account_verified: accountVerified,
            paystack_active: paystackActive,
            in_sync: inSync,
            updated,
            subaccount: sub,
          },
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    const sellerId = body?.seller_id;
    const name = body?.name;
    const email = body?.email;
    const settlementBank = body?.settlement_bank;
    const accountNumber = body?.account_number;
    const incomingSubaccountCode = String(body?.subaccount_code || "").trim();
    const primaryContactPhone = body?.primary_contact_phone;
    const type = String(body?.type || "bank").toLowerCase();
    const currency = String(body?.currency || "GHS").toUpperCase();

    if (!sellerId) throw new Error("seller_id is required");

    let percentageCharge = 0;
    if (body?.percentage_charge != null) {
      percentageCharge = Number(body.percentage_charge);
    } else if (body?.percentage != null) {
      percentageCharge = Number(body.percentage);
    } else {
      const envDefault = Deno.env.get("PAYSTACK_DEFAULT_SUBACCOUNT_PERCENTAGE");
      percentageCharge = envDefault != null ? Number(envDefault) : 0;
    }

    const payload: Record<string, any> = {
      business_name: name || "Seller-" + String(sellerId).slice(0, 6),
      primary_contact_name: name || null,
      primary_contact_email: email || null,
      percentage_charge: percentageCharge,
      currency,
    };

    if (primaryContactPhone)
      payload.primary_contact_phone = primaryContactPhone;

    if (type === "bank" || type === "mobile_money") {
      if (!settlementBank) {
        throw new Error("settlement_bank is required");
      }

      const countryParam = getCountryFromCurrency(currency);
      const now = Date.now();
      let banks: any[] = [];
      const cacheEntry = bankListCache[countryParam];
      if (cacheEntry && cacheEntry.expiresAt > now) {
        banks = cacheEntry.data || [];
      } else {
        const banksRes = await fetch(
          "https://api.paystack.co/bank?country=" + countryParam,
          { headers: { Authorization: "Bearer " + PAYSTACK_SECRET_KEY } },
        );
        const banksJson = await banksRes.json();
        if (!banksRes.ok || banksJson.status !== true) {
          throw new Error(banksJson.message || "failed_fetch_banks");
        }
        banks = normalizeBanks(banksJson.data || []);
        bankListCache[countryParam] = {
          expiresAt: now + BANK_LIST_TTL_MS,
          data: banks,
        };
      }

      const settlementInput = String(settlementBank).trim();
      let matchedBank: any = null;

      if (type === "bank") {
        const inputLower = settlementInput.toLowerCase();
        matchedBank = banks.find(
          (b: any) =>
            String(b.code || "").toLowerCase() === inputLower ||
            String(b.name || "").toLowerCase() === inputLower,
        );
        if (!matchedBank) {
          matchedBank = banks.find((b: any) =>
            String(b.name || "")
              .toLowerCase()
              .includes(inputLower),
          );
        }
      } else {
        // Map app/provider aliases to Paystack-facing keywords.
        const providerAliasMap: Record<string, string> = {
          mtn: "mtn",
          airteltigo: "airtel",
          telecel: "telecel",
          vodafone: "telecel",
          vod: "telecel",
        };
        const providerKey =
          providerAliasMap[settlementInput.toLowerCase()] ||
          settlementInput.toLowerCase();

        matchedBank = banks.find(
          (b: any) =>
            String(b.code || "").toLowerCase() === providerKey ||
            String(b.name || "")
              .toLowerCase()
              .includes(providerKey),
        );
      }

      if (!matchedBank || !matchedBank.code) {
        throw new Error("Settlement Bank is invalid");
      }

      payload.settlement_bank = String(matchedBank.code);
    }

    let normalizedPayoutAccount: string | null = null;
    if (accountNumber) {
      const acct = String(accountNumber).replace(/\D/g, "").trim();

      if (type === "mobile_money") {
        if (acct.length < 10 || acct.length > 13) {
          throw new Error(
            "account_number is invalid: expected 10 to 13 digits for mobile money",
          );
        }
      } else {
        // Bank account formats can vary by institution/currency.
        if (acct.length < 10 || acct.length > 13) {
          throw new Error(
            "account_number is invalid: expected 10 to 13 digits for bank accounts",
          );
        }
      }

      payload.account_number = acct;
      normalizedPayoutAccount = acct;
    }

    let existingSubaccountCode = incomingSubaccountCode || null;
    if (!existingSubaccountCode && SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const writeClient = createClient(
          SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY,
        );
        const { data: sellerRow } = await writeClient
          .from("express_sellers")
          .select("payment_account")
          .eq("id", sellerId)
          .maybeSingle();
        existingSubaccountCode =
          String(sellerRow?.payment_account || "").trim() || null;
      } catch (lookupErr) {
        console.warn("Failed to lookup existing subaccount code:", lookupErr);
      }
    }

    const method = existingSubaccountCode ? "PUT" : "POST";

    // New subaccounts must remain unverified until admin explicitly verifies them.
    if (!existingSubaccountCode) {
      payload.active = false;
    }

    const endpoint = existingSubaccountCode
      ? "https://api.paystack.co/subaccount/" +
        encodeURIComponent(existingSubaccountCode)
      : "https://api.paystack.co/subaccount";

    const subRes = await fetch(endpoint, {
      method,
      headers: {
        Authorization: "Bearer " + PAYSTACK_SECRET_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const subJson = await subRes.json();
    if (!subRes.ok || subJson.status !== true) {
      throw new Error(subJson.message || "Paystack error creating subaccount");
    }

    let sub = subJson.data || {};
    const accountId =
      sub.subaccount_code || existingSubaccountCode || sub.id || null;
    let accountVerified = existingSubaccountCode
      ? getEffectiveVerificationState(sub)
      : false;

    if (existingSubaccountCode && !accountVerified && accountId) {
      // Some Paystack responses may not include final verification fields on create/update.
      try {
        const detailsRes = await fetch(
          "https://api.paystack.co/subaccount/" +
            encodeURIComponent(String(accountId)),
          { headers: { Authorization: "Bearer " + PAYSTACK_SECRET_KEY } },
        );
        const detailsJson = await detailsRes.json();
        if (
          detailsRes.ok &&
          detailsJson?.status === true &&
          detailsJson?.data
        ) {
          sub = detailsJson.data;
          accountVerified = getEffectiveVerificationState(sub);
        }
      } catch (verifyErr) {
        console.warn(
          "Failed to fetch subaccount verification status:",
          verifyErr,
        );
      }
    }

    const dbUpdate = {
      updated: false,
      skipped: false,
      error: null as string | null,
    };

    if (accountId) {
      if (!SUPABASE_SERVICE_ROLE_KEY) {
        dbUpdate.skipped = true;
      } else {
        const writeClient = createClient(
          SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY,
        );
        const { error: updateErr } = await writeClient
          .from("express_sellers")
          .update({
            payment_platform: "paystack",
            payment_account: accountId,
            account_code: normalizedPayoutAccount,
            payment_provider: type,
            payment_currency: currency,
            account_verified: accountVerified,
          })
          .eq("id", sellerId);

        if (updateErr) {
          dbUpdate.error = String(updateErr);
        } else {
          dbUpdate.updated = true;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          subaccount: sub,
          db_update: dbUpdate,
          mode: existingSubaccountCode ? "updated" : "created",
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (err) {
    console.error("[create_subaccount] request.error", {
      request_id: requestId,
      action: (() => {
        try {
          return (err as any)?.action || null;
        } catch (_e) {
          return null;
        }
      })(),
      auth: authDebug,
      message: err?.message || String(err),
      stack: err?.stack || null,
      elapsed_ms: Date.now() - startedAt,
    });
    return new Response(
      JSON.stringify({ success: false, error: err?.message || String(err) }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      },
    );
  }
});
