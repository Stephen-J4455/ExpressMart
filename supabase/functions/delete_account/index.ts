import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      throw new Error("Supabase environment variables are not configured");
    }

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing bearer token" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Best-effort cleanup for common user-linked records to avoid FK conflicts.
    // Failures here are logged but won't block deletion if auth deletion succeeds.
    const cleanupOps = [
      adminClient.from("express_device_tokens").delete().eq("user_id", user.id),
      adminClient.from("express_follows").delete().eq("user_id", user.id),
      adminClient
        .from("express_chat_conversations")
        .delete()
        .eq("user_id", user.id),
      adminClient.from("express_addresses").delete().eq("user_id", user.id),
      adminClient.from("express_carts").delete().eq("user_id", user.id),
      adminClient
        .from("express_support_tickets")
        .delete()
        .eq("user_id", user.id),
      adminClient.from("express_sellers").delete().eq("user_id", user.id),
      adminClient.from("express_profiles").delete().eq("id", user.id),
    ];

    const cleanupResults = await Promise.allSettled(cleanupOps);
    cleanupResults.forEach((res, index) => {
      if (res.status === "fulfilled" && res.value?.error) {
        console.warn("delete_account cleanup warning", {
          opIndex: index,
          error: res.value.error,
        });
      }
      if (res.status === "rejected") {
        console.warn("delete_account cleanup rejected", {
          opIndex: index,
          reason: res.reason,
        });
      }
    });

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(
      user.id,
      true,
    );

    if (deleteError) {
      throw deleteError;
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("delete_account failed", message);

    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
