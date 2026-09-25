-- wunch: database functions
-- Order creation, status transitions and portion reservations happen here, inside
-- transactions, so two people can never buy the last portion.

-- ---------------------------------------------------------------------------
-- Role helper used by RLS policies
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- Statuses that hold portions / slot capacity
-- ---------------------------------------------------------------------------
create or replace function public.order_status_is_live(s public.order_status)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select s in ('pending_payment', 'new', 'accepted', 'delivered', 'refunded', 'partially_refunded');
$$;

-- ---------------------------------------------------------------------------
-- Public availability: order counts per slot (no personal data)
-- ---------------------------------------------------------------------------
create or replace function public.slot_order_counts(p_from date, p_to date)
returns table (delivery_date date, slot_id uuid, order_count int)
language sql
stable
security definer
set search_path = ''
as $$
  select o.delivery_date, o.slot_id, count(*)::int
  from public.orders o
  where o.delivery_date between p_from and p_to
    and public.order_status_is_live(o.status)
  group by o.delivery_date, o.slot_id;
$$;

-- ---------------------------------------------------------------------------
-- Release portions and coupon use held by an order (idempotent)
-- ---------------------------------------------------------------------------
create or replace function public.release_order_reservations(p_order_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_date date;
begin
  update public.orders
     set reservations_released_at = now()
   where id = p_order_id and reservations_released_at is null
  returning delivery_date into v_date;

  if not found then
    return; -- already released
  end if;

  -- lock rows in a stable order (same as create_order) to avoid deadlocks
  perform 1
    from public.menu_days md
   where md.menu_date = v_date
     and md.meal_id in (select oi.meal_id from public.order_items oi where oi.order_id = p_order_id)
   order by md.meal_id
   for update;

  update public.menu_days md
     set portions_reserved = greatest(0, md.portions_reserved - q.quantity)
    from (
      select oi.meal_id, sum(oi.quantity)::int as quantity
        from public.order_items oi
       where oi.order_id = p_order_id
       group by oi.meal_id
    ) q
   where md.menu_date = v_date and md.meal_id = q.meal_id;

  update public.coupon_redemptions
     set released_at = now()
   where order_id = p_order_id and released_at is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Create an order: reserves portions, slot capacity and coupon use atomically.
-- Amounts are computed by the server (src/lib/pricing.ts) from database prices;
-- this function re-checks the prices and the subtotal under lock.
-- ---------------------------------------------------------------------------
create or replace function public.create_order(
  p_user_id uuid,
  p_delivery_date date,
  p_slot_id uuid,
  p_items jsonb,     -- [{ "meal_id": uuid, "quantity": int, "unit_price_rappen": int }]
  p_details jsonb,   -- { customer_name, customer_email, company, street, postcode, city, floor_room, phone, delivery_note }
  p_amounts jsonb,   -- { subtotal, discount, delivery_fee, tip, tip_percent, total, vat_rate_bp, vat }
  p_coupon_id uuid,
  p_locale text
)
returns table (order_id uuid, order_number bigint)
language plpgsql
set search_path = ''
as $$
declare
  v_item record;
  v_meal public.meals%rowtype;
  v_day public.menu_days%rowtype;
  v_slot public.delivery_slots%rowtype;
  v_coupon public.coupons%rowtype;
  v_count int;
  v_subtotal int := 0;
  v_slot_start timestamptz;
  v_slot_end timestamptz;
  v_order_id uuid;
  v_order_number bigint;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_cart' using errcode = 'P0001';
  end if;

  -- serialise orders of the same customer (first-order coupons, duplicate submits)
  perform 1 from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'profile_missing' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.closed_dates where closed_on = p_delivery_date) then
    raise exception 'date_closed' using errcode = 'P0001';
  end if;

  -- slot capacity: lock the slot row so concurrent checkouts for it queue up
  select * into v_slot from public.delivery_slots where id = p_slot_id for update;
  if not found or not v_slot.is_active then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end if;

  v_slot_start := (p_delivery_date + v_slot.starts_at) at time zone 'Europe/Zurich';
  v_slot_end := (p_delivery_date + v_slot.ends_at) at time zone 'Europe/Zurich';
  if v_slot_start <= now() then
    raise exception 'slot_started' using errcode = 'P0001';
  end if;

  if v_slot.max_orders is not null then
    select count(*) into v_count
      from public.orders o
     where o.slot_id = p_slot_id
       and o.delivery_date = p_delivery_date
       and public.order_status_is_live(o.status);
    if v_count >= v_slot.max_orders then
      raise exception 'slot_full' using errcode = 'P0001';
    end if;
  end if;

  -- portions: lock menu rows in meal_id order, check and reserve
  for v_item in
    select (e ->> 'meal_id')::uuid as meal_id,
           sum((e ->> 'quantity')::int)::int as quantity,
           min((e ->> 'unit_price_rappen')::int) as unit_price_min,
           max((e ->> 'unit_price_rappen')::int) as unit_price_max
      from jsonb_array_elements(p_items) e
     group by 1
     order by 1
  loop
    if v_item.quantity is null or v_item.quantity < 1 or v_item.quantity > 50 then
      raise exception 'invalid_quantity' using errcode = 'P0001';
    end if;

    select * into v_meal from public.meals where id = v_item.meal_id;
    if not found or not v_meal.is_active or v_meal.archived_at is not null then
      raise exception 'meal_unavailable:%', v_item.meal_id using errcode = 'P0001';
    end if;

    if v_item.unit_price_min <> v_meal.price_rappen or v_item.unit_price_max <> v_meal.price_rappen then
      raise exception 'price_changed:%', v_item.meal_id using errcode = 'P0001';
    end if;

    if v_meal.always_available then
      insert into public.menu_days (menu_date, meal_id, portion_limit, source)
      values (p_delivery_date, v_meal.id, v_meal.daily_portion_limit, 'always')
      on conflict (menu_date, meal_id) do nothing;
    end if;

    select * into v_day
      from public.menu_days
     where menu_date = p_delivery_date and meal_id = v_meal.id
       for update;
    if not found then
      raise exception 'meal_unavailable:%', v_meal.id using errcode = 'P0001';
    end if;

    if v_day.portion_limit is not null
       and v_day.portions_reserved + v_item.quantity > v_day.portion_limit then
      raise exception 'sold_out:%', v_meal.id using errcode = 'P0001';
    end if;

    update public.menu_days
       set portions_reserved = portions_reserved + v_item.quantity
     where menu_date = p_delivery_date and meal_id = v_meal.id;

    v_subtotal := v_subtotal + v_meal.price_rappen * v_item.quantity;
  end loop;

  if v_subtotal <> (p_amounts ->> 'subtotal')::int then
    raise exception 'amount_mismatch' using errcode = 'P0001';
  end if;

  -- coupon limits that depend on other orders are checked under lock
  if p_coupon_id is not null then
    select * into v_coupon from public.coupons where id = p_coupon_id for update;
    if not found or not v_coupon.is_active or v_coupon.archived_at is not null then
      raise exception 'coupon_invalid' using errcode = 'P0001';
    end if;

    if v_coupon.max_total_uses is not null then
      select count(*) into v_count
        from public.coupon_redemptions
       where coupon_id = p_coupon_id and released_at is null;
      if v_count >= v_coupon.max_total_uses then
        raise exception 'coupon_exhausted' using errcode = 'P0001';
      end if;
    end if;

    if v_coupon.max_uses_per_customer is not null then
      select count(*) into v_count
        from public.coupon_redemptions
       where coupon_id = p_coupon_id and user_id = p_user_id and released_at is null;
      if v_count >= v_coupon.max_uses_per_customer then
        raise exception 'coupon_customer_limit' using errcode = 'P0001';
      end if;
    end if;

    if v_coupon.first_order_only and exists (
      select 1 from public.orders o
       where o.user_id = p_user_id and public.order_status_is_live(o.status)
    ) then
      raise exception 'coupon_first_order_only' using errcode = 'P0001';
    end if;
  end if;

  insert into public.orders (
    user_id, status, locale, delivery_date, slot_id, slot_starts_at, slot_ends_at,
    customer_name, customer_email, company, street, postcode, city, floor_room, phone, delivery_note,
    subtotal_rappen, discount_rappen, delivery_fee_rappen, tip_rappen, tip_percent, total_rappen,
    vat_rate_bp, vat_rappen, coupon_id, coupon_code
  ) values (
    p_user_id, 'pending_payment', coalesce(p_locale, 'de'), p_delivery_date, p_slot_id, v_slot_start, v_slot_end,
    p_details ->> 'customer_name', p_details ->> 'customer_email', nullif(p_details ->> 'company', ''),
    p_details ->> 'street', p_details ->> 'postcode', p_details ->> 'city',
    nullif(p_details ->> 'floor_room', ''), p_details ->> 'phone', nullif(p_details ->> 'delivery_note', ''),
    v_subtotal,
    (p_amounts ->> 'discount')::int,
    (p_amounts ->> 'delivery_fee')::int,
    (p_amounts ->> 'tip')::int,
    (p_amounts ->> 'tip_percent')::int,
    (p_amounts ->> 'total')::int,
    coalesce((p_amounts ->> 'vat_rate_bp')::int, 0),
    coalesce((p_amounts ->> 'vat')::int, 0),
    p_coupon_id,
    case when p_coupon_id is not null then v_coupon.code end
  )
  returning id, orders.order_number into v_order_id, v_order_number;

  insert into public.order_items (order_id, meal_id, name_de, name_en, unit_price_rappen, quantity, line_total_rappen)
  select v_order_id, m.id, m.name_de, m.name_en, m.price_rappen, q.quantity, m.price_rappen * q.quantity
    from (
      select (e ->> 'meal_id')::uuid as meal_id, sum((e ->> 'quantity')::int)::int as quantity
        from jsonb_array_elements(p_items) e
       group by 1
    ) q
    join public.meals m on m.id = q.meal_id;

  insert into public.order_events (order_id, from_status, to_status, actor_type, actor_id, actor_label)
  values (v_order_id, null, 'pending_payment', 'customer', p_user_id, p_details ->> 'customer_email');

  if p_coupon_id is not null then
    insert into public.coupon_redemptions (coupon_id, order_id, user_id, discount_rappen)
    values (p_coupon_id, v_order_id, p_user_id, (p_amounts ->> 'discount')::int);
  end if;

  return query select v_order_id, v_order_number;
end;
$$;

-- ---------------------------------------------------------------------------
-- Status transition with history. Returns the updated order, or null when the
-- order was not in one of the expected statuses (which makes every caller
-- idempotent: webhooks, cron, admin clicks).
-- p_patch may set: reject_reason, stripe_charge_id, capture_before,
-- amount_captured_rappen, amount_refunded_rappen, stripe_fee_rappen,
-- stripe_net_rappen, authorized_at, accepted_at, delivered_at, cancelled_at.
-- ---------------------------------------------------------------------------
create or replace function public.transition_order(
  p_order_id uuid,
  p_from public.order_status[],
  p_to public.order_status,
  p_actor_type text,
  p_actor_id uuid default null,
  p_actor_label text default null,
  p_note text default null,
  p_patch jsonb default '{}'::jsonb,
  p_event_kind text default 'status',
  p_event_data jsonb default '{}'::jsonb
)
returns public.orders
language plpgsql
set search_path = ''
as $$
declare
  v_old public.orders;
  v_new public.orders;
begin
  select * into v_old from public.orders where id = p_order_id for update;
  if not found or not (v_old.status = any (p_from)) then
    return null;
  end if;

  v_new := jsonb_populate_record(v_old, coalesce(p_patch, '{}'::jsonb));

  update public.orders set
    status = p_to,
    reject_reason = v_new.reject_reason,
    stripe_charge_id = v_new.stripe_charge_id,
    capture_before = v_new.capture_before,
    amount_captured_rappen = v_new.amount_captured_rappen,
    amount_refunded_rappen = v_new.amount_refunded_rappen,
    stripe_fee_rappen = v_new.stripe_fee_rappen,
    stripe_net_rappen = v_new.stripe_net_rappen,
    authorized_at = v_new.authorized_at,
    accepted_at = v_new.accepted_at,
    delivered_at = v_new.delivered_at,
    cancelled_at = v_new.cancelled_at,
    action_lock_until = null
  where id = p_order_id
  returning * into v_new;

  insert into public.order_events (order_id, from_status, to_status, kind, actor_type, actor_id, actor_label, note, data)
  values (p_order_id, v_old.status, p_to, coalesce(p_event_kind, 'status'), p_actor_type, p_actor_id, p_actor_label, p_note, coalesce(p_event_data, '{}'::jsonb));

  if p_to in ('rejected', 'auto_cancelled', 'payment_failed', 'expired') then
    perform public.release_order_reservations(p_order_id);
  end if;

  return v_new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Short-lived lock so that an admin click and the cron job never call Stripe
-- for the same order at the same time.
-- ---------------------------------------------------------------------------
create or replace function public.claim_order_action(
  p_order_id uuid,
  p_statuses public.order_status[],
  p_seconds int default 60
)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  update public.orders
     set action_lock_until = now() + make_interval(secs => p_seconds)
   where id = p_order_id
     and status = any (p_statuses)
     and (action_lock_until is null or action_lock_until < now());
  return found;
end;
$$;

create or replace function public.release_order_action(p_order_id uuid)
returns void
language sql
set search_path = ''
as $$
  update public.orders set action_lock_until = null where id = p_order_id;
$$;

-- ---------------------------------------------------------------------------
-- Fixed-window rate limiter. Returns true when the call is allowed.
-- ---------------------------------------------------------------------------
create or replace function public.rate_limit_hit(p_key text, p_max int, p_window_seconds int)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count int;
begin
  insert into public.rate_limits (key, window_start, count)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set count = public.rate_limits.count + 1
  returning count into v_count;

  if random() < 0.02 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_count <= p_max;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges: only the server (service role) may call the write
-- functions. is_admin and slot_order_counts are safe for everyone.
-- ---------------------------------------------------------------------------
revoke execute on function public.create_order(uuid, date, uuid, jsonb, jsonb, jsonb, uuid, text) from public, anon, authenticated;
revoke execute on function public.transition_order(uuid, public.order_status[], public.order_status, text, uuid, text, text, jsonb, text, jsonb) from public, anon, authenticated;
revoke execute on function public.release_order_reservations(uuid) from public, anon, authenticated;
revoke execute on function public.claim_order_action(uuid, public.order_status[], int) from public, anon, authenticated;
revoke execute on function public.release_order_action(uuid) from public, anon, authenticated;
revoke execute on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_email_change() from public, anon, authenticated;

grant execute on function public.create_order(uuid, date, uuid, jsonb, jsonb, jsonb, uuid, text) to service_role;
grant execute on function public.transition_order(uuid, public.order_status[], public.order_status, text, uuid, text, text, jsonb, text, jsonb) to service_role;
grant execute on function public.release_order_reservations(uuid) to service_role;
grant execute on function public.claim_order_action(uuid, public.order_status[], int) to service_role;
grant execute on function public.release_order_action(uuid) to service_role;
grant execute on function public.rate_limit_hit(text, int, int) to service_role;

grant execute on function public.is_admin() to anon, authenticated, service_role;
grant execute on function public.slot_order_counts(date, date) to anon, authenticated, service_role;
