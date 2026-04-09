-- Add use_image_as_bg column to express_ads table
ALTER TABLE express_ads 
ADD COLUMN IF NOT EXISTS use_image_as_bg BOOLEAN DEFAULT true;

COMMENT ON COLUMN express_ads.use_image_as_bg IS 'Whether to use the image as the background (full bleed) or as a standalone element';
