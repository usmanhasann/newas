-- Trust & Safety — Phase 1 foundations (see design_and_spec/trust-safety-design).
--
-- Schema + RLS for the three safety systems. NO consuming code ships in this phase, so nothing
-- here is user-facing yet; later phases (crisis, private-threat, Circles moderation) write to these
-- tables from Edge Functions under the service role. The pure enforcement engine that decides tiers
-- lives in supabase/functions/_shared/moderation.ts and is unit-tested (__tests__/moderation.test.ts).
--
-- Separation of the three systems is enforced by the schema itself: System 1 (harassment) has its
-- own tables + consequences; System 2 (crisis support) stores NOTHING about a person (no table);
-- System 3 (private-threat) has a single service-role-only flag table with no automated consequence.
--
-- Trust model: the client uses the anon key only. Every write that carries a CONSEQUENCE (strike,
-- restriction, suspension, threat flag) happens in an Edge Function under the service role — RLS
-- gives the client read-only access to its OWN moderation state and no access at all to internal
-- review data. Users may only INSERT their own reports, appeals, and blocks.

-- ---------------------------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------------------------
create type public.moderation_category as enum (
  'inappropriate_language', 'harassment', 'threat', 'hate_speech', 'doxxing'
);
create type public.moderation_severity as enum ('low', 'moderate', 'severe');
create type public.moderation_report_status as enum ('pending', 'reviewing', 'actioned', 'dismissed');
create type public.moderation_appeal_status as enum ('pending', 'upheld', 'denied');
create type public.circle_suspension_status as enum ('pending_review', 'upheld', 'lifted');
create type public.user_block_type as enum ('block', 'mute');
create type public.private_threat_status as enum ('pending_review', 'assessed_no_action', 'escalated', 'dismissed');

-- ---------------------------------------------------------------------------------------------
-- System 1 — Circles harassment / threats / doxxing
-- ---------------------------------------------------------------------------------------------

-- One row per confirmed violation. `tier`, `severity`, `category` mirror the engine's decision;
-- `excerpt` + `target_*` preserve exactly what triggered it (transparency + appeals).
create table public.circle_strikes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category public.moderation_category not null,
  severity public.moderation_severity not null,
  tier smallint not null check (tier between 1 and 3),
  target_type text,                 -- e.g. 'circle_post' | 'circle_comment' (future posting surface)
  target_id uuid,
  excerpt text,                     -- the offending text, stored for the user-facing explanation
  reason text not null,
  created_at timestamptz not null default now()
);
create index circle_strikes_user_idx on public.circle_strikes (user_id, created_at desc);

-- Active posting restriction (Tier 2). A user is restricted while `until` is in the future.
create table public.circle_restrictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  strike_id uuid references public.circle_strikes (id) on delete set null,
  until timestamptz not null,
  reason text not null,
  created_at timestamptz not null default now()
);
create index circle_restrictions_user_idx on public.circle_restrictions (user_id, until desc);

-- Indefinite Circles suspension (Tier 3), pending human review. Automated code only ever inserts
-- 'pending_review'; a human moves it to 'upheld' or 'lifted'.
create table public.circle_suspensions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  strike_id uuid references public.circle_strikes (id) on delete set null,
  status public.circle_suspension_status not null default 'pending_review',
  reason text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz
);
create index circle_suspensions_user_idx on public.circle_suspensions (user_id);
create index circle_suspensions_status_idx on public.circle_suspensions (status);

-- User-submitted report (the visible "Report" button). Routes to the review queue.
create table public.circle_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reported_user_id uuid references auth.users (id) on delete set null,
  target_type text not null,        -- 'circle_post' | 'circle_comment'
  target_id uuid,
  reason text,
  status public.moderation_report_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz
);
create index circle_reports_status_idx on public.circle_reports (status, created_at);
create index circle_reports_reporter_idx on public.circle_reports (reporter_id);

-- Appeal against a strike or a suspension. Nothing is auto-reversed; a human decides.
create table public.moderation_appeals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  strike_id uuid references public.circle_strikes (id) on delete cascade,
  suspension_id uuid references public.circle_suspensions (id) on delete cascade,
  message text,
  status public.moderation_appeal_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  check (strike_id is not null or suspension_id is not null)
);
create index moderation_appeals_status_idx on public.moderation_appeals (status, created_at);
create index moderation_appeals_user_idx on public.moderation_appeals (user_id);

-- Block / mute — independent of reporting. Block = mutual invisibility; mute = one-directional.
create table public.user_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references auth.users (id) on delete cascade,
  target_id uuid not null references auth.users (id) on delete cascade,
  type public.user_block_type not null default 'block',
  created_at timestamptz not null default now(),
  unique (blocker_id, target_id),
  check (blocker_id <> target_id)
);
create index user_blocks_blocker_idx on public.user_blocks (blocker_id);
create index user_blocks_target_idx on public.user_blocks (target_id);

-- Append-only audit of every automated + human action, powering transparency + appeal review.
create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  action text not null,             -- 'content_removed' | 'warning_issued' | 'restriction_applied' | 'suspension_applied' | 'pre_post_blocked' | 'report_actioned' | 'appeal_upheld' | 'appeal_denied' ...
  tier smallint check (tier between 1 and 3),
  category public.moderation_category,
  severity public.moderation_severity,
  target_type text,
  target_id uuid,
  reason text,
  actor uuid references auth.users (id) on delete set null,  -- null = automated/system; set = human reviewer
  created_at timestamptz not null default now()
);
create index moderation_actions_user_idx on public.moderation_actions (user_id, created_at desc);

-- ---------------------------------------------------------------------------------------------
-- System 3 — Private threats against another person (journal / check-in only)
-- Internal review ONLY. No automated consequence, nothing the user ever sees.
-- ---------------------------------------------------------------------------------------------
create table public.private_threat_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null,             -- 'journal_entry' | 'checkin_note'
  source_id uuid,
  excerpt text not null,
  assessment jsonb,                 -- model output: confidence, target descriptor, specificity, etc.
  status public.private_threat_status not null default 'pending_review',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz
);
create index private_threat_flags_status_idx on public.private_threat_flags (status, created_at);

-- updated_at triggers on the mutable (status-carrying) tables.
create trigger circle_suspensions_set_updated_at before update on public.circle_suspensions
  for each row execute function public.set_updated_at();
create trigger circle_reports_set_updated_at before update on public.circle_reports
  for each row execute function public.set_updated_at();
create trigger moderation_appeals_set_updated_at before update on public.moderation_appeals
  for each row execute function public.set_updated_at();
create trigger private_threat_flags_set_updated_at before update on public.private_threat_flags
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Standing helper — mirrors deriveStanding() in the engine. Used by the client to show status and
-- (Phase 4) by RLS on the Circles posting/reading surface. No-arg so a user can only ever read
-- their OWN standing (auth.uid()), never probe another user's.
-- ---------------------------------------------------------------------------------------------
create or replace function public.my_circle_standing()
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when exists (
      select 1 from public.circle_suspensions s
      where s.user_id = auth.uid() and s.status in ('pending_review', 'upheld')
    ) then 'suspended'
    when exists (
      select 1 from public.circle_restrictions r
      where r.user_id = auth.uid() and r.until > now()
    ) then 'restricted'
    else 'ok'
  end;
$$;
grant execute on function public.my_circle_standing() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------
alter table public.circle_strikes       enable row level security;
alter table public.circle_restrictions  enable row level security;
alter table public.circle_suspensions   enable row level security;
alter table public.circle_reports        enable row level security;
alter table public.moderation_appeals    enable row level security;
alter table public.user_blocks           enable row level security;
alter table public.moderation_actions    enable row level security;
alter table public.private_threat_flags  enable row level security;

-- The user can READ its own consequences (no silent penalties) but never write them.
create policy "strikes_select_own" on public.circle_strikes
  for select using (user_id = auth.uid());
create policy "restrictions_select_own" on public.circle_restrictions
  for select using (user_id = auth.uid());
create policy "suspensions_select_own" on public.circle_suspensions
  for select using (user_id = auth.uid());

-- Reports: a user files and sees only their own.
create policy "reports_insert_own" on public.circle_reports
  for insert with check (reporter_id = auth.uid());
create policy "reports_select_own" on public.circle_reports
  for select using (reporter_id = auth.uid());

-- Appeals: a user files and sees only their own.
create policy "appeals_insert_own" on public.moderation_appeals
  for insert with check (user_id = auth.uid());
create policy "appeals_select_own" on public.moderation_appeals
  for select using (user_id = auth.uid());

-- Blocks/mutes: fully owned by the blocker (private, even from the target).
create policy "blocks_select_own" on public.user_blocks
  for select using (blocker_id = auth.uid());
create policy "blocks_insert_own" on public.user_blocks
  for insert with check (blocker_id = auth.uid());
create policy "blocks_delete_own" on public.user_blocks
  for delete using (blocker_id = auth.uid());

-- moderation_actions + private_threat_flags: RLS enabled with NO policy → the client can never read
-- or write them. Service role (Edge Functions / dashboard) bypasses RLS. Belt-and-suspenders revoke
-- so the private-threat data is never exposed even if default privileges change.
revoke all on public.private_threat_flags from anon, authenticated;
revoke all on public.moderation_actions  from anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Review queues (for the Supabase dashboard — reviewers query these directly as postgres). Not
-- granted to app roles; revoked explicitly so the private-threat queue can never leak to a client.
-- ---------------------------------------------------------------------------------------------
create view public.moderation_reports_open as
  select * from public.circle_reports where status in ('pending', 'reviewing') order by created_at;
create view public.moderation_appeals_open as
  select * from public.moderation_appeals where status = 'pending' order by created_at;
create view public.moderation_suspensions_open as
  select * from public.circle_suspensions where status = 'pending_review' order by created_at;
create view public.private_threat_flags_open as
  select * from public.private_threat_flags where status = 'pending_review' order by created_at;

revoke all on public.moderation_reports_open     from anon, authenticated;
revoke all on public.moderation_appeals_open     from anon, authenticated;
revoke all on public.moderation_suspensions_open from anon, authenticated;
revoke all on public.private_threat_flags_open   from anon, authenticated;
