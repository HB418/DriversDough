-- Migration: adds road_key to map_pins.
--
-- What this is for: pins now auto-color to match whichever road they sit
-- closest to (In Road, Out Road, or one of the alleys/Rec Road), each with
-- its own rainbow/magenta color. When a pin sits ambiguously close to two
-- roads, Setup Mode now shows a choice between the two -- road_key is
-- where that manual choice gets saved so it sticks instead of just
-- guessing again next time the map loads. A pin with no road_key (every
-- pin placed before this migration, or one that was never ambiguous)
-- just falls back to the automatic nearest-road match -- nothing else to
-- do for those, they don't need a value here.
--
-- Safe to run more than once -- every statement below is idempotent
-- (IF NOT EXISTS / DROP IF EXISTS + CREATE OR REPLACE).
--
-- HOW TO RUN: Supabase dashboard -> SQL Editor -> paste this whole file
-- -> Run. Takes under a second; map_pins has no rows so far that this
-- could ever break.

alter table public.map_pins
  add column if not exists road_key text;

-- dd_create_pin/dd_update_pin get a new p_road_key parameter (defaulted to
-- null, so old client code that doesn't pass it still works). Postgres
-- treats a changed parameter list as a NEW overload rather than replacing
-- the old one -- dropping the old signature first avoids ending up with
-- both at once, which would make calls with the old 5/6-arg shape
-- ambiguous.
drop function if exists public.dd_create_pin(text, text, int, double precision, double precision, double precision);
drop function if exists public.dd_update_pin(text, uuid, int, double precision, double precision, double precision);

create or replace function public.dd_create_pin(
  p_token text,
  p_map_id text,
  p_number int,
  p_lat double precision,
  p_lng double precision,
  p_rotation double precision,
  p_road_key text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_account public.accounts%rowtype;
  v_id uuid;
begin
  v_account := public.dd_account_for_token(p_token);
  if v_account.id is null or v_account.role <> 'admin' then
    return jsonb_build_object('ok', false, 'error', 'Admin only.');
  end if;

  insert into public.map_pins (map_id, number, lat, lng, rotation, road_key, created_by)
  values (p_map_id, p_number, p_lat, p_lng, p_rotation, p_road_key, v_account.id)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.dd_update_pin(
  p_token text,
  p_pin_id uuid,
  p_number int,
  p_lat double precision,
  p_lng double precision,
  p_rotation double precision,
  p_road_key text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_account public.accounts%rowtype;
begin
  v_account := public.dd_account_for_token(p_token);
  if v_account.id is null or v_account.role <> 'admin' then
    return jsonb_build_object('ok', false, 'error', 'Admin only.');
  end if;

  update public.map_pins
    set number = p_number, lat = p_lat, lng = p_lng, rotation = p_rotation, road_key = p_road_key
    where id = p_pin_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.dd_create_pin(text, text, int, double precision, double precision, double precision, text) to anon, authenticated;
grant execute on function public.dd_update_pin(text, uuid, int, double precision, double precision, double precision, text) to anon, authenticated;
