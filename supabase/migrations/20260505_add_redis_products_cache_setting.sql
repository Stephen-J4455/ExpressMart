insert into public.express_settings (key, value, updated_at)
values ('redis_products_cache_enabled', 'false', now())
on conflict (key)
do nothing;
