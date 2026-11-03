-- ============================================================================
-- 20260629150000_invite_visibility.sql
-- Bubble "Invite a loved one" parity: capture the invitee's nickname and the
-- inline "What can they see?" choices (mood / AI summaries) at INVITE time, then
-- apply them to the EXISTING per-connection permission system (sharing_permissions)
-- when that person actually joins the circle.
--
-- Functional model is unchanged: invites still go out as the circle's join code;
-- this only pre-seeds sharing_permissions so the owner's invite-time choices take
-- effect automatically once the invitee has an account + membership.
-- ============================================================================

alter table public.circle_email_invites
  add column if not exists invitee_name    text,
  add column if not exists can_see_mood     boolean not null default true,
  add column if not exists can_see_summary  boolean not null default true;

-- When a member becomes 'approved', if their email matches a pending email-invite
-- for that circle, materialize the owner's invite-time visibility choices into
-- sharing_permissions (without clobbering any choice the owner already made), and
-- mark the invite accepted. SECURITY DEFINER: reads auth.users.email + writes
-- another user's sharing_permissions row.
create or replace function public.apply_invite_permissions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  joiner_email citext;
  owner uuid;
  inv record;
begin
  if NEW.status <> 'approved' then
    return NEW;
  end if;
  -- Only act on the transition INTO approved (avoid re-running on later updates).
  if TG_OP = 'UPDATE' and OLD.status = 'approved' then
    return NEW;
  end if;

  select owner_id into owner from public.circles where id = NEW.circle_id;
  if owner is null or owner = NEW.user_id then
    return NEW; -- the owner joining their own circle: nothing to apply
  end if;

  select email into joiner_email from auth.users where id = NEW.user_id;
  if joiner_email is null then
    return NEW;
  end if;

  select * into inv
    from public.circle_email_invites
   where circle_id = NEW.circle_id
     and email = joiner_email
     and status = 'pending'
   limit 1;
  if not found then
    return NEW;
  end if;

  insert into public.sharing_permissions (owner_id, target_user_id, can_see_mood, can_see_summary)
  values (owner, NEW.user_id, inv.can_see_mood, inv.can_see_summary)
  on conflict (owner_id, target_user_id) do nothing;

  update public.circle_email_invites set status = 'accepted' where id = inv.id;

  return NEW;
end;
$$;

drop trigger if exists circle_members_apply_invite_permissions on public.circle_members;
create trigger circle_members_apply_invite_permissions
  after insert or update of status on public.circle_members
  for each row execute function public.apply_invite_permissions();

grant execute on function public.apply_invite_permissions()
  to anon, authenticated, service_role;
