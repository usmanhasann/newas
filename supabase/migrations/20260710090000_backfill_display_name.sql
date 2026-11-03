-- ============================================================================
-- 20260710090000_backfill_display_name.sql
-- One-time backfill: copy the display name from each auth account into its profile,
-- for accounts created BEFORE the client-side sync (AuthStep) existed. Onboarding starts
-- on an anonymous user, so handle_new_user() created these profiles with a NULL name; the
-- name the user gave at sign-up lives in auth.users.raw_user_meta_data (email/Apple →
-- display_name, Google → full_name/name) but never reached profiles — so Home greeted
-- "Hello, there". Fills ONLY when the profile name is still empty, so a name the user later
-- customized is never overwritten. Idempotent (safe to re-run).
-- ============================================================================

update public.profiles p
   set display_name = coalesce(
         u.raw_user_meta_data ->> 'display_name',
         u.raw_user_meta_data ->> 'full_name',
         u.raw_user_meta_data ->> 'name'
       )
  from auth.users u
 where u.id = p.user_id
   and (p.display_name is null or btrim(p.display_name) = '')
   and coalesce(
         u.raw_user_meta_data ->> 'display_name',
         u.raw_user_meta_data ->> 'full_name',
         u.raw_user_meta_data ->> 'name'
       ) is not null;
