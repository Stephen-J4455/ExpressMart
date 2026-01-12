-- Allow newly registered users to create their seller profile row
DROP POLICY IF EXISTS "Sellers can create their own profile" ON express_sellers;
CREATE POLICY "Sellers can create their own profile" ON express_sellers
  FOR INSERT
  WITH CHECK (user_id = auth.uid());
