-- Migration: add product video columns
-- ---------------------------------------------------------------------------
-- Lets sellers attach a promotional/showcase video to a product. The video is
-- uploaded directly to Cloudflare R2 (via the `get-r2-upload-url` edge
-- function) and only its public URL is stored here.
--
-- Run this once in the Supabase SQL editor (or via the Supabase CLI):
--   supabase db execute --file supabase/schema/product_video.sql
-- ---------------------------------------------------------------------------

ALTER TABLE public.express_products
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS r2_video_key text;

COMMENT ON COLUMN public.express_products.video_url IS
  'Public Cloudflare R2 URL of the product showcase video.';
COMMENT ON COLUMN public.express_products.r2_video_key IS
  'R2 object key of the product video (useful for later deletion).';