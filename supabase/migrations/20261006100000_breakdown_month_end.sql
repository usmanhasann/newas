-- ============================================================================
-- 20261006100000_breakdown_month_end.sql
-- Final pre-handover check (2026-10-06): the Mood Breakdown has to switch to a finished period on the
-- same day the matching reflection (and its recap push) unlocks.
--
-- Reflections unlock once a period's last day has passed (get_due_reflection_periods: period_end <
-- today). get_breakdown_periods only looked at periods BEFORE the one today falls in by the age-based
-- index. With a first entry on the 29th, 30th or 31st, the index still points at the period that
-- just ended on its first day after (first entry Jan 31: on Feb 28 the index is still 0, the period
-- Jan 31 to Feb 27), so the Monthly breakdown switched one day after the Monthly Reflection.
-- Fix: also consider today's index, and keep only periods that have ended. Every other case picks
-- exactly the same period as before (today's own period never ends before today).
-- ============================================================================

create or replace function public.get_breakdown_periods(p_today date)
returns table (type public.reflection_type, period_start date, period_end date)
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
    select ty.t, b.period_start, b.period_end
      from unnest(enum_range(null::public.reflection_type)) as ty (t)
      cross join lateral (
        select pb.period_start, pb.period_end
          from generate_series(public.reflection_period_index(ty.t, v_first, p_today), 0, -1) as g (idx)
          cross join lateral public.reflection_period_bounds(ty.t, v_first, g.idx) as pb
         where pb.period_end < p_today
           and exists (
             select 1 from public.journal_days jd
              where jd.user_id = uid and jd.local_date between pb.period_start and pb.period_end
           )
         order by g.idx desc
         limit 1
      ) b;
end;
$$;

revoke all on function public.get_breakdown_periods(date) from public, anon;
grant execute on function public.get_breakdown_periods(date) to authenticated;
