-- Add chat functionality and social media links to sellers
-- Migration: 20260131_add_chat_and_social_media.sql

-- =====================================================
-- CHAT SYSTEM TABLES
-- =====================================================

-- Chat conversations table
CREATE TABLE IF NOT EXISTS express_chat_conversations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES express_profiles(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES express_sellers(id) ON DELETE CASCADE,
  last_message text,
  last_message_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, seller_id)
);

-- Chat messages table
CREATE TABLE IF NOT EXISTS express_chat_messages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id uuid NOT NULL REFERENCES express_chat_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL, -- Can be user or seller profile id
  sender_type text NOT NULL CHECK (sender_type IN ('user', 'seller')),
  message text NOT NULL,
  message_type text NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'file')),
  is_read boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =====================================================
-- SOCIAL MEDIA LINKS FOR SELLERS
-- =====================================================

-- Add social media columns to sellers table
ALTER TABLE express_sellers
ADD COLUMN IF NOT EXISTS social_facebook text,
ADD COLUMN IF NOT EXISTS social_instagram text,
ADD COLUMN IF NOT EXISTS social_twitter text,
ADD COLUMN IF NOT EXISTS social_whatsapp text,
ADD COLUMN IF NOT EXISTS social_website text;

-- =====================================================
-- INDEXES
-- =====================================================

-- Chat indexes
CREATE INDEX IF NOT EXISTS idx_express_chat_conversations_user_id ON express_chat_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_express_chat_conversations_seller_id ON express_chat_conversations(seller_id);
CREATE INDEX IF NOT EXISTS idx_express_chat_conversations_last_message_at ON express_chat_conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_express_chat_messages_conversation_id ON express_chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_express_chat_messages_created_at ON express_chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_express_chat_messages_sender_id ON express_chat_messages(sender_id);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

-- Enable RLS
ALTER TABLE express_chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE express_chat_messages ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- POLICIES
-- =====================================================

-- Chat conversations: Users and sellers can access conversations they're part of
CREATE POLICY "Users can access their own conversations" ON express_chat_conversations
  FOR ALL USING (
    user_id = auth.uid() OR
    seller_id IN (
      SELECT id FROM express_sellers WHERE name = auth.jwt() ->> 'vendor'
    )
  );

-- Chat messages: Users and sellers can access messages in their conversations
CREATE POLICY "Users can access messages in their conversations" ON express_chat_messages
  FOR ALL USING (
    conversation_id IN (
      SELECT id FROM express_chat_conversations
      WHERE user_id = auth.uid() OR
            seller_id IN (
              SELECT id FROM express_sellers WHERE name = auth.jwt() ->> 'vendor'
            )
    )
  );

-- Sellers can update their social media links
CREATE POLICY "Sellers can update their social media links" ON express_sellers
  FOR UPDATE USING (
    auth.jwt() ->> 'role' = 'seller' AND
    name = auth.jwt() ->> 'vendor'
  )
  WITH CHECK (
    auth.jwt() ->> 'role' = 'seller' AND
    name = auth.jwt() ->> 'vendor'
  );

-- =====================================================
-- REALTIME SUBSCRIPTIONS
-- =====================================================

-- Enable realtime for chat tables
ALTER PUBLICATION supabase_realtime ADD TABLE express_chat_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE express_chat_messages;

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Function to update conversation last_message and last_message_at
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE express_chat_conversations
  SET last_message = NEW.message,
      last_message_at = NEW.created_at,
      updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update conversation when new message is added
CREATE TRIGGER update_conversation_on_message
  AFTER INSERT ON express_chat_messages
  FOR EACH ROW EXECUTE FUNCTION update_conversation_last_message();

-- Add updated_at trigger for conversations
CREATE TRIGGER update_express_chat_conversations_updated_at
  BEFORE UPDATE ON express_chat_conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE express_chat_conversations IS 'Chat conversations between users and sellers';
COMMENT ON TABLE express_chat_messages IS 'Individual messages within chat conversations';
COMMENT ON COLUMN express_sellers.social_facebook IS 'Facebook page URL for the seller';
COMMENT ON COLUMN express_sellers.social_instagram IS 'Instagram profile URL for the seller';
COMMENT ON COLUMN express_sellers.social_twitter IS 'Twitter/X profile URL for the seller';
COMMENT ON COLUMN express_sellers.social_whatsapp IS 'WhatsApp contact number for the seller';
COMMENT ON COLUMN express_sellers.social_website IS 'Website URL for the seller';