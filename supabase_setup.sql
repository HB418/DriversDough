-- ============================================================
-- Driver's Dough — Supabase backend setup
--
-- Run this ENTIRE file once, in the Supabase SQL Editor, by pasting
-- it all in and clicking Run. It creates every table the app needs
-- (accounts, sessions, forum threads/replies, map pins) plus a set
-- of safe functions the app calls instead of touching those tables
-- directly.
--
-- Why functions instead of letting the app read/write the tables
-- directly: the tables themselves are locked down (Row Level
-- Security is on, with no open policies), so nobody holding the
-- public "publishable" key can read password hashes or write data
-- as someone else. Only these specific functions -- which check who
-- you are and what you're allowed to do first -- can touch the
-- locked-down tables. This is the standard safe pattern for this
-- kind of app on Supabase.
--
-- The two access codes (VILLA2026 for drivers, VILLAOWNER2026 for
-- the admin/owner account) are baked into dd_sign_up() below. If
-- you ever want to change them, edit the two lines marked CHANGE ME
-- and re-run just that one function's CREATE OR REPLACE block.
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- TABLES
-- ============================================================

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  name text not null,
  role text not null default 'driver' check (role in ('driver', 'admin')),
  password_hash text not null,
  created_at timestamptz not null default now()
);
alter table public.accounts enable row level security;
-- No policies on purpose: nobody can read or write this table directly,
-- not even a logged-in user. Everything goes through the functions below.

create table if not exists public.sessions (
  token text primary key,
  account_id uuid not null references public.accounts (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.sessions enable row level security;
-- Same as above: no direct access, functions only.

create table if not exists public.forum_threads (
  id uuid primary key default gen_random_uuid(),
  board_id text not null,
  type text not null check (type in ('swap', 'discussion')),
  title text,
  body text,
  swap_date text,
  swap_shift text,
  note text,
  status text not null default 'open' check (status in ('open', 'filled')),
  author_id uuid references public.accounts (id) on delete set null,
  author_name text not null,
  created_at timestamptz not null default now()
);
alter table public.forum_threads enable row level security;
drop policy if exists "forum threads are viewable by everyone" on public.forum_threads;
create policy "forum threads are viewable by everyone" on public.forum_threads
  for select using (true);
-- Reading is open to everyone (forum posts aren't sensitive); writing is
-- only possible through the dd_create_thread/dd_delete_thread/etc.
-- functions below, since there's no insert/update/delete policy here.

create table if not exists public.forum_replies (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.forum_threads (id) on delete cascade,
  body text not null,
  author_id uuid references public.accounts (id) on delete set null,
  author_name text not null,
  created_at timestamptz not null default now()
);
alter table public.forum_replies enable row level security;
drop policy if exists "forum replies are viewable by everyone" on public.forum_replies;
create policy "forum replies are viewable by everyone" on public.forum_replies
  for select using (true);

create table if not exists public.map_pins (
  id uuid primary key default gen_random_uuid(),
  map_id text not null,
  number int not null,
  lat double precision not null,
  lng double precision not null,
  rotation double precision not null default 0,
  created_by uuid references public.accounts (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.map_pins enable row level security;
drop policy if exists "map pins are viewable by everyone" on public.map_pins;
create policy "map pins are viewable by everyone" on public.map_pins
  for select using (true);
-- Reading pins is open to everyone; only dd_create_pin/dd_update_pin/
-- dd_delete_pin (below) can write, and those check for an admin account.

create table if not exists public.access_codes (
  id uuid primary key default gen_random_uuid(),
  address text not null,
  code text not null,
  created_at timestamptz not null default now(),
  unique (address, code)
);
alter table public.access_codes enable row level security;
drop policy if exists "access codes are viewable by everyone" on public.access_codes;
create policy "access codes are viewable by everyone" on public.access_codes
  for select using (true);
-- Same pattern as map pins: everyone can read, only dd_create_code/
-- dd_update_code/dd_delete_code (below) can write, admin-only.

create table if not exists public.delivery_entries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  street text not null default '',
  order_type text not null default '',
  total text not null default '',
  tip text not null default '',
  fee text not null default '',
  cash_tip boolean not null default false,
  partial_cash_tip boolean not null default false,
  partial_cash_amount text not null default '',
  entry_time text not null default '',
  created_at timestamptz not null default now()
);
alter table public.delivery_entries enable row level security;
-- No policies on purpose, same as accounts/sessions: this is one driver's
-- own shift data, nobody else's business (including other drivers seeing
-- it in the app) -- everything goes through the account-scoped functions
-- below, every one of which only ever touches the calling driver's own
-- account_id. There is no admin-bypass anywhere in these functions.

create table if not exists public.daily_stats (
  account_id uuid not null references public.accounts (id) on delete cascade,
  date_key text not null,
  hour_key text not null,
  deliveries int not null default 0,
  tip_count int not null default 0,
  tip_value numeric not null default 0,
  order_total numeric not null default 0,
  fee_counts jsonb not null default '{}'::jsonb,
  tip_buckets jsonb not null default '{}'::jsonb,
  primary key (account_id, date_key, hour_key)
);
alter table public.daily_stats enable row level security;
-- Same as above: this driver's own permanent stats archive, function-only.

create table if not exists public.time_card (
  account_id uuid not null references public.accounts (id) on delete cascade,
  date_key text not null,
  shifts jsonb not null default '[]'::jsonb,
  cc_gratuity text,
  primary key (account_id, date_key)
);
alter table public.time_card enable row level security;
-- Same as above: this driver's own punch clock, function-only.

-- ============================================================
-- INTERNAL HELPER (not callable directly by the app -- only by the
-- functions below, which run with elevated privileges)
-- ============================================================

create or replace function public.dd_account_for_token(p_token text)
returns public.accounts
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_account public.accounts%rowtype;
begin
  select a.* into v_account
    from public.sessions s
    join public.accounts a on a.id = s.account_id
    where s.token = p_token;
  return v_account;
end;
$$;

-- Adds two jsonb objects of number-like values together key by key (e.g.
-- {"4.00": 1, "5.00": 2} + {"4.00": 3} -> {"4.00": 4, "5.00": 2}). Used by
-- dd_end_night below to fold a fresh End Night's fee/tip-bucket counts
-- into whatever's already archived for that hour, instead of overwriting.
create or replace function public.dd_jsonb_sum(a jsonb, b jsonb) returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_object_agg(key, total), '{}'::jsonb)
  from (
    select key, sum(value::numeric) as total
    from (
      select * from jsonb_each_text(coalesce(a, '{}'::jsonb))
      union all
      select * from jsonb_each_text(coalesce(b, '{}'::jsonb))
    ) pairs
    group by key
  ) summed
$$;

-- ============================================================
-- AUTH FUNCTIONS
-- ============================================================

create or replace function public.dd_sign_up(
  p_access_code text,
  p_username text,
  p_password text,
  p_name text
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_role text;
  v_account_id uuid;
  v_token text;
  v_username text := lower(trim(p_username));
  v_name text := trim(p_name);
begin
  if p_access_code = 'VILLA2026' then          -- CHANGE ME: regular driver code
    v_role := 'driver';
  elsif p_access_code = 'VILLAOWNER2026' then  -- CHANGE ME: admin/owner code
    v_role := 'admin';
  else
    return jsonb_build_object('ok', false, 'error', 'That access code isn''t valid.');
  end if;

  if v_name = '' then
    return jsonb_build_object('ok', false, 'error', 'Enter your name.');
  end if;
  if length(v_username) < 3 then
    return jsonb_build_object('ok', false, 'error', 'Username must be at least 3 characters.');
  end if;
  if length(p_password) < 6 then
    return jsonb_build_object('ok', false, 'error', 'Password must be at least 6 characters.');
  end if;
  if exists (select 1 from public.accounts where lower(username) = v_username) then
    return jsonb_build_object('ok', false, 'error', 'That username is already taken.');
  end if;

  insert into public.accounts (username, name, role, password_hash)
  values (v_username, v_name, v_role, crypt(p_password, gen_salt('bf')))
  returning id into v_account_id;

  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.sessions (token, account_id) values (v_token, v_account_id);

  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'account', jsonb_build_object(
      'id', v_account_id, 'username', v_username, 'name', v_name, 'isAdmin', v_role = 'admin'
    )
  );
end;
$$;

create or replace function public.dd_log_in(
  p_username text,
  p_password text
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_account public.accounts%rowtype;
  v_token text;
begin
  select * into v_account from public.accounts where lower(username) = lower(trim(p_username));
  if not found then
    return jsonb_build_object('ok', false, 'error', 'No account found with that username.');
  end if;
  if v_account.password_hash <> crypt(p_password, v_account.password_hash) then
    return jsonb_build_object('ok', false, 'error', 'Incorrect password.');
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.sessions (token, account_id) values (v_token, v_account.id);

  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'account', jsonb_build_object(
      'id', v_account.id, 'username', v_account.username, 'name', v_account.name,
      'isAdmin', v_account.role = 'admin'
    )
  );
end;
$$;

create or replace function public.dd_get_session(p_token text) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_account public.accounts%rowtype;
begin
  if p_token is null then
    return null;
  end if;
  v_account := public.dd_account_for_token(p_token);
  if v_account.id is null then
    return null;
  end if;
  return jsonb_build_object(
    'id', v_account.id, 'username', v_account.username, 'name', v_account.name,
    'isAdmin', v_account.role = 'admin'
  );
end;
$$;

create or replace function public.dd_log_out(p_token text) returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  delete from public.sessions where token = p_token;
end;
$$;

-- ============================================================
-- FORUM FUNCTIONS
-- ============================================================

create or replace function public.dd_create_thread(
  p_token text,
  p_board_id text,
  p_type text,
  p_title text,
  p_body text,
  p_swap_date text,
  p_swap_shift text,
  p_note text
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
  if v_account.id is null then
    return jsonb_build_object('ok', false, 'error', 'Not logged in.');
  end if;

  insert into public.forum_threads (board_id, type, title, body, swap_date, swap_shift, note, author_id, author_name)
  values (p_board_id, p_type, p_title, p_body, p_swap_date, p_swap_shift, p_note, v_account.id, v_account.name)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.dd_add_reply(
  p_token text,
  p_thread_id uuid,
  p_body text
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
  if v_account.id is null then
    return jsonb_build_object('ok', false, 'error', 'Not logged in.');
  end if;

  insert into public.forum_replies (thread_id, body, author_id, author_name)
  values (p_thread_id, p_body, v_account.id, v_account.name)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.dd_toggle_swap_status(
  p_token text,
  p_thread_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_account public.accounts%rowtype;
begin
  v_account := public.dd_account_for_token(p_token);
  if v_account.id is null then
    return jsonb_build_object('ok', false, 'error', 'Not logged in.');
  end if;

  update public.forum_threads
    set status = case when status = 'open' then 'filled' else 'open' end
    where id = p_thread_id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.dd_delete_thread(
  p_token text,
  p_thread_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_account public.accounts%rowtype;
  v_thread public.forum_threads%rowtype;
begin
  v_account := public.dd_account_for_token(p_token);
  if v_account.id is null then
    return jsonb_build_object('ok', false, 'error', 'Not logged in.');
  end if;

  select * into v_thread from public.forum_threads where id = p_thread_id;
  if not found then
    return jsonb_build_object('ok', true);
  end if;
  if v_thread.author_id is distinct from v_account.id and v_account.role <> 'admin' then
    return jsonb_build_object('ok', false, 'error', 'You can only delete your own posts.');
  end if;

  delete from public.forum_threads where id = p_thread_id;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.dd_delete_reply(
  p_token text,
  p_reply_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_account public.accounts%rowtype;
  v_reply public.forum_replies%rowtype;
begin
  v_account := public.dd_account_for_token(p_token);
  if v_account.id is null then
    return jsonb_build_object('ok', false, 'error', 'Not logged in.');
  end if;

  select * into v_reply from public.forum_replies where id = p_reply_id;
  if not found then
    return jsonb_build_object('ok', true);
  end if;
  if v_reply.author_id is distinct from v_account.id and v_account.role <> 'admin' then
    return jsonb_build_object('ok', false, 'error', 'You can only delete your own replies.');
  end if;

  delete from public.forum_replies where id = p_reply_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ============================================================
-- MAP PIN FUNCTIONS (admin only)
-- ============================================================

create or replace function public.dd_create_pin(
  p_token text,
  p_map_id text,
  p_number int,
  p_lat double precision,
  p_lng double precision,
  p_rotation double precision
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

  insert into public.map_pins (map_id, number, lat, lng, rotation, created_by)
  values (p_map_id, p_number, p_lat, p_lng, p_rotation, v_account.id)
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
  p_rotation double precision
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
    set number = p_number, lat = p_lat, lng = p_lng, rotation = p_rotation
    where id = p_pin_id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.dd_delete_pin(
  p_token text,
  p_pin_id uuid
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

  delete from public.map_pins where id = p_pin_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ============================================================
-- ACCESS CODE FUNCTIONS (admin only) -- a plain address + code list.
-- ============================================================

create or replace function public.dd_create_code(
  p_token text,
  p_address text,
  p_code text
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

  insert into public.access_codes (address, code)
  values (trim(p_address), trim(p_code))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.dd_update_code(
  p_token text,
  p_code_id uuid,
  p_address text,
  p_code text
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

  update public.access_codes
    set address = trim(p_address), code = trim(p_code)
    where id = p_code_id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.dd_delete_code(
  p_token text,
  p_code_id uuid
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

  delete from public.access_codes where id = p_code_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ============================================================
-- DELIVERY ENTRIES / TIME CARD / STATS FUNCTIONS
--
-- Every function below is scoped strictly to public.dd_account_for_token's
-- own account_id -- a driver (including the admin account) only ever
-- reads or writes their OWN data through these. There is deliberately no
-- "see every driver's entries" function anywhere: Heath was explicit the
-- app itself should never surface that, even though it's fine for all
-- drivers' rows to coexist in the same tables.
-- ============================================================

-- Three separate get functions (entries / time card / stats history)
-- rather than one combined one -- entries change every delivery, the time
-- card changes every punch, but the stats archive only changes once a
-- night (End Night), so the app only re-fetches the piece that actually
-- changed instead of re-downloading everything (including years of
-- archived stats) on every small update.
create or replace function public.dd_get_entries(p_token text) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_account public.accounts%rowtype;
  v_entries jsonb;
begin
  v_account := public.dd_account_for_token(p_token);
  if v_account.id is null then
    return jsonb_build_object('ok', false, 'error', 'Not logged in.');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'street', street, 'orderType', order_type, 'total', total, 'tip', tip,
      'fee', fee, 'cashTip', cash_tip, 'partialCashTip', partial_cash_tip,
      'partialCashAmount', partial_cash_amount, 'time', entry_time
    ) order by created_at asc), '[]'::jsonb)
    into v_entries
    from public.delivery_entries where account_id = v_account.id;

  return jsonb_build_object('ok', true, 'entries', v_entries);
end;
$$;

create or replace function public.dd_get_time_card(p_token text) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_account public.accounts%rowtype;
  v_timecard jsonb;
begin
  v_account := public.dd_account_for_token(p_token);
  if v_account.id is null then
    return jsonb_build_object('ok', false, 'error', 'Not logged in.');
  end if;

  select coalesce(jsonb_object_agg(date_key, jsonb_build_object('shifts', shifts, 'ccGratuity', cc_gratuity)), '{}'::jsonb)
    into v_timecard
    from public.time_card where account_id = v_account.id;

  return jsonb_build_object('ok', true, 'timeCard', v_timecard);
end;
$$;

create or replace function public.dd_get_stats_history(p_token text) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_account public.accounts%rowtype;
  v_stats jsonb;
begin
  v_account := public.dd_account_for_token(p_token);
  if v_account.id is null then
    return jsonb_build_object('ok', false, 'error', 'Not logged in.');
  end if;

  select coalesce(jsonb_object_agg(date_key, hours), '{}'::jsonb) into v_stats
    from (
      select date_key, jsonb_object_agg(hour_key, jsonb_build_object(
          'deliveries', deliveries, 'tipCount', tip_count, 'tipValue', tip_value,
          'orderTotal', order_total, 'feeCounts', fee_counts, 'tipBuckets', tip_buckets
        )) as hours
        from public.daily_stats where account_id = v_account.id
        group by date_key
    ) d;

  return jsonb_build_object('ok', true, 'statsHistory', v_stats);
end;
$$;

create or replace function public.dd_create_entry(
  p_token text, p_street text, p_order_type text, p_total text, p_tip text, p_fee text,
  p_cash_tip boolean, p_partial_cash_tip boolean, p_partial_cash_amount text, p_time text
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
  if v_account.id is null then
    return jsonb_build_object('ok', false, 'error', 'Not logged in.');
  end if;

  insert into public.delivery_entries
    (account_id, street, order_type, total, tip, fee, cash_tip, partial_cash_tip, partial_cash_amount, entry_time)
  values
    (v_account.id, p_street, p_order_type, p_total, p_tip, p_fee, p_cash_tip, p_partial_cash_tip, p_partial_cash_amount, p_time)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.dd_update_entry(
  p_token text, p_entry_id uuid, p_street text, p_order_type text, p_total text, p_tip text, p_fee text,
  p_cash_tip boolean, p_partial_cash_tip boolean, p_partial_cash_amount text, p_time text
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_account public.accounts%rowtype;
begin
  v_account := public.dd_account_for_token(p_token);
  if v_account.id is null then
    return jsonb_build_object('ok', false, 'error', 'Not logged in.');
  end if;

  update public.delivery_entries set
    street = p_street, order_type = p_order_type, total = p_total, tip = p_tip, fee = p_fee,
    cash_tip = p_cash_tip, partial_cash_tip = p_partial_cash_tip,
    partial_cash_amount = p_partial_cash_amount, entry_time = p_time
    where id = p_entry_id and account_id = v_account.id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'That delivery no longer exists.');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.dd_delete_entry(p_token text, p_entry_id uuid) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_account public.accounts%rowtype;
begin
  v_account := public.dd_account_for_token(p_token);
  if v_account.id is null then
    return jsonb_build_object('ok', false, 'error', 'Not logged in.');
  end if;

  delete from public.delivery_entries where id = p_entry_id and account_id = v_account.id;
  return jsonb_build_object('ok', true);
end;
$$;

-- Punching in/out only ever touches TODAY's time card record, so this
-- takes the one day's already-computed shifts array and stores it --
-- lighter than resending the whole time card for a single punch.
create or replace function public.dd_set_shifts(p_token text, p_date_key text, p_shifts jsonb) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_account public.accounts%rowtype;
begin
  v_account := public.dd_account_for_token(p_token);
  if v_account.id is null then
    return jsonb_build_object('ok', false, 'error', 'Not logged in.');
  end if;

  insert into public.time_card (account_id, date_key, shifts, cc_gratuity)
  values (v_account.id, p_date_key, coalesce(p_shifts, '[]'::jsonb), null)
  on conflict (account_id, date_key) do update set shifts = excluded.shifts;

  return jsonb_build_object('ok', true);
end;
$$;

-- End Night: folds tonight's already-computed per-hour stat deltas into
-- the permanent archive (adding onto whatever's already there for that
-- hour, since the same hour can accumulate across more than one End
-- Night), stamps today's CC gratuity onto the time card, and clears every
-- current delivery for this account -- all three together, so a dropped
-- connection partway through can't leave stats archived but entries not
-- cleared (or vice versa).
create or replace function public.dd_end_night(
  p_token text, p_date_key text, p_deltas jsonb, p_cc_gratuity text
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_account public.accounts%rowtype;
  v_hour_key text;
  v_bucket jsonb;
begin
  v_account := public.dd_account_for_token(p_token);
  if v_account.id is null then
    return jsonb_build_object('ok', false, 'error', 'Not logged in.');
  end if;

  for v_hour_key, v_bucket in select * from jsonb_each(coalesce(p_deltas, '{}'::jsonb))
  loop
    insert into public.daily_stats (account_id, date_key, hour_key, deliveries, tip_count, tip_value, order_total, fee_counts, tip_buckets)
    values (
      v_account.id, p_date_key, v_hour_key,
      coalesce((v_bucket->>'deliveries')::int, 0),
      coalesce((v_bucket->>'tipCount')::int, 0),
      coalesce((v_bucket->>'tipValue')::numeric, 0),
      coalesce((v_bucket->>'orderTotal')::numeric, 0),
      coalesce(v_bucket->'feeCounts', '{}'::jsonb),
      coalesce(v_bucket->'tipBuckets', '{}'::jsonb)
    )
    on conflict (account_id, date_key, hour_key) do update set
      deliveries = public.daily_stats.deliveries + excluded.deliveries,
      tip_count = public.daily_stats.tip_count + excluded.tip_count,
      tip_value = public.daily_stats.tip_value + excluded.tip_value,
      order_total = public.daily_stats.order_total + excluded.order_total,
      fee_counts = public.dd_jsonb_sum(public.daily_stats.fee_counts, excluded.fee_counts),
      tip_buckets = public.dd_jsonb_sum(public.daily_stats.tip_buckets, excluded.tip_buckets);
  end loop;

  if p_cc_gratuity is not null then
    insert into public.time_card (account_id, date_key, shifts, cc_gratuity)
    values (v_account.id, p_date_key, '[]'::jsonb, p_cc_gratuity)
    on conflict (account_id, date_key) do update set cc_gratuity = excluded.cc_gratuity;
  end if;

  delete from public.delivery_entries where account_id = v_account.id;

  return jsonb_build_object('ok', true);
end;
$$;

-- ============================================================
-- PERMISSIONS -- let the app (using the public "publishable" key)
-- actually call these functions. Direct table access stays locked.
-- ============================================================

grant execute on function public.dd_sign_up(text, text, text, text) to anon, authenticated;
grant execute on function public.dd_log_in(text, text) to anon, authenticated;
grant execute on function public.dd_get_session(text) to anon, authenticated;
grant execute on function public.dd_log_out(text) to anon, authenticated;
grant execute on function public.dd_create_thread(text, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.dd_add_reply(text, uuid, text) to anon, authenticated;
grant execute on function public.dd_toggle_swap_status(text, uuid) to anon, authenticated;
grant execute on function public.dd_delete_thread(text, uuid) to anon, authenticated;
grant execute on function public.dd_delete_reply(text, uuid) to anon, authenticated;
grant execute on function public.dd_create_pin(text, text, int, double precision, double precision, double precision) to anon, authenticated;
grant execute on function public.dd_update_pin(text, uuid, int, double precision, double precision, double precision) to anon, authenticated;
grant execute on function public.dd_delete_pin(text, uuid) to anon, authenticated;
grant execute on function public.dd_create_code(text, text, text) to anon, authenticated;
grant execute on function public.dd_update_code(text, uuid, text, text) to anon, authenticated;
grant execute on function public.dd_delete_code(text, uuid) to anon, authenticated;
grant execute on function public.dd_get_entries(text) to anon, authenticated;
grant execute on function public.dd_get_time_card(text) to anon, authenticated;
grant execute on function public.dd_get_stats_history(text) to anon, authenticated;
grant execute on function public.dd_create_entry(text, text, text, text, text, text, boolean, boolean, text, text) to anon, authenticated;
grant execute on function public.dd_update_entry(text, uuid, text, text, text, text, text, boolean, boolean, text, text) to anon, authenticated;
grant execute on function public.dd_delete_entry(text, uuid) to anon, authenticated;
grant execute on function public.dd_set_shifts(text, text, jsonb) to anon, authenticated;
grant execute on function public.dd_end_night(text, text, jsonb, text) to anon, authenticated;

-- A Row Level Security policy only FILTERS which rows are visible -- it
-- doesn't grant the read itself. These four lines grant the actual
-- SELECT so the "viewable by everyone" policies above take effect (without
-- them, reading forum posts, map pins, and access codes would still be
-- blocked).
grant select on public.forum_threads to anon, authenticated;
grant select on public.forum_replies to anon, authenticated;
grant select on public.map_pins to anon, authenticated;
grant select on public.access_codes to anon, authenticated;

-- ============================================================
-- STARTER DATA -- the codes Heath gave to start the list with. Safe to
-- re-run: the "on conflict do nothing" means it will never insert a
-- duplicate of the same address+code pair twice.
-- ============================================================
insert into public.access_codes (address, code) values
  ('Grand', '2004'),
  ('Canal', '*4288#'),
  ('Canal', '*3636#'),
  ('Canal', '*12814#'),
  ('94 Maple', '1550'),
  ('Indigo', '050386#'),
  ('Indigo', '549283#'),
  ('104 Green', '4927')
on conflict (address, code) do nothing;

-- Done. If this ran with no red error messages, the backend is ready.
