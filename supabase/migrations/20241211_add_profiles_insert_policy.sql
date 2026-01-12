-- Ensure admins and authenticated users can upsert their profile rows so admin app can load data
-- Safe to run repeatedly

-- Enable RLS (noop if already enabled)
ALTER TABLE express_profiles ENABLE ROW LEVEL SECURITY;

-- Drop old/duplicate policies to avoid conflicts
DROP POLICY IF EXISTS "Users can insert their own profile" ON express_profiles;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON express_profiles;
DROP POLICY IF EXISTS "Service role can manage all profiles" ON express_profiles;

-- Allow authenticated users to insert their own profile row (required for upsert)
CREATE POLICY "Users can insert their own profile" ON express_profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Allow service role to manage profiles (admin/maintenance tasks)
CREATE POLICY "Service role can manage all profiles" ON express_profiles
    FOR ALL USING (auth.jwt()->>'role' = 'service_role');
