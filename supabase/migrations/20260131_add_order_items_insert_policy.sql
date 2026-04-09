-- Add missing INSERT policy for order items
-- This allows users to create order items when placing orders

CREATE POLICY "Users can create order items" ON express_order_items
    FOR INSERT WITH CHECK (
        order_id IN (SELECT id FROM express_orders WHERE user_id = auth.uid())
    );