-- Circles Posts, Phase 4 — Private invites require owner approval.
--
-- redeem_invite_code previously inserted an 'approved' membership for EVERY circle type, so anyone
-- with a Private Circle's code auto-admitted themselves — violating the spec's "the owner must
-- approve new members; invites don't auto-admit." Now: PUBLIC codes join approved (open-join),
-- PRIVATE codes join as 'requested' (pending owner approval, surfaced in the Pending requests
-- section). Also add a ban check — this SECURITY DEFINER function bypasses the RLS ban policy, so a
-- banned user could otherwise rejoin via a code.
--
-- Returns a json object { circle_id, status, name } (or null when the code matches no circle, or the
-- caller is banned) so the client can tell an immediate 'approved' join from a 'requested' one and
-- route a private request to a "pending approval" message instead of a circle it can't yet read.

create or replace function public.redeem_invite_code(code text)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
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
  values (cid, auth.uid(), 'member', case when ctype = 'public' then 'approved' else 'requested' end)
  on conflict (circle_id, user_id) do update
    set status = case
      when public.circle_members.status = 'approved' then 'approved' -- already a member
      when ctype = 'public' then 'approved'
      else 'requested'
    end
  returning status into final_status;

  return json_build_object('circle_id', cid, 'status', final_status, 'name', cname);
end;
$$;
