-- Ensure bucket exists and is public
INSERT INTO storage.buckets (id, name, public)
VALUES ('ad-images', 'ad-images', true)
ON CONFLICT (id) DO NOTHING;

-- Reset any conflicting policies on the bucket
DROP POLICY IF EXISTS "Public read ad images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload ad images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update ad images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete ad images" ON storage.objects;

-- Allow anyone to read ad images
CREATE POLICY "Public read ad images" ON storage.objects
  FOR SELECT USING (bucket_id = 'ad-images');

-- Allow signed-in users (admins) to upload
CREATE POLICY "Authenticated upload ad images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ad-images');

-- Allow signed-in users (admins) to update/delete
CREATE POLICY "Authenticated update ad images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'ad-images');

CREATE POLICY "Authenticated delete ad images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'ad-images');
