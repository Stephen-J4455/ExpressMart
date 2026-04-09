-- Add paid_at column to express_orders table
-- This tracks when an order was successfully paid

ALTER TABLE express_orders
ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- Add comment for documentation
COMMENT ON COLUMN express_orders.paid_at IS 'Timestamp when the order payment was successfully processed';