-- ============================================================================
-- 20260929150000_journal_days.sql
-- Deleting an entry never breaks or shrinks a streak (client spec 2026-09-29): "Once a day's entry
-- requirement is met, that day stays counted permanently, regardless of what happens to the entry
-- afterward."
--
-- Until now every streak number was recomputed live from journal_entries, so deleting a day's only
-- entry erased that day. journal_days records each journaled day ONCE, on the day's first entry,
-- and is never touched by a delete. Everything streak-related reads it:
--   * get_journal_stats: current / longest streak, the last journaled day, days journaled
--     (entries_count still counts the entries that exist).
--   * streak_len + claim_streak_reminders (the 8pm push): a day stays journaled after a delete, so
--     deleting today's entry never re-arms the reminder.
--   * the entry-complete heading: first_entry_id is the day's FIRST entry even if it was deleted,
--     so a later entry that day is never mistaken for the first.
-- Existing history is back-filled from journal_entries.
--
-- Depends on 20260929120000_notifications_v2 (claim_streak_reminders reads streak_reminder).
-- ============================================================================

create table if not exists public.journal_days (
  user_id        uuid not null references auth.users (id) on delete cascade,
  local_date     date not null,
  -- The day's first entry (no FK: it stays recorded after that entry is deleted).
  first_entry_id uuid not null,
  created_at     timestamptz not null default now(),
  primary key (user_id, local_date)
);
alter table public.journal_days enable row level security;
revoke insert, update, delete on table public.journal_days from anon, authenticated;

drop policy if exists "journal_days_select_own" on public.journal_days;
create policy "journal_days_select_own"
  on public.journal_days for select using (auth.uid() = user_id);

create or replace function public.record_journal_day()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.journal_days (user_id, local_date, first_entry_id)
  values (new.user_id, new.local_date, new.id)
  on conflict (user_id, local_date) do nothing;
  return new;
end;
$$;

revoke all on function public.record_journal_day() from public, anon, authenticated;

drop trigger if exists journal_entries_record_day on public.journal_entries;
create trigger journal_entries_record_day
  after insert on public.journal_entries
  for each row execute function public.record_journal_day();

-- Back-fill: one row per day already journaled, pointing at that day's first entry.
insert into public.journal_days (user_id, local_date, first_entry_id, created_at)
select distinct on (e.user_id, e.local_date) e.user_id, e.local_date, e.id, e.created_at
  from public.journal_entries e
 order by e.user_id, e.local_date, e.created_at, e.id
on conflict (user_id, local_date) do nothing;

-- ---------- get_journal_stats (same columns; streaks from journaled days) ----------
create or replace function public.get_journal_stats(today_local date)
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
  select count(*)::bigint into entries_count
    from public.journal_entries where user_id = uid;

  -- The last day journaled (and how many days in total), even if those entries were deleted.
  select max(jd.local_date), count(*)::bigint
    into last_entry_date, distinct_days
    from public.journal_days jd where jd.user_id = uid;

  -- longest streak (consecutive journaled days)
  prev := null;
  for d in
    select jd.local_date from public.journal_days jd
     where jd.user_id = uid order by jd.local_date asc
  loop
    if prev is not null and d = prev + 1 then run := run + 1; else run := 1; end if;
    if run > best then best := run; end if;
    prev := d;
  end loop;
  longest_streak := best;

  -- current streak: consecutive days ending at the last journaled day, but only "live" if that
  -- day is today or yesterday.
  if last_entry_date is not null and last_entry_date >= today_local - 1 then
    prev := null;
    for d in
      select jd.local_date from public.journal_days jd
       where jd.user_id = uid order by jd.local_date desc
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

-- ---------- streak_len (the 8pm reminder's count) ----------
create or replace function public.streak_len(uid uuid, end_date date)
returns int language sql stable security definer set search_path = public, pg_temp as $$
  with islands as (
    select jd.local_date,
           jd.local_date - (row_number() over (order by jd.local_date))::int as grp
      from public.journal_days jd
     where jd.user_id = uid and jd.local_date <= end_date
  )
  select coalesce(
    (select count(*)::int from islands where grp = (select grp from islands where local_date = end_date)),
    0
  );
$$;

revoke all on function public.streak_len(uuid, date) from public, anon, authenticated;
grant execute on function public.streak_len(uuid, date) to service_role;

-- ---------- claim_streak_reminders (reads journaled days) ----------
create or replace function public.claim_streak_reminders(run_at timestamptz)
returns table (user_id uuid, streak int)
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  return query
  with cand as (
    select p.user_id as uid, (run_at at time zone p.timezone) as lts
    from public.profiles p
    join pg_timezone_names z on z.name = p.timezone
  ),
  due as (
    select c.uid, c.lts::date as today_local
    from cand c
    where extract(hour from c.lts)::int = 20
      and (select max(jd.local_date) from public.journal_days jd where jd.user_id = c.uid)
          = c.lts::date - 1
      and coalesce(
        (select np.streak_reminder from public.notification_prefs np where np.user_id = c.uid),
        true
      )
  ),
  claimed as (
    insert into public.streak_reminder_sends (user_id, local_date)
    select d.uid, d.today_local from due d
    on conflict (user_id, local_date) do nothing
    returning streak_reminder_sends.user_id as uid, streak_reminder_sends.local_date as ld
  )
  select cl.uid, public.streak_len(cl.uid, cl.ld - 1)
  from claimed cl;
end;
$$;

revoke all on function public.claim_streak_reminders(timestamptz) from public, anon, authenticated;
grant execute on function public.claim_streak_reminders(timestamptz) to service_role;
