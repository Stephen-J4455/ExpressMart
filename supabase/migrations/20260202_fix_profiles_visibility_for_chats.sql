-- Fix profiles visibility for chat functionality
-- Migration: 20260202_fix_profiles_visibility_for_chats.sql
-- Problem: Sellers cannot see customer names in chats because they can't read express_profiles

-- Allow sellers to view basic profile info (name, email, avatar) for users they have chats with
DROP POLICY IF EXISTS "Sellers can view profiles of chat participants" ON express_profiles;

CREATE POLICY "Sellers can view profiles of chat participants" ON express_profiles
  FOR SELECT USING (
    -- Allow sellers to see profiles of users they have conversations with
    id IN (
      SELECT user_id FROM express_chat_conversations 
      WHERE seller_id IN (
        SELECT id FROM express_sellers WHERE user_id = auth.uid()
      )
    )
  );

-- Alternative: Allow anyone authenticated to read basic profile info (simpler approach)
-- This is safer for chat/social features where users need to see each other's names
DROP POLICY IF EXISTS "Authenticated users can view basic profile info" ON express_profiles;

CREATE POLICY "Authenticated users can view basic profile info" ON express_profiles
  FOR SELECT USING (auth.role() = 'authenticated');

-- Note: The above policy allows any authenticated user to read profiles
-- If you want more restrictive access, comment out the above and use the first policy
