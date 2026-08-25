-- ── Platform settings seeds ──────────────────────────────────────────────────
-- Run once against the Supabase project (SQL editor or migration).
--
-- 1. Seeds the platform settings used by:
--      • the Admin app  → Settings → Fees & Config (edit values)
--      • the AI edge function (ai_model → OpenRouter model id)
--      • Store registration flow (store_registration_fee)
-- 2. Cleans up the deprecated product charge (%):
--      • removes the `product_charge_percentage` settings row
--      • drops `express_products.charge_percentage`
--    The platform fee is computed solely from `service_fee_percentage`,
--    so the per-product charge snapshot is redundant.

INSERT INTO public.express_settings (key, value, description) VALUES
  ('ai_model', '"openai/gpt-4o-mini"'::jsonb,
    'OpenRouter model id used by the in-app AI assistant (e.g. openai/gpt-4o-mini, anthropic/claude-3.5-haiku).'),
  ('store_registration_fee', '150'::jsonb,
    'One-time store registration fee in GHS charged via Paystack.')
ON CONFLICT (key) DO NOTHING;

-- ── Deprecated product charge cleanup ───────────────────────────────────────
-- The service_fee_percentage setting is the single source of truth for the
-- platform fee; drop the redundant per-product charge snapshot.
DELETE FROM public.express_settings WHERE key = 'product_charge_percentage';

ALTER TABLE public.express_products
  DROP COLUMN IF EXISTS charge_percentage;

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Settings are world-readable (the buyer/seller apps need the fee + charge),
-- but only authenticated users (the Admin app session) may change them.
ALTER TABLE public.express_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settings_public_read" ON public.express_settings;
CREATE POLICY "settings_public_read" ON public.express_settings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "settings_authenticated_write" ON public.express_settings;
CREATE POLICY "settings_authenticated_write" ON public.express_settings
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);