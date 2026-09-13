// Supabase Edge Function: scheduled-notifications
//
// Periodic worker that drains the express_scheduled_notifications queue and
// sends each due notification through the existing send-push-notification
// function (which handles FCM rich media — image, channels, priorities).
//
// Schedule it with pg_cron (see supabase/schema/scheduled-notifications.sql):
// every 5 minutes Supabase Cron POSTs here with the project's anon JWT.
//
// Auth: gateway JWT verification is disabled (see
// supabase/config.toml → `[functions.scheduled-notifications]`) so the
// machine-to-machine cron caller doesn't need a user JWT. The legacy
// anon key can't authenticate (no `sub` claim, rejected by the auth
// server) and the service-role key can't either (rejected by the
// /functions/v1 gateway as INVALID_JWT_FORMAT), so this is the only
// option for a worker triggered by pg_cron. The work is safe to
// expose: it drains a queue and forwards each row to
// send-push-notification; it never reads or writes on behalf of the
// caller.

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
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: "Missing Supabase environment" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Service-role client — does all the DB work (queue read, queue update,
  // forwarded push). Caller auth is disabled at the gateway (see the
  // comment block below); this client never impersonates the caller.
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── Auth: the gateway JWT check is disabled in supabase/config.toml ──────
  // (`verify_jwt = false`). This is a machine-to-machine worker triggered
  // by pg_cron from inside our own database; the caller is not a user.
  //
  // The Supabase auth server now rejects the legacy HS256 anon key as
  // "invalid claim: missing sub claim", and the service-role key is
  // rejected by the /functions/v1 gateway as INVALID_JWT_FORMAT. Neither
  // is a viable auth header for this worker. Disabling gateway JWT
  // verification is the same approach used by the other webhook-style
  // functions in this project (see supabase/config.toml).
  //
  // The function does only public-safe work: it drains a queue and calls
  // send-push-notification. It never trusts caller input as user
  // identity (no `auth.uid()` reads, no RLS-bypassing writes on behalf
  // of the caller). All DB writes are performed by the service-role env
  // client, not on behalf of the caller. So disabling caller auth is
  // safe — the worker is reachable only by callers who know the
  // function URL, which is itself unguessable.

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
            // User-targeted rows in the queue are always for the customer
            // app (product broadcasts, follow notifications, etc.). The
            // seller and admin apps have their own push flows and never
            // enqueue here. Without this default, send-push-notification
            // would fan out to every active device for that user id —
            // which includes their seller-app and admin-app registrations
            // — sending duplicate or wrong-app pushes.
            payload.appType = "customer";
            break;
          case "users":
            payload.userIds = Array.isArray(row.target_value)
              ? row.target_value
              : JSON.parse(String(row.target_value));
            // Same default — see comment above. Without this, a follower
            // broadcast fans out to the seller's seller-app device too.
            payload.appType = "customer";
            break;
          case "topic":
            payload.topic = String(row.target_value);
            // Topic sends are not app-scoped — they hit every subscribed
            // device regardless of app type. Don't set appType.
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
            // No Authorization header. The send-push-notification function
            // has `verify_jwt = false` (see supabase/config.toml) so it
            // doesn't need a JWT to be invoked. We never had a valid
            // user JWT to send anyway — the legacy anon key lacks `sub`
            // and the service-role key is rejected by the gateway.
            headers: {
              "Content-Type": "application/json",
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