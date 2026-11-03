-- ============================================================================
-- 20260702091000_first_entry_date.sql
-- Overhaul spec §1.4: the yearly reflection must unlock ONE FULL CALENDAR YEAR after
-- the user's FIRST journal entry (not on Jan 1). To compute that server-side we need
-- the first-entry date stored on the profile.
--
-- profiles.first_entry_date is maintained by a SECURITY DEFINER trigger (clients have
-- no column grant to write it — defence-in-depth, matching 20260629130000). It's the
-- earliest local_date across the user's entries and is monotonic-safe against
-- out-of-order inserts via least().
-- ============================================================================

alter table public.profiles
  add column if not exists first_entry_date date;

-- Backfill from existing entries (earliest local day per user).
update public.profiles p
   set first_entry_date = sub.d
  from (
    select user_id, min(local_date) as d
    from public.journal_entries
    group by user_id
  ) sub
 where p.user_id = sub.user_id
   and p.first_entry_date is null;

create or replace function public.set_first_entry_date()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Set on the first entry, and correct downward if an earlier-dated entry arrives.
  update public.profiles
     set first_entry_date = least(coalesce(first_entry_date, NEW.local_date), NEW.local_date)
   where user_id = NEW.user_id
     and (first_entry_date is null or NEW.local_date < first_entry_date);
  return NEW;
end;
$$;

drop trigger if exists journal_entries_set_first_entry_date on public.journal_entries;
create trigger journal_entries_set_first_entry_date
  after insert on public.journal_entries
  for each row execute function public.set_first_entry_date();
