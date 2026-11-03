-- ============================================================================
-- 20260702090000_per_entry_moods.sql
-- Overhaul spec §1.2/§1.3: moods are now selected PER JOURNAL ENTRY (up to 3),
-- with NO per-user or per-day cap. This reverses the earlier "3 distinct moods per
-- user" model (20260629130000): that trigger + active_moods cap is removed.
--
-- Model: journal_entries.mood_slugs text[] holds 1..3 distinct moods for the entry.
-- The legacy single `mood_slug` column is KEPT and always mirrors mood_slugs[1] (via
-- a BEFORE trigger) so every existing surface that reads one mood — sharing, the
-- widget (get_circle_member_moods), EntryCard/TodaysMoodCard/MoodPill — keeps working
-- unchanged. Replacing a mood on an entry never "consumes a slot" because the count
-- is simply the array length; that logic lives client-side (moods/entrySelection.ts)
-- and is re-asserted here (dedupe + cap 3 + slug validation).
-- ============================================================================

-- ---------- multi-mood column ---------------------------------------------
alter table public.journal_entries
  add column if not exists mood_slugs text[] not null default '{}';

-- Backfill existing rows from the single mood. Historical entries are never rewritten
-- beyond mirroring their existing mood into the new array.
update public.journal_entries
   set mood_slugs = array[mood_slug]
 where mood_slug is not null
   and array_length(mood_slugs, 1) is null;

-- Aggregation/containment index over the array (mood breakdown, future filters).
create index if not exists journal_entries_mood_slugs_gin
  on public.journal_entries using gin (mood_slugs);

-- ---------- normalize trigger (single source of truth for the array) -------
-- Runs BEFORE insert/update: dedupes preserving order, requires >=1 mood, caps at 3,
-- validates each slug against public.moods, and keeps mood_slug = mood_slugs[1].
-- SECURITY DEFINER so it can read public.moods regardless of the caller's grants.
create or replace function public.normalize_entry_moods()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  src     text[];
  deduped text[] := '{}';
  m       text;
  bad     text;
begin
  -- Prefer the multi-mood array; fall back to the legacy single mood if empty.
  src := coalesce(NEW.mood_slugs, '{}');
  if array_length(src, 1) is null and NEW.mood_slug is not null then
    src := array[NEW.mood_slug];
  end if;

  -- Dedupe, preserving first-occurrence order.
  foreach m in array src loop
    if m is not null and not (m = any(deduped)) then
      deduped := array_append(deduped, m);
    end if;
  end loop;

  if array_length(deduped, 1) is null then
    raise exception 'entry_requires_mood: at least one mood is required'
      using errcode = 'check_violation';
  end if;

  -- Per-entry cap (spec §1.2). No per-user / per-day limit exists anymore.
  if array_length(deduped, 1) > 3 then
    deduped := deduped[1:3];
  end if;

  -- FK-equivalent for every array member (mood_slug's own FK covers only the first).
  select s into bad
    from unnest(deduped) as s
   where not exists (select 1 from public.moods where slug = s)
   limit 1;
  if bad is not null then
    raise exception 'invalid_mood_slug: %', bad using errcode = 'foreign_key_violation';
  end if;

  NEW.mood_slugs := deduped;
  NEW.mood_slug  := deduped[1];
  return NEW;
end;
$$;

drop trigger if exists journal_entries_normalize_moods on public.journal_entries;
create trigger journal_entries_normalize_moods
  before insert or update on public.journal_entries
  for each row execute function public.normalize_entry_moods();

-- ---------- remove the old per-user mood cap -------------------------------
-- Spec §1.2: "There must be no daily mood limit" and the 3-mood limit applies per
-- entry, not across the user. Drop the enforcement + its trigger. active_moods stays
-- as a (now unused) column so generated DB types / historical data are undisturbed.
drop trigger if exists journal_entries_enforce_mood_limit on public.journal_entries;
drop function if exists public.enforce_mood_limit();

-- ---------- mood breakdown counts every mood on every entry ----------------
-- `create or replace` preserves the existing PostgREST grants (20260619160000).
create or replace function public.get_mood_breakdown(start_date date, end_date date)
returns table (mood_slug text, count bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m as mood_slug, count(*)::bigint as count
  from public.journal_entries e
  cross join lateral unnest(
    case
      when array_length(e.mood_slugs, 1) is null then array[e.mood_slug]
      else e.mood_slugs
    end
  ) as m
  where e.user_id = auth.uid()
    and e.local_date between start_date and end_date
  group by m
  order by count(*) desc;
$$;
