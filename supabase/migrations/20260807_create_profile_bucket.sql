-- Create storage bucket for seller/customer profile images (mirrors Express-Store "profile" bucket)
-- Safe to run repeatedly.

INSERT INTO storage.buckets (id, name, public)
VALUES ('profile', 'profile', true)
ON CONFLICT (id) DO NOTHING;

-- Public read access for profile images
DROP POLICY IF EXISTS "Public read profile images" ON storage.objects;
CREATE POLICY "Public read profile images" ON storage.objects
  FOR SELECT USING (bucket_id = 'profile');

-- Authenticated users can upload their own profile images
DROP POLICY IF EXISTS "Authenticated users can upload profile images" ON storage.objects;
CREATE POLICY "Authenticated users can upload profile images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'profile' AND auth.uid() IS NOT NULL);

-- Owners can update/delete their profile images
DROP POLICY IF EXISTS "Users can update own profile images" ON storage.objects;
CREATE POLICY "Users can update own profile images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'profile' AND owner = auth.uid());

DROP POLICY IF EXISTS "Users can delete own profile images" ON storage.objects;
CREATE POLICY "Users can delete own profile images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'profile' AND owner = auth.uid());