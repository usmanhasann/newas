-- ============================================================================
-- 20260621100200_subscription_trial_grants.sql
-- Lock privileged trial/billing functions to the service role.
--
-- 20260619160000_grant_api_roles.sql set DEFAULT PRIVILEGES that auto-grant
-- EXECUTE on every new public function to anon + authenticated. That
-- unintentionally exposed apply_stripe_subscription() (SECURITY DEFINER, can set
-- ANY user's subscription to 'active') and expire_trials() to ordinary clients —
-- a privilege-escalation hole. This migration revokes those, keeps start_trial()
-- for authenticated callers only (it acts on auth.uid()), and stops future
-- functions from being auto-granted to anon.
--
-- The stripe-webhook calls apply_stripe_subscription with the service-role key,
-- so restricting these to service_role does not affect it. No client code calls
-- apply_stripe_subscription / expire_trials directly.
-- ============================================================================

do $$
declare r record;
begin
  -- Backend-only: these write arbitrary billing state -> service_role exclusively.
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('apply_stripe_subscription', 'expire_trials')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;

  -- start_trial acts on the caller's own row (auth.uid()); authenticated only.
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'start_trial'
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;

-- Stop future functions from being auto-granted to anon. (authenticated is left
-- intact: client RPCs depend on it and are protected by RLS + auth.uid() checks.)
alter default privileges in schema public revoke execute on functions from anon;

-- ---- best-effort scheduled expiry ----------------------------------------
-- Correctness does NOT depend on this: has_active_subscription() already rejects
-- trials past trial_ends_at by timestamp. The job only flips status -> 'expired'
-- for reporting/audit. Requires the pg_cron extension (enable in the Supabase
-- dashboard if this is skipped).
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    null; -- unavailable / insufficient privilege; skip (access stays correct)
  end;
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    begin
      if exists (select 1 from cron.job where jobname = 'inner-circle-expire-trials') then
        perform cron.unschedule('inner-circle-expire-trials');
      end if;
      perform cron.schedule('inner-circle-expire-trials', '*/15 * * * *',
                            'select public.expire_trials();');
    exception when others then
      null; -- insufficient privilege to schedule; skip
    end;
  end if;
end $$;
