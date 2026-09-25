-- wunch: Row Level Security
-- Customers only see their own data. Public menu data is readable by everyone.
-- Order writes happen only on the server with the service role (Stripe, cron,
-- admin actions after a server-side role check).

alter table public.settings enable row level security;
alter table public.profiles enable row level security;
alter table public.meals enable row level security;
alter table public.menu_days enable row level security;
alter table public.delivery_slots enable row level security;
alter table public.closed_dates enable row level security;
alter table public.coupons enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;
alter table public.coupon_redemptions enable row level security;
alter table public.stripe_events enable row level security;
alter table public.email_log enable row level security;
alter table public.rate_limits enable row level security;

-- settings -------------------------------------------------------------------
create policy "settings are public" on public.settings
  for select to anon, authenticated using (true);
create policy "admins update settings" on public.settings
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- profiles -------------------------------------------------------------------
create policy "read own profile or admin" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy "update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));


-- meals ----------------------------------------------------------------------
create policy "active meals are public" on public.meals
  for select to anon, authenticated
  using ((is_active and archived_at is null) or (select public.is_admin()));
create policy "admins insert meals" on public.meals
  for insert to authenticated with check ((select public.is_admin()));
create policy "admins update meals" on public.meals
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins delete meals" on public.meals
  for delete to authenticated using ((select public.is_admin()));

-- menu_days ------------------------------------------------------------------
create policy "menu is public" on public.menu_days
  for select to anon, authenticated using (true);
create policy "admins insert menu" on public.menu_days
  for insert to authenticated with check ((select public.is_admin()));
create policy "admins update menu" on public.menu_days
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins delete menu" on public.menu_days
  for delete to authenticated using ((select public.is_admin()));


-- delivery_slots -------------------------------------------------------------
create policy "slots are public" on public.delivery_slots
  for select to anon, authenticated using (true);
create policy "admins insert slots" on public.delivery_slots
  for insert to authenticated with check ((select public.is_admin()));
create policy "admins update slots" on public.delivery_slots
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins delete slots" on public.delivery_slots
  for delete to authenticated using ((select public.is_admin()));

-- closed_dates ---------------------------------------------------------------
create policy "closed dates are public" on public.closed_dates
  for select to anon, authenticated using (true);
create policy "admins insert closed dates" on public.closed_dates
  for insert to authenticated with check ((select public.is_admin()));
create policy "admins update closed dates" on public.closed_dates
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins delete closed dates" on public.closed_dates
  for delete to authenticated using ((select public.is_admin()));

-- coupons (never public: codes would leak) -----------------------------------
create policy "admins read coupons" on public.coupons
  for select to authenticated using ((select public.is_admin()));
create policy "admins insert coupons" on public.coupons
  for insert to authenticated with check ((select public.is_admin()));
create policy "admins update coupons" on public.coupons
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins delete coupons" on public.coupons
  for delete to authenticated using ((select public.is_admin()));

create policy "admins read redemptions" on public.coupon_redemptions
  for select to authenticated using ((select public.is_admin()));

-- orders ---------------------------------------------------------------------
create policy "read own orders or admin" on public.orders
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy "read own order items or admin" on public.order_items
  for select to authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()))
  );

create policy "admins read order events" on public.order_events
  for select to authenticated using ((select public.is_admin()));

-- infrastructure -------------------------------------------------------------
create policy "admins read email log" on public.email_log
  for select to authenticated using ((select public.is_admin()));
create policy "admins read stripe events" on public.stripe_events
  for select to authenticated using ((select public.is_admin()));
-- rate_limits: no policies, service role only

-- ---------------------------------------------------------------------------
-- Table privileges, explicit (do not rely on platform default grants).
-- RLS policies above decide which rows; these grants decide which operations.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

-- public menu data
grant select on public.settings, public.meals, public.menu_days, public.delivery_slots, public.closed_dates
  to anon, authenticated;

-- signed-in reads (rows filtered by RLS)
grant select on public.profiles, public.coupons, public.coupon_redemptions, public.orders,
  public.order_items, public.order_events, public.email_log, public.stripe_events
  to authenticated;

-- admin writes (RLS requires is_admin())
grant insert, update, delete on public.meals, public.delivery_slots, public.closed_dates, public.coupons
  to authenticated;
grant update on public.settings to authenticated;
grant insert (menu_date, meal_id, portion_limit, source) on public.menu_days to authenticated;
grant update (portion_limit) on public.menu_days to authenticated;
grant delete on public.menu_days to authenticated;

-- customers may only change their own contact fields, never role or email
grant update (full_name, company, street, postcode, city, floor_room, phone, delivery_note, locale)
  on public.profiles to authenticated;

-- orders, events, payments, email log and rate limits are written only by the server
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
