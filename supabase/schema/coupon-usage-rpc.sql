-- coupon-usage-rpc.sql
--
-- Customers need to record promo-code usage after a successful order, but the
-- express_coupons write policy (coupons_admin_write) intentionally blocks
-- non-admin/seller writes. This SECURITY DEFINER function is the safe,
-- atomic way for any authenticated user to bump the usage counters without
-- granting row-level UPDATE on the table.
--
-- Run once in the Supabase SQL editor.

CREATE OR REPLACE FUNCTION public.record_coupon_use(p_coupon_id uuid)
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
END;
$$;

REVOKE ALL ON FUNCTION public.record_coupon_use(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_coupon_use(uuid) TO authenticated;