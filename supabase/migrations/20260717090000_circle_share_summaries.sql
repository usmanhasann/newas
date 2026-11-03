-- ============================================================================
-- 20260717090000_circle_share_summaries.sql
-- Personalization Phase 2 (part 2): make circle_reflection_style actually re-tone the AI text
-- shared into a circle.
--
-- WHY a per-share copy: journal_entries.ai_summary is ONE first-person summary per entry, reused
-- for the author's own view AND every circle the entry is shared to. One entry can be shared to
-- many circles (entry_shares is unique per (entry, circle)), so a single stored summary cannot
-- carry a different tone per circle. Each entry_shares row therefore gets its OWN toned copy,
-- generated in that circle's tone ('personal' → the AUTHOR's personal_reflection_style).
--
-- Written ONLY by the service role (generate-share-summaries). entry_shares has no UPDATE policy
-- for authenticated, so clients can never write these. Reads fall back to the entry's base
-- summary until the toned copy is ready, so the board is never blank.
--
-- Tone changes apply to NEW shares only (a ready copy is never overwritten) — matching how
-- weekly/monthly/yearly reflections are static once generated.
-- ============================================================================

alter table public.entry_shares
  add column if not exists ai_summary text,
  add column if not exists ai_status public.ai_status not null default 'idle',
  add column if not exists ai_error text;

-- Pending/idle circle shares that still need a toned copy (drives the generator).
create index if not exists entry_shares_ai_status_idx
  on public.entry_shares (entry_id, ai_status) where circle_id is not null;

-- ---------- circle feed: serve the per-circle toned copy -------------------
-- Signature unchanged → `create or replace` preserves the existing PostgREST grants.
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
    -- The circle's toned copy when it's ready, else the entry's base summary (never blank).
    case when coalesce(sp.can_see_summary, true)
      then coalesce(es.ai_summary, e.ai_summary)
      else null end,
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

-- ---------- single shared entry: needs the circle context -------------------
-- The detail view must show the SAME toned text as the card the user tapped, so it now takes the
-- circle it is being viewed from. Adding a defaulted arg would create an ambiguous overload with
-- the 1-arg version, so the old one is dropped and the grant re-applied. `cid` null (e.g. a
-- direct-to-user share) → the entry's base summary.
drop function if exists public.get_shared_entry(uuid);

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
    case when coalesce(sp.can_see_summary, true)
      then coalesce(es.ai_summary, e.ai_summary)
      else null end,
    e.shared, e.created_at
  from public.journal_entries e
  left join public.sharing_permissions sp
    on sp.owner_id = e.user_id and sp.target_user_id = auth.uid()
  left join public.entry_shares es
    on es.entry_id = e.id
   and cid is not null
   and es.circle_id = cid
   and public.is_circle_member(cid, auth.uid())
  where e.id = eid
    and public.can_view_entry(eid, auth.uid())
    and coalesce(sp.can_see_mood, true) = true;
$$;

grant execute on function public.get_shared_entry(uuid, uuid) to authenticated, service_role;
