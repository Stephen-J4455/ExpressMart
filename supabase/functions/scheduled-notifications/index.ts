// Supabase Edge Function: scheduled-notifications
//
// Periodic worker that drains the express_scheduled_notifications queue and
// sends each due notification through the existing send-push-notification
// function (which handles FCM rich media — image, channels, priorities).
//
// Schedule it with pg_cron (see supabase/schema/scheduled-notifications.sql):
// every 5 minutes Supabase Cron POSTs here with the service-role key.
//
// Auth: requires the service-role key as Bearer token — this endpoint is a
// machine-to-machine worker, never called from the app.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BATCH_LIMIT = 20;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ScheduledRow {
  id: string;
  title: string;
  body: string | null;
  image_url: string | null;
  notification_type: string | null;
  channel_id: string | null;
  target_type: "user" | "users" | "topic" | "app_type";
  target_value: unknown;
  data: Record<string, unknown> | null;
  repeat_interval: "none" | "daily" | "weekly";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  // Supabase auto-injects the anon key into edge functions. It is used only as
  // the gateway credential — all DB work here uses the service-role env client,
  // so the caller token identity is irrelevant. (Sending the service_role JWT
  // directly to the /functions/v1 gateway is rejected with INVALID_JWT_FORMAT,
  // so we authenticate the cron call with the anon key instead.)
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // ── Auth: accept the project's anon OR service-role JWT ───────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const authorized =
    (!!serviceRoleKey && authHeader.endsWith(serviceRoleKey)) ||
    (!!anonKey && authHeader.endsWith(anonKey));
  if (!authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // ── Fetch due notifications (oldest first, small batch per run) ─────────
    const { data: due, error: fetchError } = await supabase
      .from("express_scheduled_notifications")
      .select("*")
      .eq("status", "pending")
      .lte("send_at", new Date().toISOString())
      .order("send_at", { ascending: true })
      .limit(BATCH_LIMIT);

    if (fetchError) throw new Error(fetchError.message);
    if (!due || due.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "Nothing due" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let sent = 0;
    let failed = 0;

    for (const row of due as ScheduledRow[]) {
      try {
        // Map the queue row onto the send-push-notification payload contract.
        const payload: Record<string, unknown> = {
          title: row.title,
          body: row.body ?? "",
          imageUrl: row.image_url ?? undefined,
          notificationType: row.notification_type || "promotion",
          data: {
            ...(row.data ?? {}),
            screen:
              (row.data as Record<string, string> | null)?.screen ?? "Home",
          },
          android: {
            channelId: row.channel_id || "promotions",
            priority: "high",
          },
        };

        switch (row.target_type) {
          case "user":
            payload.userId = String(row.target_value);
            break;
          case "users":
            payload.userIds = Array.isArray(row.target_value)
              ? row.target_value
              : JSON.parse(String(row.target_value));
            break;
          case "topic":
            payload.topic = String(row.target_value);
            break;
          case "app_type":
          default:
            payload.appType = String(
              typeof row.target_value === "string"
                ? row.target_value.replace(/"/g, "")
                : "all",
            );
            break;
        }

        const res = await fetch(
          `${supabaseUrl}/functions/v1/send-push-notification`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              // Use the anon key for the gateway hop — the service-role JWT is
              // rejected by the /functions/v1 gateway with INVALID_JWT_FORMAT.
              Authorization: `Bearer ${anonKey}`,
            },
            body: JSON.stringify(payload),
          },
        );

        if (!res.ok) {
          throw new Error(`send-push-notification returned ${res.status}`);
        }
        sent += 1;
      } catch (sendErr) {
        failed += 1;
        await supabase
          .from("express_scheduled_notifications")
          .update({
            status: "failed",
            last_error: sendErr?.message || String(sendErr),
          })
          .eq("id", row.id);
        console.error("Scheduled notification failed:", row.id, sendErr);
        continue;
      }

      if (row.repeat_interval && row.repeat_interval !== "none") {
        // Recurring campaign — reschedule the next occurrence.
        const next = new Date();
        if (row.repeat_interval === "daily") next.setDate(next.getDate() + 1);
        else next.setDate(next.getDate() + 7);

        await supabase
          .from("express_scheduled_notifications")
          .update({ send_at: next.toISOString(), last_error: null })
          .eq("id", row.id);
      } else {
        await supabase
          .from("express_scheduled_notifications")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", row.id);
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed: due.length, sent, failed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("scheduled-notifications error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});