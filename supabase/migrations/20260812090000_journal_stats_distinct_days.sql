-- ============================================================================
-- 20260812090000_journal_stats_distinct_days.sql
-- Adds `distinct_days` to get_journal_stats: the number of separate LOCAL calendar
-- days the user has journalled on. Needed for the notification re-prompt rule
-- ("5 entries across at least 3 separate days"), which a flat entry count cannot
-- express — five entries in one sitting must not qualify.
--
-- ADDITIVE for callers: the existing columns and their order are unchanged, so every
-- current reader keeps working. `local_date` is already indexed for this exact access
-- pattern (journal_entries_user_localdate_idx on (user_id, local_date desc)), so the
-- extra aggregate costs nothing beyond the scan already being done.
--
-- DROP-THEN-CREATE, not `create or replace`: adding a column to a RETURNS TABLE changes
-- the function's return type, which Postgres refuses to do in place ("cannot change
-- return type of existing function"). Same approach — and the same grant re-application —
-- as 20260717090000_circle_share_summaries.sql. The grant matters because
-- 20260621100200 revokes default execute in this schema.
-- ============================================================================

drop function if exists public.get_journal_stats(date);

create function public.get_journal_stats(today_local date)
returns table (
  entries_count bigint,
  current_streak int,
  longest_streak int,
  last_entry_date date,
  distinct_days bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  d date;
  prev date;
  run int := 0;
  best int := 0;
  cur int := 0;
begin
  select count(*)::bigint, max(local_date), count(distinct local_date)::bigint
    into entries_count, last_entry_date, distinct_days
    from public.journal_entries where user_id = uid;

  -- longest streak (gaps-and-islands over distinct local dates)
  prev := null;
  for d in
    select distinct local_date from public.journal_entries
    where user_id = uid order by local_date asc
  loop
    if prev is not null and d = prev + 1 then run := run + 1; else run := 1; end if;
    if run > best then best := run; end if;
    prev := d;
  end loop;
  longest_streak := best;

  -- current streak: consecutive days ending at the latest entry, but only "live"
  -- if the latest entry is today or yesterday.
  if last_entry_date is not null and last_entry_date >= today_local - 1 then
    prev := null;
    for d in
      select distinct local_date from public.journal_entries
      where user_id = uid order by local_date desc
    loop
      if prev is null then cur := 1;
      elsif d = prev - 1 then cur := cur + 1;
      else exit;
      end if;
      prev := d;
    end loop;
  end if;
  current_streak := cur;

  return next;
end;
$$;

-- Re-apply access after the drop (the drop takes the old grants with it).
revoke all on function public.get_journal_stats(date) from public, anon;
grant execute on function public.get_journal_stats(date) to authenticated, service_role;
