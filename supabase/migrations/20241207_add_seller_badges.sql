-- Add badges to sellers
-- Badges will display in seller profiles and their products

-- Add badges column to express_sellers table
ALTER TABLE express_sellers 
ADD COLUMN IF NOT EXISTS badges text[] DEFAULT '{}';

-- Create index for faster badge queries
CREATE INDEX IF NOT EXISTS idx_express_sellers_badges ON express_sellers USING GIN(badges);

-- Add some comments for documentation
COMMENT ON COLUMN express_sellers.badges IS 'Array of badge identifiers (e.g., verified, top_seller, fast_shipping, etc.)';

-- Example badge values:
-- 'verified' - Verified seller
-- 'top_seller' - Top performing seller
-- 'fast_shipping' - Known for fast shipping
-- 'eco_friendly' - Eco-friendly products
-- 'local' - Local business
-- 'trending' - Trending seller
-- 'premium' - Premium quality products
