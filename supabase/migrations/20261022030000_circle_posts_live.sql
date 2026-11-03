-- Live circles (client revisions 10/14, p.7, N1): new posts, prompts and replies, hearts, reply
-- counts, edits and deleted posts show up on their own while someone is in a circle, Public and
-- Private, without leaving it or pulling to refresh.
--
-- How: every change a circle's members could see sends one small signal on that circle's PRIVATE
-- Realtime topic "circle-posts:<circle id>" (Supabase Broadcast from the database, realtime.send).
-- The signal carries ids and counts only, never the text or who wrote it; the app then loads what
-- changed through the usual RLS-protected queries, so a Private circle still shows a member only
-- the threads from after they joined. Only the circle's approved members may listen (RLS policy on
-- realtime.messages below).
--
-- Why Broadcast and not Postgres Changes on circle_posts: Postgres Changes can't filter deletes by
-- circle (every listener in the app would receive every delete), never delivers a post that
-- moderation removes (the removed row fails RLS, so the event is dropped), and re-checks RLS once
-- per listener for every change. One signal per change on a per-circle topic scales with the
-- circle, not with the app.
--
-- Signals: {op: insert|update|delete, post_id, parent_id, like_count, reply_count, edited}
--  * insert: a post or reply members can now see (new, a shared reflection that just arrived, or
--    restored).
--  * update: hearts or reply count changed, or its text/moods were edited (edited = true).
--  * delete: deleted, or removed by moderation. A reply removed along with the post above it (or a
--    whole circle being deleted) sends nothing: the post's own signal covers its thread.

-- Sends one signal on a circle's private topic. realtime.send never raises (it only logs a warning),
-- so a signal can never block a post. Only the trigger below may call it.
-- (realtime.messages is partitioned by day; the Realtime service creates the partitions once apps
-- connect to it. Before any app has connected a send only logs that warning, and nobody is
-- listening yet anyway.)
create or replace function public.circle_posts_live_send(p_circle uuid, p_payload jsonb)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  select realtime.send(p_payload, 'post', 'circle-posts:' || p_circle::text, true);
$$;

revoke all on function public.circle_posts_live_send(uuid, jsonb) from public, anon, authenticated;

create or replace function public.circle_posts_live_signal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.circle_posts;
  was_visible boolean := false;
  is_visible boolean := false;
  edited boolean := false;
  counts_changed boolean := false;
  op text;
begin
  if TG_OP = 'INSERT' then
    r := NEW;
    is_visible := NEW.deleted_at is null and NEW.body is not null;
  elsif TG_OP = 'DELETE' then
    r := OLD;
    was_visible := OLD.deleted_at is null and OLD.body is not null;
    -- Deleted along with the post (or reply) above it, or with the whole circle: covered already.
    if OLD.parent_id is not null
       and not exists (select 1 from public.circle_posts p where p.id = OLD.parent_id) then
      return null;
    end if;
    if not exists (select 1 from public.circles c where c.id = OLD.circle_id) then
      return null;
    end if;
  else
    r := NEW;
    was_visible := OLD.deleted_at is null and OLD.body is not null;
    is_visible := NEW.deleted_at is null and NEW.body is not null;
    edited := NEW.body is distinct from OLD.body
           or NEW.mood_slugs is distinct from OLD.mood_slugs
           or NEW.entry_version is distinct from OLD.entry_version;
    counts_changed := NEW.like_count is distinct from OLD.like_count
                   or NEW.reply_count is distinct from OLD.reply_count;
  end if;

  if is_visible and not was_visible then
    op := 'insert';
    edited := false;
  elsif was_visible and not is_visible then
    op := 'delete';
    edited := false;
  elsif is_visible and (edited or counts_changed) then
    op := 'update';
  else
    return null; -- nothing members can see has changed
  end if;

  perform public.circle_posts_live_send(
    r.circle_id,
    jsonb_build_object(
      'op', op,
      'post_id', r.id,
      'parent_id', r.parent_id,
      'like_count', r.like_count,
      'reply_count', r.reply_count,
      'edited', edited
    )
  );
  return null;
end;
$$;

drop trigger if exists circle_posts_live_signal on public.circle_posts;
create trigger circle_posts_live_signal
  after insert or delete or update of body, like_count, reply_count, deleted_at, mood_slugs, entry_version
  on public.circle_posts
  for each row execute function public.circle_posts_live_signal();

-- Who may listen to a circle's topic: its approved members (owner included). Anything that isn't a
-- well-formed "circle-posts:<uuid>" topic is refused.
create or replace function public.can_listen_to_circle_posts(topic text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when topic ~ '^circle-posts:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then public.is_circle_member(substr(topic, 14)::uuid, auth.uid())
    else false
  end;
$$;

revoke all on function public.can_listen_to_circle_posts(text) from public, anon;
grant execute on function public.can_listen_to_circle_posts(text) to authenticated;

-- Realtime checks this when the app joins a private channel (it reads realtime.messages with the
-- topic set, as the signed-in person).
drop policy if exists circle_posts_live_members_listen on realtime.messages;
create policy circle_posts_live_members_listen on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and public.can_listen_to_circle_posts((select realtime.topic()))
  );
