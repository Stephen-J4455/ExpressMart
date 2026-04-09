-- =====================================================
-- ExpressMart/Express-Seller Complete Database Schema
-- =====================================================
-- This file creates all necessary tables, policies, and realtime subscriptions
-- for the ExpressMart e-commerce platform

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =====================================================
-- TABLES
-- =====================================================

-- Categories table
CREATE TABLE IF NOT EXISTS express_categories (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL UNIQUE,
  icon text,
  color text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Products table
CREATE TABLE IF NOT EXISTS express_products (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  vendor text,
  price numeric(12,2) NOT NULL DEFAULT 0,
  rating numeric(3,1) DEFAULT 0,
  badges text[] DEFAULT '{}',
  thumbnails text[] DEFAULT '{}',
  category text REFERENCES express_categories(name) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('draft', 'pending', 'active', 'rejected')),
  description text,
  discount numeric(5,2) DEFAULT 0,
  sizes text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Sellers table
CREATE TABLE IF NOT EXISTS express_sellers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL UNIQUE,
  email text,
  avatar text,
  phone text,
  location text,
  rating numeric(3,2) DEFAULT 0,
  fulfillment_speed text,
  weekly_target numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Orders table
CREATE TABLE IF NOT EXISTS express_orders (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number text NOT NULL UNIQUE,
  vendor text NOT NULL,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','packed','shipped','delivered','canceled','refunded')),
  total numeric(12,2) NOT NULL DEFAULT 0,
  customer jsonb DEFAULT '{}'::jsonb,
  eta timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Order items table
CREATE TABLE IF NOT EXISTS express_order_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id uuid NOT NULL REFERENCES express_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES express_products(id) ON DELETE SET NULL,
  title text,
  quantity integer NOT NULL DEFAULT 1,
  price numeric(12,2) NOT NULL DEFAULT 0
);

-- Support tickets table
CREATE TABLE IF NOT EXISTS express_support_tickets (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor text,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  messages jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- =====================================================
-- INDEXES
-- =====================================================

-- Products indexes
CREATE INDEX IF NOT EXISTS idx_express_products_status_created_at ON express_products(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_express_products_title ON express_products USING gin (to_tsvector('english', title));
CREATE INDEX IF NOT EXISTS idx_express_products_category ON express_products(category);
CREATE INDEX IF NOT EXISTS idx_express_products_vendor ON express_products(vendor);

-- Orders indexes
CREATE INDEX IF NOT EXISTS idx_express_orders_vendor_status ON express_orders(vendor, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_express_orders_status_created_at ON express_orders(status, created_at DESC);

-- Order items indexes
CREATE INDEX IF NOT EXISTS idx_express_order_items_order_id ON express_order_items(order_id);

-- Support tickets indexes
CREATE INDEX IF NOT EXISTS idx_express_support_tickets_status ON express_support_tickets(status, priority DESC);
CREATE INDEX IF NOT EXISTS idx_express_support_tickets_vendor ON express_support_tickets(vendor);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE express_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE express_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE express_sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE express_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE express_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE express_support_tickets ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- POLICIES
-- =====================================================

-- Categories: Public read access
CREATE POLICY "Public read access to categories" ON express_categories
  FOR SELECT USING (true);

-- Products: Public read for active products, sellers can manage their own
CREATE POLICY "Public read access to active products" ON express_products
  FOR SELECT USING (status = 'active');

CREATE POLICY "Sellers can insert their own products" ON express_products
  FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'seller' AND vendor = auth.jwt() ->> 'vendor');

CREATE POLICY "Sellers can update their own products" ON express_products
  FOR UPDATE USING (auth.jwt() ->> 'role' = 'seller' AND vendor = auth.jwt() ->> 'vendor');

CREATE POLICY "Sellers can delete their own products" ON express_products
  FOR DELETE USING (auth.jwt() ->> 'role' = 'seller' AND vendor = auth.jwt() ->> 'vendor');

CREATE POLICY "Admins can manage all products" ON express_products
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- Sellers: Sellers can read/update their own profile, admins can manage all
CREATE POLICY "Sellers can read their own profile" ON express_sellers
  FOR SELECT USING (auth.jwt() ->> 'role' = 'seller' AND name = auth.jwt() ->> 'vendor');

CREATE POLICY "Sellers can update their own profile" ON express_sellers
  FOR UPDATE USING (auth.jwt() ->> 'role' = 'seller' AND name = auth.jwt() ->> 'vendor');

CREATE POLICY "Admins can manage all sellers" ON express_sellers
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Public read access to sellers" ON express_sellers
  FOR SELECT USING (true);

-- Orders: Sellers can manage their own orders, admins can manage all
CREATE POLICY "Sellers can read their own orders" ON express_orders
  FOR SELECT USING (auth.jwt() ->> 'role' IN ('seller', 'admin') AND (vendor = auth.jwt() ->> 'vendor' OR auth.jwt() ->> 'role' = 'admin'));

CREATE POLICY "Sellers can update their own orders" ON express_orders
  FOR UPDATE USING (auth.jwt() ->> 'role' IN ('seller', 'admin') AND (vendor = auth.jwt() ->> 'vendor' OR auth.jwt() ->> 'role' = 'admin'));

CREATE POLICY "Admins can manage all orders" ON express_orders
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- Order items: Same as orders
CREATE POLICY "Sellers can read their own order items" ON express_order_items
  FOR SELECT USING (
    auth.jwt() ->> 'role' IN ('seller', 'admin') AND
    EXISTS (
      SELECT 1 FROM express_orders
      WHERE id = order_id AND (vendor = auth.jwt() ->> 'vendor' OR auth.jwt() ->> 'role' = 'admin')
    )
  );

CREATE POLICY "Admins can manage all order items" ON express_order_items
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- Support tickets: Sellers can manage their own tickets, admins can manage all
CREATE POLICY "Sellers can read their own support tickets" ON express_support_tickets
  FOR SELECT USING (auth.jwt() ->> 'role' IN ('seller', 'admin') AND (vendor = auth.jwt() ->> 'vendor' OR auth.jwt() ->> 'role' = 'admin'));

CREATE POLICY "Sellers can insert their own support tickets" ON express_support_tickets
  FOR INSERT WITH CHECK (auth.jwt() ->> 'role' IN ('seller', 'admin') AND (vendor = auth.jwt() ->> 'vendor' OR auth.jwt() ->> 'role' = 'admin'));

CREATE POLICY "Sellers can update their own support tickets" ON express_support_tickets
  FOR UPDATE USING (auth.jwt() ->> 'role' IN ('seller', 'admin') AND (vendor = auth.jwt() ->> 'vendor' OR auth.jwt() ->> 'role' = 'admin'));

CREATE POLICY "Admins can manage all support tickets" ON express_support_tickets
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- =====================================================
-- REALTIME SUBSCRIPTIONS
-- =====================================================

-- Enable realtime for all tables
ALTER PUBLICATION supabase_realtime ADD TABLE express_products;
ALTER PUBLICATION supabase_realtime ADD TABLE express_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE express_order_items;
ALTER PUBLICATION supabase_realtime ADD TABLE express_support_tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE express_sellers;

-- =====================================================
-- TRIGGERS FOR UPDATED_AT
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers to tables that have updated_at
CREATE TRIGGER update_express_products_updated_at
  BEFORE UPDATE ON express_products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_express_sellers_updated_at
  BEFORE UPDATE ON express_sellers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_express_orders_updated_at
  BEFORE UPDATE ON express_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_express_support_tickets_updated_at
  BEFORE UPDATE ON express_support_tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- SEED DATA
-- =====================================================

-- Seed categories
INSERT INTO express_categories (id, name, icon, color) VALUES
  ('550e8400-e29b-41d4-a716-446655440001', 'Consumer Electronics', 'headset-outline', '#E4F1FF'),
  ('550e8400-e29b-41d4-a716-446655440002', 'Beauty & Personal Care', 'color-palette-outline', '#FFF3E0'),
  ('550e8400-e29b-41d4-a716-446655440003', 'Home & Living', 'home-outline', '#E8F5E9'),
  ('550e8400-e29b-41d4-a716-446655440004', 'Men''s Fashion', 'shirt-outline', '#FCE4EC'),
  ('550e8400-e29b-41d4-a716-446655440005', 'Women''s Fashion', 'body-outline', '#F3E5F5'),
  ('550e8400-e29b-41d4-a716-446655440006', 'Sports & Outdoors', 'bicycle-outline', '#E0F7FA'),
  ('550e8400-e29b-41d4-a716-446655440007', 'Automotive', 'car-sport-outline', '#FFF8E1'),
  ('550e8400-e29b-41d4-a716-446655440008', 'Groceries', 'basket-outline', '#E8EAF6'),
  ('550e8400-e29b-41d4-a716-446655440009', 'Books & Media', 'book-outline', '#F1F8E9'),
  ('550e8400-e29b-41d4-a716-446655440010', 'Health & Wellness', 'fitness-outline', '#E1F5FE'),
  ('550e8400-e29b-41d4-a716-446655440011', 'Baby & Kids', 'happy-outline', '#FFF3E0'),
  ('550e8400-e29b-41d4-a716-446655440012', 'Pet Supplies', 'paw-outline', '#F3E5F5'),
  ('550e8400-e29b-41d4-a716-446655440013', 'Office & School', 'school-outline', '#E8F5E9'),
  ('550e8400-e29b-41d4-a716-446655440014', 'Tools & Hardware', 'hammer-outline', '#FFF8E1'),
  ('550e8400-e29b-41d4-a716-446655440015', 'Toys & Games', 'game-controller-outline', '#FCE4EC')
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE express_categories IS 'Product categories for ExpressMart';
COMMENT ON TABLE express_products IS 'Products listed by sellers on ExpressMart';
COMMENT ON TABLE express_sellers IS 'Seller profiles and information';
COMMENT ON TABLE express_orders IS 'Customer orders from ExpressMart';
COMMENT ON TABLE express_order_items IS 'Individual items within orders';
COMMENT ON TABLE express_support_tickets IS 'Support tickets from sellers and customers';

-- =====================================================
-- END OF SCHEMA
-- =====================================================