-- ============================================================================
-- 20260709120000_monthly_reflection_anchor.sql
-- Monthly reflections unlock ONE FULL MONTH AFTER the first entry, not on the first of
-- the next calendar month. (Mirror of the yearly anchor, 20260702092000.)
--   first entry 2026-07-07 → the first monthly reflection unlocks 2026-08-07 (was 2026-08-01).
--
-- Replaces the MONTHLY branch of the reflection period service:
--   * reflection_monthly_unlock(first, today) → the displayed "ready on <date>".
--   * get_due_reflection_periods → monthly periods are month-anniversary windows anchored
--     to the user's first entry ([first+k months, first+(k+1) months - 1 day]).
--   * get_reflections_overview → uses it for the monthly next-unlock date.
-- Weekly stays calendar-aligned (Monday-based); yearly keeps its first-entry anchor
-- (20260702092000). `create or replace` preserves the existing PostgREST grants.
-- ============================================================================

-- Next monthly unlock: the first entry's month-anniversary STRICTLY AFTER `today`.
--   first=2026-07-07, today=2026-07-07 → 2026-08-07
--   first=2026-07-07, today=2026-08-07 → 2026-09-07
--   first=2026-01-31 → month-end clamps (Postgres standard: + interval '1 month')
create or replace function public.reflection_monthly_unlock(p_first date, p_today date)
returns date
language sql
immutable
as $$
  select case
    when p_first is null then null
    else (p_first + make_interval(months =>
      (extract(year from age(p_today, p_first))::int * 12
       + extract(month from age(p_today, p_first))::int) + 1))::date
  end;
$$;

grant execute on function public.reflection_monthly_unlock(date, date)
  to anon, authenticated, service_role;

-- ---------- due periods (monthly + yearly anchored to first entry) ----------
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
    -- weekly (Monday-based calendar weeks)
    select 'weekly'::public.reflection_type as t,
           date_trunc('week', e.local_date::timestamp)::date as ps,
           (date_trunc('week', e.local_date::timestamp) + interval '6 days')::date as pe,
           count(*) as cnt
      from public.journal_entries e
     where e.user_id = uid
     group by 1, 2, 3
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

-- ---------- overview (monthly + yearly next-unlock from first entry) --------
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
