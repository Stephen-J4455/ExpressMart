alter table if exists public.express_products
  add column if not exists is_preorder boolean not null default false;
