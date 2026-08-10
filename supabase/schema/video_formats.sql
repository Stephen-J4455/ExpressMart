-- Migration: video_formats
-- ---------------------------------------------------------------------------
-- Stores every transcoded output produced by the Node transcoding server
-- (scripts/transcode-server) for a given reel or product video. Each row is
-- one playable variant: source MP4, H.264 MP4, VP9 WebM, or an HLS playlist
-- (master or per-rendition). Raw HLS .ts segments are referenced by the
-- playlists and are NOT recorded individually.
--
-- Safe to re-run (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- Run in the Supabase SQL editor, or via the CLI:
--   supabase db execute --file supabase/schema/video_formats.sql
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.video_formats (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  owner_table text NOT NULL,            -- 'reels' | 'express_products'
  owner_id uuid NOT NULL,               -- id of the reel/product row
  job_id uuid,                          -- links rows from one transcode run
  format text NOT NULL,                 -- 'source' | 'mp4' | 'webm' | 'hls'
  codec text NOT NULL,                  -- 'original' | 'h264' | 'vp9' | 'm3u8' | 'ts'
  rendition text,                       -- '360p'..'1080p' for HLS, else null
  url text NOT NULL,                    -- public R2/CDN URL
  r2_key text NOT NULL,                 -- R2 object key
  content_type text NOT NULL,
  is_master boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT video_formats_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS video_formats_owner_idx
  ON public.video_formats (owner_table, owner_id);
CREATE INDEX IF NOT EXISTS video_formats_job_idx
  ON public.video_formats (job_id);

-- RLS: service role (transcode server) manages rows; authenticated users can
-- read formats for publicly visible reels/products via the existing policies.
ALTER TABLE public.video_formats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages video_formats" ON public.video_formats;
CREATE POLICY "Service role manages video_formats"
  ON public.video_formats FOR ALL
  USING (true)
  WITH CHECK (true);