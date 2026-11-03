-- ============================================================================
-- 20260621100100_subscription_trial.sql
-- Application-managed 5-day free trial (NOT Stripe trials). The `subscriptions`
-- row stays the single source of truth for access; trial validity is always
-- derived from `status` + server UTC timestamps, never a bare boolean.
--
-- Backward compatible: new columns have safe defaults; existing rows are NOT
-- altered (no status/date/stripe changes). No existing user is granted a trial.
-- ============================================================================

-- ---- trial columns -------------------------------------------------------
alter table public.subscriptions
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at    timestamptz,
  add column if not exists trial_consumed   boolean not null default false;

-- Fast lookup of active/expiring trials (access checks + expiry job).
create index if not exists subscriptions_trial_idx
  on public.subscriptions (trial_ends_at)
  where status = 'trialing';

-- ---- centralized access check (paid active OR valid app trial) ------------
-- Same signature as before (create-or-replace, no overload). Trial access is
-- granted only while now() < trial_ends_at, so an expired trial loses access
-- immediately even before the expiry job runs.
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
      and (
        (s.status = 'active'
          and (s.current_period_end is null or s.current_period_end > now()))
        or (s.status = 'trialing'
          and s.trial_ends_at is not null
          and s.trial_ends_at > now())
      )
  );
$$;

-- ---- start a 5-day trial (idempotent, eligibility-gated, race-safe) -------
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

  -- Lock the user's row for this environment so concurrent calls serialize.
  select * into existing
    from public.subscriptions
   where user_id = uid and environment = p_environment
   for update;

  if found then
    -- Already in an app trial -> return unchanged (idempotent; never extend/reset).
    if existing.status = 'trialing' and existing.trial_ends_at is not null then
      return existing;
    end if;
    -- Not eligible: trial already consumed, a Stripe sub exists, or any non-pristine
    -- state (canceled/active/expired/etc.). Return current state without changes.
    if existing.trial_consumed
       or existing.stripe_subscription_id is not null
       or existing.status <> 'incomplete' then
      return existing;
    end if;
    -- Eligible pristine 'incomplete' row -> grant the trial.
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

  -- No row yet: insert a trial row. The unique (user_id, environment) constraint +
  -- ON CONFLICT make concurrent first-time calls safe (exactly one trial).
  insert into public.subscriptions
    (user_id, environment, status, trial_started_at, trial_ends_at, trial_consumed)
  values
    (uid, p_environment, 'trialing', now_ts, now_ts + interval '5 days', true)
  on conflict (user_id, environment) do nothing
  returning * into res;

  if res.id is null then
    -- A concurrent request inserted first; return that row (no second trial).
    select * into res
      from public.subscriptions
     where user_id = uid and environment = p_environment;
  end if;
  return res;
end;
$$;

-- ---- apply a Stripe subscription event WITHOUT clobbering a valid trial ----
-- Used by the stripe-webhook (service role). A valid internal trial is preserved
-- unless Stripe reports 'active' (paid activated), which flips trialing -> active.
-- Trial audit columns are never overwritten.
create or replace function public.apply_stripe_subscription(
  p_user_id                uuid,
  p_environment            text,
  p_status                 public.subscription_status,
  p_plan                   public.subscription_plan,
  p_current_period_end     timestamptz,
  p_cancel_at_period_end   boolean,
  p_stripe_subscription_id text,
  p_stripe_customer_id     text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target       uuid := p_user_id;
  existing     public.subscriptions;
  final_status public.subscription_status;
begin
  -- Resolve the user from the Stripe customer when metadata is absent.
  if target is null and p_stripe_customer_id is not null then
    select user_id into target
      from public.subscriptions
     where stripe_customer_id = p_stripe_customer_id and environment = p_environment
     limit 1;
  end if;
  if target is null then
    return; -- cannot map this event to a user; ignore safely (idempotent no-op)
  end if;

  select * into existing
    from public.subscriptions
   where user_id = target and environment = p_environment
   for update;

  final_status :=
    case
      when p_status = 'active' then 'active'::public.subscription_status
      when existing.status = 'trialing'
           and existing.trial_ends_at is not null
           and existing.trial_ends_at > now()
        then 'trialing'::public.subscription_status   -- preserve a still-valid trial
      else p_status
    end;

  insert into public.subscriptions as s
    (user_id, environment, status, plan, current_period_end, cancel_at_period_end,
     stripe_subscription_id, stripe_customer_id)
  values
    (target, p_environment, final_status, p_plan, p_current_period_end,
     coalesce(p_cancel_at_period_end, false), p_stripe_subscription_id, p_stripe_customer_id)
  on conflict (user_id, environment) do update set
    status                 = excluded.status,
    plan                   = coalesce(excluded.plan, s.plan),
    current_period_end     = coalesce(excluded.current_period_end, s.current_period_end),
    cancel_at_period_end   = excluded.cancel_at_period_end,
    stripe_subscription_id = coalesce(excluded.stripe_subscription_id, s.stripe_subscription_id),
    stripe_customer_id     = coalesce(excluded.stripe_customer_id, s.stripe_customer_id),
    updated_at             = now();
  -- trial_started_at / trial_ends_at / trial_consumed are intentionally preserved.
end;
$$;

-- ---- expire trials whose end time has passed (idempotent) -----------------
create or replace function public.expire_trials()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  update public.subscriptions
     set status = 'expired', updated_at = now()
   where status = 'trialing'
     and trial_ends_at is not null
     and trial_ends_at <= now();
  get diagnostics n = row_count;
  return n; -- preserves trial_started_at / trial_ends_at for audit
end;
$$;

-- ---- grants (RLS still gates rows) ---------------------------------------
grant execute on function public.start_trial(text) to authenticated, service_role;
grant execute on function public.has_active_subscription(uuid, text)
  to anon, authenticated, service_role;
grant execute on function public.expire_trials() to service_role;
grant execute on function public.apply_stripe_subscription(
  uuid, text, public.subscription_status, public.subscription_plan,
  timestamptz, boolean, text, text
) to service_role;

-- ---- best-effort scheduled expiry (correctness does NOT depend on it; the
--      access check already rejects expired trials by timestamp) -----------
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    null; -- extension may be unavailable / insufficient privilege; ignore
  end;
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    begin
      perform cron.schedule(
        'inner-circle-expire-trials', '*/15 * * * *', 'select public.expire_trials();'
      );
    exception when others then
      null; -- already scheduled or insufficient privilege; ignore
    end;
  end if;
end;
$$;
