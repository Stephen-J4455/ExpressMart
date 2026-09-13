-- scheduled-notifications-cleanup.sql
--
-- Adds management columns to express_scheduled_notifications and a
-- helper SQL function for safe image cleanup. Apply once, then use the
-- admin "Scheduled" screen to manage the queue from there.
--
-- Run this in the Supabase SQL editor (idempotent — safe to re-run).

-- ── 1. Track the previous image URL on edit ────────────────────────────────
-- When the admin edits a scheduled push and replaces the image, the old
-- image becomes a candidate for deletion. We capture it on this column
-- so the cleanup pass knows which R2 object to try to remove. The
-- cleanup pass is "safe" — it only deletes the object if no other row
-- still references the URL.
ALTER TABLE public.express_scheduled_notifications
  ADD COLUMN IF NOT EXISTS previous_image_url text;

-- ── 2. Reference-count helper for image cleanup ───────────────────────────
-- Returns the number of rows in express_scheduled_notifications whose
-- image_url or previous_image_url column equals the given URL. A safe
-- delete only fires the R2 DELETE when this count is 0.
--
-- We pass the URL as a function argument so the admin client can call
-- this from RLS-safe code (the function is SECURITY DEFINER; the calling
-- user just needs EXECUTE privilege). The function reads only from
-- express_scheduled_notifications, which already has RLS for
-- admin/seller — since this function runs as the function owner, we
-- bypass RLS. That's intentional: image cleanup is a system job.
CREATE OR REPLACE FUNCTION public.count_image_references(p_url text)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT count(*)::bigint
  FROM public.express_scheduled_notifications
  WHERE image_url = p_url
     OR previous_image_url = p_url;
$$;

REVOKE ALL ON FUNCTION public.count_image_references(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_image_references(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_image_references(text) TO service_role;
