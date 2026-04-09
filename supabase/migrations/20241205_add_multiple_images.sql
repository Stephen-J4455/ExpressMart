-- Migration to support multiple product images
-- Change thumbnail column to thumbnails array

ALTER TABLE express_products
ADD COLUMN thumbnails text[];

-- Migrate existing data
UPDATE express_products
SET thumbnails = ARRAY[thumbnail]
WHERE thumbnail IS NOT NULL;

-- Remove old column
ALTER TABLE express_products
DROP COLUMN thumbnail;