-- coupon-limits-and-stores.sql
--
-- Extends the coupon system:
--   1. Per-account usage limits (user_limit + express_coupon_redemptions log)
--   2. max_product_price — coupons skip cart items above this unit price
--   3. Multi-store scoping via express_coupons.seller_ids uuid[]
--      (NULL/empty = valid at every store; legacy single seller_id still honored)
--   4. Sellers can manage coupons scoped to their own store(s) via RLS
--
-- Idempotent — safe to run multiple times.

BEGIN;

ALTER TABLE public.express_coupons ADD COLUMN IF NOT EXISTS seller_ids uuid[];
ALTER TABLE public.express_coupons ADD COLUMN IF NOT EXISTS max_product_price numeric;
ALTER TABLE public.express_coupons ADD COLUMN IF NOT EXISTS user_limit integer DEFAULT 1;

-- ── Redemption log (drives per-account limits) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.express_coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  coupon_id uuid NOT NULL REFERENCES public.express_coupons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coupon_redemptions_coupon_user_idx
  ON public.express_coupon_redemptions (coupon_id, user_id);

ALTER TABLE public.express_coupon_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own coupon redemptions" ON public.express_coupon_redemptions;
CREATE POLICY "users read own coupon redemptions"
  ON public.express_coupon_redemptions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ── Usage recorder: bumps global counters AND logs the per-account use ──────
-- Supersedes the earlier single-arg version. SECURITY DEFINER because the
-- coupons table RLS blocks direct customer writes.
CREATE OR REPLACE FUNCTION public.record_coupon_use(
  p_coupon_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_reference text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_coupon_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.express_coupons
  SET current_uses = COALESCE(current_uses, usage_count, 0) + 1,
      usage_count = COALESCE(usage_count, current_uses, 0) + 1
  WHERE id = p_coupon_id;

  IF p_user_id IS NOT NULL THEN
    INSERT INTO public.express_coupon_redemptions (coupon_id, user_id, reference)
    VALUES (p_coupon_id, p_user_id, p_reference);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_coupon_use(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_coupon_use(uuid, uuid, text) TO authenticated;

-- ── Sellers manage their own store-scoped coupons ────────────────────────────
DROP POLICY IF EXISTS "coupons_seller_manage" ON public.express_coupons;
CREATE POLICY "coupons_seller_manage"
  ON public.express_coupons
  FOR ALL
  TO authenticated
  USING (
    seller_id IN (SELECT id FROM public.express_sellers WHERE user_id = auth.uid())
    OR seller_ids && ARRAY(SELECT id FROM public.express_sellers WHERE user_id = auth.uid())
  )
  WITH CHECK (
    seller_id IN (SELECT id FROM public.express_sellers WHERE user_id = auth.uid())
    OR seller_ids && ARRAY(SELECT id FROM public.express_sellers WHERE user_id = auth.uid())
  );

COMMIT;