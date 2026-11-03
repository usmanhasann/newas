-- ============================================================================
-- 20260629130000_mood_limit_and_icons.sql
-- Build task §5 (app-wide 3-distinct-mood limit) + §6 (non-emoji mood icons).
--
-- §5 model: each user has an ACTIVE MOOD SET (profiles.active_moods, max 3 slugs) —
-- the distinct moods they're allowed to use going forward. A BEFORE trigger on
-- journal_entries enforces the cap atomically (race-safe via a row lock on the
-- profile) and grows the set as new moods are used. Historical entries are never
-- rewritten; for existing users with >3 historical moods the active set is seeded
-- from their 3 MOST-USED moods (ties broken by most recent use).
--
-- Enforcement is server-side and cannot be bypassed by a direct API call: the
-- trigger runs on every insert/mood-change. As defence-in-depth we also revoke the
-- client's ability to write active_moods directly (column-level UPDATE grant).
-- ============================================================================

-- ---------- §5: active mood set --------------------------------------------
alter table public.profiles
  add column if not exists active_moods text[] not null default '{}';

-- Backfill existing users: top-3 most-used distinct moods (ties → most recent).
with ranked as (
  select
    user_id,
    mood_slug,
    row_number() over (
      partition by user_id
      order by count(*) desc, max(created_at) desc, mood_slug
    ) as rn
  from public.journal_entries
  group by user_id, mood_slug
),
top3 as (
  select user_id, array_agg(mood_slug order by rn) as moods
  from ranked
  where rn <= 3
  group by user_id
)
update public.profiles p
set active_moods = top3.moods
from top3
where p.user_id = top3.user_id
  and p.active_moods = '{}';

-- Enforce the cap on insert and on any change of mood_slug. SECURITY DEFINER so it
-- can read/grow active_moods regardless of the client's column privileges/RLS.
create or replace function public.enforce_mood_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  active text[];
begin
  -- Lock the user's profile row so concurrent inserts can't both slip past the cap.
  select active_moods
    into active
    from public.profiles
   where user_id = NEW.user_id
   for update;

  if not found then
    -- No profile row (shouldn't happen post-signup); allow without tracking.
    return NEW;
  end if;

  active := coalesce(active, '{}');

  -- Already one of the user's allowed moods → fine (re-use doesn't count as new).
  if NEW.mood_slug = any(active) then
    return NEW;
  end if;

  -- Room for another distinct mood → claim the slot.
  if coalesce(array_length(active, 1), 0) < 3 then
    update public.profiles
       set active_moods = array_append(active_moods, NEW.mood_slug)
     where user_id = NEW.user_id;
    return NEW;
  end if;

  -- Set is full and this is a 4th distinct mood → reject.
  raise exception
    'mood_limit_reached: at most 3 distinct moods are allowed per user'
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists journal_entries_enforce_mood_limit on public.journal_entries;
create trigger journal_entries_enforce_mood_limit
  before insert or update of mood_slug on public.journal_entries
  for each row execute function public.enforce_mood_limit();

-- Defence-in-depth: the client must not set active_moods directly. Replace the
-- table-level UPDATE grant with a column-level grant over the user-editable columns
-- only (the trigger, running as definer, is unaffected). RLS still applies on top.
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url, bio, timezone, onboarding_completed, settings, updated_at)
  on public.profiles to authenticated;

-- ---------- §6: non-emoji mood icons --------------------------------------
-- Mirror the client icon map (src/theme/moods.ts) so the server/widget can render
-- moods without emoji. Stable mood IDs remain the `slug`; emoji column is retained
-- (no longer used by the app) so historical data/records are never lost.
alter table public.moods add column if not exists icon text;

update public.moods set icon = case slug
  when 'happy'      then 'happy-outline'
  when 'content'    then 'sunny-outline'
  when 'calm'       then 'leaf-outline'
  when 'grateful'   then 'heart-outline'
  when 'tired'      then 'moon-outline'
  when 'neutral'    then 'ellipse-outline'
  when 'anxious'    then 'pulse-outline'
  when 'sad'        then 'sad-outline'
  when 'frustrated' then 'thunderstorm-outline'
  when 'angry'      then 'flame-outline'
  else icon
end;
