-- Insights cards move on every period, empty or not (client revisions 10/14, p.13-14).
--
-- Before: the Mood Breakdown and the Weekly/Monthly/Yearly Reflection showed the newest finished
-- period WITH entries (and the newest READY reflection), so after a period with no entries both
-- cards stayed on an older period. Now both show the newest FINISHED period, whatever it held, on
-- the same once-per-period schedule as before: Sep 21 to 27 (no entries) shows from Sep 28 through
-- Oct 4 with an empty state, and Sep 28 to Oct 4 takes over on Oct 5. Each returns whether that
-- period has entries, so the app can show the empty state with the period's dates.
--
-- Both functions keep their name and argument and gain one column, so they're dropped and created
-- again with the same grants as live (2026-10-20): get_breakdown_periods to authenticated only;
-- get_reflections_overview to authenticated (its PUBLIC grant came from the default, and an anon
-- call fails 'no user' anyway, so it is now authenticated only like the rest). The period math
-- (reflection_period_index / reflection_period_bounds / *_unlock) is unchanged.

-- ---------- Mood Breakdown: the newest finished period per tab --------------------------------
drop function if exists public.get_breakdown_periods(date);
create function public.get_breakdown_periods(p_today date)
returns table (type public.reflection_type, period_start date, period_end date, has_entries boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  v_first date;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select pr.first_entry_date into v_first from public.profiles pr where pr.user_id = uid;
  if v_first is null then
    return;
  end if;
  return query
    select ty.t, b.period_start, b.period_end,
           exists (
             select 1 from public.journal_entries e
              where e.user_id = uid and e.local_date between b.period_start and b.period_end
           )
      from unnest(enum_range(null::public.reflection_type)) as ty (t)
      cross join lateral (
        select pb.period_start, pb.period_end
          from generate_series(public.reflection_period_index(ty.t, v_first, p_today), 0, -1) as g (idx)
          cross join lateral public.reflection_period_bounds(ty.t, v_first, g.idx) as pb
         where pb.period_end < p_today
         order by g.idx desc
         limit 1
      ) b;
end;
$$;
revoke all on function public.get_breakdown_periods(date) from public, anon;
grant execute on function public.get_breakdown_periods(date) to authenticated;

-- ---------- Reflections: the newest finished period's reflection per type ---------------------
-- content / period / generated_at / generating / failed now all describe that one period (before:
-- the newest READY reflection of any period, with pending/failed from any period).
-- period_has_entries: false = an empty period (the app shows the empty state with its dates);
-- null = no period has finished yet (the app shows the not-ready text).
-- next_unlock_date is now the day after the CURRENT period ends, from the same period bounds the
-- cards use (the *_unlock helpers could name today on clamped month-end days, e.g. a Jan 31 first
-- entry on Feb 28; that date is now also printed under the Mood Breakdown).
drop function if exists public.get_reflections_overview(date);
create function public.get_reflections_overview(p_today date)
returns table (
  type public.reflection_type,
  has_any_entry boolean,
  next_unlock_date date,
  content text,
  period_start date,
  period_end date,
  generated_at timestamptz,
  generating boolean,
  failed boolean,
  period_has_entries boolean
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
  latest as (
    select ty.t, b.idx, b.period_start, b.period_end
      from types ty
      cross join lateral (
        select g.idx, pb.period_start, pb.period_end
          from generate_series(public.reflection_period_index(ty.t, v_first, p_today), 0, -1) as g (idx)
          cross join lateral public.reflection_period_bounds(ty.t, v_first, g.idx) as pb
         where v_first is not null and pb.period_end < p_today
         order by g.idx desc
         limit 1
      ) b
  )
  select ty.t,
         any_entry,
         case
           when v_first is null then null::date
           else (
             select nb.period_end + 1
               from public.reflection_period_bounds(ty.t, v_first, coalesce(l.idx, -1) + 1) as nb
           )
         end,
         case when r.status = 'ready' then r.content end,
         l.period_start,
         l.period_end,
         case when r.status = 'ready' then r.generated_at end,
         coalesce(r.status = 'pending', false),
         coalesce(r.status = 'failed', false),
         case
           when l.period_start is null then null
           else exists (
             select 1 from public.journal_entries e
              where e.user_id = uid and e.local_date between l.period_start and l.period_end
           )
         end
    from types ty
    left join latest l on l.t = ty.t
    left join public.reflections r
      on r.user_id = uid and r.type = ty.t and r.period_start = l.period_start;
end;
$$;
revoke all on function public.get_reflections_overview(date) from public, anon;
grant execute on function public.get_reflections_overview(date) to authenticated;
