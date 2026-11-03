-- ============================================================================
-- 20260825140000_retained_billing_records.sql
-- Account deletion retains an ANONYMIZED billing record (billing/legal retention) that
-- deliberately OUTLIVES the deleted account. The delete-account Edge Function copies the
-- billing-relevant subscription fields here BEFORE deleting the auth user (which cascades the
-- live `subscriptions` row). NO FK to auth.users — the account is gone. NO personal content is
-- retained (no journal text, no profile, no email). Internal ledger: RLS on, NO policies →
-- only the service role (the Edge Function) can write it; clients can never read or write it.
-- ============================================================================

create table if not exists public.retained_billing_records (
  id                      uuid primary key default gen_random_uuid(),
  -- Opaque reference to the deleted account. The auth user no longer exists, so this is not
  -- resolvable to a person; kept only for billing-dispute reconciliation.
  former_user_id          uuid,
  platform                text,        -- 'ios' | 'android'
  product_id              text,        -- store product id
  plan                    text,        -- 'monthly' | 'yearly'
  status                  text,        -- subscription status at deletion
  store_transaction_id    text,        -- Apple originalTransactionId / Google purchaseToken (billing identity)
  store_environment       text,        -- 'sandbox' | 'production'
  current_period_end      timestamptz,
  subscription_started_at timestamptz, -- copied from subscriptions.created_at
  retained_at             timestamptz not null default now()
);

create index retained_billing_store_txn_idx on public.retained_billing_records (store_transaction_id);

alter table public.retained_billing_records enable row level security;
-- Intentionally NO policies: anon/authenticated clients can never read or write this ledger.
-- The delete-account Edge Function uses the service role, which bypasses RLS.
