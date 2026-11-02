ALTER TABLE public.express_products
  ADD COLUMN IF NOT EXISTS reorder_level integer NOT NULL DEFAULT 0
    CHECK (reorder_level >= 0);

COMMENT ON COLUMN public.express_products.reorder_level IS
  'Seller-defined on-hand quantity at or below which the product should be reordered.';