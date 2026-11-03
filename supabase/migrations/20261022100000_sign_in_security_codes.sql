-- Sign-in & Security (client revisions 10/14, p.17-21, N5): 6-digit email codes for email
-- verification, change email and forgot password; password checks; signing out other devices.
--
-- Everything here is server-only. The Edge Functions (service role) are the only callers of the
-- private functions below; the app reads its own sign-in methods through my_sign_in_methods().
--
--  * auth_codes: one live code per (user, purpose). Only an HMAC of the code is stored (never the
--    code). A code expires (the caller passes the window, 10 minutes), works once, and locks after
--    5 wrong tries (the user then asks for a new one). Resends have a cooldown and an hourly cap.
--    A password reset code, once used, leaves a one-time "reset ticket" (hash only) for choosing
--    the new password.
--  * auth_rate_events: small sliding-window counters for the Edge Functions' rate limits (keys are
--    hashes of emails / IPs, never the raw values).
--  * email_verifications.verified_email: verification now belongs to an ADDRESS. When the email on
--    an account changes any other way, the trigger below makes the account unverified again, so a
--    verified flag can never carry over to an address nobody confirmed (this is what makes
--    email-match account linking safe, p.18).
--  * Google and Apple verify the email themselves (p.18): an account whose email is the email of
--    its own Google / Apple identity counts as verified (backfilled here, and kept by triggers when
--    an identity is added or the email changes). This matters once such an account also gets an
--    email sign-in ("Set a password", account linking): it is never asked for a code it can't need.
--  * auth_verify_password / auth_revoke_sessions / auth_end_session: check the current password
--    without signing in, sign out devices after a password change or reset (p.19-20), and end the
--    extra session a browser Google re-authentication creates.
--
-- The triggers on auth.users / auth.identities run inside the auth server's own writes, so they
-- never raise: a failure only logs a warning (sign-in must never break because of them).

-- ---------------------------------------------------------------------------------------------
-- 1) Verification belongs to an address
-- ---------------------------------------------------------------------------------------------
alter table public.email_verifications add column if not exists verified_email text;

-- Accounts verified today keep their status for the address they have now.
update public.email_verifications ev
   set verified_email = lower(u.email)
  from auth.users u
 where u.id = ev.user_id
   and ev.verified
   and ev.verified_email is null
   and u.email is not null;

-- Whether the account's current email is the (verified) email of one of its Google / Apple
-- identities, i.e. the provider already verified it.
create or replace function public.email_is_provider_verified(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from auth.users u
      join auth.identities i on i.user_id = u.id
     where u.id = p_user
       and u.email is not null
       and i.provider in ('google', 'apple')
       and lower(i.identity_data ->> 'email') = lower(u.email)
       and coalesce(i.identity_data ->> 'email_verified', 'true') <> 'false'
  );
$$;

create or replace function public.email_verification_mark_provider(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.email_is_provider_verified(p_user) then
    insert into public.email_verifications (user_id, verified, verified_at, verified_email)
    select u.id, true, now(), lower(u.email) from auth.users u where u.id = p_user
    on conflict (user_id) do update
       set verified = true, verified_at = now(), verified_email = excluded.verified_email
     where not public.email_verifications.verified
        or public.email_verifications.verified_email is distinct from excluded.verified_email;
  end if;
end;
$$;

-- Google / Apple accounts whose email is their provider's: verified (no code needed, p.18).
insert into public.email_verifications (user_id, verified, verified_at, verified_email)
select u.id, true, now(), lower(u.email)
  from auth.users u
 where public.email_is_provider_verified(u.id)
on conflict (user_id) do update
   set verified = true, verified_at = now(), verified_email = excluded.verified_email
 where not public.email_verifications.verified;

create or replace function public.email_verification_follow_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    begin
      update public.email_verifications
         set verified = false, verified_at = null
       where user_id = new.id
         and verified
         and lower(coalesce(verified_email, '')) <> lower(coalesce(new.email, ''));
      perform public.email_verification_mark_provider(new.id);
    exception when others then
      raise warning 'email_verification_follow_email: %', sqlstate;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.email_verification_follow_email();

create or replace function public.email_verification_on_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform public.email_verification_mark_provider(new.user_id);
  exception when others then
    raise warning 'email_verification_on_identity: %', sqlstate;
  end;
  return new;
end;
$$;

drop trigger if exists on_auth_identity_added on auth.identities;
create trigger on_auth_identity_added
  after insert on auth.identities
  for each row execute function public.email_verification_on_identity();

-- ---------------------------------------------------------------------------------------------
-- 2) Codes and rate limits (service role only: RLS on, no policies, no grants to app roles)
-- ---------------------------------------------------------------------------------------------
create table if not exists public.auth_codes (
  user_id           uuid not null references auth.users (id) on delete cascade,
  purpose           text not null check (purpose in ('verify_email', 'change_email', 'password_reset')),
  email             text not null,          -- the address the code was sent to (lower case)
  code_hash         text not null,          -- HMAC of the code, never the code itself
  expires_at        timestamptz not null,
  attempts          int not null default 0,
  consumed_at       timestamptz,
  ticket_hash       text,                   -- password reset: one-time ticket after the code
  ticket_expires_at timestamptz,
  sent_at           timestamptz not null default now(),
  window_started_at timestamptz not null default now(),
  window_sends      int not null default 1,
  primary key (user_id, purpose)
);
create index if not exists auth_codes_expires_idx on public.auth_codes (expires_at);
alter table public.auth_codes enable row level security;
revoke all on public.auth_codes from public, anon, authenticated;
grant all on public.auth_codes to service_role;

create table if not exists public.auth_rate_events (
  id         bigint generated always as identity primary key,
  key        text not null,
  created_at timestamptz not null default now()
);
create index if not exists auth_rate_events_key_time_idx on public.auth_rate_events (key, created_at desc);
create index if not exists auth_rate_events_time_idx on public.auth_rate_events (created_at);
alter table public.auth_rate_events enable row level security;
revoke all on public.auth_rate_events from public, anon, authenticated;
grant all on public.auth_rate_events to service_role;

-- Count + record in one step: true (and recorded) when under p_max in the window, else false.
create or replace function public.auth_rate_hit(p_key text, p_window_seconds int, p_max int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  perform pg_advisory_xact_lock(hashtextextended('auth_rate:' || p_key, 0));
  select count(*) into n from public.auth_rate_events
   where key = p_key and created_at > now() - make_interval(secs => p_window_seconds);
  if n >= p_max then
    return false;
  end if;
  insert into public.auth_rate_events (key) values (p_key);
  return true;
end;
$$;

create or replace function public.auth_rate_count(p_key text, p_window_seconds int)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.auth_rate_events
   where key = p_key and created_at > now() - make_interval(secs => p_window_seconds);
$$;

create or replace function public.auth_rate_add(p_key text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.auth_rate_events (key) values (p_key);
$$;

create or replace function public.auth_rate_clear(p_key text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.auth_rate_events where key = p_key;
$$;

-- Issue (or keep) the user's code for a purpose. Returns:
--   {status:'issued'}                      a new code is stored: send it
--   {status:'active'}                      p_only_if_none and a usable code for the same address exists
--   {status:'cooldown', retry_after:secs}  the same address got a code less than p_cooldown ago
--   {status:'too_many', retry_after:secs}  p_max_per_hour codes were sent in the last hour
-- A new code replaces the old one (the old code stops working).
create or replace function public.auth_code_issue(
  p_user uuid,
  p_purpose text,
  p_email text,
  p_code_hash text,
  p_ttl_seconds int,
  p_cooldown_seconds int,
  p_max_per_hour int,
  p_only_if_none boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.auth_codes;
  v_now timestamptz := now();
  v_email text := lower(trim(p_email));
  v_in_window boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended('auth_code:' || p_user::text || ':' || p_purpose, 0));
  select * into r from public.auth_codes where user_id = p_user and purpose = p_purpose;

  if not found then
    insert into public.auth_codes (user_id, purpose, email, code_hash, expires_at)
    values (p_user, p_purpose, v_email, p_code_hash, v_now + make_interval(secs => p_ttl_seconds));
    return jsonb_build_object('status', 'issued');
  end if;

  if p_only_if_none and r.email = v_email and r.consumed_at is null
     and r.expires_at > v_now and r.attempts < 5 then
    return jsonb_build_object('status', 'active');
  end if;

  if r.email = v_email and r.sent_at > v_now - make_interval(secs => p_cooldown_seconds) then
    return jsonb_build_object(
      'status', 'cooldown',
      'retry_after', greatest(1, ceil(extract(epoch from (r.sent_at + make_interval(secs => p_cooldown_seconds) - v_now)))::int)
    );
  end if;

  v_in_window := r.window_started_at > v_now - interval '1 hour';
  if v_in_window and r.window_sends >= p_max_per_hour then
    return jsonb_build_object(
      'status', 'too_many',
      'retry_after', greatest(1, ceil(extract(epoch from (r.window_started_at + interval '1 hour' - v_now)))::int)
    );
  end if;

  update public.auth_codes
     set email = v_email,
         code_hash = p_code_hash,
         expires_at = v_now + make_interval(secs => p_ttl_seconds),
         attempts = 0,
         consumed_at = null,
         ticket_hash = null,
         ticket_expires_at = null,
         sent_at = v_now,
         window_started_at = case when v_in_window then r.window_started_at else v_now end,
         window_sends = case when v_in_window then r.window_sends + 1 else 1 end
   where user_id = p_user and purpose = p_purpose;
  return jsonb_build_object('status', 'issued');
end;
$$;

-- Check a code: ok (and used up) | invalid (attempts_left) | locked (5 wrong tries) | expired | missing.
create or replace function public.auth_code_check(p_user uuid, p_purpose text, p_code_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.auth_codes;
begin
  perform pg_advisory_xact_lock(hashtextextended('auth_code:' || p_user::text || ':' || p_purpose, 0));
  select * into r from public.auth_codes where user_id = p_user and purpose = p_purpose;
  if not found or r.consumed_at is not null then
    return jsonb_build_object('status', 'missing');
  end if;
  if r.attempts >= 5 then
    return jsonb_build_object('status', 'locked');
  end if;
  if r.expires_at <= now() then
    return jsonb_build_object('status', 'expired');
  end if;
  if r.code_hash <> p_code_hash then
    update public.auth_codes set attempts = attempts + 1 where user_id = p_user and purpose = p_purpose;
    if r.attempts + 1 >= 5 then
      return jsonb_build_object('status', 'locked');
    end if;
    return jsonb_build_object('status', 'invalid', 'attempts_left', 5 - (r.attempts + 1));
  end if;
  update public.auth_codes set consumed_at = now() where user_id = p_user and purpose = p_purpose;
  return jsonb_build_object('status', 'ok', 'email', r.email);
end;
$$;

-- The email could not be sent: forget the code so the user can ask again straight away.
create or replace function public.auth_code_void(p_user uuid, p_purpose text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.auth_codes where user_id = p_user and purpose = p_purpose;
$$;

-- Password reset: after the code is used, a one-time ticket lets the user choose the password.
create or replace function public.auth_reset_ticket_issue(p_user uuid, p_ticket_hash text, p_ttl_seconds int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.auth_codes
     set ticket_hash = p_ticket_hash,
         ticket_expires_at = now() + make_interval(secs => p_ttl_seconds)
   where user_id = p_user and purpose = 'password_reset' and consumed_at is not null;
  return found;
end;
$$;

create or replace function public.auth_reset_ticket_use(p_user uuid, p_ticket_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.auth_codes
     set ticket_hash = null, ticket_expires_at = null
   where user_id = p_user and purpose = 'password_reset'
     and ticket_hash = p_ticket_hash and ticket_expires_at > now();
  return found;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 3) Accounts, passwords, sessions
-- ---------------------------------------------------------------------------------------------
-- What the server needs to decide a flow: email, anonymous, whether a password exists, and the
-- sign-in identities oldest first (the first Google / Apple identity is the provider the account
-- was created with). Providers are matched by their own account id (identities.provider_id), not
-- by email text (p.19).
create or replace function public.auth_account(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', u.id,
    'email', u.email,
    'is_anonymous', coalesce(u.is_anonymous, false),
    'has_password', coalesce(u.encrypted_password, '') <> '',
    'identities', coalesce((
      select jsonb_agg(jsonb_build_object(
               'provider', i.provider,
               'provider_id', i.provider_id,
               'created_at', i.created_at)
             order by i.created_at, i.provider)
        from auth.identities i where i.user_id = u.id), '[]'::jsonb)
  )
  from auth.users u
  where u.id = p_user;
$$;

create or replace function public.auth_account_by_email(p_email text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.auth_account(u.id)
    from auth.users u
   where lower(u.email) = lower(trim(p_email))
   order by u.is_sso_user nulls first, u.created_at
   limit 1;
$$;

-- Check a password against the stored hash without signing in (no session is created).
create or replace function public.auth_verify_password(p_user uuid, p_password text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select u.encrypted_password <> ''
       and extensions.crypt(p_password, u.encrypted_password) = u.encrypted_password
      from auth.users u where u.id = p_user), false);
$$;

-- Sign out devices: every session of the user except p_keep (null = all). Deleting a session
-- also removes its refresh tokens, so those devices are signed out at their next refresh.
create or replace function public.auth_revoke_sessions(p_user uuid, p_keep uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  delete from auth.sessions
   where user_id = p_user
     and (p_keep is null or id <> p_keep);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- End ONE session of the user (the extra one a browser Google re-authentication signs in).
create or replace function public.auth_end_session(p_user uuid, p_session uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from auth.sessions where user_id = p_user and id = p_session;
  return found;
end;
$$;

-- Mark an address verified, only while it is still the account's email.
create or replace function public.auth_mark_email_verified(p_user uuid, p_email text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from auth.users u where u.id = p_user and lower(u.email) = lower(trim(p_email))) then
    return false;
  end if;
  insert into public.email_verifications (user_id, verified, verified_at, verified_email)
  values (p_user, true, now(), lower(trim(p_email)))
  on conflict (user_id) do update
     set verified = true, verified_at = now(), verified_email = excluded.verified_email;
  return true;
end;
$$;

-- The signed-in user's own sign-in methods for the Sign-in & Security screen.
create or replace function public.my_sign_in_methods()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'email', u.email,
    'has_password', coalesce(u.encrypted_password, '') <> '',
    'providers', coalesce((
      select jsonb_agg(i.provider order by i.created_at, i.provider)
        from auth.identities i where i.user_id = u.id), '[]'::jsonb)
  )
  from auth.users u
  where u.id = auth.uid();
$$;

-- Private functions: the service role only (Supabase grants new public functions to the app roles
-- by default, so revoke explicitly).
revoke all on function public.email_verification_follow_email() from public, anon, authenticated;
revoke all on function public.email_verification_on_identity() from public, anon, authenticated;
revoke all on function public.email_is_provider_verified(uuid) from public, anon, authenticated;
revoke all on function public.email_verification_mark_provider(uuid) from public, anon, authenticated;
revoke all on function public.auth_end_session(uuid, uuid) from public, anon, authenticated;
revoke all on function public.auth_rate_hit(text, int, int) from public, anon, authenticated;
revoke all on function public.auth_rate_count(text, int) from public, anon, authenticated;
revoke all on function public.auth_rate_add(text) from public, anon, authenticated;
revoke all on function public.auth_rate_clear(text) from public, anon, authenticated;
revoke all on function public.auth_code_issue(uuid, text, text, text, int, int, int, boolean) from public, anon, authenticated;
revoke all on function public.auth_code_check(uuid, text, text) from public, anon, authenticated;
revoke all on function public.auth_code_void(uuid, text) from public, anon, authenticated;
revoke all on function public.auth_reset_ticket_issue(uuid, text, int) from public, anon, authenticated;
revoke all on function public.auth_reset_ticket_use(uuid, text) from public, anon, authenticated;
revoke all on function public.auth_account(uuid) from public, anon, authenticated;
revoke all on function public.auth_account_by_email(text) from public, anon, authenticated;
revoke all on function public.auth_verify_password(uuid, text) from public, anon, authenticated;
revoke all on function public.auth_revoke_sessions(uuid, uuid) from public, anon, authenticated;
revoke all on function public.auth_mark_email_verified(uuid, text) from public, anon, authenticated;
revoke all on function public.my_sign_in_methods() from public, anon;

grant execute on function public.auth_rate_hit(text, int, int) to service_role;
grant execute on function public.auth_rate_count(text, int) to service_role;
grant execute on function public.auth_rate_add(text) to service_role;
grant execute on function public.auth_rate_clear(text) to service_role;
grant execute on function public.auth_code_issue(uuid, text, text, text, int, int, int, boolean) to service_role;
grant execute on function public.auth_code_check(uuid, text, text) to service_role;
grant execute on function public.auth_code_void(uuid, text) to service_role;
grant execute on function public.auth_reset_ticket_issue(uuid, text, int) to service_role;
grant execute on function public.auth_reset_ticket_use(uuid, text) to service_role;
grant execute on function public.auth_account(uuid) to service_role;
grant execute on function public.auth_account_by_email(text) to service_role;
grant execute on function public.auth_verify_password(uuid, text) to service_role;
grant execute on function public.auth_revoke_sessions(uuid, uuid) to service_role;
grant execute on function public.auth_end_session(uuid, uuid) to service_role;
grant execute on function public.auth_mark_email_verified(uuid, text) to service_role;
grant execute on function public.my_sign_in_methods() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4) Housekeeping: old codes and rate events are deleted daily (best effort, like the trial job)
-- ---------------------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    begin
      if exists (select 1 from cron.job where jobname = 'lysm-auth-codes-cleanup') then
        perform cron.unschedule('lysm-auth-codes-cleanup');
      end if;
      perform cron.schedule(
        'lysm-auth-codes-cleanup', '17 3 * * *',
        $job$delete from public.auth_rate_events where created_at < now() - interval '2 days';
             delete from public.auth_codes
              where expires_at < now() - interval '2 days'
                and (ticket_expires_at is null or ticket_expires_at < now() - interval '2 days');$job$
      );
    exception when others then
      null; -- insufficient privilege to schedule: skip (nothing depends on the cleanup)
    end;
  end if;
end;
$$;
