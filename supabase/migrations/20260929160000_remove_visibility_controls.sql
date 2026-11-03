-- ============================================================================
-- 20260929160000_remove_visibility_controls.sql
-- "Connection Settings" is removed from the app (client spec 2026-09-29): if someone is in a circle,
-- they see everything every member shares there. No per-person hiding, and no blocking.
--
-- The per-person switches lived in sharing_permissions (can_see_mood / can_see_summary) and were
-- enforced in the functions below; each is redefined here WITHOUT them and otherwise unchanged.
-- apply_invite_permissions keeps its other job (marking an email invite 'accepted') but no longer
-- writes permissions. The sharing_permissions and user_blocks tables stay for now, unused, only so
-- app builds already installed (which still open those screens) don't error; drop them once those
-- builds are gone. Blocks were never enforced anywhere, so there is nothing to undo for them.
--
-- Same spec, same functions: the circle Reflection Tone setting is gone too. A shared entry's
-- reflection was already written in its author's own tone when they wrote the entry, so every
-- circle now shows that reflection (journal_entries.ai_summary). The per-circle re-toned copies
-- (entry_shares.ai_summary, written by the retired generate-share-summaries function) are no
-- longer read; circles.circle_reflection_style stays only for installed builds that still send it.
-- ============================================================================

-- Visibility of an entry to a viewer: its owner, or anyone it's shared with (a direct share, or a
-- circle they're an approved member of).
create or replace function public.can_view_entry(eid uuid, uid uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.journal_entries e
    where e.id = eid and (
      e.user_id = uid
      or (
        e.shared and exists (
          select 1 from public.entry_shares es
          where es.entry_id = e.id and (
            es.target_user_id = uid
            or es.circle_id in (
              select cm.circle_id from public.circle_members cm
              where cm.user_id = uid and cm.status = 'approved'
            )
          )
        )
      )
    )
  );
$$;

-- Circle feed: every shared entry, with its author's own reflection.
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
  select
    e.id, e.user_id, e.mood_slug,
    e.ai_summary,
    e.shared, es.created_at
  from public.entry_shares es
  join public.journal_entries e on e.id = es.entry_id
  where es.circle_id = cid
    and public.is_circle_member(cid, auth.uid())
    and (before is null or es.created_at < before)
  order by es.created_at desc
  limit greatest(lim, 1);
$$;

-- One shared entry. cid (the circle it's opened from) stays in the signature for installed builds;
-- every circle sees the same reflection now.
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
  select
    e.id, e.user_id, e.mood_slug,
    e.ai_summary,
    e.shared, e.created_at
  from public.journal_entries e
  where e.id = eid
    and public.can_view_entry(eid, auth.uid());
$$;

-- The older widget feed (still called by installed builds): each member's latest shared mood.
create or replace function public.get_circle_member_moods(cid uuid)
returns table (user_id uuid, mood_slug text, created_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select distinct on (e.user_id) e.user_id, e.mood_slug, e.created_at
  from public.entry_shares es
  join public.journal_entries e on e.id = es.entry_id
  where es.circle_id = cid
    and public.is_circle_member(cid, auth.uid())
  order by e.user_id, e.created_at desc;
$$;

-- Joining a circle through an email invite: mark that invite accepted (nothing else to apply now).
create or replace function public.apply_invite_permissions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  joiner_email citext;
  owner uuid;
begin
  if NEW.status <> 'approved' then
    return NEW;
  end if;
  -- Only on the transition INTO approved (avoid re-running on later updates).
  if TG_OP = 'UPDATE' and OLD.status = 'approved' then
    return NEW;
  end if;

  select owner_id into owner from public.circles where id = NEW.circle_id;
  if owner is null or owner = NEW.user_id then
    return NEW; -- the owner joining their own circle: nothing to mark
  end if;

  select email into joiner_email from auth.users where id = NEW.user_id;
  if joiner_email is null then
    return NEW;
  end if;

  update public.circle_email_invites
     set status = 'accepted'
   where circle_id = NEW.circle_id
     and email = joiner_email
     and status = 'pending';

  return NEW;
end;
$$;
