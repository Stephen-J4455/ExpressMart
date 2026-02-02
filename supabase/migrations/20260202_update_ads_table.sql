-- Migration to update ads table with additional styles and placements
-- This adds support for story, fullscreen, sidebar, sticky_footer styles
-- and checkout, profile, notification placements

-- Drop existing constraints
ALTER TABLE express_ads DROP CONSTRAINT IF EXISTS valid_style;
ALTER TABLE express_ads DROP CONSTRAINT IF EXISTS valid_placement;

-- Add updated constraints with all styles and placements
ALTER TABLE express_ads ADD CONSTRAINT valid_style 
  CHECK (style IN ('banner', 'card', 'popup', 'carousel', 'story', 'fullscreen', 'sidebar', 'sticky_footer'));

ALTER TABLE express_ads ADD CONSTRAINT valid_placement 
  CHECK (placement IN ('home', 'search', 'category', 'product_detail', 'feed', 'checkout', 'profile', 'notification'));

-- Add comments for new styles
COMMENT ON COLUMN express_ads.style IS 'Visual style of the ad (banner, card, popup, carousel, story, fullscreen, sidebar, sticky_footer)';
COMMENT ON COLUMN express_ads.placement IS 'Where the ad should appear in the app (home, search, category, product_detail, feed, checkout, profile, notification)';

-- Add comments for new placements