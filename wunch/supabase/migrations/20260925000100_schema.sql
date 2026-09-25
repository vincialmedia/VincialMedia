-- wunch: core schema
-- All money is stored as integer Rappen (CHF 14.50 = 1450).
-- All business dates/times are Europe/Zurich.

create type public.order_status as enum (
  'pending_payment',    -- order created, card not yet authorised
  'new',                -- card authorised (held), waiting for admin decision
  'accepted',           -- admin accepted, payment captured
  'delivered',          -- delivered to the customer
  'rejected',           -- admin rejected, hold released
  'auto_cancelled',     -- nobody decided in time, hold released
  'payment_failed',     -- card declined / authorisation failed
  'expired',            -- checkout abandoned (never authorised) or replaced by a newer checkout
  'refunded',           -- fully refunded after capture
  'partially_refunded'  -- partially refunded after capture
);

-- Generic updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Settings (single row)
-- ---------------------------------------------------------------------------
create table public.settings (
  id boolean primary key default true check (id),
  same_day_cutoff time not null default '10:30',
  max_days_ahead int not null default 5 check (max_days_ahead between 0 and 6),
  delivery_weekdays int[] not null default '{1,2,3,4,5}'
    check (delivery_weekdays <@ array[1,2,3,4,5,6,7]),
  delivery_postcodes text[] not null default '{8952}',
  min_order_rappen int not null default 0 check (min_order_rappen >= 0),
  delivery_fee_rappen int not null default 0 check (delivery_fee_rappen >= 0 and delivery_fee_rappen % 5 = 0),
  tip_percentages int[] not null default '{5,10,15}'
    check (tip_percentages <@ array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,25,30]),
  vat_rate_bp int not null default 0 check (vat_rate_bp between 0 and 10000),
  vat_number text,
  undecided_reminder_minutes int not null default 10 check (undecided_reminder_minutes between 1 and 240),
  business_name text not null default 'wunch',
  business_address text not null default '8952 Schlieren',
  business_email text,
  notify_email text,
  updated_at timestamptz not null default now()
);

comment on column public.settings.vat_rate_bp is 'VAT rate in basis points of a percent: 260 = 2.6 %, 810 = 8.1 %. 0 = not VAT registered.';
comment on column public.settings.notify_email is 'Where admin notifications go. Falls back to ADMIN_EMAILS when empty.';

create trigger settings_updated_at before update on public.settings
  for each row execute function public.set_updated_at();

insert into public.settings default values;

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text check (length(full_name) <= 120),
  company text check (length(company) <= 120),
  street text check (length(street) <= 160),
  postcode text check (length(postcode) <= 10),
  city text check (length(city) <= 80),
  floor_room text check (length(floor_room) <= 80),
  phone text check (length(phone) <= 40),
  delivery_note text check (length(delivery_note) <= 500),
  locale text not null default 'de' check (locale in ('de', 'en')),
  role text not null default 'customer' check (role in ('customer', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_email_idx on public.profiles (lower(email));

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create a profile whenever a user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, locale)
  values (
    new.id,
    new.email,
    case when new.raw_user_meta_data ->> 'locale' = 'en' then 'en' else 'de' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profile email in sync with auth email
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- Meals
-- ---------------------------------------------------------------------------
create table public.meals (
  id uuid primary key default gen_random_uuid(),
  name_de text not null check (length(name_de) between 1 and 120),
  name_en text not null check (length(name_en) between 1 and 120),
  description_de text not null default '' check (length(description_de) <= 2000),
  description_en text not null default '' check (length(description_en) <= 2000),
  price_rappen int not null check (price_rappen >= 0 and price_rappen % 5 = 0),
  category text not null default 'main'
    check (category in ('main', 'soup', 'salad', 'side', 'dessert', 'drink')),
  dietary_tags text[] not null default '{}'
    check (dietary_tags <@ array['vegetarian', 'vegan', 'gluten_free', 'lactose_free', 'spicy']),
  allergens text[] not null default '{}'
    check (allergens <@ array[
      'gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soybeans', 'milk',
      'nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs'
    ]),
  image_path text,
  is_active boolean not null default true,
  always_available boolean not null default false,
  daily_portion_limit int check (daily_portion_limit is null or daily_portion_limit >= 0),
  sort_order int not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.meals.always_available is 'Drinks/sides: offered every delivery day without planning.';
comment on column public.meals.daily_portion_limit is 'Only for always-available meals: portions per day (null = unlimited).';
comment on column public.meals.archived_at is 'Set instead of deleting once a meal has been ordered, so old orders stay intact.';

create index meals_active_idx on public.meals (sort_order) where archived_at is null;

create trigger meals_updated_at before update on public.meals
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Menu planner: which meal runs on which date, with a portion limit
-- ---------------------------------------------------------------------------
create table public.menu_days (
  menu_date date not null,
  meal_id uuid not null references public.meals (id) on delete cascade,
  portion_limit int check (portion_limit is null or portion_limit >= 0),
  portions_reserved int not null default 0 check (portions_reserved >= 0),
  source text not null default 'planned' check (source in ('planned', 'always')),
  created_at timestamptz not null default now(),
  primary key (menu_date, meal_id),
  constraint menu_days_within_limit
    check (portion_limit is null or portions_reserved <= portion_limit)
);

comment on table public.menu_days is 'source=planned rows come from the menu planner; source=always rows are created on demand to count portions of always-available meals.';

create index menu_days_meal_idx on public.menu_days (meal_id);

-- Don't let the planner remove a meal that people already ordered for that day
create or replace function public.prevent_reserved_menu_day_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.portions_reserved > 0 then
    raise exception 'menu_day_has_orders' using errcode = 'P0001';
  end if;
  return old;
end;
$$;

create trigger menu_days_prevent_delete before delete on public.menu_days
  for each row execute function public.prevent_reserved_menu_day_delete();

-- ---------------------------------------------------------------------------
-- Delivery slots and closed dates
-- ---------------------------------------------------------------------------
create table public.delivery_slots (
  id uuid primary key default gen_random_uuid(),
  starts_at time not null,
  ends_at time not null,
  max_orders int check (max_orders is null or max_orders > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (starts_at, ends_at)
);

insert into public.delivery_slots (starts_at, ends_at) values
  ('11:45', '12:15'),
  ('12:15', '12:45'),
  ('12:45', '13:15');

create table public.closed_dates (
  closed_on date primary key,
  reason text check (length(reason) <= 200),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Coupons
-- ---------------------------------------------------------------------------
create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[A-Z0-9_-]{3,32}$'),
  kind text not null check (kind in ('percent', 'fixed')),
  percent_off int check (percent_off between 1 and 100),
  amount_off_rappen int check (amount_off_rappen > 0 and amount_off_rappen % 5 = 0),
  is_active boolean not null default true,
  valid_from date,
  valid_to date,
  max_total_uses int check (max_total_uses is null or max_total_uses > 0),
  max_uses_per_customer int check (max_uses_per_customer is null or max_uses_per_customer > 0),
  min_order_rappen int not null default 0 check (min_order_rappen >= 0),
  first_order_only boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (kind = 'percent' and percent_off is not null and amount_off_rappen is null)
    or (kind = 'fixed' and amount_off_rappen is not null and percent_off is null)
  ),
  check (valid_to is null or valid_from is null or valid_to >= valid_from)
);

comment on column public.coupons.code is 'Stored upper-case; lookups are case-insensitive.';

-- Codes are unique among non-archived coupons
create unique index coupons_code_unique on public.coupons (code) where archived_at is null;

create trigger coupons_updated_at before update on public.coupons
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity (start with 1001) unique,
  user_id uuid references auth.users (id) on delete set null,
  status public.order_status not null default 'pending_payment',
  locale text not null default 'de' check (locale in ('de', 'en')),

  -- delivery
  delivery_date date not null,
  slot_id uuid not null references public.delivery_slots (id),
  slot_starts_at timestamptz not null,
  slot_ends_at timestamptz not null,

  -- snapshot of the delivery details at order time
  customer_name text not null,
  customer_email text not null,
  company text,
  street text not null,
  postcode text not null,
  city text not null,
  floor_room text,
  phone text not null,
  delivery_note text,

  -- amounts (Rappen)
  subtotal_rappen int not null check (subtotal_rappen >= 0),
  discount_rappen int not null default 0 check (discount_rappen >= 0 and discount_rappen <= subtotal_rappen),
  delivery_fee_rappen int not null default 0 check (delivery_fee_rappen >= 0),
  tip_rappen int not null default 0 check (tip_rappen >= 0),
  total_rappen int not null check (total_rappen >= 0),
  tip_percent int,
  vat_rate_bp int not null default 0,
  vat_rappen int not null default 0,
  coupon_id uuid references public.coupons (id),
  coupon_code text,

  -- Stripe
  stripe_payment_intent_id text unique,
  stripe_charge_id text,
  capture_before timestamptz,
  amount_captured_rappen int not null default 0,
  amount_refunded_rappen int not null default 0 check (amount_refunded_rappen >= 0),
  stripe_fee_rappen int,
  stripe_net_rappen int,

  -- lifecycle
  reject_reason text check (length(reject_reason) <= 500),
  authorized_at timestamptz,
  accepted_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  admin_reminded_at timestamptz,
  reservations_released_at timestamptz,
  action_lock_until timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint orders_total_consistent
    check (total_rappen = subtotal_rappen - discount_rappen + delivery_fee_rappen + tip_rappen)
);

create index orders_delivery_idx on public.orders (delivery_date, slot_id, status);
create index orders_user_idx on public.orders (user_id, created_at desc);
create index orders_status_idx on public.orders (status, created_at);
create index orders_coupon_idx on public.orders (coupon_id) where coupon_id is not null;

create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  meal_id uuid not null references public.meals (id) on delete restrict,
  name_de text not null,
  name_en text not null,
  unit_price_rappen int not null check (unit_price_rappen >= 0),
  quantity int not null check (quantity between 1 and 50),
  line_total_rappen int not null,
  check (line_total_rappen = unit_price_rappen * quantity)
);

create index order_items_order_idx on public.order_items (order_id);
create index order_items_meal_idx on public.order_items (meal_id);

create table public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status,
  kind text not null default 'status' check (kind in ('status', 'refund', 'note', 'email', 'payment')),
  actor_type text not null check (actor_type in ('customer', 'admin', 'system', 'stripe')),
  actor_id uuid,
  actor_label text,
  note text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index order_events_order_idx on public.order_events (order_id, created_at);

create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons (id) on delete restrict,
  order_id uuid not null unique references public.orders (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  discount_rappen int not null check (discount_rappen >= 0),
  released_at timestamptz,
  created_at timestamptz not null default now()
);

comment on column public.coupon_redemptions.released_at is 'Set when the order was never paid (rejected, cancelled, failed, expired), so the use no longer counts.';

create index coupon_redemptions_coupon_idx on public.coupon_redemptions (coupon_id) where released_at is null;
create index coupon_redemptions_user_idx on public.coupon_redemptions (user_id, coupon_id) where released_at is null;

-- ---------------------------------------------------------------------------
-- Infrastructure tables
-- ---------------------------------------------------------------------------
create table public.stripe_events (
  id text primary key,
  type text not null,
  livemode boolean not null default false,
  stripe_created_at timestamptz,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);

create table public.email_log (
  id bigint generated always as identity primary key,
  dedupe_key text unique,
  to_email text not null,
  template text not null,
  locale text not null,
  order_id uuid references public.orders (id) on delete set null,
  status text not null check (status in ('sent', 'failed', 'dev')),
  provider_id text,
  error text,
  created_at timestamptz not null default now()
);

create index email_log_order_idx on public.email_log (order_id);

create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);
