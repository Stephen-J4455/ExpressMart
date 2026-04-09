-- Ensure admins can have profiles with correct columns.
-- When migrations run without a JWT (service role), auth.uid() is null.
-- Guard to avoid null constraint errors during migration.
DO $$
DECLARE
  u uuid;
  claims json;
  em text;
BEGIN
  SELECT auth.uid() INTO u;
  IF u IS NULL THEN
    RAISE NOTICE 'Skipping admin profile insert: auth.uid() is null in migration context';
    RETURN;
  END IF;

  BEGIN
    claims := current_setting('request.jwt.claims', true)::json;
    em := claims->>'email';
  EXCEPTION WHEN others THEN
    em := NULL;
  END;

  INSERT INTO express_profiles (id, email, full_name, role)
  VALUES (u, COALESCE(em, ''), COALESCE(em, ''), 'admin')
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = 'admin';
END $$;
