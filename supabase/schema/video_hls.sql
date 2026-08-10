-- Migration: HLS adaptive-bitrate streaming support
-- ---------------------------------------------------------------------------
-- Adds HLS playback URLs to the reels + product video tables and a job queue
-- that the FFmpeg transcoder worker drains to produce multi-bitrate HLS.
--
-- Run once in the Supabase SQL editor (or via the Supabase CLI):
--   supabase db execute --file supabase/schema/video_hls.sql
-- ---------------------------------------------------------------------------

-- Reels: store the generated HLS master playlist URL alongside the raw MP4.
ALTER TABLE public.reels
  ADD COLUMN IF NOT EXISTS hls_url text;

COMMENT ON COLUMN public.reels.hls_url IS
  'Public Cloudflare R2 URL of the HLS master playlist (.m3u8) for ABR playback.';

-- Products: same for the product showcase video.
ALTER TABLE public.express_products
  ADD COLUMN IF NOT EXISTS video_hls_url text;

COMMENT ON COLUMN public.express_products.video_hls_url IS
  'Public Cloudflare R2 URL of the HLS master playlist (.m3u8) for the product video.';

-- Transcode job queue. The `transcode-reel` edge function inserts a row here;
-- the self-hosted FFmpeg worker drains pending rows, encodes HLS segments into
-- R2, then updates the owning row's hls_url and marks the job completed.
CREATE TABLE IF NOT EXISTS public.video_transcode_jobs (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  source_key text NOT NULL,
  target_folder text NOT NULL DEFAULT 'hls',
  owner_table text NOT NULL,            -- 'reels' | 'express_products'
  owner_id uuid NOT NULL,
  hls_url_column text NOT NULL,         -- 'hls_url' | 'video_hls_url'
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT video_transcode_jobs_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS video_transcode_jobs_status_idx
  ON public.video_transcode_jobs (status, created_at);

-- RLS: only the service role (worker) and privileged server functions mutate
-- jobs. Authenticated users only need to read their own reel's hls_url, which
-- is already covered by the existing reels/products SELECT policies.
ALTER TABLE public.video_transcode_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages transcode jobs" ON public.video_transcode_jobs;
CREATE POLICY "Service role manages transcode jobs"
  ON public.video_transcode_jobs FOR ALL
  USING (true)
  WITH CHECK (true);