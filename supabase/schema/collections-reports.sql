-- ── Collections ──────────────────────────────────────────────────────────
-- User-curated lists of products. The owner decides which products to save
-- together (think Pinterest boards for shopping). Used by the FeedProductCard
-- "Add to collection" menu action.
CREATE TABLE IF NOT EXISTS public.express_collections (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  cover_image text,
  is_private boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT express_collections_pkey PRIMARY KEY (id),
  CONSTRAINT express_collections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS express_collections_user_idx
  ON public.express_collections (user_id, created_at DESC);

-- Items inside a collection. Unique per (collection, product) so a product
-- cannot be added twice to the same collection.
CREATE TABLE IF NOT EXISTS public.express_collection_items (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  collection_id uuid NOT NULL,
  product_id uuid NOT NULL,
  added_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT express_collection_items_pkey PRIMARY KEY (id),
  CONSTRAINT express_collection_items_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.express_collections(id) ON DELETE CASCADE,
  CONSTRAINT express_collection_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.express_products(id) ON DELETE CASCADE,
  CONSTRAINT express_collection_items_unique UNIQUE (collection_id, product_id)
);

CREATE INDEX IF NOT EXISTS express_collection_items_product_idx
  ON public.express_collection_items (product_id);

-- ── Listing reports ───────────────────────────────────────────────────────
-- User-submitted reports against individual product listings. Used by the
-- FeedProductCard "Report listing" menu action. Admin/Marketing screens can
-- later read this to triage abuse. RLS keeps the table owner-scoped for INSERT
-- and SELECT so other users can't see what was reported.
CREATE TABLE IF NOT EXISTS public.express_listing_reports (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  product_id uuid NOT NULL,
  seller_id uuid,
  reason text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'reviewed', 'actioned', 'dismissed')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT express_listing_reports_pkey PRIMARY KEY (id),
  CONSTRAINT express_listing_reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT express_listing_reports_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.express_products(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS express_listing_reports_product_idx
  ON public.express_listing_reports (product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS express_listing_reports_user_idx
  ON public.express_listing_reports (user_id, created_at DESC);

-- ── Row Level Security ────────────────────────────────────────────────────
-- Default to owner-scoped access for collections & reports. The marketing
-- dashboard reads through a service-role key, so we don't need a public read
-- policy here.

ALTER TABLE public.express_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.express_collection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.express_listing_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own collections" ON public.express_collections;
CREATE POLICY "Users manage their own collections"
  ON public.express_collections FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Collection items: the owner of the parent collection may manage items.
-- We check ownership through a subquery against express_collections so users
-- can't add items to other people's collections.
DROP POLICY IF EXISTS "Collection owners manage items" ON public.express_collection_items;
CREATE POLICY "Collection owners manage items"
  ON public.express_collection_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.express_collections c
      WHERE c.id = collection_id AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.express_collections c
      WHERE c.id = collection_id AND c.user_id = auth.uid()
    )
  );

-- Reports: only the reporting user can read their own report rows. INSERT is
-- also owner-scoped so anonymous traffic can't fabricate reports on behalf
-- of someone else.
DROP POLICY IF EXISTS "Users manage their own listing reports" ON public.express_listing_reports;
CREATE POLICY "Users manage their own listing reports"
  ON public.express_listing_reports FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- `updated_at` trigger for collections so a touch on the row updates the
-- timestamp automatically. We piggy-back on the existing `moddatetime`
-- extension if it's installed; otherwise fall back to a plain trigger.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'moddatetime'
  ) THEN
    EXECUTE $tg$
      CREATE OR REPLACE TRIGGER express_collections_touch_updated
        BEFORE UPDATE ON public.express_collections
        FOR EACH ROW
        EXECUTE PROCEDURE moddatetime(updated_at);
    $tg$;
  ELSE
    EXECUTE $tg$
      CREATE OR REPLACE FUNCTION public.express_collections_touch_updated()
      RETURNS trigger AS $fn$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $fn$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS express_collections_touch_updated
        ON public.express_collections;
      CREATE TRIGGER express_collections_touch_updated
        BEFORE UPDATE ON public.express_collections
        FOR EACH ROW
        EXECUTE PROCEDURE public.express_collections_touch_updated();
    $tg$;
  END IF;
END
$$;