-- All tables are prefixed with "express" to satisfy naming requirements.
create table if not exists express_categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  icon text,
  color text,
  created_at timestamptz not null default now()
);

create table if not exists express_products (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  vendor text,
  price numeric(12,2) not null default 0,
  rating numeric(3,1) default 0,
  badges text[] default '{}',
  thumbnail text,
  category text references express_categories(name) on delete set null,
  status text not null default 'pending' check (status in ('draft', 'pending', 'active', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists idx_express_products_status_created_at on express_products(status, created_at desc);
create index if not exists idx_express_products_title on express_products using gin (to_tsvector('english', title));

create table if not exists express_sellers (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  email text,
  avatar text,
  phone text,
  location text,
  rating numeric(3,2) default 0,
  fulfillment_speed text,
  weekly_target numeric(12,2),
  created_at timestamptz not null default now()
);

create table if not exists express_orders (
  id uuid primary key default uuid_generate_v4(),
  order_number text not null unique,
  vendor text not null,
  status text not null default 'processing' check (status in ('processing','packed','shipped','delivered','canceled','refunded')),
  total numeric(12,2) not null default 0,
  customer jsonb default '{}'::jsonb,
  eta timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists express_order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references express_orders(id) on delete cascade,
  product_id uuid references express_products(id) on delete set null,
  title text,
  quantity integer not null default 1,
  price numeric(12,2) not null default 0
);

create table if not exists express_support_tickets (
  id uuid primary key default uuid_generate_v4(),
  vendor text,
  subject text not null,
  status text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  priority text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  messages jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_express_orders_vendor_status on express_orders(vendor, status, created_at desc);
create index if not exists idx_express_order_items_order_id on express_order_items(order_id);
create index if not exists idx_express_support_tickets_status on express_support_tickets(status, priority desc);
