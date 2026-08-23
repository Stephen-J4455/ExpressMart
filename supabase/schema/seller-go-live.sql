-- Store "Go Live" guard
-- ---------------------------------------------------------------------------
-- A store may only be marked active (is_active = true) when it has a Paystack
-- payment account that is synced/verified. This prevents stores without a
-- working payout account from going live and taking orders they can't be paid
-- for. The app enforces the same rule client-side (see SellerAdminScreen's
-- Go Live toggle), but this trigger is the authoritative backstop so the
-- rule holds no matter how is_active is written (admin panel, API, SQL).

-- Ensure the columns exist (idempotent). They are already in schema.sql, but
-- guard anyway so this file is safe to re-run.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'express_sellers' AND column_name = 'payment_account'
  ) THEN
    ALTER TABLE public.express_sellers ADD COLUMN payment_account text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'express_sellers' AND column_name = 'account_verified'
  ) THEN
    ALTER TABLE public.express_sellers ADD COLUMN account_verified boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Function: block going live without a synced Paystack account.
CREATE OR REPLACE FUNCTION public.guard_seller_go_live()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only enforce when someone is trying to flip the store to active.
  IF NEW.is_active = true AND (TG_OP = 'INSERT' OR OLD.is_active IS DISTINCT FROM true) THEN
    IF NEW.payment_account IS NULL OR NULLIF(TRIM(NEW.payment_account), '') IS NULL THEN
      RAISE EXCEPTION 'Store cannot go live: no Paystack payment account linked.'
        USING ERRCODE = 'store_no_payment_account';
    END IF;
    IF NEW.account_verified IS NOT TRUE THEN
      RAISE EXCEPTION 'Store cannot go live: Paystack payment account is not verified/synced.'
        USING ERRCODE = 'store_payment_not_synced';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seller_go_live_guard ON public.express_sellers;
CREATE TRIGGER seller_go_live_guard
  BEFORE INSERT OR UPDATE OF is_active, payment_account, account_verified
  ON public.express_sellers
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_seller_go_live();

-- Helper column the app can read to know WHY a store can't go live, without
-- re-deriving the rule. Kept in sync by the same trigger.
CREATE OR REPLACE FUNCTION public.seller_can_go_live(payment_account text, account_verified boolean)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT payment_account IS NOT NULL
    AND NULLIF(TRIM(payment_account), '') IS NOT NULL
    AND account_verified IS TRUE;
$$;
