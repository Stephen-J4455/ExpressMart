-- product-delete-cascade.sql
--
-- Product deletion from the seller admin fails with a foreign-key violation
-- whenever the product is referenced by carts, wishlists, orders, reviews,
-- flash sales or reels (those FKs were created without an ON DELETE action).
-- This migration replaces those constraints with explicit behaviour:
--   * cart items / wishlist entries / reviews / flash sales -> CASCADE
--     (they are meaningless without their product)
--   * order items / reels -> SET NULL (both product_id columns are nullable;
--     order history and reels must survive the product being removed)
--
-- Run once in the Supabase SQL editor. The seller admin also cleans up these
-- references client-side before deleting, but this migration is the
-- authoritative backstop (RLS can block some client-side cleanups).

BEGIN;

ALTER TABLE public.express_wishlists
  DROP CONSTRAINT IF EXISTS express_wishlists_product_id_fkey;
ALTER TABLE public.express_wishlists
  ADD CONSTRAINT express_wishlists_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.express_products(id) ON DELETE CASCADE;

ALTER TABLE public.express_cart_items
  DROP CONSTRAINT IF EXISTS express_cart_items_product_id_fkey;
ALTER TABLE public.express_cart_items
  ADD CONSTRAINT express_cart_items_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.express_products(id) ON DELETE CASCADE;

ALTER TABLE public.express_reviews
  DROP CONSTRAINT IF EXISTS express_reviews_product_id_fkey;
ALTER TABLE public.express_reviews
  ADD CONSTRAINT express_reviews_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.express_products(id) ON DELETE CASCADE;

ALTER TABLE public.express_flash_sales
  DROP CONSTRAINT IF EXISTS express_flash_sales_product_id_fkey;
ALTER TABLE public.express_flash_sales
  ADD CONSTRAINT express_flash_sales_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.express_products(id) ON DELETE CASCADE;

ALTER TABLE public.express_order_items
  DROP CONSTRAINT IF EXISTS express_order_items_product_id_fkey;
ALTER TABLE public.express_order_items
  ADD CONSTRAINT express_order_items_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.express_products(id) ON DELETE SET NULL;

ALTER TABLE public.reels
  DROP CONSTRAINT IF EXISTS reels_product_id_fkey;
ALTER TABLE public.reels
  ADD CONSTRAINT reels_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.express_products(id) ON DELETE SET NULL;

COMMIT;