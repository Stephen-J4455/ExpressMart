-- product-delete-rls.sql
--
-- Product deletion in the seller admin silently did nothing: Row Level
-- Security on public.express_products had no DELETE policy for sellers, so
-- Supabase returned success while deleting zero rows (the product came back
-- after a refresh). This adds explicit DELETE policies:
--   * sellers may delete products belonging to their own store
--   * admins may delete any product
--
-- Run once in the Supabase SQL editor alongside product-delete-cascade.sql.

ALTER TABLE public.express_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sellers can delete their own products" ON public.express_products;
CREATE POLICY "Sellers can delete their own products"
  ON public.express_products FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.express_sellers s
      WHERE s.id = express_products.seller_id
        AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can delete any product" ON public.express_products;
CREATE POLICY "Admins can delete any product"
  ON public.express_products FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.express_profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
  );