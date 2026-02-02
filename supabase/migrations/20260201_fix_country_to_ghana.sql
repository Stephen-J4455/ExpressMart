-- Fix country field: Change default from Nigeria to Ghana
-- and update existing records

-- Update existing records that have Nigeria as country to Ghana
UPDATE express_addresses 
SET country = 'Ghana' 
WHERE country = 'Nigeria';

-- Update existing records that have NULL country to Ghana
UPDATE express_addresses 
SET country = 'Ghana' 
WHERE country IS NULL;

-- Alter the table to set the default to Ghana
ALTER TABLE express_addresses 
ALTER COLUMN country SET DEFAULT 'Ghana';

-- Add comment
COMMENT ON COLUMN express_addresses.country IS 'Country for delivery (defaults to Ghana)';
