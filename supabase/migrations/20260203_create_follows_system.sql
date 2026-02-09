-- Create follows table for tracking user-seller relationships
CREATE TABLE IF NOT EXISTS express_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES express_sellers(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, seller_id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_follows_user_id ON express_follows(user_id);
CREATE INDEX IF NOT EXISTS idx_follows_seller_id ON express_follows(seller_id);

-- RLS policies
ALTER TABLE express_follows ENABLE ROW LEVEL SECURITY;

-- Users can view all follows
CREATE POLICY "Anyone can view follows"
ON express_follows FOR SELECT
TO public
USING (true);

-- Users can only insert their own follows
CREATE POLICY "Users can follow sellers"
ON express_follows FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can only delete their own follows
CREATE POLICY "Users can unfollow sellers"
ON express_follows FOR DELETE
TO authenticated
USING (auth.uid() = user_id);
