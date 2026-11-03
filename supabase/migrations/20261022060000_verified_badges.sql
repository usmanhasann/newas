-- Verified badges for well-known users (client revisions 10/14, p.5, N7).
--
-- 1. profiles.verified: an on/off setting that ONLY admins can change. Off for everyone by default.
--    Users can't request it or set it in the app: the column has no UPDATE grant for app users
--    (authenticated / anon), and a trigger refuses any app-user write that sets or changes it, the
--    INSERT path included (authenticated has a table-wide INSERT grant). Admin writes (Supabase Table
--    Editor / SQL editor, run as postgres) and the service role are allowed.
--    The flag is never copied anywhere: the app reads it live from profiles with each name it shows,
--    so turning it off removes the badge everywhere the next time each screen loads.
--
--    ADMIN PROCEDURE (client: "When someone is confirmed, I'll let you know or turn it on myself"):
--      Supabase dashboard > Table Editor > profiles > find the person (display_name or user_id) >
--      tick "verified" (true) and Save. Untick (false) to remove the badge. Or in the SQL editor:
--        update public.profiles set verified = true  where user_id = '<the user id>';
--        update public.profiles set verified = false where user_id = '<the user id>';
--
-- 2. Names can't include check marks or verification symbols (so nobody fakes the badge by typing
--    it): ✓ ✔ ✅ ☑ (incl. the emoji forms ✔️ ☑️), 🗸 🗹 ⍻ √ 𐄂 🮱. The app checks this first and shows
--    "Names can’t include check marks or verification symbols." (sign-up and Edit Profile); the
--    database re-checks every write: an app-user write is REFUSED (error name_has_check_mark), and a
--    system write (the sign-up trigger copying a name from Google / Apple / the sign-up form, or an
--    admin) has the symbols removed instead, so a sign-up never fails over its name. On 2026-10-22
--    no saved name contained one (read-only count: 0 of 83 profiles), so nothing needs cleaning.
--    The same list lives in the app: src/utils/nameSymbols.ts (keep the two in step).
--
-- 3. verified_circle_owners(circle ids): for Discover, which shows "Created by [Name] ✓" on a Public
--    circle whose owner is verified. Someone browsing Discover isn't in those circles, so profiles'
--    RLS hides the owner; this returns ONLY verified owners of PUBLIC circles (their name is public
--    by being verified), at most 200 circles per call.
--
-- DEPLOY ORDER: apply BEFORE the app build that shows badges ships. That build reads
-- profiles.verified with every post author and member, and those loads fail on a database without
-- the column.

alter table public.profiles
  add column if not exists verified boolean not null default false;

comment on column public.profiles.verified is
  'Verified badge (client 10/14 p.5). Admin only: set in the Supabase Table Editor / SQL editor or with the service role. App users can never set or change it (trigger profiles_verified_admin_only).';

-- ---------------------------------------------------------------------------------------------
-- 1. Only admins set verified.
-- Runs as the CALLER (not security definer) so current_user is the app's role for app requests.
create or replace function public.profiles_verified_admin_only()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      if new.verified then
        raise exception using errcode = '42501', message = 'verified_admin_only';
      end if;
    elsif new.verified is distinct from old.verified then
      raise exception using errcode = '42501', message = 'verified_admin_only';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_verified_admin_only on public.profiles;
create trigger profiles_verified_admin_only
  before insert or update of verified on public.profiles
  for each row execute function public.profiles_verified_admin_only();

-- No column grant for app users (none is added here; the table's UPDATE grants are per column).
revoke update (verified) on public.profiles from authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. No check marks in names.
-- The symbols (code points), each with an optional emoji / text variation selector after it:
--   U+2713 ✓  U+2714 ✔  U+2705 ✅  U+2611 ☑  U+1F5F8 🗸  U+1F5F9 🗹  U+237B ⍻  U+221A √
--   U+10102 𐄂  U+1FBB1 🮱
create or replace function public.profiles_name_no_check_marks()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  marks constant text :=
    '[✓✔✅☑\U0001F5F8\U0001F5F9⍻√\U00010102\U0001FBB1][︎️]?';
begin
  if new.display_name is null or new.display_name !~ marks then
    return new;
  end if;
  if current_user in ('anon', 'authenticated') then
    raise exception using
      errcode = '22023',
      message = 'name_has_check_mark',
      detail = 'Names can’t include check marks or verification symbols.';
  end if;
  -- A system write (sign-up trigger, admin): drop the symbols, tidy the spaces, empty = no name.
  new.display_name := nullif(
    btrim(regexp_replace(regexp_replace(new.display_name, marks, '', 'g'), '\s{2,}', ' ', 'g')),
    ''
  );
  return new;
end;
$$;

drop trigger if exists profiles_name_no_check_marks on public.profiles;
create trigger profiles_name_no_check_marks
  before insert or update of display_name on public.profiles
  for each row execute function public.profiles_name_no_check_marks();

-- ---------------------------------------------------------------------------------------------
-- 3. Verified owners of Public circles, for Discover.
create or replace function public.verified_circle_owners(p_circles uuid[])
returns table (circle_id uuid, owner_id uuid, display_name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id, c.owner_id, p.display_name
    from public.circles c
    join public.profiles p on p.user_id = c.owner_id
   where c.id = any ((p_circles)[1:200])
     and c.type = 'public'
     and p.verified
$$;

revoke all on function public.verified_circle_owners(uuid[]) from public, anon;
grant execute on function public.verified_circle_owners(uuid[]) to authenticated;
