-- Create express_addresses table for delivery addresses
-- This table stores customer delivery addresses

CREATE TABLE IF NOT EXISTS express_addresses (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text NOT NULL,
  street_address text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  is_default boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add RLS policies
ALTER TABLE express_addresses ENABLE ROW LEVEL SECURITY;

-- Users can only see their own addresses
CREATE POLICY "Users can view their own addresses" ON express_addresses
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own addresses
CREATE POLICY "Users can insert their own addresses" ON express_addresses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own addresses
CREATE POLICY "Users can update their own addresses" ON express_addresses
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own addresses
CREATE POLICY "Users can delete their own addresses" ON express_addresses
  FOR DELETE USING (auth.uid() = user_id);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_express_addresses_user_id ON express_addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_express_addresses_is_default ON express_addresses(user_id, is_default);

-- Add comments for documentation
COMMENT ON TABLE express_addresses IS 'Customer delivery addresses';
COMMENT ON COLUMN express_addresses.user_id IS 'Reference to the user who owns this address';
COMMENT ON COLUMN express_addresses.full_name IS 'Full name of the recipient';
COMMENT ON COLUMN express_addresses.phone IS 'Phone number of the recipient';
COMMENT ON COLUMN express_addresses.street_address IS 'Street address for delivery';
COMMENT ON COLUMN express_addresses.city IS 'City for delivery';
COMMENT ON COLUMN express_addresses.state IS 'State/province for delivery';
COMMENT ON COLUMN express_addresses.is_default IS 'Whether this is the user default address';