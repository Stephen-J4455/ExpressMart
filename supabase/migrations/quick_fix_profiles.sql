-- Quick fix for "Database error saving new user"
-- Run this in Supabase SQL Editor

-- Create user_role enum if not exists
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('customer', 'seller', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create profiles table if not exists
CREATE TABLE IF NOT EXISTS express_profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email text NOT NULL,
    full_name text,
    phone text,
    avatar_url text,
    role user_role NOT NULL DEFAULT 'customer',
    is_active boolean DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE express_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
DROP POLICY IF EXISTS "Users can view own profile" ON express_profiles;
CREATE POLICY "Users can view own profile" ON express_profiles
    FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON express_profiles;
CREATE POLICY "Users can update own profile" ON express_profiles
    FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Enable insert for service role" ON express_profiles;
CREATE POLICY "Enable insert for service role" ON express_profiles
    FOR INSERT WITH CHECK (true);

-- Function to create profile on signup (SECURITY DEFINER is important!)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO express_profiles (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'customer')
    );
    RETURN NEW;
EXCEPTION
    WHEN others THEN
        -- Log error but don't fail the signup
        RAISE WARNING 'Error creating profile: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to auto-create profile on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =====================================================
-- CART TABLES
-- =====================================================

-- Shopping carts
CREATE TABLE IF NOT EXISTS express_carts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT user_or_session CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)
);

-- Cart items
CREATE TABLE IF NOT EXISTS express_cart_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id uuid NOT NULL REFERENCES express_carts(id) ON DELETE CASCADE,
    product_id uuid NOT NULL,
    quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
    size text,
    color text,
    variant_id text,
    price numeric(12,2) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(cart_id, product_id, size, color, variant_id)
);

-- Enable RLS on cart tables
ALTER TABLE express_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE express_cart_items ENABLE ROW LEVEL SECURITY;

-- Cart policies
DROP POLICY IF EXISTS "Users can manage their own cart" ON express_carts;
CREATE POLICY "Users can manage their own cart" ON express_carts
    FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own cart items" ON express_cart_items;
CREATE POLICY "Users can manage their own cart items" ON express_cart_items
    FOR ALL USING (
        cart_id IN (SELECT id FROM express_carts WHERE user_id = auth.uid())
    );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_express_carts_user ON express_carts(user_id);
CREATE INDEX IF NOT EXISTS idx_express_cart_items_cart ON express_cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_express_cart_items_product ON express_cart_items(product_id);

-- =====================================================
-- PRODUCTS TABLE (minimal for cart to work)
-- =====================================================

CREATE TABLE IF NOT EXISTS express_products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id uuid,
    vendor text,
    title text NOT NULL,
    slug text,
    description text,
    price numeric(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
    compare_at_price numeric(12,2),
    discount numeric(5,2) DEFAULT 0,
    sku text,
    quantity integer DEFAULT 0,
    rating numeric(3,1) DEFAULT 0,
    total_ratings integer DEFAULT 0,
    thumbnail text,
    thumbnails text[] DEFAULT '{}',
    category text,
    tags text[] DEFAULT '{}',
    sizes text[] DEFAULT '{}',
    colors text[] DEFAULT '{}',
    status text NOT NULL DEFAULT 'active',
    is_featured boolean DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on products
ALTER TABLE express_products ENABLE ROW LEVEL SECURITY;

-- Anyone can view active products
DROP POLICY IF EXISTS "Anyone can view active products" ON express_products;
CREATE POLICY "Anyone can view active products" ON express_products
    FOR SELECT USING (status = 'active');
