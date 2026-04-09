-- Ensure bucket exists and is public
INSERT INTO storage.buckets (id, name, public)
VALUES ('express-products', 'express-products', true)
ON CONFLICT (id) DO NOTHING;

-- Reset any conflicting policies on the bucket
DROP POLICY IF EXISTS "Public read product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Owners manage product images" ON storage.objects;

-- Allow anyone to read product images
CREATE POLICY "Public read product images" ON storage.objects
  FOR SELECT USING (bucket_id = 'express-products');

-- Allow signed-in users (sellers/admins) to upload
CREATE POLICY "Authenticated upload product images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'express-products' AND auth.uid() IS NOT NULL);

-- Allow the uploader to replace or remove their files
CREATE POLICY "Owners manage product images" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'express-products' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'express-products' AND owner = auth.uid());
