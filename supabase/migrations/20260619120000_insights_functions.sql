-- ============================================================================
-- 20260619120000_insights_functions.sql
-- Server-side aggregation for insights (build prompt §5.1/§9.5 — no client N+1).
-- Both functions use auth.uid() internally (never a uid param) so a user can only
-- ever read their own stats. Bucketing is by local_date (the user's local day),
-- which is what makes week/month/year correct regardless of UTC.
-- ============================================================================

-- Streaks + totals. `today_local` is the caller's current local date (their tz),
-- used to decide whether the current streak is still "live" (today or yesterday).
create or replace function public.get_journal_stats(today_local date)
returns table (
  entries_count bigint,
  current_streak int,
  longest_streak int,
  last_entry_date date
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
  select count(*)::bigint, max(local_date)
    into entries_count, last_entry_date
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

-- Mood counts within an inclusive local-date range, highest first.
create or replace function public.get_mood_breakdown(start_date date, end_date date)
returns table (mood_slug text, count bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.mood_slug, count(*)::bigint as count
  from public.journal_entries e
  where e.user_id = auth.uid()
    and e.local_date between start_date and end_date
  group by e.mood_slug
  order by count(*) desc;
$$;
