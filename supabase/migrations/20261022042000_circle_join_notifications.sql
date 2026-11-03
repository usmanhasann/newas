-- Join notifications for Public circle owners (client revisions 10/14, p.9, N10).
--
-- "[Name] joined [Circle name]." to the owner when someone joins their Public circle, and joins close
-- together combined into one: "[Name] and [N] others joined [Circle name]." On by default; the owner
-- turns it off with the circle's own "New members" switch (the bell).
--
-- "Close together" = within 10 minutes: an owner gets at most ONE join push per circle every 10
-- minutes. The first join after a quiet spell is announced straight away; anyone who joins in the
-- 10 minutes after that is gathered and announced together when the 10 minutes are up.
--
-- How:
--  * circle_join_queue: every join of a Public circle (any path, any app version: Discover, invite
--    code, sign-up code) is queued by a trigger on circle_members.
--  * claim_circle_join_digest(circle): takes everything queued for that circle (once, atomically)
--    unless the circle had a join push in the last 10 minutes; returns who to name and how many.
--    People who left again before the push are not counted.
--  * due_circle_join_digests(): the circles whose gathered joins are ready to announce now.
--  * Callers: send-push ("member_joined", sent by the app right after a join: the first push goes out
--    at once) and the circle-join-digest Edge Function, run every minute by pg_cron, which sends the
--    gathered ones (and covers older app builds, which don't send "member_joined").
--  * The owner's "New members" switch is checked by the sender; a claimed digest is consumed either
--    way, so turning the switch back on never replays old joins.

-- The owner's switch, on by default (no saved row = on, as for every other switch).
alter table public.circle_notification_prefs
  add column if not exists new_members boolean not null default true;

create table if not exists public.circle_join_queue (
  id bigint generated always as identity primary key,
  circle_id uuid not null references public.circles (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now()
);

create index if not exists circle_join_queue_circle_idx
  on public.circle_join_queue (circle_id, joined_at);

-- When each circle last had a join push (the 10-minute rule).
create table if not exists public.circle_join_digests (
  circle_id uuid primary key references public.circles (id) on delete cascade,
  last_sent_at timestamptz not null
);

-- Server only: no app access to either table.
alter table public.circle_join_queue enable row level security;
alter table public.circle_join_digests enable row level security;
revoke all on public.circle_join_queue from anon, authenticated;
revoke all on public.circle_join_digests from anon, authenticated;

create or replace function public.queue_circle_join()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if NEW.status = 'approved'
     and NEW.role = 'member'
     and (TG_OP = 'INSERT' or OLD.status is distinct from 'approved')
     and exists (
       select 1 from public.circles c
        where c.id = NEW.circle_id and c.type = 'public' and c.owner_id is distinct from NEW.user_id
     ) then
    insert into public.circle_join_queue (circle_id, user_id) values (NEW.circle_id, NEW.user_id);
  end if;
  return null;
end;
$$;

revoke all on function public.queue_circle_join() from public, anon, authenticated;

drop trigger if exists circle_members_queue_join on public.circle_members;
create trigger circle_members_queue_join
  after insert or update of status on public.circle_members
  for each row execute function public.queue_circle_join();

-- Takes this circle's queued joins for one push, unless it had one in the last 10 minutes. Returns
-- one row (owner, circle name, the newest joiner still in the circle, how many joined) or nothing.
create or replace function public.claim_circle_join_digest(p_circle uuid)
returns table (owner_id uuid, circle_name text, latest_user_id uuid, joined_count integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c record;
  last_sent timestamptz;
  v_latest uuid;
  v_count integer;
begin
  select ci.owner_id, ci.name, ci.type into c from public.circles ci where ci.id = p_circle;
  if not found or c.type <> 'public' or c.owner_id is null then
    return;
  end if;

  -- One claim at a time per circle.
  insert into public.circle_join_digests as d (circle_id, last_sent_at)
  values (p_circle, '-infinity')
  on conflict (circle_id) do nothing;
  select d.last_sent_at into last_sent
    from public.circle_join_digests d
   where d.circle_id = p_circle
     for update;
  if last_sent > now() - interval '10 minutes' then
    return;
  end if;

  with taken as (
    delete from public.circle_join_queue q
     where q.circle_id = p_circle
    returning q.user_id, q.joined_at
  ), still_in as (
    select t.user_id, max(t.joined_at) as joined_at
      from taken t
     where exists (
       select 1 from public.circle_members m
        where m.circle_id = p_circle and m.user_id = t.user_id and m.status = 'approved'
     )
     group by t.user_id
  )
  select (select s.user_id from still_in s order by s.joined_at desc, s.user_id limit 1),
         (select count(*)::integer from still_in)
    into v_latest, v_count;

  if coalesce(v_count, 0) = 0 then
    return;
  end if;

  update public.circle_join_digests d set last_sent_at = now() where d.circle_id = p_circle;
  return query select c.owner_id, c.name, v_latest, v_count;
end;
$$;

revoke all on function public.claim_circle_join_digest(uuid) from public, anon, authenticated;
grant execute on function public.claim_circle_join_digest(uuid) to service_role;

-- The circles with joins waiting whose 10 minutes are up (for the every-minute sweep).
create or replace function public.due_circle_join_digests(p_limit integer default 500)
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select q.circle_id
    from public.circle_join_queue q
    left join public.circle_join_digests d on d.circle_id = q.circle_id
   where d.last_sent_at is null or d.last_sent_at <= now() - interval '10 minutes'
   group by q.circle_id
   order by min(q.joined_at)
   limit least(greatest(coalesce(p_limit, 500), 1), 1000);
$$;

revoke all on function public.due_circle_join_digests(integer) from public, anon, authenticated;
grant execute on function public.due_circle_join_digests(integer) to service_role;

-- SCHEDULING (deploy-time; not activated by this migration because it needs the project's Functions
-- URL and the shared CRON_SECRET, which don't belong in version control). After deploying the
-- `circle-join-digest` Edge Function (verify_jwt off: it checks the secret itself), run ONCE:
--
--   select cron.schedule(
--     'lysm-circle-join-digest', '* * * * *',
--     $cron$
--       select net.http_post(
--         url    := 'https://<project-ref>.functions.supabase.co/circle-join-digest',
--         headers:= jsonb_build_object('Content-Type','application/json','x-cron-secret','<CRON_SECRET>'),
--         body   := '{}'::jsonb
--       );
--     $cron$
--   );
