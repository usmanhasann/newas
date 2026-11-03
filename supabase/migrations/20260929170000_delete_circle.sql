-- ============================================================================
-- 20260929170000_delete_circle.sql
-- Circle Settings (client spec 2026-09-29): the owner can DELETE a circle, with a different rule
-- per circle type.
--   * Private: at any size (every member was personally vetted). Archive stays available too.
--   * Public: only while it has fewer than 5 members (the owner counts). From 5 up the only option
--     is Archive, so a grown community can't be wiped out.
--
-- Deleting removes the circle and everything in it for everyone: members, posts and replies,
-- shared entries, invites, bans and mutes all cascade from circles. Members' journal entries stay
-- theirs; an entry that was shared ONLY to this circle goes back to private.
--
-- Deleting now goes through delete_circle() only. The direct DELETE policy is dropped so the size
-- rule can't be skipped (no app build ever deleted circles directly).
-- ============================================================================

drop policy if exists "circles_delete_owner" on public.circles;

create or replace function public.delete_circle(p_circle uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  c record;
  members int;
  entry_ids uuid[];
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select ci.id, ci.owner_id, ci.type into c
    from public.circles ci
   where ci.id = p_circle
     for update;
  if not found or c.owner_id is distinct from uid then
    raise exception 'only the owner can delete this circle' using errcode = '42501';
  end if;

  if c.type = 'public' then
    select count(*) into members
      from public.circle_members m
     where m.circle_id = p_circle and m.status = 'approved';
    if members >= 5 then
      raise exception 'circle_too_big_to_delete' using errcode = 'P0001';
    end if;
  end if;

  select coalesce(array_agg(distinct es.entry_id), '{}') into entry_ids
    from public.entry_shares es
   where es.circle_id = p_circle;

  delete from public.circles where id = p_circle;

  update public.journal_entries e
     set shared = false
   where e.id = any (entry_ids)
     and e.shared
     and not exists (select 1 from public.entry_shares es where es.entry_id = e.id);
end;
$$;

revoke all on function public.delete_circle(uuid) from public, anon;
grant execute on function public.delete_circle(uuid) to authenticated;
