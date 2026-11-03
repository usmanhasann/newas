-- ============================================================================
-- 20260619093000_subscriptions.sql
-- Stripe-driven entitlement. The app is hard-gated behind an active subscription
-- after onboarding (build prompt §9.1, confirmed by user 2026-06-19).
-- Entitlement is the source of truth in this table, written ONLY by the Stripe
-- webhook Edge Function (service role). Clients can read their own row, never write.
-- ============================================================================

create type public.subscription_status as enum (
  'trialing', 'active', 'past_due', 'canceled',
  'incomplete', 'incomplete_expired', 'unpaid', 'paused'
);

create type public.subscription_plan as enum ('monthly', 'yearly');

create table public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null unique references auth.users (id) on delete cascade,
  stripe_customer_id     text,
  stripe_subscription_id text unique,
  plan                   public.subscription_plan,
  status                 public.subscription_status not null default 'incomplete',
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index subscriptions_user_id_idx on public.subscriptions (user_id);
create index subscriptions_customer_idx on public.subscriptions (stripe_customer_id);

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

alter table public.subscriptions enable row level security;

-- Read your own entitlement. No INSERT/UPDATE/DELETE policies => only the
-- service role (Stripe webhook) can mutate, which bypasses RLS.
create policy "subscriptions_select_own"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- Reusable entitlement check for server-side gating (Edge Functions / future RLS).
create or replace function public.has_active_subscription(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.user_id = uid
      and s.status in ('active', 'trialing')
      and (s.current_period_end is null or s.current_period_end > now())
  );
$$;
