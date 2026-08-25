-- ── Platform settings seeds + per-product charge snapshot ────────────────────
-- Run once against the Supabase project (SQL editor or migration).
--
-- 1. Seeds the platform settings used by:
--      • the Admin app  → Settings → Fees & Config (edit values)
--      • the AI edge function (ai_model → OpenRouter model id)
--      • Store registration flow (store_registration_fee)
--      • Seller product form (product_charge_percentage snapshot)
-- 2. Adds express_products.charge_percentage — the charge (%) snapshotted on
--    the product at save time, so historical products keep the charge they
--    were created with even after the platform charge changes.

INSERT INTO public.express_settings (key, value, description) VALUES
  ('ai_model', '"openai/gpt-4o-mini"'::jsonb,
    'OpenRouter model id used by the in-app AI assistant (e.g. openai/gpt-4o-mini, anthropic/claude-3.5-haiku).'),
  ('store_registration_fee', '150'::jsonb,
    'One-time store registration fee in GHS charged via Paystack.'),
  ('product_charge_percentage', '5'::jsonb,
    'Platform charge (%) applied to products. Snapshotted onto each product at save time.')
ON CONFLICT (key) DO NOTHING;

-- Per-product charge snapshot column (nullable → pre-existing products simply
-- have no snapshot until they are re-saved).
ALTER TABLE public.express_products
  ADD COLUMN IF NOT EXISTS charge_percentage numeric;

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