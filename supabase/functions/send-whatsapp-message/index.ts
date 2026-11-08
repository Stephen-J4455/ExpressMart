import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Send a WhatsApp message to a store/seller when an order is placed.
 *
 * Uses the WhatsApp Cloud API (Meta Graph API) to send a templated order
 * notification to the seller's WhatsApp Business phone number.
 *
 * Required edge-function secrets:
 *   WHATSAPP_TOKEN        — WhatsApp Cloud API access token
 *   WHATSAPP_PHONE_NUMBER_ID — the phone number ID used to send messages
 *   WHATSAPP_TEMPLATE_NAME — order notification template name (default: "order_notification")
 *   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — for DB writes
 *
 * Request body:
 *   { order_id, seller_id, to_phone, order_number, amount, items?, store_name? }
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const whatsappToken = Deno.env.get("WHATSAPP_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const templateName = Deno.env.get("WHATSAPP_TEMPLATE_NAME") || "order_notification";

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Supabase not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const {
    order_id,
    seller_id,
    to_phone,
    order_number,
    amount,
    items,
    store_name,
  } = body;

  if (!to_phone) {
    return new Response(JSON.stringify({ error: "Missing to_phone" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Normalize phone: strip non-digits, ensure country code prefix.
  const digits = String(to_phone).replace(/\D/g, "");
  const to = digits.startsWith("233") ? digits : `233${digits}`;

  // Insert a pending log row first so we have a record even if send fails.
  let logId: string | null = null;
  try {
    const { data: log, error: logError } = await supabase
      .from("whatsapp_message_logs")
      .insert({
        order_id,
        seller_id,
        to_phone: to,
        message: `New order #${order_number || "N/A"} for GHS ${amount ?? 0}`,
        status: "pending",
      })
      .select("id")
      .single();

    if (logError) throw logError;
    logId = log.id;
  } catch (logErr) {
    console.error("❌ Failed to insert whatsapp log:", logErr);
    // Continue anyway — we can still attempt to send.
  }

  // If WhatsApp credentials aren't configured, mark as failed and return gracefully.
  if (!whatsappToken || !phoneNumberId) {
    const msg = "WhatsApp Cloud API not configured";
    console.warn("⚠️", msg);
    if (logId) {
      await supabase
        .from("whatsapp_message_logs")
        .update({ status: "failed", error: msg })
        .eq("id", logId);
    }
    return new Response(
      JSON.stringify({ success: false, error: msg, logId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Build the WhatsApp Cloud API template payload.
  // The template must be approved in Meta and use {{1}} for order number,
  // {{2}} for amount, {{3}} for store name.
  const components: any[] = [
    {
      type: "body",
      parameters: [
        { type: "text", text: order_number || "N/A" },
        { type: "text", text: `GHS ${amount ?? 0}` },
        { type: "text", text: store_name || "Your store" },
      ],
    },
  ];

  // Optional: add a button component for quick reply / order detail link.
  if (order_id) {
    components.push({
      type: "button",
      sub_type: "url",
      index: 0,
      parameters: [{ type: "text", text: `tagit://orders/${order_id}` }],
    });
  }

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: "en" },
      components,
    },
  };

  let providerMessageId: string | null = null;
  let sendError: string | null = null;

  try {
    const res = await fetch(
      `${GRAPH_BASE}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${whatsappToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    const result = await res.json();

    if (!res.ok) {
      sendError = result.error?.message || `HTTP ${res.status}`;
      console.error("❌ WhatsApp send failed:", sendError, result);
    } else {
      providerMessageId = result.messages?.[0]?.id ?? null;
      console.log("✅ WhatsApp message sent:", providerMessageId);
    }
  } catch (err) {
    sendError = err?.message || String(err);
    console.error("❌ WhatsApp send exception:", sendError);
  }

  // Update the log row with the outcome.
  if (logId) {
    await supabase
      .from("whatsapp_message_logs")
      .update({
        status: sendError ? "failed" : "sent",
        provider_message_id: providerMessageId,
        error: sendError,
        updated_at: new Date().toISOString(),
      })
      .eq("id", logId);
  }

  return new Response(
    JSON.stringify({
      success: !sendError,
      error: sendError,
      logId,
      provider_message_id: providerMessageId,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
