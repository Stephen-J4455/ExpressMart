-- Checkout calls these triggers with an empty search path.
create or replace function public.set_order_number()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.order_number is null or new.order_number = '' then
    new.order_number := public.generate_order_number();
  end if;
  return new;
end;
$$;

create or replace function public.decrement_product_quantity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.express_products
  set quantity = greatest(0, quantity - new.quantity),
      sold_count = sold_count + new.quantity
  where id = new.product_id and track_inventory = true;
  return new;
end;
$$;
