-- Add missing columns to express_orders table for payment functionality
-- This migration adds all the columns needed for the payment system

ALTER TABLE express_orders
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS subtotal numeric(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS shipping_fee numeric(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS currency text DEFAULT 'GHS',
ADD COLUMN IF NOT EXISTS shipping_address jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'paystack',
ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS payment_reference text,
ADD COLUMN IF NOT EXISTS paid_at timestamptz,
ADD COLUMN IF NOT EXISTS payment_data jsonb;

-- Drop existing payment_status check constraint if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'express_orders_payment_status_check'
        AND table_name = 'express_orders'
    ) THEN
        ALTER TABLE express_orders DROP CONSTRAINT express_orders_payment_status_check;
    END IF;
END $$;

-- Add updated payment_status check constraint
ALTER TABLE express_orders
ADD CONSTRAINT express_orders_payment_status_check
CHECK (payment_status IN ('pending', 'paid', 'failed', 'cancelled'));

-- Update status check constraint to include new statuses
ALTER TABLE express_orders
DROP CONSTRAINT IF EXISTS express_orders_status_check,
ADD CONSTRAINT express_orders_status_check
CHECK (status IN ('pending_payment', 'processing', 'confirmed', 'packed', 'shipped', 'delivered', 'canceled', 'refunded'));

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_express_orders_user_id ON express_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_express_orders_payment_status ON express_orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_express_orders_payment_reference ON express_orders(payment_reference);

-- Add comments for documentation
COMMENT ON COLUMN express_orders.user_id IS 'Reference to the user who placed the order';
COMMENT ON COLUMN express_orders.subtotal IS 'Subtotal before shipping and taxes';
COMMENT ON COLUMN express_orders.shipping_fee IS 'Shipping fee for the order';
COMMENT ON COLUMN express_orders.currency IS 'Currency code (e.g., NGN, USD)';
COMMENT ON COLUMN express_orders.shipping_address IS 'Customer shipping address details';
COMMENT ON COLUMN express_orders.payment_method IS 'Payment method used (paystack, etc.)';
COMMENT ON COLUMN express_orders.payment_status IS 'Payment status (pending, paid, failed, cancelled)';
COMMENT ON COLUMN express_orders.payment_reference IS 'Payment reference from payment provider';
COMMENT ON COLUMN express_orders.paid_at IS 'Timestamp when payment was successfully processed';
COMMENT ON COLUMN express_orders.payment_data IS 'Complete payment transaction data from provider';