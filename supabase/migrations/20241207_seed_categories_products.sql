-- Seed baseline categories and sample products for ExpressMart/Express-Seller
-- Run this script after the core schema migrations. It is idempotent: re-running it
-- keeps the data in sync without creating duplicates.

BEGIN;

-- Upsert featured categories
WITH cat_data(name, slug, icon, color) AS (
  VALUES
    ('Consumer Electronics', 'consumer-electronics', 'headset-outline', '#E4F1FF'),
    ('Beauty & Personal Care', 'beauty-personal-care', 'color-palette-outline', '#FFF3E0'),
    ('Home & Living', 'home-and-living', 'home-outline', '#E8F5E9'),
    ('Men''s Fashion', 'mens-fashion', 'shirt-outline', '#FCE4EC'),
    ('Women''s Fashion', 'womens-fashion', 'body-outline', '#F3E5F5'),
    ('Sports & Outdoors', 'sports-outdoors', 'bicycle-outline', '#E0F7FA'),
    ('Groceries', 'groceries', 'basket-outline', '#E8EAF6'),
    ('Health & Wellness', 'health-wellness', 'fitness-outline', '#E1F5FE')
)
INSERT INTO express_categories (name, slug, icon, color)
SELECT name, slug, icon, color
FROM cat_data
ON CONFLICT (name) DO UPDATE
SET slug = EXCLUDED.slug,
    icon = EXCLUDED.icon,
    color = EXCLUDED.color;

-- Resolve seller ids by brand name (NULL if the seller has not been created yet)
WITH vendor_map AS (
  SELECT 'Nova Retail'::text AS vendor_name, (
    SELECT id FROM express_sellers WHERE name = 'Nova Retail'
  ) AS seller_id
  UNION ALL
  SELECT 'Urban Threads'::text, (
    SELECT id FROM express_sellers WHERE name = 'Urban Threads'
  )
  UNION ALL
  SELECT 'Daily Fresh Market'::text, (
    SELECT id FROM express_sellers WHERE name = 'Daily Fresh Market'
  )
  UNION ALL
  SELECT 'Glam Haven'::text, (
    SELECT id FROM express_sellers WHERE name = 'Glam Haven'
  )
  UNION ALL
  SELECT 'StrideFlex'::text, (
    SELECT id FROM express_sellers WHERE name = 'StrideFlex'
  )
  UNION ALL
  SELECT 'HomeNest'::text, (
    SELECT id FROM express_sellers WHERE name = 'HomeNest'
  )
),
handcrafted_products AS (
  SELECT
    'f3b78a44-5402-4c96-9d83-d5b1b9534c01'::uuid AS id,
    (SELECT seller_id FROM vendor_map WHERE vendor_name = 'Nova Retail') AS seller_id,
    'Nova Retail'::text AS vendor,
    'Nova Pulse ANC Earbuds'::text AS title,
    'nova-pulse-anc-earbuds'::text AS slug,
    'Premium noise-canceling earbuds tuned for deep bass and crystal calls.'::text AS description,
    1299.00::numeric AS price,
    1599.00::numeric AS compare_at_price,
    720.00::numeric AS cost_price,
    18.0::numeric AS discount,
    'ELEC-EB-001'::text AS sku,
    250::integer AS quantity,
    true AS track_inventory,
    false AS allow_backorder,
    4.8::numeric AS rating,
    84::integer AS total_ratings,
    ARRAY['Best Seller', 'New']::text[] AS badges,
    'https://images.unsplash.com/photo-1511376777868-611b54f68947?auto=format&fit=crop&w=800&q=80'::text AS thumbnail,
    ARRAY[
      'https://images.unsplash.com/photo-1511376777868-611b54f68947?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1517059224940-d4af9eec41e5?auto=format&fit=crop&w=800&q=80'
    ]::text[] AS thumbnails,
    'Consumer Electronics'::text AS category_name,
    ARRAY['electronics', 'audio', 'wireless']::text[] AS tags,
    ARRAY['Universal']::text[] AS sizes,
    ARRAY['Obsidian Black', 'Frost White']::text[] AS colors,
    'active'::text AS status,
    410::integer AS sold_count
  UNION ALL
  SELECT
    'a1e0ced3-1a99-46b6-a3af-193f64f6d5d2',
    (SELECT seller_id FROM vendor_map WHERE vendor_name = 'Urban Threads'),
    'Urban Threads',
    'Urban Threads Linen Shirt',
    'urban-threads-linen-shirt',
    'Breathable premium-linen button-down built for the tropics.',
    349.00,
    399.00,
    180.00,
    12.5,
    'MENS-SH-214',
    180,
    true,
    false,
    4.6,
    57,
    ARRAY['New Arrival'],
    'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=800&q=80',
    ARRAY[
      'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=800&q=80'
    ],
    'Men''s Fashion',
    ARRAY['fashion', 'linen'],
    ARRAY['S', 'M', 'L', 'XL'],
    ARRAY['Sand', 'Ocean Blue'],
    'active',
    96
  UNION ALL
  SELECT
    '0f3940c6-4638-4abc-8d43-342539e0a9c5',
    (SELECT seller_id FROM vendor_map WHERE vendor_name = 'Daily Fresh Market'),
    'Daily Fresh Market',
    'Daily Fresh Organic Veggie Box',
    'daily-fresh-veggie-box',
    'Seasonal selection of 12 pesticide-free vegetables sourced daily.',
    249.00,
    NULL,
    140.00,
    0,
    'GROC-VB-010',
    90,
    true,
    true,
    4.9,
    112,
    ARRAY['Subscription Ready'],
    'https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=800&q=80',
    ARRAY[
      'https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=800&q=80'
    ],
    'Groceries',
    ARRAY['groceries', 'organic'],
    ARRAY['Standard'],
    ARRAY['Multi'],
    'active',
    205
  UNION ALL
  SELECT
    'f0be4c10-d801-4ff3-92f3-1b7dd29b8450',
    (SELECT seller_id FROM vendor_map WHERE vendor_name = 'Glam Haven'),
    'Glam Haven',
    'Glam Haven Radiant Skin Serum',
    'glam-haven-radiant-skin-serum',
    'Vitamin C + niacinamide serum for brighter, hydrated skin.',
    599.00,
    699.00,
    260.00,
    14.3,
    'BEAU-SR-078',
    320,
    true,
    false,
    4.7,
    241,
    ARRAY['Dermatologist Approved'],
    'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=800&q=80',
    ARRAY[
      'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=800&q=80'
    ],
    'Beauty & Personal Care',
    ARRAY['beauty', 'serum'],
    ARRAY['30ml'],
    ARRAY['Amber'],
    'active',
    332
  UNION ALL
  SELECT
    '51c6edc0-fb3c-4e50-9120-6759a4a1f31f',
    (SELECT seller_id FROM vendor_map WHERE vendor_name = 'StrideFlex'),
    'StrideFlex',
    'StrideFlex Tempo Running Shoes',
    'strideflex-tempo-running-shoes',
    'Responsive cushioning with knit upper for daily miles.',
    749.00,
    899.00,
    420.00,
    16.7,
    'SPRT-RN-332',
    210,
    true,
    false,
    4.5,
    178,
    ARRAY['Performance'],
    'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=800&q=80',
    ARRAY[
      'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1514986888952-8cd320577b68?auto=format&fit=crop&w=800&q=80'
    ],
    'Sports & Outdoors',
    ARRAY['sports', 'running'],
    ARRAY['38', '39', '40', '41', '42', '43'],
    ARRAY['Carbon Black', 'Volt Lime'],
    'active',
    142
  UNION ALL
  SELECT
    'f5f8a7c5-4201-409f-80b1-5d9b9cbe344c',
    (SELECT seller_id FROM vendor_map WHERE vendor_name = 'HomeNest'),
    'HomeNest',
    'HomeNest Smart Aroma Diffuser',
    'homenest-smart-aroma-diffuser',
    'Ultrasonic diffuser with adaptive humidity and night glow.',
    289.00,
    329.00,
    140.00,
    12.2,
    'HOME-DF-044',
    160,
    true,
    true,
    4.4,
    63,
    ARRAY['Bundle & Save'],
    'https://images.unsplash.com/photo-1501876725168-00c445821c9e?auto=format&fit=crop&w=800&q=80',
    ARRAY[
      'https://images.unsplash.com/photo-1501876725168-00c445821c9e?auto=format&fit=crop&w=800&q=80'
    ],
    'Home & Living',
    ARRAY['home', 'wellness'],
    ARRAY['Standard'],
    ARRAY['Matte White'],
    'active',
    54
),
generated_index AS (
  SELECT
    gs AS row_id,
    ((gs - 1) % 8) + 1 AS category_idx,
    ((gs - 1) % 6) + 1 AS vendor_idx
  FROM generate_series(1, 200) AS gs
),
category_traits AS (
  SELECT * FROM (
    VALUES
      (1, 'Consumer Electronics', 'Pulse Series', 'pulse-series', 'Smart modular accessory built for hybrid workspaces.', 199.00, 35.00, 'ELEC-GEN', ARRAY['Tech Essential', 'Rapid Charge', 'Pro Tune']::text[], ARRAY['electronics', 'smart']::text[], ARRAY['Standard']::text[], ARRAY['Obsidian', 'Frost', 'Citrus']::text[]),
      (2, 'Beauty & Personal Care', 'Glam Dew', 'glam-dew', 'Clinic-grade skincare booster crafted for daily rituals.', 159.00, 25.00, 'BEAU-GEN', ARRAY['Glow Boost', 'Derm Pick', 'Vegan Friendly']::text[], ARRAY['beauty', 'skincare']::text[], ARRAY['30ml']::text[], ARRAY['Amber', 'Rose', 'Iris']::text[]),
      (3, 'Home & Living', 'HomeNest Aura', 'homenest-aura', 'Calming home upgrade designed for mindful spaces.', 189.00, 22.00, 'HOME-GEN', ARRAY['Bundle & Save', 'Eco Mode', 'Quiet Run']::text[], ARRAY['home', 'decor']::text[], ARRAY['Standard']::text[], ARRAY['Ash', 'Warm Sand', 'Mist']::text[]),
      (4, 'Men''s Fashion', 'Urban Threads Form', 'urban-threads-form', 'Lightweight wardrobe staples with breathable weaves.', 219.00, 18.00, 'MENS-GEN', ARRAY['New Arrival', 'Tailored Fit', 'Weekend Ready']::text[], ARRAY['fashion', 'menswear']::text[], ARRAY['S', 'M', 'L', 'XL']::text[], ARRAY['Ink', 'Sage', 'Clay']::text[]),
      (5, 'Women''s Fashion', 'Luma Flow', 'luma-flow', 'Elevated basics with flattering drape and movement.', 229.00, 21.00, 'WMNS-GEN', ARRAY['Statement', 'Soft Touch', 'Limited']::text[], ARRAY['fashion', 'womenswear']::text[], ARRAY['XS', 'S', 'M', 'L', 'XL']::text[], ARRAY['Pearl', 'Terracotta', 'Noir']::text[]),
      (6, 'Sports & Outdoors', 'StrideFlex Motion', 'strideflex-motion', 'Performance-ready gear tested for daily miles.', 259.00, 28.00, 'SPRT-GEN', ARRAY['Performance', 'Trail Ready', 'CoolDry']::text[], ARRAY['sports', 'outdoors']::text[], ARRAY['38', '39', '40', '41', '42', '43']::text[], ARRAY['Volt', 'Carbon', 'Wave']::text[]),
      (7, 'Groceries', 'Daily Fresh Harvest', 'daily-fresh-harvest', 'Farm-direct pantry staples curated for freshness.', 79.00, 12.00, 'GROC-GEN', ARRAY['Market Pick', 'Bulk Saver', 'Family Pack']::text[], ARRAY['groceries', 'organic']::text[], ARRAY['Standard']::text[], ARRAY['Multi']::text[]),
      (8, 'Health & Wellness', 'Vital Balance', 'vital-balance', 'Wellness essentials formulated for busy routines.', 139.00, 19.00, 'HLTH-GEN', ARRAY['Immunity', 'Daily Dose', 'Clinically Tested']::text[], ARRAY['health', 'wellness']::text[], ARRAY['Standard']::text[], ARRAY['Slate', 'Citrine', 'Snow']::text[])
  ) AS t(
    category_idx,
    category_name,
    title_prefix,
    slug_prefix,
    description_stub,
    price_floor,
    price_step,
    sku_prefix,
    badge_options,
    tag_options,
    size_options,
    color_options
  )
),
vendor_traits AS (
  SELECT * FROM (
    VALUES
      (1, 'Nova Retail', 'vendor-nova'),
      (2, 'Urban Threads', 'vendor-urban'),
      (3, 'Daily Fresh Market', 'vendor-fresh'),
      (4, 'Glam Haven', 'vendor-glam'),
      (5, 'StrideFlex', 'vendor-stride'),
      (6, 'HomeNest', 'vendor-home')
  ) AS t(vendor_idx, vendor_name, tag_suffix)
),
generated_products AS (
  SELECT
    uuid_generate_v5(
      '00000000-0000-0000-0000-00000000feed'::uuid,
      concat('auto-', gi.row_id)
    ) AS id,
    (SELECT seller_id FROM vendor_map WHERE vendor_name = vt.vendor_name) AS seller_id,
    vt.vendor_name AS vendor,
    concat(ct.title_prefix, ' ', to_char(gi.row_id + 6, 'FM000')) AS title,
    regexp_replace(lower(concat(ct.slug_prefix, '-', gi.row_id + 6)), '[^a-z0-9]+', '-', 'g') AS slug,
    concat(ct.description_stub, ' Variant ', to_char(gi.row_id, 'FM000')) AS description,
    ROUND(ct.price_floor + (gi.row_id % 7) * ct.price_step, 2) AS price,
    ROUND((ct.price_floor + (gi.row_id % 7) * ct.price_step) * 1.18, 2) AS compare_at_price,
    ROUND((ct.price_floor + (gi.row_id % 7) * ct.price_step) * 0.58, 2) AS cost_price,
    ROUND(((gi.row_id % 6) * 2.5)::numeric, 2) AS discount,
    concat(ct.sku_prefix, '-', to_char(gi.row_id, 'FM000')) AS sku,
    45 + (gi.row_id % 160) AS quantity,
    true AS track_inventory,
    (gi.row_id % 5 = 0) AS allow_backorder,
    ROUND(((38 + (gi.row_id % 13))::numeric) / 10, 1) AS rating,
    40 + (gi.row_id % 260) AS total_ratings,
    ARRAY[
      ct.badge_options[((gi.row_id - 1) % 3) + 1],
      ct.badge_options[(gi.row_id % 3) + 1]
    ] AS badges,
    concat('https://images.unsplash.com/seed/express-', ct.slug_prefix, '-', gi.row_id, '?auto=format&fit=crop&w=800&q=80') AS thumbnail,
    ARRAY[
      concat('https://images.unsplash.com/seed/express-', ct.slug_prefix, '-', gi.row_id, '?auto=format&fit=crop&w=800&q=80'),
      concat('https://images.unsplash.com/seed/express-', ct.slug_prefix, '-', gi.row_id, '-alt?auto=format&fit=crop&w=800&q=80')
    ]::text[] AS thumbnails,
    ct.category_name AS category_name,
    ct.tag_options || ARRAY[vt.tag_suffix] AS tags,
    ct.size_options AS sizes,
    ct.color_options AS colors,
    CASE
      WHEN gi.row_id % 13 = 0 THEN 'draft'
      WHEN gi.row_id % 11 = 0 THEN 'rejected'
      WHEN gi.row_id % 7 = 0 THEN 'pending'
      ELSE 'active'
    END AS status,
    CASE
      WHEN gi.row_id % 13 = 0 OR gi.row_id % 11 = 0 THEN 0
      ELSE 18 + (gi.row_id % 240)
    END AS sold_count
  FROM generated_index gi
  JOIN category_traits ct ON ct.category_idx = gi.category_idx
  JOIN vendor_traits vt ON vt.vendor_idx = gi.vendor_idx
),
product_data AS (
  SELECT * FROM handcrafted_products
  UNION ALL
  SELECT * FROM generated_products
)
INSERT INTO express_products (
  id,
  seller_id,
  vendor,
  title,
  slug,
  description,
  price,
  compare_at_price,
  cost_price,
  discount,
  sku,
  quantity,
  track_inventory,
  allow_backorder,
  rating,
  total_ratings,
  badges,
  thumbnail,
  thumbnails,
  category,
  category_id,
  tags,
  sizes,
  colors,
  status,
  sold_count
)
SELECT
  id,
  seller_id,
  vendor,
  title,
  slug,
  description,
  price,
  compare_at_price,
  cost_price,
  discount,
  sku,
  quantity,
  track_inventory,
  allow_backorder,
  rating,
  total_ratings,
  badges,
  thumbnail,
  thumbnails,
  category_name,
  (SELECT id FROM express_categories WHERE name = category_name),
  tags,
  sizes,
  colors,
  status,
  sold_count
FROM product_data
ON CONFLICT (id) DO UPDATE SET
  seller_id = EXCLUDED.seller_id,
  vendor = EXCLUDED.vendor,
  title = EXCLUDED.title,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  compare_at_price = EXCLUDED.compare_at_price,
  cost_price = EXCLUDED.cost_price,
  discount = EXCLUDED.discount,
  sku = EXCLUDED.sku,
  quantity = EXCLUDED.quantity,
  track_inventory = EXCLUDED.track_inventory,
  allow_backorder = EXCLUDED.allow_backorder,
  rating = EXCLUDED.rating,
  total_ratings = EXCLUDED.total_ratings,
  badges = EXCLUDED.badges,
  thumbnail = EXCLUDED.thumbnail,
  thumbnails = EXCLUDED.thumbnails,
  category = EXCLUDED.category,
  category_id = EXCLUDED.category_id,
  tags = EXCLUDED.tags,
  sizes = EXCLUDED.sizes,
  colors = EXCLUDED.colors,
  status = EXCLUDED.status,
  sold_count = EXCLUDED.sold_count,
  updated_at = now();

COMMIT;
