-- Add payment_data column to express_orders table
-- This stores comprehensive Paystack transaction information

ALTER TABLE express_orders
ADD COLUMN IF NOT EXISTS payment_data JSONB;

-- Add comment for documentation
COMMENT ON COLUMN express_orders.payment_data IS 'Complete Paystack transaction data including payment method, fees, authorization details, and transaction logs';