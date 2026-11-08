-- Social media ecosystem features for Tagit
-- Product tagging in statuses, hashtag discovery, cross-platform sharing.

-- 1. Product tags on seller statuses (like Instagram story product tags).
--    Lets a seller tag a product in their status so viewers can tap to buy.
CREATE TABLE IF NOT EXISTS public.status_product_tags (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  status_id uuid NOT NULL REFERENCES public.express_seller_statuses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.express_products(id) ON DELETE CASCADE,
  x_position numeric NOT NULL DEFAULT 50,   -- 0-100 horizontal position
  y_position numeric NOT NULL DEFAULT 50,   -- 0-100 vertical position
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT status_product_tags_pkey PRIMARY KEY (id),
  CONSTRAINT status_product_tags_status_id_product_id_key UNIQUE (status_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_status_product_tags_status_id
  ON public.status_product_tags (status_id);
CREATE INDEX IF NOT EXISTS idx_status_product_tags_product_id
  ON public.status_product_tags (product_id);

ALTER TABLE public.status_product_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read status product tags" ON public.status_product_tags;
CREATE POLICY "Public read status product tags"
  ON public.status_product_tags FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Seller write own status product tags" ON public.status_product_tags;
CREATE POLICY "Seller write own status product tags"
  ON public.status_product_tags FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.express_seller_statuses s
      WHERE s.id = status_id
        AND s.seller_id IN (
          SELECT id FROM public.express_sellers WHERE user_id = auth.uid()
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.express_seller_statuses s
      WHERE s.id = status_id
        AND s.seller_id IN (
          SELECT id FROM public.express_sellers WHERE user_id = auth.uid()
        )
    )
  );

-- 2. Hashtags for product and status discovery.
CREATE TABLE IF NOT EXISTS public.hashtags (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  tag text NOT NULL UNIQUE,        -- e.g. 'fashion', 'ghana-made'
  post_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hashtags_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_hashtags_tag ON public.hashtags (tag);

ALTER TABLE public.hashtags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read hashtags" ON public.hashtags;
CREATE POLICY "Public read hashtags"
  ON public.hashtags FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Service write hashtags" ON public.hashtags;
CREATE POLICY "Service write hashtags"
  ON public.hashtags FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3. Product-to-hashtag many-to-many linking.
CREATE TABLE IF NOT EXISTS public.product_hashtags (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  product_id uuid NOT NULL REFERENCES public.express_products(id) ON DELETE CASCADE,
  hashtag_id uuid NOT NULL REFERENCES public.hashtags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_hashtags_pkey PRIMARY KEY (id),
  CONSTRAINT product_hashtags_product_id_hashtag_id_key UNIQUE (product_id, hashtag_id)
);

CREATE INDEX IF NOT EXISTS idx_product_hashtags_product_id
  ON public.product_hashtags (product_id);
CREATE INDEX IF NOT EXISTS idx_product_hashtags_hashtag_id
  ON public.product_hashtags (hashtag_id);

ALTER TABLE public.product_hashtags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read product hashtags" ON public.product_hashtags;
CREATE POLICY "Public read product hashtags"
  ON public.product_hashtags FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Seller write product hashtags" ON public.product_hashtags;
CREATE POLICY "Seller write product hashtags"
  ON public.product_hashtags FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.express_products p
      WHERE p.id = product_id
        AND p.seller_id IN (
          SELECT id FROM public.express_sellers WHERE user_id = auth.uid()
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.express_products p
      WHERE p.id = product_id
        AND p.seller_id IN (
          SELECT id FROM public.express_sellers WHERE user_id = auth.uid()
        )
    )
  );

-- 4. Status-to-hashtag linking (hashtags in status text).
CREATE TABLE IF NOT EXISTS public.status_hashtags (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  status_id uuid NOT NULL REFERENCES public.express_seller_statuses(id) ON DELETE CASCADE,
  hashtag_id uuid NOT NULL REFERENCES public.hashtags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT status_hashtags_pkey PRIMARY KEY (id),
  CONSTRAINT status_hashtags_status_id_hashtag_id_key UNIQUE (status_id, hashtag_id)
);

CREATE INDEX IF NOT EXISTS idx_status_hashtags_status_id
  ON public.status_hashtags (status_id);
CREATE INDEX IF NOT EXISTS idx_status_hashtags_hashtag_id
  ON public.status_hashtags (hashtag_id);

ALTER TABLE public.status_hashtags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read status hashtags" ON public.status_hashtags;
CREATE POLICY "Public read status hashtags"
  ON public.status_hashtags FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Seller write own status hashtags" ON public.status_hashtags;
CREATE POLICY "Seller write own status hashtags"
  ON public.status_hashtags FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.express_seller_statuses s
      WHERE s.id = status_id
        AND s.seller_id IN (
          SELECT id FROM public.express_sellers WHERE user_id = auth.uid()
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.express_seller_statuses s
      WHERE s.id = status_id
        AND s.seller_id IN (
          SELECT id FROM public.express_sellers WHERE user_id = auth.uid()
        )
    )
  );

-- 5. Cross-platform share events (analytics for sharing to IG/FB/Twitter/WA).
CREATE TABLE IF NOT EXISTS public.share_events (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid,
  seller_id uuid,
  share_type text NOT NULL,        -- 'product' | 'store' | 'status' | 'reel'
  share_target_id uuid,            -- id of the thing shared
  platform text NOT NULL,          -- 'instagram' | 'facebook' | 'twitter' | 'whatsapp' | 'messenger'
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT share_events_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_share_events_platform
  ON public.share_events (platform);
CREATE INDEX IF NOT EXISTS idx_share_events_created_at
  ON public.share_events (created_at DESC);

ALTER TABLE public.share_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read share events" ON public.share_events;
CREATE POLICY "Public read share events"
  ON public.share_events FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated insert share events" ON public.share_events;
CREATE POLICY "Authenticated insert share events"
  ON public.share_events FOR INSERT
  TO authenticated
  WITH CHECK (true);
