-- Create storage bucket for ad images
-- Note: Storage policies must be configured through the Supabase Dashboard UI

INSERT INTO storage.buckets (id, name, public)
VALUES ('ad-images', 'ad-images', true)
ON CONFLICT (id) DO NOTHING;
