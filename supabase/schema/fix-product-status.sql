-- =============================================================================
-- fix-product-status.sql
--
-- Products created from the seller admin screen are inserted with
-- `status = 'active'` (see SellerAdminScreen.createProduct). If products
-- still appear as `pending`, the most common cause is a BEFORE INSERT trigger
-- on `express_products` that forces the status to 'pending' for moderation
-- (e.g. a `set_product_pending` / `moderate_product` trigger deployed on the
-- Supabase project). This migration removes any such trigger and changes the
-- column default to 'active' so new seller uploads go live immediately.
--
-- This file is safe to re-run (it only acts when the objects exist).
-- Run it against your Supabase project (SQL editor or `supabase db` tooling).
-- =============================================================================

-- 1. Drop any trigger on express_products that may be forcing `pending`.
--    We look for triggers whose name suggests moderation and fire BEFORE
--    INSERT/UPDATE on express_products, then drop them.
do $$
declare
  t record;
begin
  for t in
    select tgname, tgrelid::regclass as rel
    from pg_trigger
    where not tgisinternal
      and tgrelid = 'public.express_products'::regclass
      and (
        tgname ilike '%pending%'
        or tgname ilike '%moderat%'
        or tgname ilike '%product_status%'
        or tgname ilike '%set_status%'
        or tgname ilike '%approve%'
      )
  loop
    execute format('drop trigger if exists %I on %s;', t.tgname, t.rel);
    raise notice 'Dropped trigger % on %', t.tgname, t.rel;
  end loop;
end $$;

-- 2. Make sure the default status is 'active' so direct inserts go live.
alter table if exists public.express_products
  alter column status set default 'active';

-- 3. (Optional) Promote any existing unintentionally-pending products that
--    have all required fields to active. Review before enabling in prod —
--    comment this out if you want to keep existing pending rows for review.
-- update public.express_products
--   set status = 'active'
--   where status = 'pending'
--     and title is not null
--     and price is not null;