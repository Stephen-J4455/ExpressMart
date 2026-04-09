-- Add unique constraint to payment_reference to prevent duplicate payments
-- This ensures that each payment reference can only be used once

ALTER TABLE express_orders
ADD CONSTRAINT express_orders_payment_reference_unique UNIQUE (payment_reference);

-- Add comment
COMMENT ON CONSTRAINT express_orders_payment_reference_unique ON express_orders IS 'Ensures each payment reference is unique to prevent duplicate order creation';