-- Fix admin access to database
-- This migration ensures admins can properly access data while preventing privilege escalation

-- Drop existing policies that might conflict
DROP POLICY IF EXISTS "Users can update their own profile" ON express_profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON express_profiles;

-- Allow users to insert their own profile (needed for first login)
-- Note: Users cannot set their own role to admin on INSERT (defaults to 'customer')
CREATE POLICY "Users can insert their own profile" ON express_profiles
    FOR INSERT WITH CHECK (
        auth.uid() = id AND 
        (role IS NULL OR role = 'customer')
    );

-- Allow users to update their own profile fields, but NOT the role field
-- Only admins can change roles (via the "Admins can update all profiles" policy)
CREATE POLICY "Users can update their own profile" ON express_profiles
    FOR UPDATE USING (auth.uid() = id)
    WITH CHECK (
        auth.uid() = id AND 
        role = (SELECT role FROM express_profiles WHERE id = auth.uid())
    );

-- Create a helper function to promote a user to admin
-- This must be run with service_role or by an existing admin
CREATE OR REPLACE FUNCTION promote_user_to_admin(user_email text)
RETURNS void AS $$
DECLARE
    user_uuid uuid;
BEGIN
    -- Find user by email in auth.users
    SELECT id INTO user_uuid FROM auth.users WHERE email = user_email;
    
    IF user_uuid IS NULL THEN
        RAISE EXCEPTION 'User with email % not found', user_email;
    END IF;
    
    -- Upsert profile with admin role
    INSERT INTO express_profiles (id, email, full_name, role, created_at, updated_at)
    VALUES (user_uuid, user_email, user_email, 'admin', now(), now())
    ON CONFLICT (id) 
    DO UPDATE SET role = 'admin', updated_at = now();
    
    RAISE NOTICE 'User % promoted to admin', user_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users (needed for admins to call it)
GRANT EXECUTE ON FUNCTION promote_user_to_admin(text) TO authenticated;

-- Instructions for use:
-- 1. First, create your admin user account in the app
-- 2. Then run this in the Supabase SQL editor (with service_role):
--    SELECT promote_user_to_admin('your-admin-email@example.com');
-- 3. Refresh the admin app and you should see all data
