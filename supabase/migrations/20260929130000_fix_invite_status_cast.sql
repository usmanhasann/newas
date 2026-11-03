-- ============================================================================
-- 20260929130000_fix_invite_status_cast.sql
-- LIVE BUG FIX: joining a circle with an invite code — and signing up with one — failed EVERY time.
--
-- 20260914150000 (redeem_invite_code) and 20260914160000 (handle_new_user) insert the membership
-- status as `case when ctype = 'public' then 'approved' else 'requested' end`. A CASE over string
-- literals resolves to TEXT, and circle_members.status is the member_status ENUM, which has no
-- assignment cast from text — so Postgres raised
--   42804: column "status" is of type member_status but expression is of type text
-- on every call:
--   * redeem_invite_code → the app's "Join Circle" button spun, then nothing happened (the error
--     wasn't surfaced), no request was created and the owner was never notified. Reported by a
--     member trying to join a private circle; it affected public codes too.
--   * handle_new_user (auth.users insert trigger) → signing up with an invite code failed the
--     whole sign-up.
-- Found by reproducing the member's exact call as that user in a rolled-back transaction.
--
-- Fix: cast the CASE results to public.member_status. Behavior is otherwise identical to the two
-- functions it replaces (public → approved, private → requested pending the owner, banned users
-- can't redeem, an existing approved member stays approved).
-- ============================================================================

create or replace function public.redeem_invite_code(code text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cid uuid;
  ctype public.circle_type;
  cname text;
  final_status text;
begin
  select id, type, name into cid, ctype, cname from public.circles where invite_code = upper(trim(code));
  if cid is null then return null; end if;

  -- A banned user cannot rejoin via a code.
  if exists (select 1 from public.circle_bans b where b.circle_id = cid and b.user_id = auth.uid()) then
    return null;
  end if;

  insert into public.circle_members (circle_id, user_id, role, status)
  values (
    cid,
    auth.uid(),
    'member',
    (case when ctype = 'public' then 'approved' else 'requested' end)::public.member_status
  )
  on conflict (circle_id, user_id) do update
    set status = (case
      when public.circle_members.status = 'approved' then 'approved' -- already a member
      when ctype = 'public' then 'approved'
      else 'requested'
    end)::public.member_status
  returning status into final_status;

  return json_build_object('circle_id', cid, 'status', final_status, 'name', cname);
end;
$$;

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
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
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
