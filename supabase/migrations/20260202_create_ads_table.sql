-- Create ads table for ExpressMart advertisements
CREATE TABLE IF NOT EXISTS express_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT NOT NULL,
  
  -- Style and Layout
  style TEXT NOT NULL DEFAULT 'banner', -- 'banner', 'card', 'popup', 'carousel'
  background_color TEXT DEFAULT '#FFFFFF',
  text_color TEXT DEFAULT '#000000',
  accent_color TEXT DEFAULT '#0B6EFE',
  border_radius INTEGER DEFAULT 12,
  
  -- Content
  cta_text TEXT DEFAULT 'Shop Now',
  cta_url TEXT,
  discount_badge TEXT, -- e.g., "50% OFF", "Limited Time"
  discount_color TEXT DEFAULT '#FF6B6B',
  
  -- Placement and Scheduling
  placement TEXT NOT NULL DEFAULT 'home', -- 'home', 'search', 'category', 'product_detail', 'feed'
  position INTEGER DEFAULT 0, -- Order of display
  
  -- Visibility and targeting
  is_active BOOLEAN DEFAULT true,
  show_on_web BOOLEAN DEFAULT true,
  show_on_mobile BOOLEAN DEFAULT true,
  
  -- Schedule
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  
  -- Analytics
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  
  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT valid_style CHECK (style IN ('banner', 'card', 'popup', 'carousel')),
  CONSTRAINT valid_placement CHECK (placement IN ('home', 'search', 'category', 'product_detail', 'feed'))
);

-- Create indexes for performance
CREATE INDEX idx_ads_active ON express_ads(is_active);
CREATE INDEX idx_ads_placement ON express_ads(placement);
CREATE INDEX idx_ads_dates ON express_ads(start_date, end_date);
CREATE INDEX idx_ads_created_at ON express_ads(created_at DESC);

-- Enable RLS
ALTER TABLE express_ads ENABLE ROW LEVEL SECURITY;

-- Allow everyone to view active ads
CREATE POLICY "Anyone can view active ads" 
  ON express_ads 
  FOR SELECT 
  USING (is_active = true);

-- Only admins can create/update/delete ads
CREATE POLICY "Only admins can manage ads" 
  ON express_ads 
  FOR ALL 
  USING (
    auth.uid() IN (
      SELECT id FROM express_profiles WHERE role = 'admin'
    )
  );

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_ads_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ads_timestamp
BEFORE UPDATE ON express_ads
FOR EACH ROW
EXECUTE FUNCTION update_ads_timestamp();

COMMENT ON TABLE express_ads IS 'Advertisements for the ExpressMart platform';
COMMENT ON COLUMN express_ads.style IS 'Visual style of the ad (banner, card, popup, carousel)';
COMMENT ON COLUMN express_ads.placement IS 'Where the ad should appear in the app';
COMMENT ON COLUMN express_ads.position IS 'Order of display within a placement';
