-- Migration: adds the border_overrides table + its 2 functions.
--
-- What this is for: the road border (v49) is now COMPUTED -- traced
-- straight off the actual union of every dirt-fill piece already being
-- drawn, rather than reasoned about junction-by-junction (that approach,
-- v46/v47, kept producing gaps/stray lines against the real map and was
-- reverted). Since a computed shape can still land slightly off in a spot
-- against Heath's real, irregular waypoint geometry, Setup Mode now also
-- lets him drag any border point by hand to nudge it -- this table is
-- where a dragged point's new position is saved so it sticks on future
-- loads instead of the computed shape just overwriting it again. Dragging
-- a point back close to its own computed position deletes its override
-- (that's the "reset to computed" gesture -- no separate button for it).
--
-- Safe to run more than once -- every statement below is idempotent
-- (CREATE TABLE IF NOT EXISTS / DROP POLICY IF EXISTS + CREATE POLICY /
-- CREATE OR REPLACE / GRANT, which Postgres allows repeating).
--
-- HOW TO RUN: Supabase dashboard -> SQL Editor -> paste this whole file
-- -> Run. Takes under a second.

create table if not exists public.border_overrides (
  id uuid primary key default gen_random_uuid(),
  map_id text not null,
  -- The border point's position as COMPUTED, before any drag -- how a
  -- future render matches this override back to the right point (by
  -- proximity, not by index -- see dd_set_border_override below and the
  -- client-side comment near BORDER_OVERRIDE_MATCH_METERS in maps.js).
  orig_lat double precision not null,
  orig_lng double precision not null,
  -- Where Heath actually dragged it to.
  new_lat double precision not null,
  new_lng double precision not null,
  created_by uuid references public.accounts (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.border_overrides enable row level security;
drop policy if exists "border overrides are viewable by everyone" on public.border_overrides;
create policy "border overrides are viewable by everyone" on public.border_overrides
  for select using (true);
-- Same pattern as map_pins/map_paths: everyone can read (so the adjusted
-- border shows for every driver, not just admins), only the two functions
-- below can write, and those are admin-only.
grant select on public.border_overrides to anon, authenticated;

-- Upsert-by-proximity: if an override already exists for this map within
-- ~1.5m of the given orig point, its new_lat/new_lng is updated in place
-- (re-dragging the same computed point moves the SAME override, rather
-- than piling up duplicates); otherwise a new row is inserted. 1.5m
-- matches the client's own BORDER_OVERRIDE_MATCH_METERS, so "the same
-- point" means the same thing on both sides.
create or replace function public.dd_set_border_override(
  p_token text,
  p_map_id text,
  p_orig_lat double precision,
  p_orig_lng double precision,
  p_new_lat double precision,
  p_new_lng double precision
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_account public.accounts%rowtype;
  v_id uuid;
  v_lat_m double precision := 111320;
  v_lng_m double precision := 111320 * cos(radians(p_orig_lat));
begin
  v_account := public.dd_account_for_token(p_token);
  if v_account.id is null or v_account.role <> 'admin' then
    return jsonb_build_object('ok', false, 'error', 'Admin only.');
  end if;

  select id into v_id
  from public.border_overrides
  where map_id = p_map_id
    and sqrt(power((orig_lat - p_orig_lat) * v_lat_m, 2) + power((orig_lng - p_orig_lng) * v_lng_m, 2)) <= 1.5
  order by sqrt(power((orig_lat - p_orig_lat) * v_lat_m, 2) + power((orig_lng - p_orig_lng) * v_lng_m, 2)) asc
  limit 1;

  if v_id is not null then
    update public.border_overrides set new_lat = p_new_lat, new_lng = p_new_lng where id = v_id;
  else
    insert into public.border_overrides (map_id, orig_lat, orig_lng, new_lat, new_lng, created_by)
    values (p_map_id, p_orig_lat, p_orig_lng, p_new_lat, p_new_lng, v_account.id)
    returning id into v_id;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.dd_delete_border_override(
  p_token text,
  p_id uuid
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

  delete from public.border_overrides where id = p_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.dd_set_border_override(text, text, double precision, double precision, double precision, double precision) to anon, authenticated;
grant execute on function public.dd_delete_border_override(text, uuid) to anon, authenticated;
