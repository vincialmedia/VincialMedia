-- wunch: storage bucket for meal photos, realtime for the admin Today view,
-- and the 5-minute scheduled job.

-- ---------------------------------------------------------------------------
-- Storage: meal photos (public read, admin write)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meal-images', 'meal-images', true, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "admins read meal images" on storage.objects
  for select to authenticated
  using (bucket_id = 'meal-images' and (select public.is_admin()));
create policy "admins upload meal images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'meal-images' and (select public.is_admin()));
create policy "admins update meal images" on storage.objects
  for update to authenticated
  using (bucket_id = 'meal-images' and (select public.is_admin()));
create policy "admins delete meal images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'meal-images' and (select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Realtime: admins get live order changes (RLS decides who sees which rows;
-- customers only ever receive their own orders)
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.orders;

-- ---------------------------------------------------------------------------
-- Scheduled job: pg_cron calls the protected API route /api/cron/tick every
-- 5 minutes. URL and secret live in Supabase Vault (see README):
--   select vault.create_secret('https://wunch.ch/api/cron/tick', 'wunch_cron_url');
--   select vault.create_secret('<CRON_SECRET>', 'wunch_cron_secret');
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.cron_tick()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  v_request_id bigint;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'wunch_cron_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'wunch_cron_secret';
  if v_url is null or v_secret is null then
    return null; -- not configured in this environment
  end if;

  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke execute on function public.cron_tick() from public, anon, authenticated;

select cron.schedule('wunch-tick', '*/5 * * * *', $$ select public.cron_tick(); $$);
