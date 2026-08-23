-- Per-seller WhatsApp Business / Meta Commerce catalog connection.
-- Stores the seller's WABA access token + catalog id so the
-- sync-whatsapp-catalog edge function can pull their catalog into
-- express_products. The token is read only by the service-role function
-- (never the anon client), so RLS blocks public reads.

CREATE TABLE IF NOT EXISTS public.seller_meta_connections (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  seller_id uuid NOT NULL,
  waba_access_token text NOT NULL,
  meta_catalog_id text NOT NULL,
  waba_business_id text,
  waba_phone_number_id text,
  meta_page_id text,
  meta_app_id text,
  catalog_name text,
  last_synced_at timestamptz,
  last_sync_status text DEFAULT 'pending',
  last_sync_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seller_meta_connections_pkey PRIMARY KEY (id),
  CONSTRAINT seller_meta_connections_seller_id_key UNIQUE (seller_id)
);

-- FK added with a guard because Postgres has no ADD CONSTRAINT IF NOT EXISTS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'seller_meta_connections_seller_id_fkey'
      AND conrelid = 'public.seller_meta_connections'::regclass
  ) THEN
    ALTER TABLE public.seller_meta_connections
      ADD CONSTRAINT seller_meta_connections_seller_id_fkey
      FOREIGN KEY (seller_id) REFERENCES public.express_sellers(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_seller_meta_connections_seller_id
  ON public.seller_meta_connections (seller_id);

ALTER TABLE public.seller_meta_connections ENABLE ROW LEVEL SECURITY;

-- Sellers may read/write only their own connection row.
DROP POLICY IF EXISTS "Owner read meta connection" ON public.seller_meta_connections;
CREATE POLICY "Owner read meta connection"
  ON public.seller_meta_connections FOR SELECT
  TO authenticated
  USING (seller_id IN (
    SELECT id FROM public.express_sellers WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Owner write meta connection" ON public.seller_meta_connections;
CREATE POLICY "Owner write meta connection"
  ON public.seller_meta_connections FOR ALL
  TO authenticated
  USING (seller_id IN (
    SELECT id FROM public.express_sellers WHERE user_id = auth.uid()
  ))
  WITH CHECK (seller_id IN (
    SELECT id FROM public.express_sellers WHERE user_id = auth.uid()
  ));

-- Service role (edge function) has full access.
DROP POLICY IF EXISTS "Service meta connection" ON public.seller_meta_connections;
CREATE POLICY "Service meta connection"
  ON public.seller_meta_connections FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Keep updated_at fresh.
DROP TRIGGER IF EXISTS trg_touch_seller_meta_connections ON public.seller_meta_connections;
CREATE TRIGGER trg_touch_seller_meta_connections
  BEFORE UPDATE ON public.seller_meta_connections
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
