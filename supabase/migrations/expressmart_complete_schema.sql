-- =====================================================
-- ExpressMart Complete E-Commerce Platform Schema
-- =====================================================
-- This file creates all necessary tables, policies, functions,
-- and realtime subscriptions for the ExpressMart ecosystem:
-- - ExpressMart (Customer App)
-- - Express-Seller (Seller App)  
-- - ExpressMartAdmin (Admin App)
-- =====================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- ENUMS
-- =====================================================

DO $$ BEGIN
    CREATE TYPE product_status AS ENUM ('draft', 'pending', 'active', 'rejected', 'archived');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE order_status AS ENUM ('pending_payment', 'processing', 'packed', 'shipped', 'delivered', 'canceled', 'refunded');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE ticket_status AS ENUM ('open', 'in_progress', 'resolved', 'closed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE ticket_priority AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('customer', 'seller', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM ('pending', 'success', 'failed', 'refunded');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =====================================================
-- TABLES
-- =====================================================

-- User profiles (extends Supabase auth.users)
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

-- Categories table
CREATE TABLE IF NOT EXISTS express_categories (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    name text NOT NULL UNIQUE,
    slug text UNIQUE,
    icon text,
    color text,
    image_url text,
    parent_id uuid REFERENCES express_categories(id) ON DELETE SET NULL,
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Sellers table
CREATE TABLE IF NOT EXISTS express_sellers (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    name text NOT NULL UNIQUE,
    slug text UNIQUE,
    email text NOT NULL,
    phone text,
    avatar text,
    cover_image text,
    description text,
    location text,
    address jsonb DEFAULT '{}'::jsonb,
    rating numeric(3,2) DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
    total_ratings integer DEFAULT 0,
    fulfillment_speed text,
    weekly_target numeric(12,2),
    commission_rate numeric(5,2) DEFAULT 10.00,
    is_verified boolean DEFAULT false,
    is_active boolean DEFAULT true,
    bank_details jsonb DEFAULT '{}'::jsonb,
    paystack_subaccount_code text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Products table
CREATE TABLE IF NOT EXISTS express_products (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    seller_id uuid REFERENCES express_sellers(id) ON DELETE CASCADE,
    vendor text,
    title text NOT NULL,
    slug text,
    description text,
    price numeric(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
    compare_at_price numeric(12,2) CHECK (compare_at_price IS NULL OR compare_at_price >= 0),
    cost_price numeric(12,2) CHECK (cost_price IS NULL OR cost_price >= 0),
    discount numeric(5,2) DEFAULT 0 CHECK (discount >= 0 AND discount <= 100),
    sku text,
    barcode text,
    quantity integer DEFAULT 0 CHECK (quantity >= 0),
    track_inventory boolean DEFAULT true,
    allow_backorder boolean DEFAULT false,
    weight numeric(10,2),
    weight_unit text DEFAULT 'kg',
    rating numeric(3,1) DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
    total_ratings integer DEFAULT 0,
    badges text[] DEFAULT '{}',
    thumbnail text,
    thumbnails text[] DEFAULT '{}',
    category text REFERENCES express_categories(name) ON DELETE SET NULL,
    category_id uuid REFERENCES express_categories(id) ON DELETE SET NULL,
    tags text[] DEFAULT '{}',
    sizes text[] DEFAULT '{}',
    colors text[] DEFAULT '{}',
    variants jsonb DEFAULT '[]'::jsonb,
    specifications jsonb DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('draft', 'pending', 'active', 'rejected', 'archived')),
    rejection_reason text,
    is_featured boolean DEFAULT false,
    view_count integer DEFAULT 0,
    sold_count integer DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Customer addresses
CREATE TABLE IF NOT EXISTS express_addresses (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    label text DEFAULT 'Home',
    full_name text NOT NULL,
    phone text NOT NULL,
    street_address text NOT NULL,
    apartment text,
    city text NOT NULL,
    state text NOT NULL,
    postal_code text,
    country text DEFAULT 'Nigeria',
    latitude numeric(10,8),
    longitude numeric(11,8),
    is_default boolean DEFAULT false,
    delivery_instructions text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Wishlists
CREATE TABLE IF NOT EXISTS express_wishlists (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES express_products(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id, product_id)
);

-- Shopping carts
CREATE TABLE IF NOT EXISTS express_carts (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT user_or_session CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)
);

-- Cart items
CREATE TABLE IF NOT EXISTS express_cart_items (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    cart_id uuid NOT NULL REFERENCES express_carts(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES express_products(id) ON DELETE CASCADE,
    quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
    size text,
    color text,
    variant_id text,
    price numeric(12,2) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(cart_id, product_id, size, color, variant_id)
);

-- Orders table
CREATE TABLE IF NOT EXISTS express_orders (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number text NOT NULL UNIQUE,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    seller_id uuid REFERENCES express_sellers(id) ON DELETE SET NULL,
    vendor text NOT NULL,
    status text NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('pending_payment', 'processing', 'packed', 'shipped', 'delivered', 'canceled', 'refunded')),
    subtotal numeric(12,2) NOT NULL DEFAULT 0,
    discount_amount numeric(12,2) DEFAULT 0,
    shipping_fee numeric(12,2) DEFAULT 0,
    tax_amount numeric(12,2) DEFAULT 0,
    total numeric(12,2) NOT NULL DEFAULT 0,
    currency text DEFAULT 'NGN',
    customer jsonb DEFAULT '{}'::jsonb,
    shipping_address jsonb DEFAULT '{}'::jsonb,
    billing_address jsonb DEFAULT '{}'::jsonb,
    payment_method text,
    payment_reference text,
    payment_status text DEFAULT 'pending' CHECK (payment_status IN ('pending', 'success', 'failed', 'refunded')),
    paystack_reference text,
    notes text,
    tracking_number text,
    tracking_url text,
    shipped_at timestamptz,
    delivered_at timestamptz,
    canceled_at timestamptz,
    cancellation_reason text,
    eta timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Order items table
CREATE TABLE IF NOT EXISTS express_order_items (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id uuid NOT NULL REFERENCES express_orders(id) ON DELETE CASCADE,
    product_id uuid REFERENCES express_products(id) ON DELETE SET NULL,
    seller_id uuid REFERENCES express_sellers(id) ON DELETE SET NULL,
    title text NOT NULL,
    sku text,
    thumbnail text,
    quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
    price numeric(12,2) NOT NULL DEFAULT 0,
    discount numeric(5,2) DEFAULT 0,
    total numeric(12,2) NOT NULL DEFAULT 0,
    size text,
    color text,
    variant_data jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Payments table
CREATE TABLE IF NOT EXISTS express_payments (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id uuid NOT NULL REFERENCES express_orders(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    amount numeric(12,2) NOT NULL,
    currency text DEFAULT 'NGN',
    provider text NOT NULL DEFAULT 'paystack',
    reference text NOT NULL UNIQUE,
    authorization_code text,
    channel text,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'refunded')),
    gateway_response text,
    metadata jsonb DEFAULT '{}'::jsonb,
    paid_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Product reviews
CREATE TABLE IF NOT EXISTS express_reviews (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id uuid NOT NULL REFERENCES express_products(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    order_id uuid REFERENCES express_orders(id) ON DELETE SET NULL,
    rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title text,
    comment text,
    images text[] DEFAULT '{}',
    is_verified_purchase boolean DEFAULT false,
    is_approved boolean DEFAULT false,
    helpful_count integer DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(product_id, user_id, order_id)
);

-- Support tickets table
CREATE TABLE IF NOT EXISTS express_support_tickets (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_number text UNIQUE,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    seller_id uuid REFERENCES express_sellers(id) ON DELETE SET NULL,
    order_id uuid REFERENCES express_orders(id) ON DELETE SET NULL,
    vendor text,
    subject text NOT NULL,
    category text,
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    messages jsonb DEFAULT '[]'::jsonb,
    assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    resolved_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Notifications
CREATE TABLE IF NOT EXISTS express_notifications (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type text NOT NULL,
    title text NOT NULL,
    body text,
    data jsonb DEFAULT '{}'::jsonb,
    is_read boolean DEFAULT false,
    read_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Promo codes / Coupons
CREATE TABLE IF NOT EXISTS express_coupons (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    code text NOT NULL UNIQUE,
    description text,
    discount_type text NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
    discount_value numeric(12,2) NOT NULL,
    min_order_amount numeric(12,2) DEFAULT 0,
    max_discount_amount numeric(12,2),
    usage_limit integer,
    usage_count integer DEFAULT 0,
    user_limit integer DEFAULT 1,
    seller_id uuid REFERENCES express_sellers(id) ON DELETE CASCADE,
    category_id uuid REFERENCES express_categories(id) ON DELETE SET NULL,
    valid_from timestamptz NOT NULL DEFAULT now(),
    valid_until timestamptz,
    is_active boolean DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Coupon usage tracking
CREATE TABLE IF NOT EXISTS express_coupon_usage (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    coupon_id uuid NOT NULL REFERENCES express_coupons(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    order_id uuid REFERENCES express_orders(id) ON DELETE SET NULL,
    discount_amount numeric(12,2) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(coupon_id, order_id)
);

-- Banner / Promotions
CREATE TABLE IF NOT EXISTS express_banners (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    title text NOT NULL,
    subtitle text,
    image_url text NOT NULL,
    link_type text CHECK (link_type IN ('product', 'category', 'seller', 'url', 'none')),
    link_value text,
    position text DEFAULT 'home_top',
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    starts_at timestamptz DEFAULT now(),
    ends_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- App settings
CREATE TABLE IF NOT EXISTS express_settings (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    key text NOT NULL UNIQUE,
    value jsonb NOT NULL,
    description text,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seller payouts
CREATE TABLE IF NOT EXISTS express_payouts (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    seller_id uuid NOT NULL REFERENCES express_sellers(id) ON DELETE CASCADE,
    amount numeric(12,2) NOT NULL,
    currency text DEFAULT 'NGN',
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    reference text UNIQUE,
    bank_details jsonb,
    processed_at timestamptz,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- =====================================================
-- INDEXES
-- =====================================================

-- Profiles indexes
CREATE INDEX IF NOT EXISTS idx_express_profiles_role ON express_profiles(role);
CREATE INDEX IF NOT EXISTS idx_express_profiles_email ON express_profiles(email);

-- Categories indexes
CREATE INDEX IF NOT EXISTS idx_express_categories_slug ON express_categories(slug);
CREATE INDEX IF NOT EXISTS idx_express_categories_parent ON express_categories(parent_id);

-- Sellers indexes
CREATE INDEX IF NOT EXISTS idx_express_sellers_user_id ON express_sellers(user_id);
CREATE INDEX IF NOT EXISTS idx_express_sellers_slug ON express_sellers(slug);
CREATE INDEX IF NOT EXISTS idx_express_sellers_active ON express_sellers(is_active);

-- Products indexes
CREATE INDEX IF NOT EXISTS idx_express_products_seller ON express_products(seller_id);
CREATE INDEX IF NOT EXISTS idx_express_products_status ON express_products(status);
CREATE INDEX IF NOT EXISTS idx_express_products_status_created ON express_products(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_express_products_title_trgm ON express_products USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_express_products_category ON express_products(category);
CREATE INDEX IF NOT EXISTS idx_express_products_category_id ON express_products(category_id);
CREATE INDEX IF NOT EXISTS idx_express_products_vendor ON express_products(vendor);
CREATE INDEX IF NOT EXISTS idx_express_products_featured ON express_products(is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_express_products_tags ON express_products USING gin(tags);

-- Addresses indexes
CREATE INDEX IF NOT EXISTS idx_express_addresses_user ON express_addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_express_addresses_default ON express_addresses(user_id, is_default) WHERE is_default = true;

-- Wishlists indexes
CREATE INDEX IF NOT EXISTS idx_express_wishlists_user ON express_wishlists(user_id);
CREATE INDEX IF NOT EXISTS idx_express_wishlists_product ON express_wishlists(product_id);

-- Carts indexes
CREATE INDEX IF NOT EXISTS idx_express_carts_user ON express_carts(user_id);
CREATE INDEX IF NOT EXISTS idx_express_carts_session ON express_carts(session_id);
CREATE INDEX IF NOT EXISTS idx_express_cart_items_cart ON express_cart_items(cart_id);

-- Orders indexes
CREATE INDEX IF NOT EXISTS idx_express_orders_user ON express_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_express_orders_seller ON express_orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_express_orders_vendor ON express_orders(vendor);
CREATE INDEX IF NOT EXISTS idx_express_orders_status ON express_orders(status);
CREATE INDEX IF NOT EXISTS idx_express_orders_vendor_status ON express_orders(vendor, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_express_orders_payment_status ON express_orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_express_orders_created ON express_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_express_order_items_order ON express_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_express_order_items_product ON express_order_items(product_id);

-- Payments indexes
CREATE INDEX IF NOT EXISTS idx_express_payments_order ON express_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_express_payments_reference ON express_payments(reference);
CREATE INDEX IF NOT EXISTS idx_express_payments_status ON express_payments(status);

-- Reviews indexes
CREATE INDEX IF NOT EXISTS idx_express_reviews_product ON express_reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_express_reviews_user ON express_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_express_reviews_approved ON express_reviews(is_approved) WHERE is_approved = true;

-- Support tickets indexes
CREATE INDEX IF NOT EXISTS idx_express_tickets_user ON express_support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_express_tickets_seller ON express_support_tickets(seller_id);
CREATE INDEX IF NOT EXISTS idx_express_tickets_status ON express_support_tickets(status, priority DESC);
CREATE INDEX IF NOT EXISTS idx_express_tickets_vendor ON express_support_tickets(vendor);

-- Notifications indexes
CREATE INDEX IF NOT EXISTS idx_express_notifications_user ON express_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_express_notifications_unread ON express_notifications(user_id, is_read) WHERE is_read = false;

-- Coupons indexes
CREATE INDEX IF NOT EXISTS idx_express_coupons_code ON express_coupons(code);
CREATE INDEX IF NOT EXISTS idx_express_coupons_active ON express_coupons(is_active, valid_from, valid_until);

-- Banners indexes
CREATE INDEX IF NOT EXISTS idx_express_banners_active ON express_banners(is_active, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_express_banners_position ON express_banners(position, sort_order);

-- Payouts indexes
CREATE INDEX IF NOT EXISTS idx_express_payouts_seller ON express_payouts(seller_id);
CREATE INDEX IF NOT EXISTS idx_express_payouts_status ON express_payouts(status);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

ALTER TABLE express_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE express_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE express_sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE express_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE express_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE express_wishlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE express_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE express_cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE express_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE express_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE express_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE express_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE express_support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE express_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE express_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE express_coupon_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE express_banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE express_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE express_payouts ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- Helper function to get user role
CREATE OR REPLACE FUNCTION get_user_role(user_id uuid)
RETURNS text AS $$
DECLARE
    user_role text;
BEGIN
    SELECT role::text INTO user_role FROM express_profiles WHERE id = user_id;
    RETURN COALESCE(user_role, 'customer');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to get seller_id for a user
CREATE OR REPLACE FUNCTION get_user_seller_id(user_id uuid)
RETURNS uuid AS $$
DECLARE
    sid uuid;
BEGIN
    SELECT id INTO sid FROM express_sellers WHERE express_sellers.user_id = get_user_seller_id.user_id;
    RETURN sid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Profiles policies
CREATE POLICY "Users can view their own profile" ON express_profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON express_profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON express_profiles
    FOR SELECT USING (get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Admins can update all profiles" ON express_profiles
    FOR ALL USING (get_user_role(auth.uid()) = 'admin');

-- Categories policies (public read)
CREATE POLICY "Anyone can view active categories" ON express_categories
    FOR SELECT USING (is_active = true OR get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Admins can manage categories" ON express_categories
    FOR ALL USING (get_user_role(auth.uid()) = 'admin');

-- Sellers policies
CREATE POLICY "Anyone can view active sellers" ON express_sellers
    FOR SELECT USING (is_active = true);

CREATE POLICY "Sellers can view their own profile" ON express_sellers
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Sellers can update their own profile" ON express_sellers
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all sellers" ON express_sellers
    FOR ALL USING (get_user_role(auth.uid()) = 'admin');

-- Products policies
CREATE POLICY "Anyone can view active products" ON express_products
    FOR SELECT USING (status = 'active');

CREATE POLICY "Sellers can view their own products" ON express_products
    FOR SELECT USING (seller_id = get_user_seller_id(auth.uid()));

CREATE POLICY "Sellers can insert products" ON express_products
    FOR INSERT WITH CHECK (seller_id = get_user_seller_id(auth.uid()));

CREATE POLICY "Sellers can update their own products" ON express_products
    FOR UPDATE USING (seller_id = get_user_seller_id(auth.uid()));

CREATE POLICY "Sellers can delete their own draft products" ON express_products
    FOR DELETE USING (seller_id = get_user_seller_id(auth.uid()) AND status = 'draft');

CREATE POLICY "Admins can manage all products" ON express_products
    FOR ALL USING (get_user_role(auth.uid()) = 'admin');

-- Addresses policies
CREATE POLICY "Users can manage their own addresses" ON express_addresses
    FOR ALL USING (user_id = auth.uid());

-- Wishlists policies
CREATE POLICY "Users can manage their own wishlist" ON express_wishlists
    FOR ALL USING (user_id = auth.uid());

-- Carts policies
CREATE POLICY "Users can manage their own cart" ON express_carts
    FOR ALL USING (user_id = auth.uid() OR (user_id IS NULL AND session_id IS NOT NULL));

CREATE POLICY "Users can manage their own cart items" ON express_cart_items
    FOR ALL USING (
        cart_id IN (SELECT id FROM express_carts WHERE user_id = auth.uid())
    );

-- Orders policies
CREATE POLICY "Users can view their own orders" ON express_orders
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create orders" ON express_orders
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Sellers can view orders for their store" ON express_orders
    FOR SELECT USING (seller_id = get_user_seller_id(auth.uid()));

CREATE POLICY "Sellers can update their orders" ON express_orders
    FOR UPDATE USING (seller_id = get_user_seller_id(auth.uid()));

CREATE POLICY "Admins can manage all orders" ON express_orders
    FOR ALL USING (get_user_role(auth.uid()) = 'admin');

-- Order items policies
CREATE POLICY "Users can view their own order items" ON express_order_items
    FOR SELECT USING (
        order_id IN (SELECT id FROM express_orders WHERE user_id = auth.uid())
    );

CREATE POLICY "Sellers can view their order items" ON express_order_items
    FOR SELECT USING (
        order_id IN (SELECT id FROM express_orders WHERE seller_id = get_user_seller_id(auth.uid()))
    );

CREATE POLICY "Admins can manage all order items" ON express_order_items
    FOR ALL USING (get_user_role(auth.uid()) = 'admin');

-- Payments policies
CREATE POLICY "Users can view their own payments" ON express_payments
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all payments" ON express_payments
    FOR ALL USING (get_user_role(auth.uid()) = 'admin');

-- Reviews policies
CREATE POLICY "Anyone can view approved reviews" ON express_reviews
    FOR SELECT USING (is_approved = true);

CREATE POLICY "Users can create reviews" ON express_reviews
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own reviews" ON express_reviews
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own reviews" ON express_reviews
    FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all reviews" ON express_reviews
    FOR ALL USING (get_user_role(auth.uid()) = 'admin');

-- Support tickets policies
CREATE POLICY "Users can manage their own tickets" ON express_support_tickets
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Sellers can manage their tickets" ON express_support_tickets
    FOR ALL USING (seller_id = get_user_seller_id(auth.uid()));

CREATE POLICY "Admins can manage all tickets" ON express_support_tickets
    FOR ALL USING (get_user_role(auth.uid()) = 'admin');

-- Notifications policies
CREATE POLICY "Users can view their own notifications" ON express_notifications
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications" ON express_notifications
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own notifications" ON express_notifications
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role can manage notifications" ON express_notifications
    FOR ALL USING (true);

-- Coupons policies
CREATE POLICY "Anyone can view active coupons" ON express_coupons
    FOR SELECT USING (is_active = true AND valid_from <= now() AND (valid_until IS NULL OR valid_until >= now()));

CREATE POLICY "Sellers can manage their own coupons" ON express_coupons
    FOR ALL USING (seller_id = get_user_seller_id(auth.uid()));

CREATE POLICY "Admins can manage all coupons" ON express_coupons
    FOR ALL USING (get_user_role(auth.uid()) = 'admin');

-- Coupon usage policies
CREATE POLICY "Users can view their own coupon usage" ON express_coupon_usage
    FOR SELECT USING (user_id = auth.uid());

-- Banners policies (public read for active banners)
CREATE POLICY "Anyone can view active banners" ON express_banners
    FOR SELECT USING (is_active = true AND starts_at <= now() AND (ends_at IS NULL OR ends_at >= now()));

CREATE POLICY "Admins can manage banners" ON express_banners
    FOR ALL USING (get_user_role(auth.uid()) = 'admin');

-- Settings policies
CREATE POLICY "Anyone can read settings" ON express_settings
    FOR SELECT USING (true);

CREATE POLICY "Admins can manage settings" ON express_settings
    FOR ALL USING (get_user_role(auth.uid()) = 'admin');

-- Payouts policies
CREATE POLICY "Sellers can view their own payouts" ON express_payouts
    FOR SELECT USING (seller_id = get_user_seller_id(auth.uid()));

CREATE POLICY "Admins can manage all payouts" ON express_payouts
    FOR ALL USING (get_user_role(auth.uid()) = 'admin');

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to generate order number
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS text AS $$
DECLARE
    prefix text := 'EM';
    datestamp text := to_char(now(), 'YYMMDD');
    random_part text := upper(substring(md5(random()::text) from 1 for 4));
BEGIN
    RETURN prefix || datestamp || random_part;
END;
$$ LANGUAGE plpgsql;

-- Function to generate ticket number
CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS text AS $$
DECLARE
    prefix text := 'TKT';
    datestamp text := to_char(now(), 'YYMMDD');
    random_part text := upper(substring(md5(random()::text) from 1 for 4));
BEGIN
    RETURN prefix || datestamp || random_part;
END;
$$ LANGUAGE plpgsql;

-- Function to create profile on signup
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
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update product rating
CREATE OR REPLACE FUNCTION update_product_rating()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        UPDATE express_products
        SET 
            rating = (SELECT COALESCE(AVG(rating), 0) FROM express_reviews WHERE product_id = NEW.product_id AND is_approved = true),
            total_ratings = (SELECT COUNT(*) FROM express_reviews WHERE product_id = NEW.product_id AND is_approved = true)
        WHERE id = NEW.product_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE express_products
        SET 
            rating = (SELECT COALESCE(AVG(rating), 0) FROM express_reviews WHERE product_id = OLD.product_id AND is_approved = true),
            total_ratings = (SELECT COUNT(*) FROM express_reviews WHERE product_id = OLD.product_id AND is_approved = true)
        WHERE id = OLD.product_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to set default address
CREATE OR REPLACE FUNCTION handle_default_address()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_default = true THEN
        UPDATE express_addresses
        SET is_default = false
        WHERE user_id = NEW.user_id AND id != NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to decrement product quantity on order
CREATE OR REPLACE FUNCTION decrement_product_quantity()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE express_products
    SET 
        quantity = GREATEST(0, quantity - NEW.quantity),
        sold_count = sold_count + NEW.quantity
    WHERE id = NEW.product_id AND track_inventory = true;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Updated_at triggers
CREATE TRIGGER update_express_profiles_updated_at
    BEFORE UPDATE ON express_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_express_sellers_updated_at
    BEFORE UPDATE ON express_sellers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_express_products_updated_at
    BEFORE UPDATE ON express_products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_express_addresses_updated_at
    BEFORE UPDATE ON express_addresses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_express_carts_updated_at
    BEFORE UPDATE ON express_carts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_express_cart_items_updated_at
    BEFORE UPDATE ON express_cart_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_express_orders_updated_at
    BEFORE UPDATE ON express_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_express_payments_updated_at
    BEFORE UPDATE ON express_payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_express_reviews_updated_at
    BEFORE UPDATE ON express_reviews
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_express_support_tickets_updated_at
    BEFORE UPDATE ON express_support_tickets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-create profile on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Update product rating on review changes
CREATE TRIGGER on_review_change
    AFTER INSERT OR UPDATE OR DELETE ON express_reviews
    FOR EACH ROW EXECUTE FUNCTION update_product_rating();

-- Handle default address
CREATE TRIGGER on_address_default_change
    BEFORE INSERT OR UPDATE ON express_addresses
    FOR EACH ROW
    WHEN (NEW.is_default = true)
    EXECUTE FUNCTION handle_default_address();

-- Decrement inventory on order item creation
CREATE TRIGGER on_order_item_created
    AFTER INSERT ON express_order_items
    FOR EACH ROW EXECUTE FUNCTION decrement_product_quantity();

-- Auto-generate order number
CREATE OR REPLACE FUNCTION set_order_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
        NEW.order_number := generate_order_number();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_order_number_trigger
    BEFORE INSERT ON express_orders
    FOR EACH ROW EXECUTE FUNCTION set_order_number();

-- Auto-generate ticket number
CREATE OR REPLACE FUNCTION set_ticket_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
        NEW.ticket_number := generate_ticket_number();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_ticket_number_trigger
    BEFORE INSERT ON express_support_tickets
    FOR EACH ROW EXECUTE FUNCTION set_ticket_number();

-- =====================================================
-- REALTIME SUBSCRIPTIONS
-- =====================================================

ALTER PUBLICATION supabase_realtime ADD TABLE express_products;
ALTER PUBLICATION supabase_realtime ADD TABLE express_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE express_order_items;
ALTER PUBLICATION supabase_realtime ADD TABLE express_support_tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE express_sellers;
ALTER PUBLICATION supabase_realtime ADD TABLE express_notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE express_carts;
ALTER PUBLICATION supabase_realtime ADD TABLE express_cart_items;
ALTER PUBLICATION supabase_realtime ADD TABLE express_reviews;

-- =====================================================
-- SEED DATA
-- =====================================================

-- Seed categories
INSERT INTO express_categories (id, name, slug, icon, color) VALUES
    ('550e8400-e29b-41d4-a716-446655440001', 'Consumer Electronics', 'consumer-electronics', 'headset-outline', '#E4F1FF'),
    ('550e8400-e29b-41d4-a716-446655440002', 'Beauty & Personal Care', 'beauty-personal-care', 'color-palette-outline', '#FFF3E0'),
    ('550e8400-e29b-41d4-a716-446655440003', 'Home & Living', 'home-living', 'home-outline', '#E8F5E9'),
    ('550e8400-e29b-41d4-a716-446655440004', 'Men''s Fashion', 'mens-fashion', 'shirt-outline', '#FCE4EC'),
    ('550e8400-e29b-41d4-a716-446655440005', 'Women''s Fashion', 'womens-fashion', 'body-outline', '#F3E5F5'),
    ('550e8400-e29b-41d4-a716-446655440006', 'Sports & Outdoors', 'sports-outdoors', 'bicycle-outline', '#E0F7FA'),
    ('550e8400-e29b-41d4-a716-446655440007', 'Automotive', 'automotive', 'car-sport-outline', '#FFF8E1'),
    ('550e8400-e29b-41d4-a716-446655440008', 'Groceries', 'groceries', 'basket-outline', '#E8EAF6'),
    ('550e8400-e29b-41d4-a716-446655440009', 'Books & Media', 'books-media', 'book-outline', '#F1F8E9'),
    ('550e8400-e29b-41d4-a716-446655440010', 'Health & Wellness', 'health-wellness', 'fitness-outline', '#E1F5FE'),
    ('550e8400-e29b-41d4-a716-446655440011', 'Baby & Kids', 'baby-kids', 'happy-outline', '#FFF3E0'),
    ('550e8400-e29b-41d4-a716-446655440012', 'Pet Supplies', 'pet-supplies', 'paw-outline', '#F3E5F5'),
    ('550e8400-e29b-41d4-a716-446655440013', 'Office & School', 'office-school', 'school-outline', '#E8F5E9'),
    ('550e8400-e29b-41d4-a716-446655440014', 'Tools & Hardware', 'tools-hardware', 'hammer-outline', '#FFF8E1'),
    ('550e8400-e29b-41d4-a716-446655440015', 'Toys & Games', 'toys-games', 'game-controller-outline', '#FCE4EC')
ON CONFLICT (name) DO UPDATE SET
    slug = EXCLUDED.slug,
    icon = EXCLUDED.icon,
    color = EXCLUDED.color;

-- Seed default settings
INSERT INTO express_settings (key, value, description) VALUES
    ('app_name', '"ExpressMart"', 'Application name'),
    ('currency', '"GHS"', 'Default currency'),
    ('currency_symbol', '"GH₵"', 'Currency symbol'),
    ('min_order_amount', '1000', 'Minimum order amount'),
    ('shipping_fee', '500', 'Default shipping fee'),
    ('free_shipping_threshold', '10000', 'Order amount for free shipping'),
    ('commission_rate', '10', 'Default seller commission rate (%)'),
    ('paystack_public_key', '""', 'Paystack public key'),
    ('support_email', '"support@expressmart.com"', 'Support email'),
    ('support_phone', '"+233-XXX-XXXX"', 'Support phone')
ON CONFLICT (key) DO NOTHING;

-- =====================================================
-- STORAGE BUCKETS
-- =====================================================

-- Note: Run these separately in Supabase dashboard or via API
-- INSERT INTO storage.buckets (id, name, public) VALUES ('express-products', 'express-products', true);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('express-avatars', 'express-avatars', true);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('express-banners', 'express-banners', true);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('express-reviews', 'express-reviews', true);

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE express_profiles IS 'User profiles extending Supabase auth';
COMMENT ON TABLE express_categories IS 'Product categories';
COMMENT ON TABLE express_sellers IS 'Seller/vendor profiles';
COMMENT ON TABLE express_products IS 'Product listings';
COMMENT ON TABLE express_addresses IS 'Customer delivery addresses';
COMMENT ON TABLE express_wishlists IS 'User wishlists';
COMMENT ON TABLE express_carts IS 'Shopping carts';
COMMENT ON TABLE express_cart_items IS 'Items in shopping carts';
COMMENT ON TABLE express_orders IS 'Customer orders';
COMMENT ON TABLE express_order_items IS 'Items within orders';
COMMENT ON TABLE express_payments IS 'Payment transactions';
COMMENT ON TABLE express_reviews IS 'Product reviews';
COMMENT ON TABLE express_support_tickets IS 'Customer/seller support tickets';
COMMENT ON TABLE express_notifications IS 'User notifications';
COMMENT ON TABLE express_coupons IS 'Discount coupons';
COMMENT ON TABLE express_coupon_usage IS 'Coupon usage tracking';
COMMENT ON TABLE express_banners IS 'Promotional banners';
COMMENT ON TABLE express_settings IS 'Application settings';
COMMENT ON TABLE express_payouts IS 'Seller payout records';

-- =====================================================
-- END OF SCHEMA
-- =====================================================
