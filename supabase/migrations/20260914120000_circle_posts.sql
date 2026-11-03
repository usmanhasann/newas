-- Circles — Posts & Replies, Phase 1 (see design_and_spec/circles-posts-design).
-- Schema + RLS + counts. ADDITIVE to the existing journal-sharing Board — no existing table is
-- replaced. Two interaction models (Public creator-led / Private group-chat) are enforced by RLS
-- (can_post_in_circle) mirrored client-side by circlePostPermissions(). Infinite reply nesting via a
-- single self-referencing table (adjacency list). Nothing is user-facing until later phases.

-- ---------------------------------------------------------------------------------------------
-- circles: new columns + owner-delete → archive (content survives; no auto-transfer)
-- ---------------------------------------------------------------------------------------------
alter table public.circles
  add column if not exists description text,
  add column if not exists member_count integer not null default 0,
  add column if not exists archived_at timestamptz;

-- Deleting the owner's account must ARCHIVE the Circle, not cascade-delete it.
alter table public.circles alter column owner_id drop not null;
alter table public.circles drop constraint if exists circles_owner_id_fkey;
alter table public.circles
  add constraint circles_owner_id_fkey
  foreign key (owner_id) references auth.users (id) on delete set null;

create or replace function public.archive_circle_when_ownerless()
returns trigger language plpgsql as $$
begin
  if new.owner_id is null and old.owner_id is not null and new.archived_at is null then
    new.archived_at := now();
  end if;
  return new;
end;
$$;
create trigger circles_archive_on_owner_removed
  before update of owner_id on public.circles
  for each row execute function public.archive_circle_when_ownerless();

-- member_count = approved members (denormalized for the discovery sort). Recompute on any change.
create or replace function public.refresh_circle_member_count()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare cid uuid;
begin
  cid := coalesce(new.circle_id, old.circle_id);
  update public.circles c
    set member_count = (
      select count(*) from public.circle_members m
      where m.circle_id = cid and m.status = 'approved'
    )
    where c.id = cid;
  return coalesce(new, old);
end;
$$;
create trigger circle_members_count_ins after insert on public.circle_members
  for each row execute function public.refresh_circle_member_count();
create trigger circle_members_count_del after delete on public.circle_members
  for each row execute function public.refresh_circle_member_count();
create trigger circle_members_count_upd after update of status on public.circle_members
  for each row execute function public.refresh_circle_member_count();

update public.circles c set member_count = (
  select count(*) from public.circle_members m where m.circle_id = c.id and m.status = 'approved'
);

-- ---------------------------------------------------------------------------------------------
-- circle_posts — top-level posts AND replies in one table (parent_id null = top-level)
-- ---------------------------------------------------------------------------------------------
create table public.circle_posts (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  parent_id uuid references public.circle_posts (id) on delete cascade,
  body text not null check (length(btrim(body)) > 0),
  reply_count integer not null default 0, -- direct, non-deleted replies (trigger-maintained)
  like_count integer not null default 0,  -- hearts (trigger-maintained)
  created_at timestamptz not null default now(),
  -- Soft-delete is for MODERATION removal (keep the row + reason so the author is told what/why).
  -- A user deleting their OWN post is a hard DELETE (nothing to moderate once it's gone).
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  deleted_reason text
);
create index circle_posts_feed_idx on public.circle_posts (circle_id, parent_id, created_at desc);
create index circle_posts_parent_idx on public.circle_posts (parent_id, created_at);
create index circle_posts_author_idx on public.circle_posts (author_id);

create or replace function public.refresh_reply_count()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare pid uuid;
begin
  pid := coalesce(new.parent_id, old.parent_id);
  if pid is not null then
    update public.circle_posts p set reply_count = (
      select count(*) from public.circle_posts r where r.parent_id = pid and r.deleted_at is null
    ) where p.id = pid;
  end if;
  return coalesce(new, old);
end;
$$;
create trigger circle_posts_reply_count_ins after insert on public.circle_posts
  for each row execute function public.refresh_reply_count();
create trigger circle_posts_reply_count_del after delete on public.circle_posts
  for each row execute function public.refresh_reply_count();
create trigger circle_posts_reply_count_upd after update of deleted_at on public.circle_posts
  for each row execute function public.refresh_reply_count();

-- ---------------------------------------------------------------------------------------------
-- post_reactions — a single heart per user per post
-- ---------------------------------------------------------------------------------------------
create table public.post_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.circle_posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);
create index post_reactions_post_idx on public.post_reactions (post_id);

create or replace function public.refresh_like_count()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare pid uuid;
begin
  pid := coalesce(new.post_id, old.post_id);
  update public.circle_posts p set like_count = (
    select count(*) from public.post_reactions r where r.post_id = pid
  ) where p.id = pid;
  return coalesce(new, old);
end;
$$;
create trigger post_reactions_like_ins after insert on public.post_reactions
  for each row execute function public.refresh_like_count();
create trigger post_reactions_like_del after delete on public.post_reactions
  for each row execute function public.refresh_like_count();

-- ---------------------------------------------------------------------------------------------
-- circle_bans — a real Public ban (a banned user can never rejoin THAT Circle)
-- ---------------------------------------------------------------------------------------------
create table public.circle_bans (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  banned_by uuid references auth.users (id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  unique (circle_id, user_id)
);
create index circle_bans_circle_idx on public.circle_bans (circle_id);

-- ---------------------------------------------------------------------------------------------
-- circle_post_mutes — per-Circle Private new-post mute. Absence of a row = notifications ON.
-- ---------------------------------------------------------------------------------------------
create table public.circle_post_mutes (
  user_id uuid not null references auth.users (id) on delete cascade,
  circle_id uuid not null references public.circles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, circle_id)
);

-- ---------------------------------------------------------------------------------------------
-- Posting-permission helper (mirrors circlePostPermissions in the client)
-- ---------------------------------------------------------------------------------------------
create or replace function public.can_post_in_circle(cid uuid, top_level boolean)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select
    public.is_circle_member(cid, auth.uid())
    and not exists (select 1 from public.circle_bans b where b.circle_id = cid and b.user_id = auth.uid())
    and public.my_circle_standing() = 'ok'
    and case when top_level then
      not exists (select 1 from public.circles c where c.id = cid and c.archived_at is not null)
      and (
        (select c.type from public.circles c where c.id = cid) = 'private'
        or public.is_circle_owner(cid, auth.uid())
      )
    else true end; -- replies: any approved, non-banned member (allowed even when archived)
$$;

-- ---------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------
alter table public.circle_posts      enable row level security;
alter table public.post_reactions    enable row level security;
alter table public.circle_bans       enable row level security;
alter table public.circle_post_mutes enable row level security;

-- Read: any approved member. (A suspended user's "can't view" is enforced in the client/feed query
-- so the feed SELECT stays index-cheap; the WRITE path below is hard-gated on standing.)
create policy "posts_select_member" on public.circle_posts
  for select using (public.is_circle_member(circle_id, auth.uid()));

create policy "posts_insert_allowed" on public.circle_posts
  for insert with check (
    author_id = auth.uid() and public.can_post_in_circle(circle_id, parent_id is null)
  );

-- Delete: the author, OR (PUBLIC only) the circle owner removing a post/reply (creator moderation).
-- No UPDATE policy → the client can never edit a post. Moderation removal is a service-role soft-delete.
create policy "posts_delete_author_or_public_owner" on public.circle_posts
  for delete using (
    author_id = auth.uid()
    or (
      public.is_circle_owner(circle_id, auth.uid())
      and (select c.type from public.circles c where c.id = circle_id) = 'public'
    )
  );

create policy "reactions_select_member" on public.post_reactions
  for select using (
    public.is_circle_member((select p.circle_id from public.circle_posts p where p.id = post_id), auth.uid())
  );
create policy "reactions_insert_own" on public.post_reactions
  for insert with check (
    user_id = auth.uid()
    and public.is_circle_member((select p.circle_id from public.circle_posts p where p.id = post_id), auth.uid())
    and not exists (
      select 1 from public.circle_bans b
      where b.circle_id = (select p.circle_id from public.circle_posts p where p.id = post_id)
        and b.user_id = auth.uid()
    )
  );
create policy "reactions_delete_own" on public.post_reactions
  for delete using (user_id = auth.uid());

-- Bans: the circle owner manages them.
create policy "bans_select_owner" on public.circle_bans
  for select using (public.is_circle_owner(circle_id, auth.uid()));
create policy "bans_insert_owner" on public.circle_bans
  for insert with check (public.is_circle_owner(circle_id, auth.uid()) and banned_by = auth.uid());
create policy "bans_delete_owner" on public.circle_bans
  for delete using (public.is_circle_owner(circle_id, auth.uid()));

-- Per-Circle post mutes: each user manages their own.
create policy "post_mutes_all_own" on public.circle_post_mutes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- A banned user can never rejoin that Circle: a RESTRICTIVE insert policy on circle_members ANDs
-- this ban check onto the existing (permissive) join policies.
create policy "members_no_banned_rejoin" on public.circle_members
  as restrictive for insert
  with check (
    not exists (select 1 from public.circle_bans b where b.circle_id = circle_id and b.user_id = user_id)
  );
