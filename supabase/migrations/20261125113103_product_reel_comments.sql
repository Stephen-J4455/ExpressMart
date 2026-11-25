-- The shopping feed uses express_products.id as the Reel ID.
create table public.express_product_reel_comments (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.express_products(id) on delete cascade,
  user_id uuid not null references public.express_profiles(id) on delete cascade,
  comment text not null check (char_length(btrim(comment)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index express_product_reel_comments_product_created_idx
  on public.express_product_reel_comments (product_id, created_at desc);
create index express_product_reel_comments_user_idx
  on public.express_product_reel_comments (user_id);

alter table public.express_product_reel_comments enable row level security;

revoke all on public.express_product_reel_comments from public, anon, authenticated;
grant select on public.express_product_reel_comments to anon, authenticated;
grant insert (product_id, user_id, comment) on public.express_product_reel_comments to authenticated;

create policy "Read comments on visible product reels"
  on public.express_product_reel_comments for select to anon, authenticated
  using (
    exists (
      select 1 from public.express_products as product
      where product.id = express_product_reel_comments.product_id and product.status = 'active'
        and (product.video_url is not null or product.video_hls_url is not null)
    )
  );

create policy "Post own comments on visible product reels"
  on public.express_product_reel_comments for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.express_products as product
      where product.id = express_product_reel_comments.product_id and product.status = 'active'
        and (product.video_url is not null or product.video_hls_url is not null)
    )
  );
