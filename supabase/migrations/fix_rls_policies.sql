-- Fix RLS policies for products to use correct seller_id check

-- Drop dependent policies first
DROP POLICY IF EXISTS "Sellers can insert products" ON express_products;
DROP POLICY IF EXISTS "Sellers can view their own products" ON express_products;
DROP POLICY IF EXISTS "Sellers can update their own products" ON express_products;
DROP POLICY IF EXISTS "Sellers can delete their own draft products" ON express_products;
DROP POLICY IF EXISTS "Sellers can view orders for their store" ON express_orders;
DROP POLICY IF EXISTS "Sellers can update their orders" ON express_orders;
DROP POLICY IF EXISTS "Sellers can view their order items" ON express_order_items;
DROP POLICY IF EXISTS "Sellers can manage their tickets" ON express_support_tickets;
DROP POLICY IF EXISTS "Sellers can manage their own coupons" ON express_coupons;
DROP POLICY IF EXISTS "Sellers can view their own payouts" ON express_payouts;

-- Drop the buggy function
DROP FUNCTION IF EXISTS get_user_seller_id(uuid);

-- Create corrected function
CREATE OR REPLACE FUNCTION get_user_seller_id(p_user_id uuid)
RETURNS uuid AS $$
DECLARE
    sid uuid;
BEGIN
    SELECT id INTO sid FROM express_sellers WHERE user_id = p_user_id;
    RETURN sid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate product policies with corrected function
CREATE POLICY "Sellers can insert products" ON express_products
    FOR INSERT WITH CHECK (seller_id = get_user_seller_id(auth.uid()));

CREATE POLICY "Sellers can view their own products" ON express_products
    FOR SELECT USING (seller_id = get_user_seller_id(auth.uid()));

CREATE POLICY "Sellers can update their own products" ON express_products
    FOR UPDATE USING (seller_id = get_user_seller_id(auth.uid()));

CREATE POLICY "Sellers can delete their own draft products" ON express_products
    FOR DELETE USING (seller_id = get_user_seller_id(auth.uid()) AND status = 'draft');

-- Recreate orders policies
CREATE POLICY "Sellers can view orders for their store" ON express_orders
    FOR SELECT USING (seller_id = get_user_seller_id(auth.uid()));

CREATE POLICY "Sellers can update their orders" ON express_orders
    FOR UPDATE USING (seller_id = get_user_seller_id(auth.uid()));

-- Recreate order items policy
CREATE POLICY "Sellers can view their order items" ON express_order_items
    FOR SELECT USING (
        order_id IN (SELECT id FROM express_orders WHERE seller_id = get_user_seller_id(auth.uid()))
    );

-- Recreate support tickets policy
CREATE POLICY "Sellers can manage their tickets" ON express_support_tickets
    FOR ALL USING (seller_id = get_user_seller_id(auth.uid()));

-- Recreate coupons policy
CREATE POLICY "Sellers can manage their own coupons" ON express_coupons
    FOR ALL USING (seller_id = get_user_seller_id(auth.uid()));

-- Recreate payouts policy
CREATE POLICY "Sellers can view their own payouts" ON express_payouts
    FOR SELECT USING (seller_id = get_user_seller_id(auth.uid()));