-- Migration: category images + coupons support
-- Adds image support to express_categories and ensures the coupons table
-- matches what the admin Marketing screen (Coupons tab) expects.
-- Idempotent: safe to run multiple times.

-- ── 1. Category image column ────────────────────────────────────────────────
ALTER TABLE public.express_categories
  ADD COLUMN IF NOT EXISTS image_url text;

-- ── 2. Coupons table (create if missing, then align columns) ────────────────
CREATE TABLE IF NOT EXISTS public.express_coupons (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  code text NOT NULL UNIQUE,
  description text,
  discount_type text NOT NULL DEFAULT 'percentage'
    CHECK (discount_type = ANY (ARRAY['percentage'::text, 'fixed'::text])),
  discount_value numeric NOT NULL,
  min_order_amount numeric DEFAULT 0,
  max_discount_amount numeric,
  usage_limit integer,
  usage_count integer DEFAULT 0,
  user_limit integer DEFAULT 1,
  seller_id uuid,
  category_id uuid,
  valid_from timestamp with time zone NOT NULL DEFAULT now(),
  valid_until timestamp with time zone,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT express_coupons_pkey PRIMARY KEY (id),
  CONSTRAINT express_coupons_seller_id_fkey
    FOREIGN KEY (seller_id) REFERENCES public.express_sellers(id),
  CONSTRAINT express_coupons_category_id_fkey
    FOREIGN KEY (category_id) REFERENCES public.express_categories(id)
);

-- Columns the admin UI reads/writes that may be missing on older tables
ALTER TABLE public.express_coupons ADD COLUMN IF NOT EXISTS max_uses integer;
ALTER TABLE public.express_coupons ADD COLUMN IF NOT EXISTS current_uses integer DEFAULT 0;
ALTER TABLE public.express_coupons ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone;
ALTER TABLE public.express_coupons ADD COLUMN IF NOT EXISTS min_order_amount numeric DEFAULT 0;

-- Backfill legacy column names if both exist
UPDATE public.express_coupons
SET max_uses = usage_limit
WHERE max_uses IS NULL AND usage_limit IS NOT NULL;

UPDATE public.express_coupons
SET current_uses = usage_count
WHERE current_uses IS NULL AND usage_count IS NOT NULL;

UPDATE public.express_coupons
SET expires_at = valid_until
WHERE expires_at IS NULL AND valid_until IS NOT NULL;

-- ── 3. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.express_coupons ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'express_coupons' AND policyname = 'coupons_read_all'
  ) THEN
    CREATE POLICY coupons_read_all ON public.express_coupons
      FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'express_coupons' AND policyname = 'coupons_admin_write'
  ) THEN
    CREATE POLICY coupons_admin_write ON public.express_coupons
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.express_profiles p
          WHERE p.id = auth.uid() AND p.role IN ('admin', 'seller')
        )
      );
  END IF;
END $$;

-- ── 4. Storage: category images bucket ──────────────────────────────────────
-- Category images are uploaded to the existing "ad-images" bucket.
-- Ensure public read access (run once in SQL editor if not already set):
INSERT INTO storage.buckets (id, name, public)
VALUES ('ad-images', 'ad-images', true)
ON CONFLICT (id) DO NOTHING;
