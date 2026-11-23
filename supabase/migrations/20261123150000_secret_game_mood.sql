-- "In the mood tonight?" is stored as an answer keyed mood_YYYYMMDD and matches
-- like any other answer, so it only shows up when both players tapped it.
-- Leave those keys out of the partner's answer count, so tapping it can't be
-- noticed through the progress bar.

create or replace function secret_game.state(p_token_hash text) returns jsonb
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
      'count', (select count(*) from jsonb_object_keys(partner.answers) k where k not like 'mood\_%')) end,
    'invite', case when me.seat = 1 and g.name2 is null then g.invite else null end,
    'custom', g.custom,
    'matches', v_matches);
end;
$$;

revoke all on function secret_game.state(text) from public;
