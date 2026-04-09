-- Allow authenticated users to create their profile row
DROP POLICY IF EXISTS "Users can insert their own profile" ON express_profiles;
CREATE POLICY "Users can insert their own profile" ON express_profiles
  FOR INSERT
  WITH CHECK (id = auth.uid());
