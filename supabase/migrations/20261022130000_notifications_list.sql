-- In-app notifications list (client revisions 10/14 p.8 and p.24; owner's decision 2026-10-21: a bell
-- at the top right of the Journal tab with an unread dot, opening the full list).
--
-- The client assumes the app keeps a list of what each person was notified about:
--   p.8:  no banners in onboarding / paywall / sign-in / the crisis pop-up, but "anything that comes in
--         during that time should still be saved to the in-app notifications list";
--   p.24: an archived / unarchived circle: members who turned that circle's notifications off get no
--         push, "but they still see it in the app's notifications list".
--
-- How:
--  * public.notifications: one row per person per notification, written by the Edge Functions that
--    send them (service role only: send-push, circle-join-digest, recap-notifications,
--    streak-reminder), at the moment they're sent, whether or not the person has a device that can
--    receive a push. The row keeps the push's own title, text and data (the data says where a tap
--    goes). `actor_id` = the person it's about, so the list can show their name with the verified
--    badge live (N7: "the badge disappears everywhere right away" when it's turned off).
--  * The app reads it only through the functions below (no table grants to app users):
--      my_notifications(before_created, before_id, limit): the caller's list, newest first, keyset
--        paginated; a post's one-line preview is read LIVE from the post, and only while the caller
--        can still see it (deleted or removed posts and Private threads from before they joined
--        show no preview);
--      has_unread_notifications(): the bell's dot;
--      mark_notifications_read(): opening the list marks everything in it read.
--  * Kept 90 days (the list shows that long), then deleted by a daily pg_cron job.
--  * Reminders scheduled on the phone (the daily check-in, the trial reminder) are not in the list:
--    nothing on the server knows about them.
--
-- Deleting an account deletes its rows (cascade from auth.users). Safe to apply before or after the
-- app build: older builds never read it, and the Edge Functions skip the write if the table is missing.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (char_length(kind) between 1 and 64),
  title text not null default '' check (char_length(title) <= 200),
  body text not null default '' check (char_length(body) <= 500),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  actor_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

comment on table public.notifications is
  'In-app notifications list (client 10/14 p.8, p.24). Written by Edge Functions (service role); read via my_notifications().';

-- The list (newest first, keyset) and the bell's dot.
create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc, id desc);
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at)
  where read_at is null;
-- The daily clean-up.
create index if not exists notifications_created_idx on public.notifications (created_at);

alter table public.notifications enable row level security;
-- No policies and no grants: app users go through the functions below; the service role bypasses RLS.
revoke all on public.notifications from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- The caller's list.
create or replace function public.my_notifications(
  p_before_created timestamptz default null,
  p_before_id uuid default null,
  p_limit int default 30
)
returns table (
  id uuid,
  kind text,
  title text,
  body text,
  data jsonb,
  created_at timestamptz,
  read_at timestamptz,
  actor_name text,
  actor_avatar_url text,
  actor_verified boolean,
  preview text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select n.id,
         n.kind,
         n.title,
         n.body,
         n.data,
         n.created_at,
         n.read_at,
         p.display_name,
         p.avatar_url,
         coalesce(p.verified, false),
         -- A new post or reply: one line of what they wrote, read live, only while the caller can
         -- still see it.
         case
           when n.kind = 'post_created'
                and (n.data ->> 'post_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           then (
             select left(btrim(regexp_replace(cp.body, '\s+', ' ', 'g')), 160)
               from public.circle_posts cp
              where cp.id = (n.data ->> 'post_id')::uuid
                and cp.deleted_at is null
                and cp.body is not null
                and public.is_circle_member(cp.circle_id, auth.uid())
                and public.can_see_circle_thread(cp.circle_id, cp.thread_created_at)
           )
         end
    from public.notifications n
    left join public.profiles p on p.user_id = n.actor_id
   where n.user_id = auth.uid()
     and n.created_at > now() - interval '90 days'
     and (
       p_before_created is null
       or (n.created_at, n.id) < (p_before_created, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
     )
   order by n.created_at desc, n.id desc
   limit least(greatest(coalesce(p_limit, 30), 1), 50);
$$;

revoke all on function public.my_notifications(timestamptz, uuid, int) from public, anon;
grant execute on function public.my_notifications(timestamptz, uuid, int) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- The bell's dot.
create or replace function public.has_unread_notifications()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.notifications n
     where n.user_id = auth.uid()
       and n.read_at is null
       and n.created_at > now() - interval '90 days'
  );
$$;

revoke all on function public.has_unread_notifications() from public, anon;
grant execute on function public.has_unread_notifications() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Opening the list marks everything read. Returns how many rows it marked.
create or replace function public.mark_notifications_read()
returns integer
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  with marked as (
    update public.notifications n
       set read_at = now()
     where n.user_id = auth.uid()
       and n.read_at is null
    returning 1
  )
  select count(*)::int from marked;
$$;

revoke all on function public.mark_notifications_read() from public, anon;
grant execute on function public.mark_notifications_read() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Keep 90 days.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    begin
      if exists (select 1 from cron.job where jobname = 'lysm-notifications-cleanup') then
        perform cron.unschedule('lysm-notifications-cleanup');
      end if;
      perform cron.schedule(
        'lysm-notifications-cleanup', '23 3 * * *',
        $job$delete from public.notifications where created_at < now() - interval '90 days';$job$
      );
    exception when others then
      null; -- insufficient privilege to schedule: skip (the list already hides older rows)
    end;
  end if;
end;
$$;
