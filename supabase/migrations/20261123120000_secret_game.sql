-- Two-player question game served at /secret-game.
--
-- Tables live in the private schema "secret_game", which the API does not
-- expose and anon/authenticated cannot use. The page calls only the
-- SECURITY DEFINER functions public.sg_*, which check a player's private
-- token. A player never receives the other player's answers: sg_state
-- compares both sets and returns only the matches.

create schema if not exists secret_game;
revoke all on schema secret_game from public;

create table secret_game.games (
  id uuid primary key default gen_random_uuid(),
  invite text,
  invite_hash text unique,
  name1 text not null,
  name2 text,
  custom jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table secret_game.players (
  token_hash text primary key,
  game_id uuid not null references secret_game.games (id) on delete cascade,
  seat smallint not null check (seat in (1, 2)),
  answers jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (game_id, seat)
);

alter table secret_game.games enable row level security;
alter table secret_game.players enable row level security;

-- ---------- internal helpers ----------

create function secret_game.hash(p text) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(p, 'UTF8')), 'hex')
$$;

create function secret_game.new_token() returns text
language sql volatile set search_path = '' as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
$$;

create function secret_game.fail(p_message text, p_kind text) returns void
language plpgsql set search_path = '' as $$
begin
  -- PTxxx sets the HTTP status in PostgREST; the hint is a stable code for the page.
  raise exception using
    message = p_message,
    hint = p_kind,
    errcode = case p_kind when 'gone' then 'PT401' when 'used' then 'PT404' when 'full' then 'PT429' else 'PT400' end;
end;
$$;

create function secret_game.clean_name(p text) returns text
language plpgsql set search_path = '' as $$
declare
  v text := left(btrim(regexp_replace(coalesce(p, ''), '[[:cntrl:]]', '', 'g')), 30);
begin
  if v = '' then perform secret_game.fail('Please enter a name.', 'invalid'); end if;
  return v;
end;
$$;

create function secret_game.player(p_token text) returns secret_game.players
language plpgsql set search_path = '' as $$
declare
  v secret_game.players;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{20,80}$' then
    perform secret_game.fail('This game doesn''t exist anymore.', 'gone');
  end if;
  select * into v from secret_game.players where token_hash = secret_game.hash(p_token);
  if not found then perform secret_game.fail('This game doesn''t exist anymore.', 'gone'); end if;
  return v;
end;
$$;

-- "spank:give" from one player pairs with "spank:get" from the other.
create function secret_game.partner_key(k text) returns text
language sql immutable set search_path = '' as $$
  select case
    when k like '%:give' then left(k, -5) || ':get'
    when k like '%:get' then left(k, -4) || ':give'
    else k end
$$;

create function secret_game.state(p_token_hash text) returns jsonb
language plpgsql set search_path = '' as $$
declare
  me secret_game.players;
  partner secret_game.players;
  g secret_game.games;
  v_matches jsonb := '[]'::jsonb;
begin
  select * into me from secret_game.players where token_hash = p_token_hash;
  select * into g from secret_game.games where id = me.game_id;
  select * into partner from secret_game.players where game_id = me.game_id and seat <> me.seat;
  if partner.token_hash is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
             'k', a.key,
             'l', case when a.value #>> '{}' = 'y' and b.value #>> '{}' = 'y' then 'y' else 'm' end
           ) order by a.key), '[]'::jsonb)
      into v_matches
      from jsonb_each(me.answers) a
      join jsonb_each(partner.answers) b on b.key = secret_game.partner_key(a.key)
     where (a.value #>> '{}', b.value #>> '{}') in (('y', 'y'), ('y', 'm'), ('m', 'y'));
  end if;
  return jsonb_build_object(
    'me', jsonb_build_object(
      'seat', me.seat,
      'name', case when me.seat = 1 then g.name1 else g.name2 end,
      'answers', me.answers),
    'partner', case when partner.token_hash is null then null else jsonb_build_object(
      'name', case when partner.seat = 1 then g.name1 else g.name2 end,
      'count', (select count(*) from jsonb_object_keys(partner.answers))) end,
    'invite', case when me.seat = 1 and g.name2 is null then g.invite else null end,
    'custom', g.custom,
    'matches', v_matches);
end;
$$;

revoke all on all functions in schema secret_game from public;

-- ---------- functions the page calls ----------

create function public.sg_create(p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := secret_game.clean_name(p_name);
  v_token text := secret_game.new_token();
  v_invite text := secret_game.new_token();
  v_game uuid;
begin
  -- Unjoined games expire after 30 days; cap the total to limit abuse.
  delete from secret_game.games where name2 is null and created_at < now() - interval '30 days';
  if (select count(*) from secret_game.games) >= 300 then
    perform secret_game.fail('No room for new games right now.', 'full');
  end if;
  insert into secret_game.games (invite, invite_hash, name1)
    values (v_invite, secret_game.hash(v_invite), v_name)
    returning id into v_game;
  insert into secret_game.players (token_hash, game_id, seat)
    values (secret_game.hash(v_token), v_game, 1);
  return jsonb_build_object('token', v_token) || secret_game.state(secret_game.hash(v_token));
end;
$$;

create function public.sg_peek(p_invite text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
begin
  select name1 into v_name from secret_game.games
   where invite_hash = secret_game.hash(coalesce(p_invite, '')) and name2 is null;
  if not found then perform secret_game.fail('This invite link was already used or doesn''t exist.', 'used'); end if;
  return jsonb_build_object('name', v_name);
end;
$$;

create function public.sg_join(p_invite text, p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := secret_game.clean_name(p_name);
  v_token text := secret_game.new_token();
  v_game uuid;
begin
  -- One statement claims the invite, so it works exactly once.
  update secret_game.games
     set name2 = v_name, invite = null, invite_hash = null
   where invite_hash = secret_game.hash(coalesce(p_invite, '')) and name2 is null
   returning id into v_game;
  if v_game is null then perform secret_game.fail('This invite link was already used or doesn''t exist.', 'used'); end if;
  insert into secret_game.players (token_hash, game_id, seat)
    values (secret_game.hash(v_token), v_game, 2);
  return jsonb_build_object('token', v_token) || secret_game.state(secret_game.hash(v_token));
end;
$$;

create function public.sg_state(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return secret_game.state((secret_game.player(p_token)).token_hash);
end;
$$;

create function public.sg_save(p_token text, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v secret_game.players := secret_game.player(p_token);
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'object'
     or (select count(*) from jsonb_object_keys(p_answers)) > 600
     or exists (
       select 1 from jsonb_each(p_answers) e
        where e.key !~ '^[A-Za-z0-9_]{1,40}(:give|:get)?$'
           or jsonb_typeof(e.value) <> 'string'
           or e.value #>> '{}' not in ('y', 'm', 'n'))
  then
    perform secret_game.fail('Invalid answers.', 'invalid');
  end if;
  update secret_game.players set answers = p_answers, updated_at = now() where token_hash = v.token_hash;
  return secret_game.state(v.token_hash);
end;
$$;

create function public.sg_custom(p_token text, p_custom jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v secret_game.players := secret_game.player(p_token);
  v_clean jsonb;
begin
  if p_custom is null or jsonb_typeof(p_custom) <> 'array' or jsonb_array_length(p_custom) > 50
     or exists (
       select 1 from jsonb_array_elements(p_custom) e
        where jsonb_typeof(e) <> 'object'
           or coalesce(e ->> 'id', '') !~ '^[A-Za-z0-9]{1,24}$'
           or btrim(coalesce(e ->> 'n', '')) = '')
  then
    perform secret_game.fail('Invalid questions.', 'invalid');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e ->> 'id',
           'n', left(btrim(regexp_replace(e ->> 'n', '[[:cntrl:]]', '', 'g')), 140),
           't', case when e ->> 't' = 'dir' then 'dir' else 'both' end,
           'h', case when e ->> 'h' in ('1', '3') then (e ->> 'h')::int else 2 end
         ) order by o), '[]'::jsonb)
    into v_clean
    from jsonb_array_elements(p_custom) with ordinality as x(e, o);
  update secret_game.games set custom = v_clean where id = v.game_id;
  return secret_game.state(v.token_hash);
end;
$$;

create function public.sg_delete(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v secret_game.players := secret_game.player(p_token);
begin
  delete from secret_game.games where id = v.game_id;
  return jsonb_build_object('deleted', true);
end;
$$;

revoke all on function
  public.sg_create(text), public.sg_peek(text), public.sg_join(text, text),
  public.sg_state(text), public.sg_save(text, jsonb), public.sg_custom(text, jsonb),
  public.sg_delete(text)
  from public;
grant execute on function
  public.sg_create(text), public.sg_peek(text), public.sg_join(text, text),
  public.sg_state(text), public.sg_save(text, jsonb), public.sg_custom(text, jsonb),
  public.sg_delete(text)
  to anon, authenticated;
