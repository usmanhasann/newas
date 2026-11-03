-- Your Circles sorted by latest activity (client revisions 10/14, p.2, N2).
--
-- Activity = a new post or a new reply in the circle, from anyone, the person included. A Public
-- circle's prompt and a Private circle's shared entry are posts there, so they count too. Joining or
-- creating a circle also counts, for that person only: their circle goes to the top of THEIR list.
-- Archived circles always sit below every active circle, newest activity first among themselves.
--
-- How:
--  * circles.last_activity_at = when something last appeared in the circle (server-kept: a trigger
--    on circle_posts moves it forward; the app can never set it).
--  * my_circles_by_activity(): the caller's circles in list order, each with
--    activity_at = greatest(last_activity_at, when the caller joined), keyset-paginated
--    (archived, activity_at, id) so a long list is read page by page.
--  * The circles and circle_members tables join the Realtime publication so the Circles tab can move
--    a circle the moment it gets activity (or is archived / unarchived) and show a circle the moment
--    the person is let in. Postgres Changes re-checks each listener's read access (RLS), the app
--    listens only to its own circles (id filter) and its own membership rows (user_id filter).
--
-- Older app builds keep working: they read circles with plain selects and ignore the new column.

alter table public.circles add column if not exists last_activity_at timestamptz;

-- Backfill: the newest post or reply people can see, else the circle's creation.
update public.circles c
   set last_activity_at = coalesce(
         (select max(p.created_at)
            from public.circle_posts p
           where p.circle_id = c.id and p.deleted_at is null and p.body is not null),
         c.created_at)
 where c.last_activity_at is null;

alter table public.circles alter column last_activity_at set default now();
alter table public.circles alter column last_activity_at set not null;

-- The app (signed-in requests) never moves last_activity_at itself: a new circle starts "now", and an
-- owner's edit keeps the old value. Only the server's own functions (which run as their owner, not
-- as the signed-in role) move it.
create or replace function public.circles_guard_activity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if TG_OP = 'INSERT' then
      NEW.last_activity_at := now();
    else
      NEW.last_activity_at := OLD.last_activity_at;
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists circles_guard_activity on public.circles;
create trigger circles_guard_activity
  before insert or update on public.circles
  for each row execute function public.circles_guard_activity();

-- A post or reply people can see moves its circle's activity forward: a new one, or a shared
-- reflection that just became visible (its text arrives after the share).
create or replace function public.bump_circle_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_at timestamptz := case when TG_OP = 'INSERT' then NEW.created_at else now() end;
begin
  if NEW.body is null or NEW.deleted_at is not null then
    return null;
  end if;
  update public.circles c
     set last_activity_at = v_at
   where c.id = NEW.circle_id
     and c.last_activity_at < v_at;
  return null;
end;
$$;

revoke all on function public.bump_circle_activity() from public, anon, authenticated;

drop trigger if exists circle_posts_bump_activity on public.circle_posts;
create trigger circle_posts_bump_activity
  after insert on public.circle_posts
  for each row execute function public.bump_circle_activity();

drop trigger if exists circle_posts_bump_activity_visible on public.circle_posts;
create trigger circle_posts_bump_activity_visible
  after update of body on public.circle_posts
  for each row
  when (old.body is null and new.body is not null)
  execute function public.bump_circle_activity();

-- The caller's circles in list order: active first, then archived; newest activity first in each;
-- ties by id. Keyset: pass the last row's (archived, activity_at, id) to read the next page.
create or replace function public.my_circles_by_activity(
  p_limit integer default 100,
  p_after_archived boolean default null,
  p_after_activity timestamptz default null,
  p_after_id uuid default null
)
returns table (
  id uuid,
  owner_id uuid,
  name text,
  type public.circle_type,
  invite_code text,
  invite_link_slug text,
  circle_reflection_style public.circle_reflection_style,
  description text,
  member_count integer,
  archived_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  last_activity_at timestamptz,
  role public.member_role,
  joined_at timestamptz,
  activity_at timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with mine as (
    select c.id as c_id,
           c.owner_id as c_owner_id,
           c.name as c_name,
           c.type as c_type,
           c.invite_code as c_invite_code,
           c.invite_link_slug as c_invite_link_slug,
           c.circle_reflection_style as c_style,
           c.description as c_description,
           c.member_count as c_member_count,
           c.archived_at as c_archived_at,
           c.created_at as c_created_at,
           c.updated_at as c_updated_at,
           c.last_activity_at as c_last_activity_at,
           m.role as m_role,
           coalesce(m.approved_at, m.created_at) as m_joined_at,
           greatest(c.last_activity_at, coalesce(m.approved_at, m.created_at)) as act,
           (c.archived_at is not null) as arch
      from public.circle_members m
      join public.circles c on c.id = m.circle_id
     where m.user_id = auth.uid()
       and m.status = 'approved'
  )
  select x.c_id, x.c_owner_id, x.c_name, x.c_type, x.c_invite_code, x.c_invite_link_slug,
         x.c_style, x.c_description, x.c_member_count, x.c_archived_at, x.c_created_at,
         x.c_updated_at, x.c_last_activity_at, x.m_role, x.m_joined_at, x.act
    from mine x
   where p_after_archived is null
      or x.arch > p_after_archived
      or (x.arch = p_after_archived
          and (x.act < p_after_activity
               or (x.act = p_after_activity and x.c_id < p_after_id)))
   order by x.arch, x.act desc, x.c_id desc
   limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

revoke all on function public.my_circles_by_activity(integer, boolean, timestamptz, uuid) from public, anon;
grant execute on function public.my_circles_by_activity(integer, boolean, timestamptz, uuid) to authenticated;

-- Realtime: circle changes (activity, archive state, name, member count) and the person's own
-- membership rows. Added only if not there yet (re-running is safe).
do $pub$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'circles'
  ) then
    alter publication supabase_realtime add table public.circles;
  end if;
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'circle_members'
  ) then
    alter publication supabase_realtime add table public.circle_members;
  end if;
end
$pub$;
