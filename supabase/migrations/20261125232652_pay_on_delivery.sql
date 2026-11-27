alter table public.express_products
  add column if not exists allow_pay_on_delivery boolean not null default false;

create unique index if not exists express_orders_cod_checkout_seller_idx
  on public.express_orders (user_id, payment_reference, seller_id)
  where payment_method = 'pay_on_delivery';

create or replace function public.place_pay_on_delivery_order(
  p_user_id uuid, p_address_id uuid, p_reference text, p_items jsonb,
  p_expected_total numeric, p_coupon_id uuid default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_cart_id uuid;
  v_address public.express_addresses%rowtype;
  v_coupon public.express_coupons%rowtype;
  v_lines jsonb;
  v_orders jsonb;
  v_order public.express_orders%rowtype;
  v_seller record;
  v_subtotal numeric;
  v_shipping numeric;
  v_eligible numeric;
  v_discount numeric := 0;
  v_seller_discount numeric;
  v_total numeric;
begin
  if p_user_id is null or p_reference is null or p_reference !~ '^cod_[A-Za-z0-9_-]{10,100}$' then
    raise exception 'Invalid checkout reference';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cod:' || p_user_id::text, 0));
  select jsonb_agg(to_jsonb(o) order by o.order_number), sum(o.total)
    into v_orders, v_total
  from public.express_orders o
  where o.user_id = p_user_id and o.payment_reference = p_reference
    and o.payment_method = 'pay_on_delivery';
  if v_orders is not null then
    return jsonb_build_object('orders', v_orders, 'total', v_total, 'idempotent', true);
  end if;

  select * into v_address from public.express_addresses
  where id = p_address_id and user_id = p_user_id for share;
  if not found then raise exception 'Choose a valid delivery address'; end if;

  select id into v_cart_id from public.express_carts
  where user_id = p_user_id order by created_at desc, id desc limit 1 for update;
  if not found then raise exception 'Your cart is empty'; end if;

  perform 1 from public.express_cart_items where cart_id = v_cart_id order by id for update;
  if not found then raise exception 'Your cart is empty'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Invalid cart details';
  end if;
  if jsonb_array_length(p_items) > 200 then
    raise exception 'Invalid cart details';
  end if;

  if exists (
    with current_lines as (
      select product_id, size, color, sum(quantity) as quantity
      from public.express_cart_items where cart_id = v_cart_id group by product_id, size, color
    ), expected_lines as (
      select product_id, size, color, sum(quantity) as quantity
      from jsonb_to_recordset(p_items) as i(product_id uuid, size text, color text, quantity integer)
      group by product_id, size, color
    )
    (select * from current_lines except select * from expected_lines)
    union all
    (select * from expected_lines except select * from current_lines)
  ) then
    raise exception 'Your cart changed. Refresh your cart and try again';
  end if;

  perform 1 from public.express_products p
  where p.id in (select product_id from public.express_cart_items where cart_id = v_cart_id)
  order by p.id for update;

  perform 1 from public.express_sellers s where s.id in (
    select p.seller_id from public.express_cart_items ci
    join public.express_products p on p.id = ci.product_id
    where ci.cart_id = v_cart_id
  ) order by s.id for share;

  if exists (
    select 1 from public.express_cart_items ci
    left join public.express_products p on p.id = ci.product_id
    left join public.express_sellers s on s.id = p.seller_id
    where ci.cart_id = v_cart_id
      and (p.allow_pay_on_delivery is not true or p.status is distinct from 'active'
        or s.is_active is distinct from true or ci.quantity <= 0)
  ) then
    raise exception 'Pay on delivery is unavailable for one or more items in your cart';
  end if;

  if exists (
    select 1 from public.express_cart_items ci
    join public.express_products p on p.id = ci.product_id
    where ci.cart_id = v_cart_id and p.track_inventory is true
      and p.allow_backorder is not true and p.is_preorder is not true
    group by p.id, p.quantity having sum(ci.quantity) > coalesce(p.quantity, 0)
  ) then
    raise exception 'One or more items no longer have enough stock';
  end if;

  if p_coupon_id is not null then
    select * into v_coupon from public.express_coupons where id = p_coupon_id for update;
    if not found or v_coupon.is_active is not true or v_coupon.valid_from > now()
      or coalesce(v_coupon.valid_until, v_coupon.expires_at) < now()
      or coalesce(v_coupon.current_uses, v_coupon.usage_count, 0) >=
        coalesce(v_coupon.max_uses, v_coupon.usage_limit, 2147483647)
      or (coalesce(v_coupon.user_limit, 1) > 0 and (
        select count(*) from public.express_coupon_redemptions
        where coupon_id = p_coupon_id and user_id = p_user_id
      ) >= coalesce(v_coupon.user_limit, 1)) then
      raise exception 'This promo code is no longer available. Remove it or use another code';
    end if;
  end if;

  perform 1 from public.express_flash_sales f
  where f.product_id in (select product_id from public.express_cart_items where cart_id = v_cart_id)
    and f.is_active and f.start_time <= now() and f.end_time > now()
  order by f.id for update;

  with lines as (
    select ci.id, ci.product_id, ci.quantity, ci.size, ci.color, ci.variant_id,
      p.seller_id, p.title, p.sku, coalesce(p.thumbnail, p.thumbnails[1]) as thumbnail,
      p.category_id, p.category, greatest(coalesce(p.shipping_fee, 0), 0) as shipping_fee,
      coalesce(f.flash_price, p.price * (1 - coalesce(p.discount, 0) / 100)) as price,
      f.id as flash_sale_id,
      p.track_inventory is true as tracked,
      case when p.track_inventory is true then least(ci.quantity, greatest(
        coalesce(p.quantity, 0) - coalesce(sum(ci.quantity) over (
          partition by p.id order by ci.id rows between unbounded preceding and 1 preceding
        ), 0), 0)) else 0 end as reserved
    from public.express_cart_items ci
    join public.express_products p on p.id = ci.product_id
    left join lateral (
      select fs.id, fs.flash_price from public.express_flash_sales fs
      where fs.product_id = p.id and fs.is_active
        and fs.start_time <= now() and fs.end_time > now()
        and (fs.max_quantity is null or fs.max_quantity - coalesce(fs.sold_quantity, 0) >= (
          select sum(cart_line.quantity) from public.express_cart_items cart_line
          where cart_line.cart_id = v_cart_id and cart_line.product_id = p.id
        ))
      order by fs.start_time desc, fs.id limit 1
    ) f on true
    where ci.cart_id = v_cart_id
  ), priced as (
    select l.*, l.price * l.quantity as subtotal,
      case when p_coupon_id is not null
        and (cardinality(v_coupon.seller_ids) > 0 and l.seller_id = any(v_coupon.seller_ids)
          or coalesce(cardinality(v_coupon.seller_ids),0) = 0
            and (v_coupon.seller_id is null or l.seller_id = v_coupon.seller_id))
        and (v_coupon.category_id is null or l.category_id = v_coupon.category_id or exists (
          select 1 from public.express_categories cat where cat.id = v_coupon.category_id
            and lower(cat.name) = lower(l.category)))
        and (v_coupon.max_product_price is null or l.price <= v_coupon.max_product_price)
        then l.price * l.quantity else 0 end as eligible
    from lines l
  )
  select jsonb_agg(to_jsonb(priced)), sum(subtotal), sum(shipping_fee * quantity), sum(eligible)
    into v_lines, v_subtotal, v_shipping, v_eligible from priced;

  if p_coupon_id is not null then
    if v_eligible <= 0 or v_subtotal < coalesce(v_coupon.min_order_amount, 0) then
      raise exception 'This promo code does not apply to your current cart';
    end if;
    v_discount := case when v_coupon.discount_type = 'percentage'
      then v_eligible * v_coupon.discount_value / 100 else v_coupon.discount_value end;
    if v_coupon.max_discount_amount > 0 then
      v_discount := least(v_discount, v_coupon.max_discount_amount);
    end if;
    v_discount := round(greatest(0, least(v_discount, v_eligible)), 2);
  end if;

  -- Quote the authoritative amount before committing a changed price.
  v_total := round(v_subtotal + v_shipping - v_discount, 2);
  if p_expected_total is distinct from v_total then
    return jsonb_build_object('price_changed', true, 'total', v_total,
      'subtotal', round(v_subtotal, 2), 'shipping', round(v_shipping, 2), 'discount', v_discount);
  end if;

  v_orders := '[]'::jsonb;
  for v_seller in
    with totals as (
      select seller_id, sum(subtotal) as subtotal, sum(shipping_fee * quantity) as shipping,
        sum(eligible) as eligible
      from jsonb_to_recordset(v_lines) as l(seller_id uuid, subtotal numeric, eligible numeric, shipping_fee numeric, quantity integer)
      group by seller_id
    )
    select totals.*, sum(eligible) over(order by seller_id) as eligible_so_far,
      sum(subtotal + shipping) over(order by seller_id) as gross_so_far
    from totals order by seller_id
  loop
    v_seller_discount := 0;
    if v_eligible > 0 then
      v_seller_discount := round(v_discount * v_seller.eligible_so_far / v_eligible, 2)
        - round(v_discount * (v_seller.eligible_so_far - v_seller.eligible) / v_eligible, 2);
    end if;

    insert into public.express_orders (
      user_id, seller_id, vendor, status, subtotal, shipping_fee, discount_amount,
      service_fee, service_fee_pct, total, currency, customer, shipping_address,
      payment_method, payment_status, payment_reference
    ) values (
      p_user_id, v_seller.seller_id,
      (select name from public.express_sellers where id = v_seller.seller_id),
      'processing', round(v_seller.subtotal, 2), round(v_seller.shipping, 2), v_seller_discount,
      0, 0,
      round(v_seller.gross_so_far, 2) - round(v_seller.gross_so_far - v_seller.subtotal - v_seller.shipping, 2) - v_seller_discount,
      'GHS', jsonb_build_object('name', v_address.full_name, 'phone', v_address.phone,
        'email', (select email from public.express_profiles where id = p_user_id)),
      to_jsonb(v_address), 'pay_on_delivery', 'pending', p_reference
    ) returning * into v_order;

    insert into public.express_order_items (
      order_id, product_id, seller_id, title, sku, thumbnail, quantity, price, total,
      size, color, shipping_fee, variant_data
    )
    select v_order.id, l.product_id, l.seller_id, l.title, l.sku, l.thumbnail, l.quantity,
      l.price, round(l.subtotal, 2), l.size, l.color, l.shipping_fee,
      jsonb_build_object('variant_id', l.variant_id, 'cod_reserved', l.reserved,
        'cod_tracked', l.tracked, 'cod_flash_sale_id', l.flash_sale_id)
    from jsonb_to_recordset(v_lines) as l(
      id uuid, product_id uuid, seller_id uuid, title text, sku text, thumbnail text, quantity integer,
      price numeric, subtotal numeric, size text, color text, shipping_fee numeric, variant_id text, reserved integer, tracked boolean, flash_sale_id uuid
    ) where l.seller_id = v_seller.seller_id
    order by l.id;

    v_orders := v_orders || jsonb_build_array(to_jsonb(v_order));
  end loop;

  update public.express_flash_sales f
  set sold_quantity = coalesce(f.sold_quantity, 0) + sold.quantity
  from (
    select flash_sale_id, sum(quantity)::integer as quantity
    from jsonb_to_recordset(v_lines) as l(flash_sale_id uuid, quantity integer)
    where flash_sale_id is not null group by flash_sale_id
  ) sold where f.id = sold.flash_sale_id;

  if p_coupon_id is not null then
    update public.express_coupons
    set current_uses = coalesce(current_uses, usage_count, 0) + 1,
        usage_count = coalesce(usage_count, current_uses, 0) + 1
    where id = p_coupon_id;
    insert into public.express_coupon_redemptions (coupon_id, user_id, reference)
    values (p_coupon_id, p_user_id, p_reference);
  end if;

  delete from public.express_cart_items ci
  where ci.cart_id = v_cart_id and ci.id in (
    select l.id from jsonb_to_recordset(v_lines) as l(id uuid)
  );
  return jsonb_build_object('orders', v_orders, 'total', v_total, 'idempotent', false);
end;
$$;

revoke all on function public.place_pay_on_delivery_order(uuid, uuid, text, jsonb, numeric, uuid)
  from public, anon, authenticated;
grant execute on function public.place_pay_on_delivery_order(uuid, uuid, text, jsonb, numeric, uuid)
  to service_role;

create or replace function public.confirm_pay_on_delivery_order(p_seller_user_id uuid, p_order_id uuid)
returns public.express_orders
language plpgsql
set search_path = ''
as $$
declare
  v_order public.express_orders%rowtype;
begin
  select o.* into v_order
  from public.express_orders o join public.express_sellers s on s.id = o.seller_id
  where o.id = p_order_id and s.user_id = p_seller_user_id
    and o.payment_method = 'pay_on_delivery'
  for update of o;
  if not found then raise exception 'Pay-on-delivery order not found'; end if;
  if v_order.status = 'delivered' and v_order.payment_status = 'success' then return v_order; end if;
  if v_order.status <> 'shipped' or v_order.payment_status is distinct from 'pending' then
    raise exception 'Only an unpaid order marked shipped can be completed';
  end if;
  update public.express_orders set status = 'delivered', payment_status = 'success',
    delivered_at = now(), paid_at = now()
  where id = v_order.id returning * into v_order;
  return v_order;
end;
$$;

revoke all on function public.confirm_pay_on_delivery_order(uuid, uuid) from public, anon, authenticated;
grant execute on function public.confirm_pay_on_delivery_order(uuid, uuid) to service_role;

create schema if not exists private;
create or replace function private.guard_pay_on_delivery()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.payment_method = 'pay_on_delivery' and current_user in ('anon', 'authenticated') then
      raise exception 'Place pay-on-delivery orders through checkout';
    end if;
  elsif old.payment_method = 'pay_on_delivery' or new.payment_method = 'pay_on_delivery' then
    if new.payment_method is distinct from old.payment_method then
      raise exception 'An order payment method cannot be changed to or from pay on delivery';
    end if;
    if current_user in ('anon', 'authenticated') and (
      new.payment_status is distinct from old.payment_status
      or new.paid_at is distinct from old.paid_at
      or new.user_id is distinct from old.user_id
      or new.seller_id is distinct from old.seller_id
      or new.total is distinct from old.total
      or new.payment_reference is distinct from old.payment_reference
    ) then raise exception 'Only the pay-on-delivery service can change payment details'; end if;
    if new.status = 'delivered' and new.payment_status is distinct from 'success' then
      raise exception 'Confirm collection before marking this order delivered';
    end if;
    if old.status = 'canceled' and new.status is distinct from 'canceled' then
      raise exception 'A canceled pay-on-delivery order cannot be reopened';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_pay_on_delivery before insert or update on public.express_orders
for each row execute function private.guard_pay_on_delivery();

create or replace function private.restore_canceled_cod_inventory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.express_products p
  set quantity = coalesce(p.quantity, 0) + items.reserved,
      sold_count = greatest(coalesce(p.sold_count, 0) - items.ordered, 0)
  from (
    select product_id, sum((variant_data->>'cod_reserved')::int)::int as reserved,
      sum(quantity)::int as ordered
    from public.express_order_items
    where order_id = old.id and variant_data->>'cod_tracked' = 'true'
    group by product_id
  ) items
  where p.id = items.product_id;
  update public.express_flash_sales f
  set sold_quantity = greatest(coalesce(f.sold_quantity, 0) - items.quantity, 0)
  from (
    select (variant_data->>'cod_flash_sale_id')::uuid as flash_sale_id, sum(quantity)::integer as quantity
    from public.express_order_items
    where order_id = old.id and variant_data->>'cod_flash_sale_id' is not null
    group by 1
  ) items where f.id = items.flash_sale_id;
  return new;
end;
$$;

revoke all on function private.restore_canceled_cod_inventory() from public, anon, authenticated;
create trigger restore_canceled_cod_inventory after update of status on public.express_orders
for each row when (
  old.payment_method = 'pay_on_delivery' and old.status is distinct from 'canceled'
  and new.status = 'canceled' and old.payment_status = 'pending'
) execute function private.restore_canceled_cod_inventory();
