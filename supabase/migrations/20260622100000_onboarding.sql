-- ============================================================================
-- 20260622100000_onboarding.sql
-- Redesigned onboarding flow: persist the user's onboarding answers + progress on
-- the existing profiles row (in the existing `settings` jsonb column, under the
-- `onboarding` key). No new columns/tables — the trial lives in `subscriptions`
-- (source of truth) and the reminder time/timezone reuse notification_prefs +
-- profiles.timezone.
--
-- set_onboarding() does an ATOMIC shallow-merge into settings->'onboarding' for the
-- authenticated caller, so concurrent step saves never clobber each other and the
-- client never has to read-modify-write the whole settings blob. Backward
-- compatible: existing rows keep their settings; the merge only adds keys.
-- ============================================================================

create or replace function public.set_onboarding(p_patch jsonb)
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  res public.profiles;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  update public.profiles
     set settings = jsonb_set(
           coalesce(settings, '{}'::jsonb),
           '{onboarding}',
           coalesce(settings -> 'onboarding', '{}'::jsonb) || coalesce(p_patch, '{}'::jsonb),
           true
         ),
         updated_at = now()
   where user_id = auth.uid()
   returning * into res;

  return res; -- null row only if the profile is missing (handle_new_user creates it)
end;
$$;

-- Caller acts only on their own row (auth.uid()); RLS still protects direct table
-- access. anon has no identity, so it is intentionally NOT granted.
revoke all on function public.set_onboarding(jsonb) from public, anon;
grant execute on function public.set_onboarding(jsonb) to authenticated, service_role;
