-- ============================================================================
-- 20260624120000_email_verification.sql
-- App-managed email verification (onboard-first flow). Because Supabase auto-confirms
-- signups (so users can complete onboarding with a session), we track our OWN
-- verification state here — the SERVER-AUTHORITATIVE source of truth. The client may
-- READ its own row but can NEVER write `verified` (no write policy + RLS), so it
-- can't be bypassed from client state. Only the Edge Functions (service role) set it,
-- and only after validating a one-time token that was emailed.
-- ============================================================================

create table if not exists public.email_verifications (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  verified          boolean not null default false,
  verified_at       timestamptz,
  token             uuid,             -- one-time verification token (cleared on use)
  token_expires_at  timestamptz,
  last_sent_at      timestamptz,      -- for resend cooldown / rate limiting
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Fast token lookup for the confirm function.
create index if not exists email_verifications_token_idx
  on public.email_verifications (token)
  where token is not null;

create trigger email_verifications_set_updated_at
  before update on public.email_verifications
  for each row execute function public.set_updated_at();

alter table public.email_verifications enable row level security;

-- Read-only for the owner. NO insert/update/delete policy → those are denied for
-- authenticated even though table grants exist; only the service role (Edge Functions,
-- which bypass RLS) can write `verified`.
drop policy if exists "email_verifications_select_own" on public.email_verifications;
create policy "email_verifications_select_own"
  on public.email_verifications for select
  to authenticated
  using (auth.uid() = user_id);

grant select on public.email_verifications to authenticated;
grant all on public.email_verifications to service_role;

-- Grandfather EXISTING users as verified so the new gate never locks out current
-- accounts (safe default; we do not touch their other data). New signups get no row
-- → treated as unverified → they go through the verification flow.
insert into public.email_verifications (user_id, verified, verified_at)
select id, true, now() from auth.users
on conflict (user_id) do nothing;
