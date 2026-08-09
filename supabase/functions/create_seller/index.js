import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const slugify = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "seller";

const sellerSelect =
  "id,user_id,name,slug,email,phone,avatar,theme_color,badges,store_description,is_active,created_at,updated_at";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl) throw new Error("SUPABASE_URL not configured");
    if (!supabaseAnonKey) throw new Error("SUPABASE_ANON_KEY not configured");
    if (!serviceRoleKey) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");
    }

    const body = await req.json();
    const name = String(body?.name || "").trim();
    const email = String(body?.email || "").trim();
    const phone = String(body?.phone || "").trim();
    const storeDescription = String(
      body?.store_description || body?.description || "",
    ).trim();
    const avatar = String(body?.avatar || body?.avatar_url || "").trim();

    if (!name) throw new Error("name is required");
    if (!email) throw new Error("email is required");

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: req.headers.get("Authorization") || "" },
      },
    });
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      throw new Error("Authentication required");
    }

    const writeClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: existingSeller, error: existingError } = await writeClient
      .from("express_sellers")
      .select(sellerSelect)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message || "failed_lookup_seller");
    }

    if (existingSeller) {
      return new Response(
        JSON.stringify({
          success: true,
          data: { seller: existingSeller, created: false },
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    const baseSlug = slugify(name);
    const suffix = user.id.slice(0, 6);

    const buildPayload = (sellerName, sellerSlug) => ({
      user_id: user.id,
      name: sellerName,
      slug: sellerSlug,
      email,
      phone: phone || null,
      avatar: avatar || null,
      store_description: storeDescription || null,
      is_active: true,
    });

    const attempts = [
      buildPayload(name, baseSlug),
      buildPayload(`${name}-${suffix}`, `${baseSlug}-${suffix}`),
    ];

    let seller = null;
    let lastError = null;

    for (const payload of attempts) {
      const { data, error } = await writeClient
        .from("express_sellers")
        .insert(payload)
        .select(sellerSelect)
        .single();

      if (!error && data) {
        seller = data;
        break;
      }

      lastError = error;
      if (error?.code === "23505") {
        const { data: retrySeller } = await writeClient
          .from("express_sellers")
          .select(sellerSelect)
          .eq("user_id", user.id)
          .maybeSingle();

        if (retrySeller) {
          seller = retrySeller;
          break;
        }
      }
    }

    if (!seller) {
      throw new Error(lastError?.message || "failed_create_seller");
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: { seller, created: true },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    console.error("[create_seller] request.error", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || String(error),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      },
    );
  }
});