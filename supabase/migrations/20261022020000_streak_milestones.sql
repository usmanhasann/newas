-- ============================================================================
-- 20261022020000_streak_milestones.sql
-- Streak milestones (client revisions 10/14, pages 24 to 29): the streak popup and the 8pm streak
-- reminder both need the user's longest streak BEFORE the current run.
--   * Popup "Your longest streak yet." shows only on the first day the current run passes it, and
--     never during a first streak; "Every streak starts with day 1." needs an earlier streak.
--   * Reminder "Check in before midnight to achieve your longest streak." on the day checking in
--     would first pass it (never during a first streak).
-- get_journal_stats.longest_streak includes the current run, so it can't answer that.
--
--   1. prev_longest_streak(uid, end_date): the longest run of consecutive journaled days, leaving out
--      the run that includes end_date (0 when there is none). Service role only.
--   2. get_previous_longest_streak(end_date): the same for the signed-in user (the app calls it right
--      after saving the day's first entry, with that entry's day).
--   3. claim_streak_reminders also returns previous_longest (the run through yesterday left out).
--      Who gets the reminder, and when, is unchanged (same body as live). The return type changes,
--      so it is dropped and recreated in this one transaction.
--
-- journal_days is keyed (user_id, local_date), so every read here is one user's index range.
-- Depends on 20260929150000_journal_days (journal_days, streak_len) and
-- 20260929120000_notifications_v2 (claim_streak_reminders reads streak_reminder).
-- ============================================================================

-- ---------- 1. prev_longest_streak ----------
create or replace function public.prev_longest_streak(uid uuid, end_date date)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with islands as (
    -- Consecutive days share one grp (date minus its position).
    select jd.local_date,
           jd.local_date - (row_number() over (order by jd.local_date))::int as grp
      from public.journal_days jd
     where jd.user_id = uid and jd.local_date <= end_date
  )
  select coalesce(max(runs.n), 0)::int
    from (
      select i.grp, count(*)::int as n
        from islands i
       group by i.grp
    ) runs
   where runs.grp is distinct from (select i2.grp from islands i2 where i2.local_date = end_date);
$$;

revoke all on function public.prev_longest_streak(uuid, date) from public, anon, authenticated;
grant execute on function public.prev_longest_streak(uuid, date) to service_role;

-- ---------- 2. get_previous_longest_streak (the app's popup) ----------
create or replace function public.get_previous_longest_streak(end_date date)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.prev_longest_streak(auth.uid(), end_date);
$$;

revoke all on function public.get_previous_longest_streak(date) from public, anon;
grant execute on function public.get_previous_longest_streak(date) to authenticated, service_role;

-- ---------- 3. claim_streak_reminders (+ previous_longest) ----------
drop function if exists public.claim_streak_reminders(timestamptz);

create function public.claim_streak_reminders(run_at timestamptz)
returns table (user_id uuid, streak int, previous_longest int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
  select cl.uid,
         public.streak_len(cl.uid, cl.ld - 1),
         public.prev_longest_streak(cl.uid, cl.ld - 1)
  from claimed cl;
end;
$$;

revoke all on function public.claim_streak_reminders(timestamptz) from public, anon, authenticated;
grant execute on function public.claim_streak_reminders(timestamptz) to service_role;
