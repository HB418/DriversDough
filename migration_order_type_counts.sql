-- Adds per-payment-type (Cash / Phone CC / Online CC) delivery counts to
-- the permanent stats archive, for the new "Payment Type" pie chart on
-- the Stats page. Same shape as the existing fee_counts/tip_buckets jsonb
-- columns -- a {"cash": 4, "phone_cc": 2, "online_cc": 1} object per
-- archived hour, folded together with the existing dd_jsonb_sum() helper.
-- No function signature changes: dd_end_night's p_deltas and
-- dd_get_stats_history's return value are both already-flexible jsonb, so
-- this just adds one more key inside them.

alter table public.daily_stats
  add column if not exists order_type_counts jsonb not null default '{}'::jsonb;

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
          'orderTotal', order_total, 'feeCounts', fee_counts, 'tipBuckets', tip_buckets,
          'orderTypeCounts', order_type_counts
        )) as hours
        from public.daily_stats where account_id = v_account.id
        group by date_key
    ) d;

  return jsonb_build_object('ok', true, 'statsHistory', v_stats);
end;
$$;

create or replace function public.dd_end_night(
  p_token text, p_date_key text, p_deltas jsonb, p_cc_gratuity text, p_entry_ids uuid[]
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
    insert into public.daily_stats (account_id, date_key, hour_key, deliveries, tip_count, tip_value, order_total, fee_counts, tip_buckets, order_type_counts)
    values (
      v_account.id, p_date_key, v_hour_key,
      coalesce((v_bucket->>'deliveries')::int, 0),
      coalesce((v_bucket->>'tipCount')::int, 0),
      coalesce((v_bucket->>'tipValue')::numeric, 0),
      coalesce((v_bucket->>'orderTotal')::numeric, 0),
      coalesce(v_bucket->'feeCounts', '{}'::jsonb),
      coalesce(v_bucket->'tipBuckets', '{}'::jsonb),
      coalesce(v_bucket->'orderTypeCounts', '{}'::jsonb)
    )
    on conflict (account_id, date_key, hour_key) do update set
      deliveries = public.daily_stats.deliveries + excluded.deliveries,
      tip_count = public.daily_stats.tip_count + excluded.tip_count,
      tip_value = public.daily_stats.tip_value + excluded.tip_value,
      order_total = public.daily_stats.order_total + excluded.order_total,
      fee_counts = public.dd_jsonb_sum(public.daily_stats.fee_counts, excluded.fee_counts),
      tip_buckets = public.dd_jsonb_sum(public.daily_stats.tip_buckets, excluded.tip_buckets),
      order_type_counts = public.dd_jsonb_sum(public.daily_stats.order_type_counts, excluded.order_type_counts);
  end loop;

  if p_cc_gratuity is not null then
    insert into public.time_card (account_id, date_key, shifts, cc_gratuity)
    values (v_account.id, p_date_key, '[]'::jsonb, p_cc_gratuity)
    on conflict (account_id, date_key) do update set cc_gratuity = excluded.cc_gratuity;
  end if;

  delete from public.delivery_entries
    where account_id = v_account.id and id = any(coalesce(p_entry_ids, array[]::uuid[]));

  return jsonb_build_object('ok', true);
end;
$$;
