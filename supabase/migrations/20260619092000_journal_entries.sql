-- ============================================================================
-- 20260619092000_journal_entries.sql
-- The high-volume table. Owner-only RLS for now; shared-visibility policies are
-- added additively in the Phase 3 (circles/sharing) migration via entry_shares.
--
-- Scale notes (build prompt §5.1):
--   * Indexed for keyset pagination on (user_id, created_at, id).
--   * `local_date` is the entry date in the USER's timezone (set by the client) so
--     streaks + week/month/year breakdowns bucket correctly regardless of UTC.
--   * Partition-ready: when volume warrants, convert to RANGE partitions on
--     created_at (monthly). Schema avoids cross-partition unique constraints.
-- ============================================================================

create type public.ai_status as enum ('idle', 'pending', 'ready', 'failed');

create table public.journal_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  mood_slug   text not null references public.moods (slug),
  note        text,
  ai_summary  text,
  ai_status   public.ai_status not null default 'idle',
  ai_error    text,
  shared      boolean not null default false,
  -- Entry date in the user's local timezone (YYYY-MM-DD). Drives streaks/breakdowns.
  local_date  date not null default ((now() at time zone 'utc')::date),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Feed pagination (newest first, keyset on created_at + id tiebreaker).
create index journal_entries_user_created_idx
  on public.journal_entries (user_id, created_at desc, id desc);

-- Streaks + week/month/year mood breakdown.
create index journal_entries_user_localdate_idx
  on public.journal_entries (user_id, local_date desc);

-- Mood aggregation.
create index journal_entries_mood_idx on public.journal_entries (mood_slug);

-- Shared-entry lookups (Phase 3).
create index journal_entries_shared_idx
  on public.journal_entries (user_id, created_at desc)
  where shared = true;

-- Entries awaiting AI summary (worker scan).
create index journal_entries_ai_pending_idx
  on public.journal_entries (ai_status)
  where ai_status = 'pending';

create trigger journal_entries_set_updated_at
  before update on public.journal_entries
  for each row execute function public.set_updated_at();

alter table public.journal_entries enable row level security;

create policy "entries_select_own"
  on public.journal_entries for select
  using (auth.uid() = user_id);

create policy "entries_insert_own"
  on public.journal_entries for insert
  with check (auth.uid() = user_id);

create policy "entries_update_own"
  on public.journal_entries for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "entries_delete_own"
  on public.journal_entries for delete
  using (auth.uid() = user_id);
