-- Migration to fix ads table constraints to support multiple placements (comma-separated)
-- Also ensuring all current styles are supported

-- Drop existing constraints that conflict with multiple placements or new styles
ALTER TABLE express_ads DROP CONSTRAINT IF EXISTS valid_placement;
ALTER TABLE express_ads DROP CONSTRAINT IF EXISTS valid_style;

-- Re-add valid_style with current supported list
ALTER TABLE express_ads ADD CONSTRAINT valid_style 
  CHECK (style IN ('banner', 'card', 'popup', 'carousel', 'story', 'fullscreen', 'sidebar', 'sticky_footer'));

-- We don't re-add valid_placement as a simple IN() check because it's now a comma-separated string.
-- Instead, we can add a comment explaining it supports multiple values.
COMMENT ON COLUMN express_ads.placement IS 'Comma-separated list of placements (home, search, category, product_detail, feed, checkout, profile, notification)';
