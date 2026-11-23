-- Flash sale RLS policies
-- ---------------------------------------------------------------------------
-- Sellers can create and manage flash sales for their own products.
-- Public can read active flash sales so the home feed can surface them.

ALTER TABLE public.express_flash_sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active flash sales" ON public.express_flash_sales;
CREATE POLICY "Public can view active flash sales"
  ON public.express_flash_sales FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Sellers manage their own flash sales" ON public.express_flash_sales;
CREATE POLICY "Sellers manage their own flash sales"
  ON public.express_flash_sales FOR ALL
  USING (
    seller_id IN (
      SELECT id FROM public.express_sellers WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    seller_id IN (
      SELECT id FROM public.express_sellers WHERE user_id = auth.uid()
    )
  );
