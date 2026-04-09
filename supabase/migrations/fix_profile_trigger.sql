-- =====================================================
-- FIX: Ensure express_profiles is created on signup
-- Run this in Supabase SQL Editor to fix the issue
-- =====================================================

-- 1. Verify the express_profiles table exists with correct structure
CREATE TABLE IF NOT EXISTS express_profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email text NOT NULL,
    full_name text,
    phone text,
    avatar_url text,
    role user_role NOT NULL DEFAULT 'customer',
    is_active boolean DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Enable RLS on express_profiles
ALTER TABLE express_profiles ENABLE ROW LEVEL SECURITY;

-- 3. Drop existing policies and recreate them
DROP POLICY IF EXISTS "Users can view own profile" ON express_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON express_profiles;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON express_profiles;
DROP POLICY IF EXISTS "Enable insert for service role" ON express_profiles;

-- 4. Create policies
CREATE POLICY "Users can view own profile" ON express_profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON express_profiles
    FOR UPDATE USING (auth.uid() = id);

-- CRITICAL: This policy allows the trigger function to insert profiles
CREATE POLICY "Enable insert for authenticated users" ON express_profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Allow service role to manage all profiles (for admin operations)
CREATE POLICY "Service role can manage all profiles" ON express_profiles
    FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- 5. Drop and recreate the trigger function with SECURITY DEFINER
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER 
SECURITY DEFINER -- This is CRITICAL - allows function to bypass RLS
SET search_path = public
AS $$
DECLARE
    user_role_value user_role;
BEGIN
    -- Convert role to lowercase and cast to enum (handles 'Admin', 'Seller', 'Customer')
    user_role_value := CASE 
        WHEN LOWER(NEW.raw_user_meta_data->>'role') = 'admin' THEN 'admin'::user_role
        WHEN LOWER(NEW.raw_user_meta_data->>'role') = 'seller' THEN 'seller'::user_role
        WHEN LOWER(NEW.raw_user_meta_data->>'role') = 'customer' THEN 'customer'::user_role
        ELSE 'customer'::user_role
    END;

    INSERT INTO public.express_profiles (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(
            NEW.raw_user_meta_data->>'full_name', 
            NEW.raw_user_meta_data->>'name', 
            split_part(NEW.email, '@', 1)
        ),
        user_role_value
    );
    RETURN NEW;
EXCEPTION
    WHEN others THEN
        -- Log the error but don't fail the signup
        RAISE WARNING 'Error creating profile for user %: %', NEW.id, SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Create the trigger on auth.users
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW 
    EXECUTE FUNCTION handle_new_user();

-- 7. Grant necessary permissions
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON public.express_profiles TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE ON public.express_profiles TO authenticated;

-- 8. Verify the trigger was created
DO $$
DECLARE
    trigger_exists boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'on_auth_user_created'
    ) INTO trigger_exists;
    
    IF trigger_exists THEN
        RAISE NOTICE 'SUCCESS: Trigger on_auth_user_created exists and is ready';
    ELSE
        RAISE WARNING 'FAILED: Trigger on_auth_user_created was not created';
    END IF;
END $$;

-- 9. Backfill existing users who don't have profiles
INSERT INTO express_profiles (id, email, full_name, role)
SELECT 
    u.id,
    u.email,
    COALESCE(
        u.raw_user_meta_data->>'full_name',
        u.raw_user_meta_data->>'name',
        split_part(u.email, '@', 1)
    ) as full_name,
    CASE 
        WHEN LOWER(u.raw_user_meta_data->>'role') = 'admin' THEN 'admin'::user_role
        WHEN LOWER(u.raw_user_meta_data->>'role') = 'seller' THEN 'seller'::user_role
        WHEN LOWER(u.raw_user_meta_data->>'role') = 'customer' THEN 'customer'::user_role
        ELSE 'customer'::user_role
    END as role
FROM auth.users u
LEFT JOIN express_profiles p ON u.id = p.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- 10. Show summary
SELECT 
    (SELECT COUNT(*) FROM auth.users) as total_users,
    (SELECT COUNT(*) FROM express_profiles) as total_profiles,
    (SELECT COUNT(*) FROM auth.users u LEFT JOIN express_profiles p ON u.id = p.id WHERE p.id IS NULL) as missing_profiles;
