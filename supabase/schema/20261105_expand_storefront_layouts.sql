-- Make storefront layout IDs extensible for existing Supabase databases.
-- Run this once in the Supabase SQL editor or through the project's migration runner.

ALTER TABLE public.express_sellers
  DROP CONSTRAINT IF EXISTS express_sellers_storefront_layout_check;
