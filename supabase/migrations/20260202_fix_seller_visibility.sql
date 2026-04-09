-- Fix seller visibility for chats and orders
-- Migration: 20260202_fix_seller_visibility.sql

-- 1. Ensure the helper function is robust and uses SECURITY DEFINER
CREATE OR REPLACE FUNCTION get_user_seller_id(p_user_id uuid)
RETURNS uuid AS $$
DECLARE
    sid uuid;
BEGIN
    SELECT id INTO sid FROM express_sellers WHERE user_id = p_user_id;
    RETURN sid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Fix Chat Conversation RLS
-- Existing policy "Users can access their own conversations" on express_chat_conversations is buggy
DROP POLICY IF EXISTS "Users can access their own conversations" ON express_chat_conversations;

CREATE POLICY "Sellers can access their own conversations" ON express_chat_conversations
  FOR ALL USING (
    user_id = auth.uid() OR
    seller_id = get_user_seller_id(auth.uid())
  );

-- 3. Fix Chat Message RLS
-- Existing policy "Users can access messages in their conversations" on express_chat_messages is buggy
DROP POLICY IF EXISTS "Users can access messages in their conversations" ON express_chat_messages;

CREATE POLICY "Sellers can access messages in their conversations" ON express_chat_messages
  FOR ALL USING (
    conversation_id IN (
      SELECT id FROM express_chat_conversations
      WHERE user_id = auth.uid() OR
            seller_id = get_user_seller_id(auth.uid())
    )
  );

-- 4. Ensure Orders and Order Items policies are correctly using the helper function
-- (Re-applying these to be safe, as seen in fix_rls_policies.sql)
DROP POLICY IF EXISTS "Sellers can view orders for their store" ON express_orders;
CREATE POLICY "Sellers can view orders for their store" ON express_orders
    FOR SELECT USING (seller_id = get_user_seller_id(auth.uid()));

DROP POLICY IF EXISTS "Sellers can update their orders" ON express_orders;
CREATE POLICY "Sellers can update their orders" ON express_orders
    FOR UPDATE USING (seller_id = get_user_seller_id(auth.uid()));

DROP POLICY IF EXISTS "Sellers can view their order items" ON express_order_items;
CREATE POLICY "Sellers can view their order items" ON express_order_items
    FOR SELECT USING (
        order_id IN (SELECT id FROM express_orders WHERE seller_id = get_user_seller_id(auth.uid()))
    );

COMMENT ON FUNCTION get_user_seller_id IS 'Returns the seller_id associated with a user_id, used for RLS policies.';
