-- ============================================================================
-- 20261016100000_display_name_from_provider.sql
-- Client revisions 10/14/26, p.3 + p.10: every account gets a real name from the start.
--
-- 1. handle_new_user() named a new profile from metadata 'display_name' only, else the email's
--    first part. A brand-new user who starts with "Continue with Google" on the Sign In screen is
--    created by signInWithOAuth with Google's name in metadata 'full_name' / 'name' (no
--    'display_name'), so they were named after their email ("konahbluequittman") instead of
--    "Konah Quittman"; a new Apple user got the first part of Apple's hidden relay address, and
--    Apple's real name (shared only on that first sign-in) could then never replace it.
--    Now: display_name, then full_name, then name; with none, the name stays EMPTY here and the
--    app fills it (Apple's one-time name, else the email's first part: profile/api
--    syncDisplayNameFromAuth). The app only ever fills an empty name, so a name the user set is
--    never overwritten. Everything else in the function is unchanged (copied from
--    20260929130000_fix_invite_status_cast.sql, verified identical to the live function).
-- 2. One-time fill (the client asked for Google accounts to get their name retroactively): a
--    profile with no name takes the name its account's Google identity carries; so does a profile
--    whose name is exactly the email start the OLD trigger gave it, but only when the account was
--    CREATED by Google (identity made with the user: the Sign In → Google path, the only one the old
--    trigger could name after the email). Onboarding links Google later onto an anonymous user with
--    no email, so an email-start name there was chosen by the person and is kept. Idempotent; on
--    2026-10-16 no account needed it (read-only counts: 0 Google profiles without a name, 0 named
--    after their email). Re-check the counts right before applying.
--    DEPLOY ORDER: apply together with the app build that fills names (useEnsureDisplayName). With
--    no name in the metadata this trigger now leaves the name empty for the app to fill; older
--    builds don't fill it.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  code text;
  cid uuid;
  ctype public.circle_type;
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), '')
    )
  )
  on conflict (user_id) do nothing;

  insert into public.notification_prefs (user_id) values (new.id)
  on conflict (user_id) do nothing;

  code := new.raw_user_meta_data ->> 'invite_code';
  if code is not null and length(trim(code)) > 0 then
    select id, type into cid, ctype from public.circles where invite_code = upper(trim(code));
    if cid is not null
       and not exists (
         select 1 from public.circle_bans b where b.circle_id = cid and b.user_id = new.id
       )
    then
      insert into public.circle_members (circle_id, user_id, role, status)
      values (
        cid,
        new.id,
        'member',
        (case when ctype = 'public' then 'approved' else 'requested' end)::public.member_status
      )
      on conflict (circle_id, user_id) do nothing;
    end if;
  end if;
  return new;
end;
$$;

update public.profiles p
   set display_name = g.google_name
  from (
    select distinct on (i.user_id)
           i.user_id,
           coalesce(nullif(trim(i.identity_data ->> 'full_name'), ''),
                    nullif(trim(i.identity_data ->> 'name'), '')) as google_name,
           u.email,
           abs(extract(epoch from (i.created_at - u.created_at))) < 60 as created_by_google
      from auth.identities i
      join auth.users u on u.id = i.user_id
     where i.provider = 'google'
     order by i.user_id, i.created_at
  ) g
 where p.user_id = g.user_id
   and g.google_name is not null
   and (
     nullif(trim(coalesce(p.display_name, '')), '') is null
     or (g.created_by_google and p.display_name = split_part(g.email, '@', 1))
   );
