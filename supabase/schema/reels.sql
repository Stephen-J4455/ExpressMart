-- Reels feature: vertical short-video product showcases.
-- Videos are stored on Cloudflare R2; this table keeps the public URL and the
-- original R2 object key plus lightweight product metadata for the feed.

CREATE TABLE IF NOT EXISTS public.reels (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid,
  seller_id uuid,
  product_id uuid,
  video_url text NOT NULL,
  r2_key text NOT NULL,
  thumbnail_url text,
  title text NOT NULL,
  description text,
  price numeric DEFAULT 0 CHECK (price >= 0::numeric),
  category text,
  tags text[] DEFAULT '{}'::text[],
  views integer DEFAULT 0,
  likes integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT reels_pkey PRIMARY KEY (id),
  CONSTRAINT reels_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT reels_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.express_sellers(id),
  CONSTRAINT reels_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.express_products(id)
);

CREATE INDEX IF NOT EXISTS reels_created_at_idx ON public.reels (created_at DESC);
CREATE INDEX IF NOT EXISTS reels_seller_id_idx ON public.reels (seller_id);
CREATE INDEX IF NOT EXISTS reels_category_idx ON public.reels (category);

-- Enable RLS and allow authenticated users to read active reels and insert
-- their own reels. Tighten these policies as needed for your security model.
ALTER TABLE public.reels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active reels" ON public.reels;
CREATE POLICY "Public can view active reels"
  ON public.reels FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Users can insert their own reels" ON public.reels;
CREATE POLICY "Users can insert their own reels"
  ON public.reels FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own reels" ON public.reels;
CREATE POLICY "Users can update their own reels"
  ON public.reels FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own reels" ON public.reels;
CREATE POLICY "Users can delete their own reels"
  ON public.reels FOR DELETE
  USING (auth.uid() = user_id);