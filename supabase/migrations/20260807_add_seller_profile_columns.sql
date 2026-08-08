-- Add store profile columns used by the new Seller Profile screen
-- (mirrors Express-Store's seller profile surface).
-- Safe to run repeatedly.

ALTER TABLE express_sellers
  ADD COLUMN IF NOT EXISTS store_description text,
  ADD COLUMN IF NOT EXISTS theme_color text DEFAULT '#2563EB',
  ADD COLUMN IF NOT EXISTS theme_apply_store boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS theme_apply_customer boolean DEFAULT false;