-- Private circles reply like Public ones (client revisions 10/14, p.6): a reply to someone's reply
-- is attached to THAT reply and shows under it, instead of being moved under the post with an "@".
-- Threads are now post > reply > reply to a reply in both circle types; replying deeper than that
-- joins the same group tagged "@" the person answered, exactly as Public already did.
-- Only the depth rule changes; the rest of circle_posts_before_insert is unchanged (verified
-- identical to the live function on 2026-10-20). Existing replies keep where they are.

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
    -- Public and Private alike: post > reply > reply to a reply (client 10/14 p.6).
    max_depth := 2;
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
