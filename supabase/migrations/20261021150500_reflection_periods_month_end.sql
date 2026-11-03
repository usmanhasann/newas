-- ============================================================================
-- 20261021150500_reflection_periods_month_end.sql
-- A reflection, and its 9 AM "your recap is ready" push, only for a period with real entries
-- (client revisions 10/14 p.14, O28), also for a first entry on the 29th, 30th or 31st.
--
-- The period index used age(). For a first entry on the 29th to 31st (yearly: Feb 29) it put the
-- FIRST day of some periods into the period before, the one that ended the day before. First entry
-- Jan 31: Apr 30 got the index of Mar 31 to Apr 29, although that period's dates end Apr 29 and
-- Apr 30 starts the next one. get_due_reflection_periods grouped entries the same way, while the
-- Insights cards and generate-reflections read a period by its dates. So on that day (the day the
-- period before unlocks):
--   * an entry written before 9 AM made claim_recap_pushes announce a period with NO entries, and
--     generate-reflections then wrote an AI reflection from zero entries for it (shown instead of
--     the empty state);
--   * the period that really starts that day never counted that entry: if it was its only one, no
--     reflection was ever made for it (Insights showed Try again) and no push went out.
-- Fix: reflection_period_index returns the period whose dates contain the day (the age() index,
-- plus one on that first day), get_due_reflection_periods groups entries with it, and
-- claim_recap_pushes looks for entries between the period's own dates, exactly the check the
-- Insights card makes (get_reflections_overview.period_has_entries). Every other day keeps its
-- period, weekly never changed, and get_breakdown_periods / get_reflections_overview return the same
-- periods as before. Names, arguments, results and grants are unchanged (create or replace).
-- ============================================================================

-- ---------- period of a day: the one whose dates contain it -------------------------------
create or replace function public.reflection_period_index(
  p_type public.reflection_type,
  p_first date,
  p_day date
)
returns int
language sql
stable
as $$
  -- age() lands one period short only on a clamped month end that starts the next period, so add
  -- one when the day is already on or after the next period's start. One plain expression (no FROM)
  -- so Postgres still inlines it into the queries that call it per entry.
  select case p_type
    when 'weekly'  then (p_day - p_first) / 7
    when 'monthly' then extract(year from age(p_day, p_first))::int * 12
                        + extract(month from age(p_day, p_first))::int
                        + case
                            when p_day >= (p_first + make_interval(
                                   months => extract(year from age(p_day, p_first))::int * 12
                                             + extract(month from age(p_day, p_first))::int + 1
                                 ))::date then 1
                            else 0
                          end
    when 'yearly'  then extract(year from age(p_day, p_first))::int
                        + case
                            when p_day >= (p_first + make_interval(
                                   years => extract(year from age(p_day, p_first))::int + 1
                                 ))::date then 1
                            else 0
                          end
  end;
$$;

-- ---------- due reflections: finished periods with entries and no ready reflection ----------
-- Same checks, result and order as before; entries are grouped by reflection_period_index, so a
-- period counts exactly the entries between its own dates (what generate-reflections then reads).
create or replace function public.get_due_reflection_periods(p_today date, p_user uuid default null)
returns table (type public.reflection_type, period_start date, period_end date, entry_count bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  uid     uuid := coalesce(p_user, auth.uid());
  v_first date;
begin
  if uid is null then
    raise exception 'no user';
  end if;
  if auth.uid() is not null and uid <> auth.uid() then
    raise exception 'forbidden';
  end if;

  select first_entry_date into v_first from public.profiles where user_id = uid;

  return query
  with grouped as (
    select ty.t,
           public.reflection_period_index(ty.t, v_first, e.local_date) as idx,
           count(*) as cnt
      from public.journal_entries e
     cross join unnest(enum_range(null::public.reflection_type)) as ty (t)
     where e.user_id = uid
       and v_first is not null
     group by 1, 2
  ),
  periods as (
    select g.t, b.period_start as ps, b.period_end as pe, g.cnt
      from grouped g
     cross join lateral public.reflection_period_bounds(g.t, v_first, g.idx) b
  )
  select p.t, p.ps, p.pe, p.cnt
    from periods p
    left join public.reflections r
      on r.user_id = uid
     and r.type = p.t
     and r.period_start = p.ps
     and r.status = 'ready'
   where p.pe < p_today        -- period has fully elapsed
     and r.id is null          -- no READY reflection yet (static once ready)
   order by p.ps;
end;
$$;

-- ---------- recap pushes: only for a period with entries between its own dates -------------
-- Same as 20260929120000 except the entry check, which now matches the Insights card exactly.
create or replace function public.claim_recap_pushes(run_at timestamptz)
returns table (user_id uuid, type public.reflection_type, period_start date, period_end date)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  return query
  with cand as (
    -- Joining pg_timezone_names skips a corrupt timezone instead of aborting the whole batch
    -- (same guard as claim_streak_reminders).
    select p.user_id as uid,
           p.first_entry_date as first_day,
           ((run_at at time zone p.timezone)::date - 1) as yday
      from public.profiles p
      join pg_timezone_names z on z.name = p.timezone
     where p.first_entry_date is not null
       and extract(hour from (run_at at time zone p.timezone))::int = 9
       and exists (
         select 1 from public.device_tokens dt
          where dt.user_id = p.user_id and dt.enabled
       )
  ),
  periods as (
    -- For each recap type: the period that contains yesterday.
    select c.uid, c.first_day, c.yday, t.rtype,
           public.reflection_period_index(t.rtype, c.first_day, c.yday) as idx
      from cand c
     cross join unnest(enum_range(null::public.reflection_type)) as t (rtype)
     where c.yday >= c.first_day
  ),
  due as (
    select pr.uid, pr.rtype, b.period_start as ps, b.period_end as pe
      from periods pr
     cross join lateral public.reflection_period_bounds(pr.rtype, pr.first_day, pr.idx) b
      left join public.notification_prefs np on np.user_id = pr.uid
     where b.period_end = pr.yday
       and case pr.rtype
             when 'weekly'  then coalesce(np.weekly_recap, true)
             when 'monthly' then coalesce(np.monthly_recap, true)
             when 'yearly'  then coalesce(np.yearly_recap, true)
             else false
           end
       -- A real entry between the period's own dates (an empty period never gets a push,
       -- whatever the switch says). Today's entries never count: today is after period_end.
       and exists (
         select 1 from public.journal_entries e
          where e.user_id = pr.uid
            and e.local_date between b.period_start and b.period_end
       )
       -- Already opened: Insights wrote the reflection before 9 AM.
       and not exists (
         select 1 from public.reflections r
          where r.user_id = pr.uid
            and r.type = pr.rtype
            and r.period_start = b.period_start
            and r.status = 'ready'
       )
  ),
  claimed as (
    insert into public.recap_push_sends (user_id, type, period_start)
    select d.uid, d.rtype, d.ps from due d
    on conflict (user_id, type, period_start) do nothing
    returning recap_push_sends.user_id as uid,
              recap_push_sends.type as rtype,
              recap_push_sends.period_start as ps
  )
  select cl.uid, cl.rtype, cl.ps, d.pe
    from claimed cl
    join due d on d.uid = cl.uid and d.rtype = cl.rtype and d.ps = cl.ps;
end;
$$;

revoke all on function public.claim_recap_pushes(timestamptz) from public, anon, authenticated;
grant execute on function public.claim_recap_pushes(timestamptz) to service_role;
