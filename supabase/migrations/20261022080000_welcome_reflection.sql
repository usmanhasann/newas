-- ============================================================================
-- 20261022080000_welcome_reflection.sql
-- The first reflection on the new paywall (client revisions 10/14 p.33 to p.35, N15).
--
-- 1. public.welcome_reflections: the reflection written from a person's onboarding answers, when
--    they tapped "Skip for now" on "Let's try your first check in" (or their check in had concerning
--    words, so it gets no AI reflection, N18). The paywall shows its first sentence ("BASED ON YOUR
--    ANSWERS") and the Journal tab keeps it as the "Welcome reflection" card until the person
--    deletes it; it never disappears on its own. One row per person (the account the anonymous
--    onboarding session becomes, so it is kept when they sign up). Written ONLY by the
--    welcome-reflection Edge Function (service role); people can read their own row and delete it.
--    A delete keeps a tombstone (status 'deleted', no text) so the reflection is never written
--    again. Removed with the account (on delete cascade from auth.users).
-- 2. get_welcome_reflection(): the caller's own row (RLS applies; security invoker).
-- 3. delete_welcome_reflection(): the card's ••• > Delete (after "Delete your welcome reflection?
--    This can’t be undone.").
-- 4. The reflection tone(s) picked in onboarding apply from the moment they're picked (p.33: "send
--    it to OpenAI right away, using the reflection tone they picked earlier in onboarding", blended
--    when two). Until now they were copied to profiles.personal_reflection_style[_secondary] only
--    when onboarding completed, AFTER the paywall, so the first check in's reflection (ai-summary
--    reads the profile) used the default tone. While onboarding isn't completed, a change to
--    settings.onboarding.personal_reflection_style now updates the two columns too. After it's
--    completed, Edit Profile owns the tone and this never touches it.
--
-- DEPLOY ORDER: apply together with (or before) the welcome-reflection Edge Function and the app
-- build with the new paywall. The function and the app read this table; an older app never does.
-- ============================================================================

-- ---------- 1. the table ---------------------------------------------------------
create table if not exists public.welcome_reflections (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  status     text not null default 'pending'
             check (status in ('pending', 'ready', 'failed', 'deleted')),
  body       text check (body is null or char_length(body) <= 4000),
  error      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- A deleted card keeps no text.
  constraint welcome_reflections_deleted_empty check (status <> 'deleted' or body is null)
);

comment on table public.welcome_reflections is
  'Client 10/14 p.33-35 (N15): the reflection written from onboarding answers (Skip for now, or a check in with concerning words). Written only by the welcome-reflection Edge Function; read and deleted by its owner.';

alter table public.welcome_reflections enable row level security;

revoke all on table public.welcome_reflections from anon, authenticated;
grant select on table public.welcome_reflections to authenticated;

drop policy if exists welcome_reflections_select_own on public.welcome_reflections;
create policy welcome_reflections_select_own
  on public.welcome_reflections for select
  to authenticated
  using (user_id = auth.uid());

drop trigger if exists welcome_reflections_set_updated_at on public.welcome_reflections;
create trigger welcome_reflections_set_updated_at
  before update on public.welcome_reflections
  for each row execute function public.set_updated_at();

-- ---------- 2. read it -----------------------------------------------------------
create or replace function public.get_welcome_reflection()
returns table (status text, body text, created_at timestamptz, updated_at timestamptz)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select w.status, w.body, w.created_at, w.updated_at
    from public.welcome_reflections w
   where w.user_id = auth.uid();
$$;

revoke all on function public.get_welcome_reflection() from public, anon;
grant execute on function public.get_welcome_reflection() to authenticated;

-- ---------- 3. delete it ---------------------------------------------------------
create or replace function public.delete_welcome_reflection()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  update public.welcome_reflections
     set status = 'deleted', body = null, error = null, deleted_at = now()
   where user_id = auth.uid()
     and status <> 'deleted';
end;
$$;

revoke all on function public.delete_welcome_reflection() from public, anon;
grant execute on function public.delete_welcome_reflection() to authenticated;

-- ---------- 4. the onboarding tone applies right away ------------------------------
create or replace function public.sync_onboarding_reflection_style()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  styles jsonb := NEW.settings -> 'onboarding' -> 'personal_reflection_style';
  allowed text[] := enum_range(null::public.personal_reflection_style)::text[];
  p text;
  s text;
begin
  if NEW.onboarding_completed then
    return NEW;
  end if;
  if styles is not distinct from (OLD.settings -> 'onboarding' -> 'personal_reflection_style') then
    return NEW;
  end if;
  -- An older build saved one tone as a plain string.
  if jsonb_typeof(styles) = 'string' then
    styles := jsonb_build_array(styles);
  end if;
  if styles is null or jsonb_typeof(styles) <> 'array' then
    return NEW;
  end if;
  p := styles ->> 0;
  s := styles ->> 1;
  if p is null or not (p = any (allowed)) then
    return NEW;
  end if;
  NEW.personal_reflection_style := p::public.personal_reflection_style;
  NEW.personal_reflection_style_secondary :=
    case when s is not null and s <> p and s = any (allowed)
         then s::public.personal_reflection_style end;
  return NEW;
end;
$$;

revoke all on function public.sync_onboarding_reflection_style() from public, anon, authenticated;

drop trigger if exists profiles_sync_onboarding_style on public.profiles;
create trigger profiles_sync_onboarding_style
  before update of settings on public.profiles
  for each row execute function public.sync_onboarding_reflection_style();
