-- ============================================================================
-- 20260716120000_weekly_reflection_anchor.sql
-- Weekly reflections unlock ONE FULL WEEK (7 days) AFTER the first entry, not on the
-- next calendar Monday. (Mirror of the monthly anchor, 20260709120000, with 7-day
-- windows instead of month-anniversary windows.)
--   first entry 2026-07-15 → the first weekly reflection unlocks 2026-07-22 (was 2026-07-20,
--   the Monday that started the next calendar week).
--
-- Replaces the WEEKLY branch of the reflection period service:
--   * reflection_weekly_unlock(first, today) → the displayed "ready on <date>".
--   * get_due_reflection_periods → weekly periods are 7-day anniversary windows anchored to
--     the user's first entry ([first + k*7, first + k*7 + 6]).
--   * get_reflections_overview → uses it for the weekly next-unlock date.
--
-- With this, ALL three reflection types anchor to the user's first entry (weekly here,
-- monthly 20260709120000, yearly 20260702092000). Because get_due_reflection_periods and
-- get_reflections_overview are `create or replace` (last definition wins), this migration
-- re-declares them IN FULL and deliberately KEEPS the already-correct monthly + yearly
-- anchoring — only the weekly branch changes. `create or replace` preserves the existing
-- PostgREST grants (20260619160000). Everything buckets by the entry's LOCAL date, so it's
-- correct in the user's timezone.
-- ============================================================================

-- Next weekly unlock: the first entry's 7-day anniversary STRICTLY AFTER `today`.
--   first=2026-07-15, today=2026-07-16 → 2026-07-22
--   first=2026-07-15, today=2026-07-21 → 2026-07-22  (still inside the first week)
--   first=2026-07-15, today=2026-07-22 → 2026-07-29  (the day it unlocks, show the next)
-- (p_today - p_first) is an integer day count; integer division by 7 floors to the number
-- of whole weeks elapsed, and adding one more week gives the next unlock day.
create or replace function public.reflection_weekly_unlock(p_first date, p_today date)
returns date
language sql
immutable
as $$
  select case
    when p_first is null then null
    else p_first + ((((p_today - p_first) / 7) + 1) * 7)
  end;
$$;

grant execute on function public.reflection_weekly_unlock(date, date)
  to anon, authenticated, service_role;

-- ---------- due periods (weekly + monthly + yearly anchored to first entry) ----------
create or replace function public.get_due_reflection_periods(
  p_today date,
  p_user uuid default null
)
returns table (
  type public.reflection_type,
  period_start date,
  period_end date,
  entry_count bigint
)
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
  with periods as (
    -- weekly (7-day anniversary windows anchored to the user's first entry)
    select 'weekly'::public.reflection_type as t,
           (v_first + g.wk * 7)::date as ps,
           (v_first + g.wk * 7 + 6)::date as pe,
           count(*) as cnt
      from (
        select ((e.local_date - v_first) / 7) as wk
          from public.journal_entries e
         where e.user_id = uid
           and v_first is not null
      ) g
     group by g.wk
    union all
    -- monthly (month-anniversary windows anchored to the user's first entry)
    select 'monthly'::public.reflection_type,
           (v_first + make_interval(months => g.mo))::date,
           (v_first + make_interval(months => g.mo + 1) - interval '1 day')::date,
           count(*)
      from (
        select (extract(year from age(e.local_date, v_first))::int * 12
                + extract(month from age(e.local_date, v_first))::int) as mo
          from public.journal_entries e
         where e.user_id = uid
           and v_first is not null
      ) g
     group by g.mo
    union all
    -- yearly (anniversary windows anchored to the user's first entry — spec §1.4)
    select 'yearly'::public.reflection_type,
           (v_first + make_interval(years => g.yr))::date,
           (v_first + make_interval(years => g.yr + 1) - interval '1 day')::date,
           count(*)
      from (
        select extract(year from age(e.local_date, v_first))::int as yr
          from public.journal_entries e
         where e.user_id = uid
           and v_first is not null
      ) g
     group by g.yr
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

-- ---------- overview (weekly + monthly + yearly next-unlock from first entry) --------
create or replace function public.get_reflections_overview(p_today date)
returns table (
  type public.reflection_type,
  has_any_entry boolean,
  next_unlock_date date,
  content text,
  period_start date,
  period_end date,
  generated_at timestamptz,
  generating boolean,
  failed boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  uid       uuid := auth.uid();
  any_entry boolean;
  v_first   date;
begin
  if uid is null then
    raise exception 'no user';
  end if;
  select exists(select 1 from public.journal_entries where user_id = uid) into any_entry;
  select first_entry_date into v_first from public.profiles where user_id = uid;

  return query
  with types as (
    select unnest(enum_range(null::public.reflection_type)) as t
  ),
  latest_ready as (
    select distinct on (r.type)
           r.type, r.content, r.period_start, r.period_end, r.generated_at
      from public.reflections r
     where r.user_id = uid and r.status = 'ready'
     order by r.type, r.period_start desc
  ),
  nonready as (
    select r.type,
           bool_or(r.status = 'pending') as generating,
           bool_or(r.status = 'failed') as failed
      from public.reflections r
     where r.user_id = uid and r.status in ('pending', 'failed')
     group by r.type
  )
  select ty.t,
         any_entry,
         case ty.t
           when 'yearly'  then public.reflection_yearly_unlock(v_first, p_today)
           when 'monthly' then public.reflection_monthly_unlock(v_first, p_today)
           when 'weekly'  then public.reflection_weekly_unlock(v_first, p_today)
           else public.reflection_next_unlock(ty.t, p_today)
         end,
         lr.content, lr.period_start, lr.period_end, lr.generated_at,
         coalesce(nr.generating, false),
         coalesce(nr.failed, false)
    from types ty
    left join latest_ready lr on lr.type = ty.t
    left join nonready nr on nr.type = ty.t;
end;
$$;
