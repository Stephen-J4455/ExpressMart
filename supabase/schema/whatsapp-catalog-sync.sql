-- WhatsApp / Meta catalog sync schema
-- Maps Tagit products to Meta Commerce catalog entries and logs
-- customer-intent events arriving via the WhatsApp webhook.

-- 1. Catalog mapping table (kept separate from express_products so the core
--    table stays untouched; 1:1 mapping via unique meta_retailer_id).
CREATE TABLE IF NOT EXISTS public.product_catalog_mappings (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  product_id uuid NOT NULL REFERENCES public.express_products(id) ON DELETE CASCADE,
  meta_retailer_id text NOT NULL,
  meta_catalog_id text,
  synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_catalog_mappings_pkey PRIMARY KEY (id),
  CONSTRAINT product_catalog_mappings_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES public.express_products(id) ON DELETE CASCADE,
  CONSTRAINT product_catalog_mappings_meta_retailer_id_key UNIQUE (meta_retailer_id)
);

-- Index for webhook lookups by retailer id.
CREATE INDEX IF NOT EXISTS idx_product_catalog_mappings_meta_retailer_id
  ON public.product_catalog_mappings (meta_retailer_id);
CREATE INDEX IF NOT EXISTS idx_product_catalog_mappings_product_id
  ON public.product_catalog_mappings (product_id);

-- 2. Customer-intent events from WhatsApp catalog interactions.
CREATE TABLE IF NOT EXISTS public.catalog_interactions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_phone text,
  product_id uuid REFERENCES public.express_products(id) ON DELETE SET NULL,
  event_type text NOT NULL, -- e.g. 'product_query', 'message', 'order'
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_interactions_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_catalog_interactions_product_id
  ON public.catalog_interactions (product_id);
CREATE INDEX IF NOT EXISTS idx_catalog_interactions_created_at
  ON public.catalog_interactions (created_at DESC);

-- 3. RLS: mappings are readable by anyone (needed for SKU deep-link lookups
--    through the anon client); writes are service-role only. Interactions are
--    insert-only via service role; no public reads (contains phone numbers).
ALTER TABLE public.product_catalog_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_interactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read catalog mappings" ON public.product_catalog_mappings;
CREATE POLICY "Public read catalog mappings"
  ON public.product_catalog_mappings FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Service write catalog mappings" ON public.product_catalog_mappings;
CREATE POLICY "Service write catalog mappings"
  ON public.product_catalog_mappings FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service insert interactions" ON public.catalog_interactions;
CREATE POLICY "Service insert interactions"
  ON public.catalog_interactions FOR INSERT
  TO service_role
  WITH CHECK (true);

-- 4. Keep updated_at fresh on mappings.
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_product_catalog_mappings ON public.product_catalog_mappings;
CREATE TRIGGER trg_touch_product_catalog_mappings
  BEFORE UPDATE ON public.product_catalog_mappings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
