-- ============================================================================
-- 20260619150000_stripe_multi_env.sql
-- Support separate development + production Stripe environments in one schema.
--   * subscriptions rows are partitioned by `environment` so dev webhook events
--     never touch production data (and vice-versa).
--   * stripe_webhook_events is an idempotency ledger keyed on the Stripe event id.
-- Backward compatible: existing rows default to 'production' (the current live env),
-- and the existing single-env flow keeps working until *_DEV vars are added.
--
-- ⚠️ Deploy order: apply this migration AND deploy the updated Edge Functions
-- together — the old function used unique(user_id) which this migration replaces.
-- ============================================================================

-- 1) Environment tag on each subscription. Existing rows backfill to 'production'.
alter table public.subscriptions
  add column if not exists environment text not null default 'production'
  check (environment in ('development', 'production'));

-- 2) One subscription per (user, environment) instead of per user, so a user can
--    hold an independent dev (test) and production subscription.
alter table public.subscriptions drop constraint if exists subscriptions_user_id_key;
alter table public.subscriptions
  add constraint subscriptions_user_env_key unique (user_id, environment);

create index if not exists subscriptions_env_idx on public.subscriptions (environment);
create index if not exists subscriptions_customer_env_idx
  on public.subscriptions (stripe_customer_id, environment);

-- 3) Idempotency ledger — dedupe Stripe events by id. Only the service role (the
--    webhook) touches it; RLS on + no policies blocks all client access.
create table if not exists public.stripe_webhook_events (
  event_id    text primary key,
  type        text not null,
  environment text not null,
  created_at  timestamptz not null default now()
);
alter table public.stripe_webhook_events enable row level security;

-- 4) Environment-aware entitlement helper. Drop the old 1-arg version first to avoid
--    an ambiguous overload; the new signature defaults to production (backward compat).
drop function if exists public.has_active_subscription(uuid);
create or replace function public.has_active_subscription(
  uid uuid default auth.uid(),
  p_environment text default 'production'
)
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
      and s.environment = p_environment
      and s.status in ('active', 'trialing')
      and (s.current_period_end is null or s.current_period_end > now())
  );
$$;
