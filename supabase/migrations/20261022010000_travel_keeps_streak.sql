-- ============================================================================
-- 20261022010000_travel_keeps_streak.sql
-- Client revisions 10/14 p.30 (N14): no manual time zone any more; the app follows the phone's
-- zone. "Traveling should never break a streak on its own. An entry counts toward the day it was
-- written, based on the local time on the user's phone at that moment."
--
-- The app now saves the phone's zone on profiles.timezone every time it opens or comes back from
-- the background (useSyncProfileTimezone), and each entry keeps the date the phone showed when it
-- was written (journal_entries.local_date, set by the app and never re-dated). The 8 PM streak
-- reminder, the 9 AM recaps and reflections already read profiles.timezone, so they follow the
-- phone with no change here.
--
-- What changes: flying east can make the phone's date jump over a whole day (Los Angeles on Monday
-- night, Sydney on Wednesday morning: no Tuesday), which broke the streak. Now:
--   * journal_days.travel_day: a date the trip skipped is kept as a "travel day", so every streak
--     count that reads journal_days (get_journal_stats: the Home badge, Insights, the completion
--     heading; streak_len / claim_streak_reminders: the 8 PM reminder) carries on across it with
--     no change to those functions. A travel day has no entry: it is never an entry, a mood or part
--     of a reflection; it counts in the streak like a journaled day.
--   * fill_travel_days(): adds it when the zone moved and exactly one date is missing between the
--     last journaled day and the next. It is filled when, seen entirely in the OLD zone or entirely
--     in the NEW zone, no day was missed; or when the phone moved east and the app wasn't used in
--     the old zone on the skipped date (the trip used that day up). A day missed without a zone
--     change is never filled, nor two days, and a travel day never leads to another one.
--   * profiles_timezone_travel: runs it when the profile's zone changes (the phone moved).
--   * record_journal_day(): runs it as a backstop when a new day's first entry arrives before the
--     phone's new zone reached the profile, and makes a travel day a real one when an entry is
--     written on it (after flying back west).
--   * profiles_timezone_usable: profiles.timezone only ever holds a zone NAME the server and the
--     app can read (every stored value already is); anything else leaves the zone as it was. The
--     app checks the same before it saves.
-- ============================================================================

-- ---------- a usable zone name ----------
create or replace function public.is_time_zone(tz text)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $$
begin
  -- A NAME ("America/Los_Angeles", "America/Argentina/Buenos_Aires", "UTC"); never an offset or a
  -- POSIX rule, which the app can't read and which the server reads with the opposite sign
  -- ("GMT+5" is five hours WEST here).
  if tz is null or length(tz) > 64 or tz !~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$' then
    return false;
  end if;
  perform timestamptz '2000-01-01 00:00:00+00' at time zone tz;
  return true;
exception when others then
  return false;
end;
$$;

-- A zone the server can't read is never stored: the profile keeps the zone it had (UTC for a new
-- row). Kept quiet rather than an error so no save (the last onboarding step also writes the zone)
-- can ever fail over it; the app checks the same before it sends one, and keeps following the phone.
create or replace function public.keep_usable_time_zone()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not public.is_time_zone(new.timezone) then
    new.timezone := case
      when tg_op = 'UPDATE' and public.is_time_zone(old.timezone) then old.timezone
      else 'UTC'
    end;
  end if;
  return new;
end;
$$;

revoke all on function public.keep_usable_time_zone() from public, anon, authenticated;

drop trigger if exists profiles_timezone_usable on public.profiles;
create trigger profiles_timezone_usable
  before insert or update of timezone on public.profiles
  for each row execute function public.keep_usable_time_zone();

-- ---------- travel days ----------
alter table public.journal_days
  add column if not exists travel_day boolean not null default false;

comment on column public.journal_days.travel_day is
  'A date the phone skipped while the user travelled east (N14). It keeps the streak going; it has no '
  'entry (first_entry_id is the nil uuid) and becomes a real day if an entry is ever written on it.';

-- p_last: the last journaled day before p_target; p_target: the day the user is on now (or the
-- day of a new entry). p_old_zone / p_new_zone: the phone's zone before and after (the same zone
-- for the entry backstop). p_old_seen: when the old zone was last saved from the app (null: unknown).
create or replace function public.fill_travel_days(
  p_user uuid,
  p_last date,
  p_target date,
  p_old_zone text,
  p_new_zone text,
  p_at timestamptz,
  p_old_seen timestamptz default null
)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  last_at timestamptz;
  filled int := 0;
begin
  -- Exactly one date missing (a zone change moves the date by at most one).
  if p_user is null or p_last is null or p_target is null or p_target - p_last <> 2 then
    return 0;
  end if;
  if not (public.is_time_zone(p_old_zone) and public.is_time_zone(p_new_zone)) then
    return 0;
  end if;
  -- The last day must be a real journaled day: one trip never covers two missing days.
  if not exists (
    select 1 from public.journal_days jd
     where jd.user_id = p_user and jd.local_date = p_last and not jd.travel_day
  ) then
    return 0;
  end if;
  -- When that day's latest entry was written (its day record if its entries were deleted).
  select max(e.created_at) into last_at
    from public.journal_entries e
   where e.user_id = p_user and e.local_date = p_last;
  if last_at is null then
    select jd.created_at into last_at
      from public.journal_days jd
     where jd.user_id = p_user and jd.local_date = p_last;
  end if;

  if (p_at at time zone p_old_zone)::date <= p_last + 1
     -- old zone: it is still only the day after the last journaled day there
     or (last_at at time zone p_new_zone)::date >= p_target - 1
     -- new zone: the last entry already fell on the day before
     or ((p_at at time zone p_new_zone) > (p_at at time zone p_old_zone)
         and p_old_seen is not null
         and (p_old_seen at time zone p_old_zone)::date <= p_last)
     -- moved east, and the app wasn't used in the old zone on the skipped date
  then
    insert into public.journal_days (user_id, local_date, first_entry_id, travel_day)
    values (p_user, p_last + 1, '00000000-0000-0000-0000-000000000000'::uuid, true)
    on conflict (user_id, local_date) do nothing;
    get diagnostics filled = row_count;
  end if;
  return filled;
end;
$$;

revoke all on function public.fill_travel_days(uuid, date, date, text, text, timestamptz, timestamptz)
  from public, anon, authenticated;

-- ---------- the phone moved: profiles.timezone changed ----------
create or replace function public.on_profile_timezone_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_last date;
begin
  if not (public.is_time_zone(old.timezone) and public.is_time_zone(new.timezone)) then
    return new;
  end if;
  select max(jd.local_date) into v_last
    from public.journal_days jd where jd.user_id = new.user_id;
  perform public.fill_travel_days(
    new.user_id, v_last, (now() at time zone new.timezone)::date,
    old.timezone, new.timezone, now(), old.updated_at
  );
  return new;
end;
$$;

revoke all on function public.on_profile_timezone_change() from public, anon, authenticated;

drop trigger if exists profiles_timezone_travel on public.profiles;
create trigger profiles_timezone_travel
  after update of timezone on public.profiles
  for each row
  when (old.timezone is distinct from new.timezone)
  execute function public.on_profile_timezone_change();

-- ---------- record_journal_day (same as 20260929150000, plus travel days) ----------
create or replace function public.record_journal_day()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_zone text;
  v_last date;
begin
  insert into public.journal_days (user_id, local_date, first_entry_id)
  values (new.user_id, new.local_date, new.id)
  on conflict (user_id, local_date) do update
    set first_entry_id = excluded.first_entry_id,
        travel_day = false,
        created_at = excluded.created_at
    where public.journal_days.travel_day;
  if not found then
    return new; -- not the day's first entry
  end if;

  -- Backstop: a new day's first entry made in a new zone before that zone reached the profile.
  select p.timezone into v_zone from public.profiles p where p.user_id = new.user_id;
  select max(jd.local_date) into v_last
    from public.journal_days jd
   where jd.user_id = new.user_id and jd.local_date < new.local_date;
  perform public.fill_travel_days(new.user_id, v_last, new.local_date, v_zone, v_zone, now());
  return new;
end;
$$;

revoke all on function public.record_journal_day() from public, anon, authenticated;
