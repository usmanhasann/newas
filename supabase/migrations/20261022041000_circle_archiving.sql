-- Archiving and unarchiving, Public and Private circles (client revisions 10/14, p.23-24, N3).
--
-- An archived circle:
--  * stays readable by the people already in it (posts and replies), unchanged;
--  * takes no new posts AND no new replies (before: replies were still allowed). Hearts unchanged;
--  * a Public one leaves Discover: people who aren't in it can no longer see it at all;
--  * takes no one new: every way in (Discover's open join, an invite code, a request) is refused
--    with the error "circle_archived". People already in it stay, and anyone can still leave.
-- Unarchiving (archived_at back to null, owner only, as archiving is) undoes all of that.
--
-- The server owns the archive time (the app's clock is ignored) and stamps every change in
-- archive_changed_at. Each archive / unarchive is recorded in circle_archive_events: one row per
-- change, readable by the circle's members (the notifications list), and claimed once by the
-- send-push Edge Function (claim_circle_archive_push) so members get exactly one push per change.
--
-- Older app builds keep working: archiving a Private circle still works the same way; a reply they
-- try in an archived circle is refused like any other post there (they show their usual error).

-- 1. No new posts or replies in an archived circle (both types).
create or replace function public.can_post_in_circle(cid uuid, top_level boolean)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    public.is_circle_member(cid, auth.uid())
    and not exists (select 1 from public.circle_bans b where b.circle_id = cid and b.user_id = auth.uid())
    and public.my_circle_standing() = 'ok'
    and not exists (select 1 from public.circles c where c.id = cid and c.archived_at is not null)
    and case when top_level then
      (select c.type from public.circles c where c.id = cid) = 'private'
      or public.is_circle_owner(cid, auth.uid())
    else true end; -- replies: any approved, non-banned member of an active circle
$$;

-- 2. Archived Public circles are seen only by the people in them (so they leave Discover).
drop policy if exists circles_select on public.circles;
create policy circles_select on public.circles
  for select
  using (
    owner_id = auth.uid()
    or (type = 'public' and archived_at is null)
    or public.is_circle_member(id, auth.uid())
  );

-- 3. The server stamps every archive / unarchive (and keeps the original time on a repeat archive).
alter table public.circles add column if not exists archive_changed_at timestamptz;

create or replace function public.circles_stamp_archive()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if (OLD.archived_at is null) <> (NEW.archived_at is null) then
    if NEW.archived_at is not null then
      NEW.archived_at := now();
    end if;
    NEW.archive_changed_at := now();
  else
    NEW.archived_at := OLD.archived_at;
    NEW.archive_changed_at := OLD.archive_changed_at;
  end if;
  return NEW;
end;
$$;

-- Runs after circles_archive_on_owner_removed (triggers fire in name order), so an archive caused by
-- the owner deleting their account is stamped too.
drop trigger if exists circles_stamp_archive on public.circles;
create trigger circles_stamp_archive
  before update on public.circles
  for each row execute function public.circles_stamp_archive();

-- 4. One row per archive / unarchive.
create table if not exists public.circle_archive_events (
  -- In the order the changes happened (the newest change is the circle's current state).
  id bigint generated always as identity primary key,
  circle_id uuid not null references public.circles (id) on delete cascade,
  kind text not null check (kind in ('archived', 'unarchived')),
  created_at timestamptz not null default now(),
  -- When send-push announced it (null: not announced, e.g. the owner deleted their account).
  pushed_at timestamptz
);

create index if not exists circle_archive_events_circle_idx
  on public.circle_archive_events (circle_id, id desc);

alter table public.circle_archive_events enable row level security;

-- Members of the circle can read its archive history (the in-app notifications list). Nobody writes
-- from the app: only the trigger below and the service role.
drop policy if exists circle_archive_events_select_member on public.circle_archive_events;
create policy circle_archive_events_select_member on public.circle_archive_events
  for select
  using (public.is_circle_member(circle_id, auth.uid()));

revoke insert, update, delete, truncate on public.circle_archive_events from anon, authenticated;
grant select on public.circle_archive_events to authenticated;

create or replace function public.record_circle_archive_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.circle_archive_events (circle_id, kind, created_at)
  values (
    NEW.id,
    case when NEW.archived_at is null then 'unarchived' else 'archived' end,
    coalesce(NEW.archive_changed_at, now())
  );
  return null;
end;
$$;

revoke all on function public.record_circle_archive_event() from public, anon, authenticated;

drop trigger if exists circles_record_archive_event on public.circles;
create trigger circles_record_archive_event
  after update on public.circles
  for each row
  when ((old.archived_at is null) is distinct from (new.archived_at is null))
  execute function public.record_circle_archive_event();

-- send-push claims the circle's newest change once, and only when it tells members something new:
--  * it must still be the circle's state (archived then unarchived straight away: the stale
--    "archived" is never announced);
--  * it must differ from what members last heard (archived and unarchived again before anyone was
--    told: nothing to say; the circle simply never stopped being active for them).
-- At most 6 announcements per circle per day, so toggling can't flood members. Returns the kind to
-- announce ('archived' or 'unarchived'), or null.
create or replace function public.claim_circle_archive_push(p_circle uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ev record;
  is_archived boolean;
  last_heard text;
  recent integer;
begin
  select (c.archived_at is not null) into is_archived from public.circles c where c.id = p_circle;
  if not found then
    return null;
  end if;

  select e.id, e.kind, e.pushed_at into ev
    from public.circle_archive_events e
   where e.circle_id = p_circle
   order by e.id desc
   limit 1
     for update;
  if not found or ev.pushed_at is not null then
    return null;
  end if;
  if (ev.kind = 'archived') is distinct from is_archived then
    return null;
  end if;

  select coalesce(
           (select e.kind from public.circle_archive_events e
             where e.circle_id = p_circle and e.pushed_at is not null
             order by e.id desc limit 1),
           'unarchived')
    into last_heard;
  if ev.kind = last_heard then
    return null;
  end if;

  select count(*) into recent
    from public.circle_archive_events e
   where e.circle_id = p_circle and e.pushed_at > now() - interval '1 day';
  if recent >= 6 then
    return null;
  end if;

  update public.circle_archive_events set pushed_at = now() where id = ev.id;
  return ev.kind;
end;
$$;

revoke all on function public.claim_circle_archive_push(uuid) from public, anon, authenticated;
grant execute on function public.claim_circle_archive_push(uuid) to service_role;

-- 5. No one new joins an archived circle, whichever way they try (the owner's own membership and
--    people already in it are untouched; leaving always works).
create or replace function public.refuse_join_archived_circle()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if NEW.role = 'member'
     and NEW.status in ('approved', 'requested')
     and NEW.user_id = auth.uid()
     -- An upsert on an existing row (an invite code used again) fires this INSERT check first; the
     -- row's own UPDATE check then decides whether its status really changes.
     and (case when TG_OP = 'INSERT'
               then not exists (select 1 from public.circle_members m
                                 where m.circle_id = NEW.circle_id and m.user_id = NEW.user_id)
               else OLD.status is distinct from NEW.status
          end)
     and exists (
       select 1 from public.circles c where c.id = NEW.circle_id and c.archived_at is not null
     ) then
    raise exception 'circle_archived'
      using errcode = 'P0001',
            hint = 'This circle has been archived, so no one new can join.';
  end if;
  return NEW;
end;
$$;

drop trigger if exists circle_members_refuse_archived on public.circle_members;
create trigger circle_members_refuse_archived
  before insert or update of status on public.circle_members
  for each row execute function public.refuse_join_archived_circle();
