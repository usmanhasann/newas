-- ============================================================================
-- 20260619130000_circles_sharing.sql
-- Trusted Circles + sharing (build prompt §9.7). Public/private circles, invites,
-- join requests, per-entry sharing, read receipts, reactions, and per-connection
-- sharing permissions. RLS is the security boundary; SECURITY DEFINER helpers
-- encapsulate membership/visibility checks and avoid policy recursion.
-- ============================================================================

create type public.circle_type as enum ('public', 'private');
create type public.member_status as enum ('invited', 'requested', 'approved', 'rejected', 'left');
create type public.member_role as enum ('owner', 'member');
create type public.email_invite_status as enum ('pending', 'accepted', 'revoked');

-- ---------- tables ----------------------------------------------------------
create table public.circles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  type public.circle_type not null default 'private',
  invite_code text not null unique
    default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  invite_link_slug text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index circles_owner_idx on public.circles (owner_id);

create table public.circle_members (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'member',
  status public.member_status not null default 'approved',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (circle_id, user_id)
);
create index circle_members_user_idx on public.circle_members (user_id, status);
create index circle_members_circle_idx on public.circle_members (circle_id, status);

create table public.circle_email_invites (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles (id) on delete cascade,
  email citext not null,
  invited_by uuid references auth.users (id) on delete set null,
  status public.email_invite_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (circle_id, email)
);
create index circle_email_invites_email_idx on public.circle_email_invites (email);

create table public.entry_shares (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries (id) on delete cascade,
  circle_id uuid references public.circles (id) on delete cascade,
  target_user_id uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (circle_id is not null or target_user_id is not null)
);
create unique index entry_shares_circle_uniq
  on public.entry_shares (entry_id, circle_id) where circle_id is not null;
create unique index entry_shares_user_uniq
  on public.entry_shares (entry_id, target_user_id) where target_user_id is not null;
create index entry_shares_circle_idx on public.entry_shares (circle_id);
create index entry_shares_target_idx on public.entry_shares (target_user_id);

create table public.share_views (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries (id) on delete cascade,
  viewer_id uuid not null references auth.users (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  unique (entry_id, viewer_id)
);
create index share_views_entry_idx on public.share_views (entry_id);

create table public.reactions (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  reaction text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entry_id, user_id)
);
create index reactions_entry_idx on public.reactions (entry_id);

create table public.sharing_permissions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  target_user_id uuid not null references auth.users (id) on delete cascade,
  can_see_mood boolean not null default true,
  can_see_summary boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, target_user_id)
);
create index sharing_permissions_owner_idx on public.sharing_permissions (owner_id);

-- updated_at triggers
create trigger circles_set_updated_at before update on public.circles
  for each row execute function public.set_updated_at();
create trigger circle_members_set_updated_at before update on public.circle_members
  for each row execute function public.set_updated_at();
create trigger circle_email_invites_set_updated_at before update on public.circle_email_invites
  for each row execute function public.set_updated_at();
create trigger reactions_set_updated_at before update on public.reactions
  for each row execute function public.set_updated_at();
create trigger sharing_permissions_set_updated_at before update on public.sharing_permissions
  for each row execute function public.set_updated_at();

-- ---------- SECURITY DEFINER helpers (bypass RLS; avoid policy recursion) ----
create or replace function public.is_circle_owner(cid uuid, uid uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.circles c where c.id = cid and c.owner_id = uid);
$$;

create or replace function public.is_circle_member(cid uuid, uid uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.circle_members m
    where m.circle_id = cid and m.user_id = uid and m.status = 'approved'
  );
$$;

create or replace function public.users_share_circle(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.circle_members m1
    join public.circle_members m2 on m1.circle_id = m2.circle_id
    where m1.user_id = a and m1.status = 'approved'
      and m2.user_id = b and m2.status = 'approved'
  );
$$;

-- Visibility of an entry to a viewer: owner, or a share target whose owner hasn't
-- revoked mood visibility for them.
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
        and not exists (
          select 1 from public.sharing_permissions sp
          where sp.owner_id = e.user_id and sp.target_user_id = uid and sp.can_see_mood = false
        )
      )
    )
  );
$$;

-- Sanitized read of shared content. Returns mood + ai_summary ONLY (never the raw
-- private note), honoring sharing_permissions. Caller must be a member of the circle.
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
    case when coalesce(sp.can_see_summary, true) then e.ai_summary else null end,
    e.shared, es.created_at
  from public.entry_shares es
  join public.journal_entries e on e.id = es.entry_id
  left join public.sharing_permissions sp
    on sp.owner_id = e.user_id and sp.target_user_id = auth.uid()
  where es.circle_id = cid
    and public.is_circle_member(cid, auth.uid())
    and coalesce(sp.can_see_mood, true) = true
    and (before is null or es.created_at < before)
  order by es.created_at desc
  limit greatest(lim, 1);
$$;

-- Sanitized read of a single shared entry (for the read-only shared view).
create or replace function public.get_shared_entry(eid uuid)
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
    case when coalesce(sp.can_see_summary, true) then e.ai_summary else null end,
    e.shared, e.created_at
  from public.journal_entries e
  left join public.sharing_permissions sp
    on sp.owner_id = e.user_id and sp.target_user_id = auth.uid()
  where e.id = eid
    and public.can_view_entry(eid, auth.uid())
    and coalesce(sp.can_see_mood, true) = true;
$$;

-- Add the owner as an approved member when a circle is created.
create or replace function public.add_owner_as_member()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.circle_members (circle_id, user_id, role, status)
  values (new.id, new.owner_id, 'owner', 'approved')
  on conflict (circle_id, user_id) do nothing;
  return new;
end;
$$;
create trigger circles_add_owner_member after insert on public.circles
  for each row execute function public.add_owner_as_member();

-- Redeem an invite code -> approved membership for the current user.
create or replace function public.redeem_invite_code(code text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare cid uuid;
begin
  select id into cid from public.circles where invite_code = upper(trim(code));
  if cid is null then return null; end if;
  insert into public.circle_members (circle_id, user_id, role, status)
  values (cid, auth.uid(), 'member', 'approved')
  on conflict (circle_id, user_id)
    do update set status = 'approved' where public.circle_members.status <> 'approved';
  return cid;
end;
$$;

-- Extend new-user handler to redeem an invite_code supplied at signup.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare code text;
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (user_id) do nothing;

  insert into public.notification_prefs (user_id) values (new.id)
  on conflict (user_id) do nothing;

  code := new.raw_user_meta_data ->> 'invite_code';
  if code is not null and length(trim(code)) > 0 then
    declare cid uuid;
    begin
      select id into cid from public.circles where invite_code = upper(trim(code));
      if cid is not null then
        insert into public.circle_members (circle_id, user_id, role, status)
        values (cid, new.id, 'member', 'approved')
        on conflict (circle_id, user_id) do nothing;
      end if;
    end;
  end if;
  return new;
end;
$$;

-- ---------- RLS ------------------------------------------------------------
alter table public.circles enable row level security;
alter table public.circle_members enable row level security;
alter table public.circle_email_invites enable row level security;
alter table public.entry_shares enable row level security;
alter table public.share_views enable row level security;
alter table public.reactions enable row level security;
alter table public.sharing_permissions enable row level security;

-- circles
create policy "circles_select" on public.circles for select using (
  owner_id = auth.uid() or type = 'public' or public.is_circle_member(id, auth.uid())
);
create policy "circles_insert" on public.circles for insert with check (owner_id = auth.uid());
create policy "circles_update_owner" on public.circles for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "circles_delete_owner" on public.circles for delete using (owner_id = auth.uid());

-- circle_members
create policy "members_select" on public.circle_members for select using (
  user_id = auth.uid()
  or public.is_circle_owner(circle_id, auth.uid())
  or public.is_circle_member(circle_id, auth.uid())
);
create policy "members_insert" on public.circle_members for insert with check (
  (user_id = auth.uid() and status = 'requested' and role = 'member')
  or public.is_circle_owner(circle_id, auth.uid())
);
create policy "members_update" on public.circle_members for update using (
  user_id = auth.uid() or public.is_circle_owner(circle_id, auth.uid())
);
create policy "members_delete" on public.circle_members for delete using (
  user_id = auth.uid() or public.is_circle_owner(circle_id, auth.uid())
);

-- circle_email_invites (owner manages)
create policy "email_invites_owner_all_select" on public.circle_email_invites for select
  using (public.is_circle_owner(circle_id, auth.uid()));
create policy "email_invites_owner_insert" on public.circle_email_invites for insert
  with check (public.is_circle_owner(circle_id, auth.uid()));
create policy "email_invites_owner_update" on public.circle_email_invites for update
  using (public.is_circle_owner(circle_id, auth.uid()));
create policy "email_invites_owner_delete" on public.circle_email_invites for delete
  using (public.is_circle_owner(circle_id, auth.uid()));

-- entry_shares (entry owner manages; targets can read)
create policy "shares_select" on public.entry_shares for select using (
  exists (select 1 from public.journal_entries e where e.id = entry_id and e.user_id = auth.uid())
  or target_user_id = auth.uid()
  or public.is_circle_member(circle_id, auth.uid())
);
create policy "shares_insert" on public.entry_shares for insert with check (
  exists (select 1 from public.journal_entries e where e.id = entry_id and e.user_id = auth.uid())
);
create policy "shares_delete" on public.entry_shares for delete using (
  exists (select 1 from public.journal_entries e where e.id = entry_id and e.user_id = auth.uid())
);

-- share_views (viewer records own; entry owner reads receipts)
create policy "views_select" on public.share_views for select using (
  viewer_id = auth.uid()
  or exists (select 1 from public.journal_entries e where e.id = entry_id and e.user_id = auth.uid())
);
create policy "views_insert" on public.share_views for insert with check (
  viewer_id = auth.uid() and public.can_view_entry(entry_id, auth.uid())
);

-- reactions (anyone who can view the entry)
create policy "reactions_select" on public.reactions for select
  using (public.can_view_entry(entry_id, auth.uid()));
create policy "reactions_insert" on public.reactions for insert
  with check (user_id = auth.uid() and public.can_view_entry(entry_id, auth.uid()));
create policy "reactions_update_own" on public.reactions for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "reactions_delete_own" on public.reactions for delete using (user_id = auth.uid());

-- sharing_permissions (owner manages their own overrides)
create policy "perms_select_own" on public.sharing_permissions for select
  using (owner_id = auth.uid() or target_user_id = auth.uid());
create policy "perms_insert_own" on public.sharing_permissions for insert
  with check (owner_id = auth.uid());
create policy "perms_update_own" on public.sharing_permissions for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "perms_delete_own" on public.sharing_permissions for delete
  using (owner_id = auth.uid());

-- ---------- additive policies on existing tables ----------------------------
-- NOTE: we deliberately do NOT add a broad SELECT policy on journal_entries for
-- viewers — that would leak the raw private `note`. Shared content is read only via
-- the sanitized RPCs get_circle_feed / get_shared_entry (mood + summary, never note).

-- Circle members can read each other's profiles (names/avatars in circles).
create policy "profiles_select_circle" on public.profiles for select using (
  public.users_share_circle(auth.uid(), user_id)
);
