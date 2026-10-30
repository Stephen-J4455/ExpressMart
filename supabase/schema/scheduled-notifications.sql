-- scheduled-notifications.sql
--
-- ONE-SHOT setup for rich-push scheduling:
--   1. Enables the pg_cron + pg_net extensions (the cron worker depends on these)
--   2. Creates the express_scheduled_notifications queue (idempotent)
--   3. RLS: admins + sellers can manage the queue; the edge function runs with
--      the service role and bypasses RLS.
--   4. Schedules a pg_cron job that POSTs to the scheduled-notifications edge
--      function every 5 minutes, draining any due notifications.
--
-- ── BEFORE RUNNING ──────────────────────────────────────────────────────────
--   a) Deploy both functions:
--        supabase functions deploy send-push-notification
--        supabase functions deploy scheduled-notifications
--   b) In Supabase Dashboard → Edge Functions → set secrets:
--        FCM_PROJECT_ID            (your Firebase project id)
--        FCM_SERVICE_ACCOUNT_KEY  (the JSON service-account key)
--   c) Replace the two placeholders below:
--        <PROJECT_REF>      → your-project-ref  (from https://<PROJECT_REF>.supabase.co)
--        <SUPABASE_ANON_KEY> → Settings → API → the anon / public key (NOT the
--          service_role key — that JWT is rejected by the /functions/v1 gateway
--          with UNAUTHORIZED_INVALID_JWT_FORMAT). The anon key is safe to expose.
--   d) Test on a DEV BUILD / standalone build, NOT Expo Go. Expo push tokens
--      (ExponentPushToken[…]) are rejected by FCM — the app must register a
--      native device token (getDevicePushTokenAsync).
--
-- Run the whole file in the Supabase SQL editor (superuser, so extensions +
-- cron are allowed). It is safe to re-run.

-- 1. Extensions (cron worker depends on these)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Queue table
CREATE TABLE IF NOT EXISTS public.express_scheduled_notifications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  body text,
  image_url text,
  notification_type text NOT NULL DEFAULT 'promotion',
  channel_id text NOT NULL DEFAULT 'promotions',
  target_type text NOT NULL DEFAULT 'app_type'
    CHECK (target_type = ANY (ARRAY['user'::text, 'users'::text, 'topic'::text, 'app_type'::text])),
  target_value jsonb NOT NULL DEFAULT '"all"'::jsonb,
  data jsonb DEFAULT '{}'::jsonb,
  send_at timestamptz NOT NULL DEFAULT now(),
  repeat_interval text NOT NULL DEFAULT 'none'
    CHECK (repeat_interval = ANY (ARRAY['none'::text, 'daily'::text, 'weekly'::text])),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'cancelled'::text])),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS sched_notif_due_idx
  ON public.express_scheduled_notifications (status, send_at);

ALTER TABLE public.express_scheduled_notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'express_scheduled_notifications'
      AND policyname = 'admins_manage_scheduled_notifications'
  ) THEN
    CREATE POLICY admins_manage_scheduled_notifications
      ON public.express_scheduled_notifications
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.express_profiles p
          WHERE p.id = auth.uid() AND p.role IN ('admin', 'seller')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.express_profiles p
          WHERE p.id = auth.uid() AND p.role IN ('admin', 'seller')
        )
      );
  END IF;
END $$;

-- 3. Cron worker — remove any prior instance, then schedule every 5 minutes.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'send-scheduled-rich-notifications'
  ) THEN
    PERFORM cron.unschedule('send-scheduled-rich-notifications');
  END IF;
END $$;

SELECT cron.schedule(
  'send-scheduled-rich-notifications',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://meiljgoztnhnyvtfkzuh.supabase.co/functions/v1/scheduled-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1laWxqZ296dG5obnl2dGZrenVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxMTI0OTksImV4cCI6MjA4MDY4ODQ5OX0.X7zve3MSvaoplAHl45BpC57h9G4IY5suhBBteIoEU3I'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ── DIAGNOSTICS (run any time) ──────────────────────────────────────────────
-- How many queued items are waiting / failing?
--   SELECT status, count(*) FROM express_scheduled_notifications GROUP BY status;
--
-- Are any devices actually registered with a native FCM token?
--   SELECT app_type, is_active, count(*),
--          count(*) FILTER (WHERE fcm_token LIKE 'ExponentPushToken[%') AS expo_tokens
--   FROM express_device_tokens
--   GROUP BY app_type, is_active;
--
-- Did the cron job actually fire? (recent runs + outcome)
--   SELECT jobname, status, return_message, start_time
--   FROM cron.job_run_details
--   WHERE jobname = 'send-scheduled-rich-notifications'
--   ORDER BY start_time DESC LIMIT 10;
--
-- To unschedule later:
--   SELECT cron.unschedule('send-scheduled-rich-notifications');