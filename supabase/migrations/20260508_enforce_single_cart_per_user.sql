-- Ensure each authenticated user has at most one cart.
-- This migration:
-- 1) Merges duplicate user carts into one "keeper" cart per user
-- 2) Deletes duplicate cart rows
-- 3) Enforces uniqueness via a partial unique index on user_id

BEGIN;

WITH ranked_carts AS (
  SELECT
    id,
    user_id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM express_carts
  WHERE user_id IS NOT NULL
),
keeper_carts AS (
  SELECT id AS keeper_cart_id, user_id
  FROM ranked_carts
  WHERE rn = 1
),
duplicate_carts AS (
  SELECT id AS duplicate_cart_id, user_id
  FROM ranked_carts
  WHERE rn > 1
)
INSERT INTO express_cart_items (
  cart_id,
  product_id,
  quantity,
  size,
  color,
  variant_id,
  price,
  created_at,
  updated_at
)
SELECT
  k.keeper_cart_id,
  ci.product_id,
  ci.quantity,
  ci.size,
  ci.color,
  ci.variant_id,
  ci.price,
  ci.created_at,
  now()
FROM duplicate_carts d
JOIN keeper_carts k ON k.user_id = d.user_id
JOIN express_cart_items ci ON ci.cart_id = d.duplicate_cart_id
ON CONFLICT (cart_id, product_id, size, color, variant_id)
DO UPDATE SET
  quantity = express_cart_items.quantity + EXCLUDED.quantity,
  price = EXCLUDED.price,
  updated_at = now();

WITH ranked_carts AS (
  SELECT
    id,
    user_id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM express_carts
  WHERE user_id IS NOT NULL
)
DELETE FROM express_carts
WHERE id IN (
  SELECT id
  FROM ranked_carts
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_express_carts_user_id
ON express_carts (user_id)
WHERE user_id IS NOT NULL;

COMMIT;

