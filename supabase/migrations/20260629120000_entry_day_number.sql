-- ============================================================================
-- 20260629120000_entry_day_number.sql
-- "Day number" for the journal-completion confirmation (build task §2).
--
-- Day X = the number of DISTINCT local calendar dates the user has journaled on,
-- up to and including the given entry's local_date. So the user's first-ever entry
-- is Day 1; a second entry on the same local day is still Day 1; the next day they
-- journal is Day 2. This mirrors the existing distinct-local-date streak logic in
-- get_journal_stats (bucketing by the user's LOCAL day, timezone-correct).
--
-- security definer + auth.uid() scoping: a user can only ever resolve the day
-- number for their OWN entries (returns null for someone else's / unknown id).
-- ============================================================================

create or replace function public.get_entry_day_number(p_entry_id uuid)
returns int
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  entry_date date;
  day_num int;
begin
  -- Resolve the entry's local date, but only if it belongs to the caller.
  select local_date
    into entry_date
    from public.journal_entries
   where id = p_entry_id
     and user_id = uid;

  if entry_date is null then
    return null; -- not found or not owned by the caller
  end if;

  select count(distinct local_date)::int
    into day_num
    from public.journal_entries
   where user_id = uid
     and local_date <= entry_date;

  return day_num;
end;
$$;

-- PostgREST exposure (the Management-API push path doesn't apply default privileges;
-- mirrors 20260619160000_grant_api_roles.sql). Idempotent + harmless on a CLI push.
grant execute on function public.get_entry_day_number(uuid)
  to anon, authenticated, service_role;
