-- Circles Posts, Phase 4 — close the SECOND invite-redemption path.
--
-- 20260914150000 fixed redeem_invite_code so a Private Circle's code joins as 'requested' (pending
-- owner approval). But handle_new_user (the auth.users signup trigger) redeems an invite_code carried
-- in signup metadata via a SEPARATE code path, and it still inserted 'approved' for EVERY circle type
-- with no ban check. The client passes input.inviteCode into options.data (auth/api.ts), so signing up
-- with a Private Circle's code granted immediate approved access — bypassing owner approval and any ban.
--
-- Fix: mirror redeem_invite_code — PUBLIC → 'approved', PRIVATE → 'requested', and skip banned users.
-- This is an auth.users trigger where auth.uid() is null, so the type/ban logic is inlined against
-- new.id rather than calling redeem_invite_code. The profiles + notification_prefs bootstrap is
-- unchanged; only the invite-redemption block differs from 20260619130000.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
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
      values (cid, new.id, 'member', case when ctype = 'public' then 'approved' else 'requested' end)
      on conflict (circle_id, user_id) do nothing;
    end if;
  end if;
  return new;
end;
$$;
