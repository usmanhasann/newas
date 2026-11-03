-- ============================================================================
-- 20260702100000_remove_stripe_add_iap.sql
-- Remove Stripe; move to platform-independent in-app-purchase (App Store / Play)
-- entitlement. The `subscriptions` table stays the single source of truth for access.
--
-- Kept (generic / reusable, NOT dropped): plan, status, current_period_end,
-- cancel_at_period_end, environment, trial_started_at, trial_ends_at, trial_consumed.
-- Dropped (Stripe-only): stripe_customer_id, stripe_subscription_id (+ its index).
-- Added (store-agnostic): platform, product_id, store_transaction_id, store_environment.
--
-- The app-managed 5-day trial (start_trial) is unchanged in behavior and remains the
-- entitlement path that works with NO store configuration. Actual purchase entitlement
-- is written server-side by a future receipt-validation Edge Function via
-- apply_iap_subscription() (service role) — clients still never write this table.
-- ============================================================================

-- ---------- drop Stripe-specific function, table + columns ----------------
drop function if exists public.apply_stripe_subscription(
  uuid, text, public.subscription_status, public.subscription_plan,
  timestamptz, boolean, text, text
);

-- Stripe webhook idempotency ledger — no longer needed.
drop table if exists public.stripe_webhook_events;

drop index if exists public.subscriptions_customer_idx;
drop index if exists public.subscriptions_customer_env_idx;

alter table public.subscriptions
  drop column if exists stripe_customer_id,
  drop column if exists stripe_subscription_id;

-- ---------- add store-agnostic IAP columns --------------------------------
alter table public.subscriptions
  add column if not exists platform           text,       -- 'ios' | 'android'
  add column if not exists product_id         text,       -- store product id
  add column if not exists store_transaction_id text,     -- Apple originalTransactionId / Google purchaseToken
  add column if not exists store_environment   text not null default 'production'; -- 'sandbox' | 'production'

alter table public.subscriptions
  drop constraint if exists subscriptions_platform_check;
alter table public.subscriptions
  add constraint subscriptions_platform_check
  check (platform is null or platform in ('ios', 'android'));

-- Dedup lookups by the store's stable subscription id.
create unique index if not exists subscriptions_store_txn_idx
  on public.subscriptions (store_transaction_id)
  where store_transaction_id is not null;

-- ---------- start_trial: drop the Stripe reference ------------------------
-- Same behavior; eligibility now checks for an existing paid store purchase instead of
-- a Stripe subscription id.
create or replace function public.start_trial(p_environment text default 'production')
returns public.subscriptions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid      uuid := auth.uid();
  now_ts   timestamptz := now();
  existing public.subscriptions;
  res      public.subscriptions;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into existing
    from public.subscriptions
   where user_id = uid and environment = p_environment
   for update;

  if found then
    if existing.status = 'trialing' and existing.trial_ends_at is not null then
      return existing; -- already trialing → idempotent
    end if;
    -- Not eligible: trial consumed, an active store purchase exists, or non-pristine.
    if existing.trial_consumed
       or existing.store_transaction_id is not null
       or existing.status <> 'incomplete' then
      return existing;
    end if;
    update public.subscriptions
       set status           = 'trialing',
           trial_started_at = now_ts,
           trial_ends_at    = now_ts + interval '5 days',
           trial_consumed   = true,
           updated_at       = now_ts
     where id = existing.id
     returning * into res;
    return res;
  end if;

  insert into public.subscriptions
    (user_id, environment, status, trial_started_at, trial_ends_at, trial_consumed)
  values
    (uid, p_environment, 'trialing', now_ts, now_ts + interval '5 days', true)
  on conflict (user_id, environment) do nothing
  returning * into res;

  if res.id is null then
    select * into res
      from public.subscriptions
     where user_id = uid and environment = p_environment;
  end if;
  return res;
end;
$$;

grant execute on function public.start_trial(text) to authenticated, service_role;

-- ---------- apply a validated store purchase (service role) ----------------
-- Called by the future receipt-validation Edge Function after verifying an App Store /
-- Play purchase. Platform-independent. Preserves a still-valid app trial unless the
-- purchase is 'active' (paid). Trial audit columns are never overwritten.
create or replace function public.apply_iap_subscription(
  p_user_id              uuid,
  p_environment          text,
  p_platform             text,
  p_product_id           text,
  p_plan                 public.subscription_plan,
  p_status               public.subscription_status,
  p_current_period_end   timestamptz,
  p_auto_renew           boolean,
  p_store_transaction_id text,
  p_store_environment    text default 'production'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing     public.subscriptions;
  final_status public.subscription_status;
begin
  if p_user_id is null then
    return;
  end if;

  select * into existing
    from public.subscriptions
   where user_id = p_user_id and environment = p_environment
   for update;

  final_status :=
    case
      when p_status = 'active' then 'active'::public.subscription_status
      when existing.status = 'trialing'
           and existing.trial_ends_at is not null
           and existing.trial_ends_at > now()
        then 'trialing'::public.subscription_status  -- preserve a still-valid trial
      else p_status
    end;

  insert into public.subscriptions as s
    (user_id, environment, platform, product_id, plan, status,
     current_period_end, cancel_at_period_end, store_transaction_id, store_environment)
  values
    (p_user_id, p_environment, p_platform, p_product_id, p_plan, final_status,
     p_current_period_end, not coalesce(p_auto_renew, true), p_store_transaction_id,
     coalesce(p_store_environment, 'production'))
  on conflict (user_id, environment) do update set
    platform             = coalesce(excluded.platform, s.platform),
    product_id           = coalesce(excluded.product_id, s.product_id),
    plan                 = coalesce(excluded.plan, s.plan),
    status               = excluded.status,
    current_period_end   = coalesce(excluded.current_period_end, s.current_period_end),
    cancel_at_period_end = excluded.cancel_at_period_end,
    store_transaction_id = coalesce(excluded.store_transaction_id, s.store_transaction_id),
    store_environment    = excluded.store_environment,
    updated_at           = now();
end;
$$;

grant execute on function public.apply_iap_subscription(
  uuid, text, text, text, public.subscription_plan, public.subscription_status,
  timestamptz, boolean, text, text
) to service_role;
