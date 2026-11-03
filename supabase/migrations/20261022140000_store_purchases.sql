-- In-app purchases through the App Store / Google Play (client revisions 10/14 p.32-38, N17; owner's
-- decision 2026-10-21: native in-app purchases + our own server check).
--
-- The validate-purchase Edge Function (service role) checks every purchase with Apple (App Store
-- Server API) or Google (Play Developer API) and writes the result here; the app never writes its
-- own entitlement. It is checked again with the store every time the app opens (p.38), so renewals,
-- cancellations that have run out and refunds show up.
--
--  * The stores' 5-day free trial: a subscription in its free-trial period is 'trialing' with
--    trial_ends_at = the end of the free days (the app's Day 3 reminder and the confirmation screen
--    read it), and trial_consumed is set (a LYSM account never gets a second trial, p.36).
--  * A cancelled subscription keeps access until the end of the period already paid for (p.38):
--    status stays 'active' with cancel_at_period_end, and access ends at current_period_end.
--  * One store subscription unlocks ONE LYSM account: a purchase already held by another account is
--    refused ('owned_by_other_account'); the app tells the person to sign in to that account.
--
-- Older app builds keep working: they read the same subscriptions row and has_active_subscription().

create or replace function public.apply_store_subscription(
  p_user_id              uuid,
  p_environment          text,
  p_platform             text,
  p_product_id           text,
  p_plan                 public.subscription_plan,
  p_status               public.subscription_status,
  p_current_period_end   timestamptz,
  p_trial_ends_at        timestamptz,
  p_had_trial            boolean,
  p_auto_renew           boolean,
  p_store_transaction_id text,
  p_store_environment    text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user_id is null
     or p_store_transaction_id is null
     or p_environment not in ('development', 'production')
     or p_platform not in ('ios', 'android') then
    return 'invalid';
  end if;

  -- One store subscription, one LYSM account.
  if exists (
    select 1 from public.subscriptions s
     where s.store_transaction_id = p_store_transaction_id
       and s.user_id <> p_user_id
  ) then
    return 'owned_by_other_account';
  end if;

  insert into public.subscriptions as s
    (user_id, environment, platform, product_id, plan, status, current_period_end,
     cancel_at_period_end, store_transaction_id, store_environment,
     trial_started_at, trial_ends_at, trial_consumed)
  values
    (p_user_id, p_environment, p_platform, p_product_id, p_plan, p_status, p_current_period_end,
     not coalesce(p_auto_renew, true), p_store_transaction_id,
     coalesce(p_store_environment, 'production'),
     case when p_trial_ends_at is not null then now() end,
     p_trial_ends_at,
     coalesce(p_had_trial, false))
  on conflict (user_id, environment) do update set
    platform             = excluded.platform,
    product_id           = excluded.product_id,
    plan                 = excluded.plan,
    status               = excluded.status,
    current_period_end   = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    store_transaction_id = excluded.store_transaction_id,
    store_environment    = excluded.store_environment,
    trial_started_at     = case
                             when excluded.trial_ends_at is not null
                                  and excluded.trial_ends_at is distinct from s.trial_ends_at
                               then coalesce(s.trial_started_at, now())
                             else s.trial_started_at
                           end,
    trial_ends_at        = coalesce(excluded.trial_ends_at, s.trial_ends_at),
    trial_consumed       = s.trial_consumed or excluded.trial_consumed,
    updated_at           = now();
  return 'ok';
exception
  when unique_violation then
    -- Two accounts raced for the same store subscription: the other one has it.
    return 'owned_by_other_account';
end;
$$;

revoke all on function public.apply_store_subscription(
  uuid, text, text, text, public.subscription_plan, public.subscription_status,
  timestamptz, timestamptz, boolean, boolean, text, text
) from public, anon, authenticated;
grant execute on function public.apply_store_subscription(
  uuid, text, text, text, public.subscription_plan, public.subscription_status,
  timestamptz, timestamptz, boolean, boolean, text, text
) to service_role;
