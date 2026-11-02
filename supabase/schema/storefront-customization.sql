-- Storefront visibility and appearance options.
-- Public storefronts are opt-in: existing sellers start with storefronts off.
ALTER TABLE public.express_sellers
  ADD COLUMN IF NOT EXISTS storefront_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enterprise_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS storefront_theme text NOT NULL DEFAULT 'chicwave',
  ADD COLUMN IF NOT EXISTS storefront_layout text NOT NULL DEFAULT 'classic',
  ADD COLUMN IF NOT EXISTS storefront_color_mode text NOT NULL DEFAULT 'system';

ALTER TABLE public.express_sellers
  ALTER COLUMN storefront_enabled SET DEFAULT false;

ALTER TABLE public.express_sellers
  ALTER COLUMN enterprise_enabled SET DEFAULT false;

ALTER TABLE public.express_sellers
  ALTER COLUMN storefront_color_mode SET DEFAULT 'system';

DO $$
BEGIN
  ALTER TABLE public.express_sellers
    DROP CONSTRAINT IF EXISTS express_sellers_storefront_theme_check;
  ALTER TABLE public.express_sellers
    ADD CONSTRAINT express_sellers_storefront_theme_check
    CHECK (storefront_theme IN ('chicwave', 'fashionia', 'minimal', 'botanical', 'luxe'));

  ALTER TABLE public.express_sellers
    DROP CONSTRAINT IF EXISTS express_sellers_storefront_layout_check;
  ALTER TABLE public.express_sellers
    ADD CONSTRAINT express_sellers_storefront_layout_check
    CHECK (storefront_layout IN ('classic', 'editorial', 'catalog', 'split', 'spotlight'));

  ALTER TABLE public.express_sellers
    DROP CONSTRAINT IF EXISTS express_sellers_storefront_color_mode_check;
  ALTER TABLE public.express_sellers
    ADD CONSTRAINT express_sellers_storefront_color_mode_check
    CHECK (storefront_color_mode IN ('light', 'dark', 'system'));
END;
$$;

-- Enterprise status is granted only by the payment Edge Function or trusted
-- service-role operations, never by a seller editing their own row.
CREATE OR REPLACE FUNCTION public.prevent_enterprise_self_service()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF (
       (TG_OP = 'INSERT' AND NEW.enterprise_enabled)
       OR (
         TG_OP = 'UPDATE'
         AND NEW.enterprise_enabled IS DISTINCT FROM OLD.enterprise_enabled
       )
     )
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Enterprise status can only be changed by an administrator.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_enterprise_self_service
  ON public.express_sellers;
CREATE TRIGGER prevent_enterprise_self_service
  BEFORE INSERT OR UPDATE ON public.express_sellers
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_enterprise_self_service();

ALTER TABLE public.express_payments
  DROP CONSTRAINT IF EXISTS express_payments_payment_type_check;
ALTER TABLE public.express_payments
  ADD CONSTRAINT express_payments_payment_type_check
  CHECK (payment_type IN ('order', 'store_registration', 'enterprise_upgrade'));

INSERT INTO public.express_settings (key, value, description)
VALUES (
  'enterprise_upgrade_fee',
  '0'::jsonb,
  'One-time Enterprise upgrade fee in GHS charged via Paystack.'
)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.express_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "settings_authenticated_write"
  ON public.express_settings;
DROP POLICY IF EXISTS "settings_admin_write" ON public.express_settings;
CREATE POLICY "settings_admin_write" ON public.express_settings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.express_profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.express_profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
  );
