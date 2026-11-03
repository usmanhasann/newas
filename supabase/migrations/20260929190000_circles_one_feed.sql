-- ============================================================================
-- 20260929190000_circles_one_feed.sql
-- Circles rebuild (client spec 2026-09-29): Board and Posts become ONE feed.
--
-- * A shared journal entry is now a post in circle_posts (entry_id set). So shared entries and
--   direct posts share one feed, one heart, one reply thread and one delete, instead of two systems.
--   Entry sharing is Private-circles only, and the author picks what the circle sees: the entry
--   'written' as is, or its AI 'reflection'. Only that version is ever copied into the post (the
--   other stays in the private journal row). The copy follows edits to the entry and fills in when
--   the reflection is ready; until then a 'reflection' share is visible to its author only.
-- * Optional moods on any post or reply (mood_slugs; a shared entry carries the entry's moods).
-- * Two-level threads: replying past the allowed depth joins the same group and remembers who was
--   answered (reply_to_id / mention_user_id) for the "@Name" tag. Public: prompt > reply > nested
--   reply. Private: post > reply.
-- * Private circles show members only what was posted after they joined (a thread belongs to its
--   top post's time). Public circles show everything. The home widget follows the same rule and
--   now reads shared entries AND mood-tagged posts.
-- * Circle owners may remove any post in their circle, Private too. Removing a post removes its
--   replies. Moderation removals are hard deletes now (the strike keeps the text for the notice).
-- * Entries already shared into Public circles are removed (user decision); emoji reactions on
--   shared entries become hearts on the new posts.
-- * Installed app builds keep working: their entry_shares writes become 'reflection' posts, and the
--   old feed functions read from circle_posts.
-- * Fixes members_no_banned_rejoin: banned people could rejoin a Public circle, and an owner who
--   had banned anyone could not join any Public circle.
-- * Hardening (audit 2026-09-30): the server dates every post and zeroes its counts; replies only to
--   posts you can see; join times can't be moved; a circle's type can't change; the AI reflection
--   can't be written by the app; paused accounts can't change what their circle reads.
-- ============================================================================

-- ---------- 0. the ban check ----------------------------------------------------------------
-- The old policy compared circle_bans with itself, and ran under circle_bans' own RLS (only a
-- circle's owner can see its bans). So a banned person could rejoin a Public circle (they can't
-- see their own ban), while an owner who had banned anyone couldn't join any Public circle at all.
-- The check now runs server-side, for the row being inserted. It only answers about yourself, or
-- for the circle's owner (who made the bans); for anyone else it's always false, so it can't be
-- used to find out who was banned.
create or replace function public.is_banned_from_circle(cid uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (uid = auth.uid() or public.is_circle_owner(cid, auth.uid()))
     and exists (select 1 from public.circle_bans b where b.circle_id = cid and b.user_id = uid);
$$;
revoke all on function public.is_banned_from_circle(uuid, uuid) from public, anon;
grant execute on function public.is_banned_from_circle(uuid, uuid) to authenticated;

drop policy if exists "members_no_banned_rejoin" on public.circle_members;
create policy "members_no_banned_rejoin" on public.circle_members
  as restrictive for insert
  with check (not public.is_banned_from_circle(circle_members.circle_id, circle_members.user_id));

-- ---------- 1. when each member joined -------------------------------------------------
alter table public.circle_members add column if not exists approved_at timestamptz;

update public.circle_members
   set approved_at = coalesce(approved_at, created_at)
 where status = 'approved';

create or replace function public.stamp_member_approved_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Only this trigger sets the join time: approval stamps it, staying approved keeps it (nobody,
  -- not even the owner, can move it back to reveal older posts), leaving clears it.
  if NEW.status = 'approved' then
    if TG_OP = 'INSERT' or OLD.status is distinct from 'approved' then
      NEW.approved_at := now();
    else
      NEW.approved_at := OLD.approved_at;
    end if;
  else
    NEW.approved_at := null;
  end if;
  return NEW;
end;
$$;

drop trigger if exists circle_members_stamp_approved_at on public.circle_members;
create trigger circle_members_stamp_approved_at
  before insert or update on public.circle_members
  for each row execute function public.stamp_member_approved_at();

-- A circle's type is fixed once it's made: turning a Private circle Public would show everything
-- its members shared privately to whoever joins next.
create or replace function public.circles_keep_type()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if NEW.type is distinct from OLD.type then
    raise exception 'a circle''s type can''t be changed' using errcode = '42501';
  end if;
  return NEW;
end;
$$;

drop trigger if exists circles_keep_type on public.circles;
create trigger circles_keep_type
  before update of type on public.circles
  for each row execute function public.circles_keep_type();

-- Can the caller see a thread of this circle that started at thread_at? Approved members only;
-- in a Private circle, only threads started after they joined.
create or replace function public.can_see_circle_thread(cid uuid, thread_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.circle_members m
      join public.circles c on c.id = m.circle_id
     where m.circle_id = cid
       and m.user_id = auth.uid()
       and m.status = 'approved'
       and (c.type = 'public' or thread_at >= coalesce(m.approved_at, m.created_at))
  );
$$;

-- ---------- 2. circle_posts: shared entries, moods, two-level threads -----------------
alter table public.circle_posts
  add column if not exists entry_id uuid references public.journal_entries (id) on delete cascade,
  add column if not exists entry_version text,
  add column if not exists mood_slugs text[] not null default '{}',
  add column if not exists reply_to_id uuid references public.circle_posts (id) on delete set null,
  add column if not exists mention_user_id uuid references auth.users (id) on delete set null,
  add column if not exists thread_created_at timestamptz;

alter table public.circle_posts alter column body drop not null;
alter table public.circle_posts drop constraint if exists circle_posts_body_check;
alter table public.circle_posts drop constraint if exists circle_posts_content_check;
alter table public.circle_posts
  add constraint circle_posts_content_check check (
    (entry_id is null and entry_version is null and body is not null and length(btrim(body)) > 0)
    or (entry_id is not null and entry_version in ('written', 'reflection') and parent_id is null)
  );

alter table public.circle_posts drop constraint if exists circle_posts_entry_once;
alter table public.circle_posts
  add constraint circle_posts_entry_once unique (circle_id, entry_id);

-- Every existing post gets its thread's start time (none in production today; kept generic).
with recursive t as (
  select p.id, p.created_at as root_at from public.circle_posts p where p.parent_id is null
  union all
  select c.id, t.root_at from public.circle_posts c join t on c.parent_id = t.id
)
update public.circle_posts p set thread_created_at = t.root_at from t where t.id = p.id;
alter table public.circle_posts alter column thread_created_at set not null;

create index if not exists circle_posts_entry_idx on public.circle_posts (entry_id) where entry_id is not null;
create index if not exists circle_posts_widget_idx
  on public.circle_posts (circle_id, author_id, created_at desc)
  where parent_id is null and cardinality(mood_slugs) > 0;

-- Up to 3 known moods, first choice first, no repeats (same rules as an entry's moods).
create or replace function public.clean_mood_slugs(p text[])
returns text[]
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  deduped text[] := '{}';
  s text;
  bad text;
begin
  foreach s in array coalesce(p, '{}') loop
    if s is not null and not (s = any (deduped)) then
      deduped := array_append(deduped, s);
    end if;
  end loop;
  if cardinality(deduped) > 3 then
    deduped := deduped[1:3];
  end if;
  select u into bad from unnest(deduped) as u
   where not exists (select 1 from public.moods md where md.slug = u)
   limit 1;
  if bad is not null then
    raise exception 'invalid_mood_slug: %', bad using errcode = 'foreign_key_violation';
  end if;
  return deduped;
end;
$$;

-- The text a shared entry shows: exactly the version its author picked (null until it exists).
create or replace function public.entry_share_text(p_version text, p_note text, p_reflection text)
returns text
language sql
immutable
as $$
  select case p_version
           when 'written' then nullif(btrim(p_note), '')
           when 'reflection' then nullif(btrim(p_reflection), '')
         end;
$$;

-- Shapes every new post: flattens replies to two levels, dates the thread, and fills a shared
-- entry's text + moods from the entry (the client never supplies them).
create or replace function public.circle_posts_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ctype public.circle_type;
  par record;
  par_depth int;
  max_depth int;
  src record;
begin
  select ci.type into ctype from public.circles ci where ci.id = NEW.circle_id;
  if ctype is null then
    raise exception 'circle not found' using errcode = '23503';
  end if;

  -- The server decides these, never the app: a post is dated when it's made (so it can't be pinned
  -- to the top of the feed or the widget with a future date), starts with no replies or hearts, and
  -- isn't born removed. (Only a database-side import, with no signed-in user, may keep a date.)
  if coalesce(auth.role(), '') in ('authenticated', 'anon') or NEW.created_at is null then
    NEW.created_at := now();
  end if;
  NEW.reply_count := 0;
  NEW.like_count := 0;
  NEW.deleted_at := null;
  NEW.deleted_by := null;
  NEW.deleted_reason := null;
  NEW.reply_to_id := null;
  NEW.mention_user_id := null;

  if NEW.parent_id is not null then
    if NEW.entry_id is not null then
      raise exception 'a shared entry is always a top-level post' using errcode = '22023';
    end if;
    select p.id, p.circle_id, p.parent_id, p.author_id, p.thread_created_at, p.body, p.deleted_at
      into par
      from public.circle_posts p
     where p.id = NEW.parent_id;
    if not found or par.circle_id <> NEW.circle_id then
      raise exception 'reply target is not in this circle' using errcode = '22023';
    end if;
    -- You can only answer what you can see: not a thread from before you joined a Private circle,
    -- not a reflection that isn't ready yet, not a removed post.
    if coalesce(auth.role(), '') in ('authenticated', 'anon') and (
         par.deleted_at is not null
         or not public.can_see_circle_thread(NEW.circle_id, par.thread_created_at)
         or (par.body is null and par.author_id is distinct from auth.uid())
       ) then
      raise exception 'reply target is not available' using errcode = '42501';
    end if;
    par_depth := case
      when par.parent_id is null then 0
      when (select g.parent_id from public.circle_posts g where g.id = par.parent_id) is null then 1
      else 2
    end;
    max_depth := case when ctype = 'public' then 2 else 1 end;
    if par_depth + 1 > max_depth then
      -- Past the allowed depth: join the same group, tagged "@" the person being answered.
      NEW.reply_to_id := par.id;
      NEW.mention_user_id := par.author_id;
      NEW.parent_id := par.parent_id;
    end if;
    NEW.thread_created_at := par.thread_created_at;
  else
    NEW.thread_created_at := NEW.created_at;
  end if;

  if NEW.entry_id is not null then
    if ctype <> 'private' then
      raise exception 'entries can only be shared into private circles' using errcode = '42501';
    end if;
    select e.user_id, e.note, e.ai_summary, e.mood_slugs into src
      from public.journal_entries e
     where e.id = NEW.entry_id;
    if not found or src.user_id is distinct from NEW.author_id then
      raise exception 'only the entry''s author can share it' using errcode = '42501';
    end if;
    if NEW.entry_version is null or NEW.entry_version not in ('written', 'reflection') then
      raise exception 'entry_version must be written or reflection' using errcode = '22023';
    end if;
    NEW.body := public.entry_share_text(NEW.entry_version, src.note, src.ai_summary);
    NEW.mood_slugs := coalesce(src.mood_slugs, '{}');
  else
    NEW.entry_version := null;
    NEW.mood_slugs := public.clean_mood_slugs(NEW.mood_slugs);
  end if;
  return NEW;
end;
$$;

drop trigger if exists circle_posts_shape on public.circle_posts;
create trigger circle_posts_shape
  before insert on public.circle_posts
  for each row execute function public.circle_posts_before_insert();

-- A shared entry follows its entry: edits to the text, a new reflection, changed moods. While an
-- author's posting is paused (restricted or suspended) an edit can't change the words their
-- circle reads ("as written" shares keep the old text); reflections and moods still follow.
create or replace function public.sync_entry_posts()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  paused boolean := NEW.note is distinct from OLD.note and public.my_circle_standing() <> 'ok';
begin
  update public.circle_posts p
     set body = case
                  when p.entry_version = 'written' and paused then p.body
                  else public.entry_share_text(p.entry_version, NEW.note, NEW.ai_summary)
                end,
         mood_slugs = coalesce(NEW.mood_slugs, '{}')
   where p.entry_id = NEW.id;
  return NEW;
end;
$$;

-- The AI reflection is written by the server only. The app may clear it (to have it redone after
-- an edit) but never write its own text, which would then be shown under the ✨ AI marker.
create or replace function public.guard_entry_reflection()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') and NEW.ai_summary is not null
     and (TG_OP = 'INSERT' or NEW.ai_summary is distinct from OLD.ai_summary) then
    NEW.ai_summary := case when TG_OP = 'INSERT' then null else OLD.ai_summary end;
  end if;
  return NEW;
end;
$$;

drop trigger if exists journal_entries_guard_reflection on public.journal_entries;
create trigger journal_entries_guard_reflection
  before insert or update on public.journal_entries
  for each row execute function public.guard_entry_reflection();

drop trigger if exists journal_entries_sync_posts on public.journal_entries;
create trigger journal_entries_sync_posts
  after update of note, ai_summary, mood_slugs on public.journal_entries
  for each row
  when (old.note is distinct from new.note
        or old.ai_summary is distinct from new.ai_summary
        or old.mood_slugs is distinct from new.mood_slugs)
  execute function public.sync_entry_posts();

-- journal_entries.shared = "posted to at least one circle", kept by the server.
create or replace function public.mark_entry_shared()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if TG_OP = 'INSERT' then
    update public.journal_entries set shared = true where id = NEW.entry_id and not shared;
    return NEW;
  end if;
  update public.journal_entries e
     set shared = false
   where e.id = OLD.entry_id
     and e.shared
     and not exists (select 1 from public.circle_posts p where p.entry_id = e.id)
     and not exists (select 1 from public.entry_shares es where es.entry_id = e.id);
  return OLD;
end;
$$;

drop trigger if exists circle_posts_mark_shared_ins on public.circle_posts;
create trigger circle_posts_mark_shared_ins
  after insert on public.circle_posts
  for each row when (new.entry_id is not null)
  execute function public.mark_entry_shared();
drop trigger if exists circle_posts_mark_shared_del on public.circle_posts;
create trigger circle_posts_mark_shared_del
  after delete on public.circle_posts
  for each row when (old.entry_id is not null)
  execute function public.mark_entry_shared();

-- ---------- 3. who sees and removes what ----------------------------------------------
drop policy if exists "posts_select_member" on public.circle_posts;
drop policy if exists "posts_select_visible" on public.circle_posts;
-- Members see what the rules allow; authors always see their own posts while in the circle (even
-- after rejoining a Private circle, so they can still find and delete them).
create policy "posts_select_visible" on public.circle_posts
  for select using (
    deleted_at is null
    and (
      (author_id = auth.uid() and public.is_circle_member(circle_id, auth.uid()))
      or (body is not null and public.can_see_circle_thread(circle_id, thread_created_at))
    )
  );

drop policy if exists "posts_delete_author_or_public_owner" on public.circle_posts;
drop policy if exists "posts_delete_author_or_owner" on public.circle_posts;
create policy "posts_delete_author_or_owner" on public.circle_posts
  for delete using (author_id = auth.uid() or public.is_circle_owner(circle_id, auth.uid()));

drop policy if exists "reactions_select_member" on public.post_reactions;
drop policy if exists "reactions_select_visible" on public.post_reactions;
create policy "reactions_select_visible" on public.post_reactions
  for select using (exists (select 1 from public.circle_posts p where p.id = post_id));

drop policy if exists "reactions_insert_own" on public.post_reactions;
drop policy if exists "reactions_insert_visible" on public.post_reactions;
create policy "reactions_insert_visible" on public.post_reactions
  for insert with check (
    user_id = auth.uid()
    and exists (select 1 from public.circle_posts p where p.id = post_id)
    and not public.is_banned_from_circle(
      (select p.circle_id from public.circle_posts p where p.id = post_id), auth.uid()
    )
  );

-- ---------- 4. sharing an entry --------------------------------------------------------
-- Share the caller's entry into exactly these Private circles, showing this version. Circles it's
-- no longer picked for lose it (with their replies); circles it stays in switch version in place
-- (keeping hearts and replies); new ones get a new post. Returns the posts it created.
create or replace function public.share_entry(p_entry uuid, p_circles uuid[], p_version text)
returns table (circle_id uuid, post_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  want uuid[] := coalesce((select array_agg(distinct x) from unnest(p_circles) as x where x is not null), '{}');
  bad uuid;
  src record;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_version is null or p_version not in ('written', 'reflection') then
    raise exception 'entry_version must be written or reflection' using errcode = '22023';
  end if;
  select e.user_id, e.note, e.ai_summary into src from public.journal_entries e where e.id = p_entry;
  if not found or src.user_id <> uid then
    raise exception 'only the entry''s author can share it' using errcode = '42501';
  end if;

  -- Every circle it isn't in yet must be a Private circle the caller can post in right now. (Where
  -- it already is, it may stay, and switch version, even if the circle was archived since.)
  select w into bad
    from unnest(want) as w
   where not exists (select 1 from public.circle_posts q where q.entry_id = p_entry and q.circle_id = w)
     and (
       not exists (
         select 1 from public.circles ci
          where ci.id = w and ci.type = 'private' and ci.archived_at is null
       )
       or not public.is_circle_member(w, uid)
       or exists (select 1 from public.circle_bans b where b.circle_id = w and b.user_id = uid)
     )
   limit 1;
  if bad is not null then
    raise exception 'cannot share into circle %', bad using errcode = '42501';
  end if;
  -- While posting is paused (restricted or suspended) nothing new goes out: no new circles and no
  -- switching what a circle sees. Taking an entry out of a circle is always allowed.
  if public.my_circle_standing() <> 'ok' and (
       exists (
         select 1 from unnest(want) as w
          where not exists (select 1 from public.circle_posts q where q.entry_id = p_entry and q.circle_id = w)
       )
       or exists (
         select 1 from public.circle_posts q
          where q.entry_id = p_entry and q.circle_id = any (want) and q.entry_version is distinct from p_version
       )
     ) then
    raise exception 'posting is paused for this account' using errcode = '42501';
  end if;

  delete from public.circle_posts p
   where p.entry_id = p_entry and not (p.circle_id = any (want));

  update public.circle_posts p
     set entry_version = p_version,
         body = public.entry_share_text(p_version, src.note, src.ai_summary)
   where p.entry_id = p_entry and p.entry_version is distinct from p_version;

  return query
    insert into public.circle_posts as p (circle_id, author_id, entry_id, entry_version)
    select w, uid, p_entry, p_version
      from unnest(want) as w
     where not exists (
       select 1 from public.circle_posts q where q.entry_id = p_entry and q.circle_id = w
     )
    returning p.circle_id, p.id;
end;
$$;

revoke all on function public.share_entry(uuid, uuid[], text) from public, anon;
grant execute on function public.share_entry(uuid, uuid[], text) to authenticated;

-- Where the caller's entry is shared, for its author only: including circles they've since left
-- (their share stays there, and they can still take it out), with how many replies each has.
create or replace function public.get_entry_shares(p_entry uuid)
returns table (post_id uuid, circle_id uuid, circle_name text, entry_version text, reply_total int)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.circle_id, ci.name, p.entry_version,
         (with recursive t as (
            select c.id from public.circle_posts c where c.parent_id = p.id
            union all
            select c.id from public.circle_posts c join t on c.parent_id = t.id
          )
          select count(*)::int from t)
    from public.circle_posts p
    join public.journal_entries e on e.id = p.entry_id
    join public.circles ci on ci.id = p.circle_id
   where p.entry_id = p_entry
     and e.user_id = auth.uid()
   order by ci.name;
$$;

revoke all on function public.get_entry_shares(uuid) from public, anon;
grant execute on function public.get_entry_shares(uuid) to authenticated;

-- How many replies go with a post (all levels): the number the delete confirmation shows.
create or replace function public.circle_post_reply_total(p_post uuid)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with recursive t as (
    select p.id from public.circle_posts p
     where p.id = p_post
       and public.can_see_circle_thread(p.circle_id, p.thread_created_at)
    union all
    select c.id from public.circle_posts c join t on c.parent_id = t.id
  )
  select greatest(count(*) - 1, 0)::int from t;
$$;

revoke all on function public.circle_post_reply_total(uuid) from public, anon;
grant execute on function public.circle_post_reply_total(uuid) to authenticated;

-- ---------- 5. move the old shares over ------------------------------------------------
-- Public circles no longer take entries (user decision: remove the ones already there).
delete from public.entry_shares es
 using public.circles ci
 where ci.id = es.circle_id and ci.type = 'public';

-- Private circle shares become posts showing the AI reflection (what the old Board showed).
insert into public.circle_posts (circle_id, author_id, entry_id, entry_version, created_at)
select es.circle_id, e.user_id, es.entry_id, 'reflection', es.created_at
  from public.entry_shares es
  join public.journal_entries e on e.id = es.entry_id
  join public.circles ci on ci.id = es.circle_id and ci.type = 'private'
on conflict on constraint circle_posts_entry_once do nothing;

-- If an entry's own reflection was never made (the old share only wrote per-circle copies), show
-- that circle's copy instead of hiding the share; the entry's reflection replaces it once made.
update public.circle_posts p
   set body = es.ai_summary
  from public.entry_shares es
 where p.body is null
   and p.entry_id = es.entry_id
   and p.circle_id = es.circle_id
   and nullif(btrim(es.ai_summary), '') is not null;

-- Emoji reactions on a shared entry become that person's heart on it, in their circles.
insert into public.post_reactions (post_id, user_id, created_at)
select p.id, r.user_id, r.created_at
  from public.reactions r
  join public.circle_posts p on p.entry_id = r.entry_id
  join public.circle_members m
    on m.circle_id = p.circle_id and m.user_id = r.user_id and m.status = 'approved'
on conflict (post_id, user_id) do nothing;
-- ...and count as already announced.
insert into public.post_reaction_pushes (post_id, reactor_id)
select pr.post_id, pr.user_id from public.post_reactions pr
on conflict do nothing;

delete from public.entry_shares where circle_id is not null;

update public.journal_entries e
   set shared = exists (select 1 from public.circle_posts p where p.entry_id = e.id)
             or exists (select 1 from public.entry_shares es where es.entry_id = e.id)
 where e.shared;

-- ---------- 6. installed app builds ---------------------------------------------------
-- They still write entry_shares: a circle share becomes a 'reflection' post (Private circles only;
-- RLS on circle_posts still decides whether they may post); nothing is kept in entry_shares.
create or replace function public.entry_shares_to_posts()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  ctype public.circle_type;
begin
  if NEW.circle_id is null then
    return NEW; -- a direct share to one person: unchanged
  end if;
  select ci.type into ctype from public.circles ci where ci.id = NEW.circle_id;
  if ctype = 'private' then
    insert into public.circle_posts (circle_id, author_id, entry_id, entry_version)
    select NEW.circle_id, e.user_id, NEW.entry_id, 'reflection'
      from public.journal_entries e
     where e.id = NEW.entry_id
    on conflict on constraint circle_posts_entry_once do nothing;
  end if;
  return null;
end;
$$;

drop trigger if exists entry_shares_become_posts on public.entry_shares;
create trigger entry_shares_become_posts
  before insert on public.entry_shares
  for each row execute function public.entry_shares_to_posts();

-- Their Board: the circle's shared entries, as before (text = the shared version).
create or replace function public.get_circle_feed(cid uuid, before timestamptz default null, lim int default 20)
returns table (
  entry_id uuid,
  author_id uuid,
  mood_slug text,
  ai_summary text,
  shared boolean,
  created_at timestamptz
)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.entry_id, p.author_id, p.mood_slugs[1], p.body, true, p.created_at
    from public.circle_posts p
   where p.circle_id = cid
     and p.entry_id is not null
     and p.body is not null
     and public.can_see_circle_thread(cid, p.thread_created_at)
     and (before is null or p.created_at < before)
   order by p.created_at desc
   limit greatest(lim, 1);
$$;

create or replace function public.get_shared_entry(eid uuid, cid uuid default null)
returns table (
  entry_id uuid,
  author_id uuid,
  mood_slug text,
  ai_summary text,
  shared boolean,
  created_at timestamptz
)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.entry_id, p.author_id, p.mood_slugs[1], p.body, true, p.created_at
    from public.circle_posts p
   where p.entry_id = eid
     and (cid is null or p.circle_id = cid)
     and p.body is not null
     and public.can_see_circle_thread(p.circle_id, p.thread_created_at)
   order by p.created_at desc
   limit 1;
$$;

create or replace function public.get_circle_member_moods(cid uuid)
returns table (user_id uuid, mood_slug text, created_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select distinct on (p.author_id) p.author_id, p.mood_slugs[1], p.created_at
    from public.circle_posts p
   where p.circle_id = cid
     and p.parent_id is null
     and p.author_id is not null
     and p.body is not null
     and cardinality(p.mood_slugs) > 0
     and public.can_see_circle_thread(cid, p.thread_created_at)
   order by p.author_id, p.created_at desc;
$$;

-- Emoji reactions (installed builds only): who may see a shared entry.
create or replace function public.can_view_entry(eid uuid, uid uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.journal_entries e where e.id = eid and e.user_id = uid)
      or exists (
        select 1
          from public.circle_posts p
          join public.circle_members m on m.circle_id = p.circle_id and m.user_id = uid and m.status = 'approved'
          join public.circles ci on ci.id = p.circle_id
         where p.entry_id = eid
           and p.body is not null
           and (ci.type = 'public' or p.thread_created_at >= coalesce(m.approved_at, m.created_at))
      )
      or exists (select 1 from public.entry_shares es where es.entry_id = eid and es.target_user_id = uid);
$$;

-- ---------- 7. the home widget ----------------------------------------------------------
-- Per other member: their newest shared entry OR mood-tagged post in this Private circle from the
-- last 24 hours that the viewer can see (posted after the viewer joined), with its moods in order.
-- A shared entry's time is when its mood was LOGGED (the entry), not when it was shared, so sharing
-- an old entry never shows an old mood as new.
create or replace function public.widget_feed(p_key text, p_circle uuid)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid;
  cname text;
  others int;
  joined timestamptz;
begin
  update public.widget_keys
     set last_used_at = now()
   where key_hash = encode(extensions.digest(coalesce(p_key, ''), 'sha256'), 'hex')
  returning user_id into uid;
  if uid is null then
    return json_build_object('error', 'invalid_key');
  end if;

  select c.name, coalesce(m.approved_at, m.created_at) into cname, joined
    from public.circles c
    join public.circle_members m on m.circle_id = c.id and m.user_id = uid and m.status = 'approved'
   where c.id = p_circle
     and c.type = 'private';
  if cname is null then
    return json_build_object('error', 'no_circle');
  end if;

  select count(*) into others
    from public.circle_members m
   where m.circle_id = p_circle and m.status = 'approved' and m.user_id <> uid;

  return json_build_object(
    'circle', cname,
    'member_count', others,
    'generated_at', (extract(epoch from now()) * 1000)::bigint,
    'members', coalesce((
      select json_agg(json_build_object(
               'id', t.user_id,
               'name', t.name,
               'avatar', t.avatar,
               'moods', coalesce(t.moods, '[]'::json),
               'at', t.at)
             order by t.at desc nulls last, t.name)
        from (
          select m.user_id,
                 coalesce(nullif(trim(pr.display_name), ''), 'Member') as name,
                 pr.avatar_url as avatar,
                 lp.moods,
                 (extract(epoch from lp.mood_at) * 1000)::bigint as at
            from public.circle_members m
            left join public.profiles pr on pr.user_id = m.user_id
            left join lateral (
              select coalesce(e.created_at, p.created_at) as mood_at,
                     (select json_agg(md.label order by x.ord)
                        from unnest(p.mood_slugs) with ordinality as x (slug, ord)
                        join public.moods md on md.slug = x.slug) as moods
                from public.circle_posts p
                left join public.journal_entries e on e.id = p.entry_id
               where p.circle_id = p_circle
                 and p.author_id = m.user_id
                 and p.parent_id is null
                 and p.deleted_at is null
                 and p.body is not null
                 and cardinality(p.mood_slugs) > 0
                 and coalesce(e.created_at, p.created_at) > now() - interval '24 hours'
                 and p.created_at >= joined
               order by coalesce(e.created_at, p.created_at) desc
               limit 1
            ) lp on true
           where m.circle_id = p_circle
             and m.status = 'approved'
             and m.user_id <> uid
             and (others <= 4 or lp.mood_at is not null)
           order by lp.mood_at desc nulls last, name
           limit 50
        ) t
    ), '[]'::json)
  );
end;
$$;

revoke all on function public.widget_feed(text, uuid) from public;
grant execute on function public.widget_feed(text, uuid) to anon, authenticated;

-- ---------- 8. deleting a circle -------------------------------------------------------
-- Same rules as before; its posts cascade and each shared entry's `shared` flag updates itself.
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

  delete from public.circles where id = p_circle;
end;
$$;
