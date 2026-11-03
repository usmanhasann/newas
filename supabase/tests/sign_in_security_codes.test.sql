-- Sign-in & Security codes (N5, client revisions 10/14 p.17-21).
-- Verifies migration 20261022100000_sign_in_security_codes AFTER it is applied: run against the
-- database (Management API query or psql). Everything runs in ONE DO block that always ends with
-- RAISE EXCEPTION, so nothing it creates is kept. Expected: the error "ROLLED BACK. ok=63 bad=0".
-- On a database without the migration the first checks fail (no column, no functions, no tables).
do $test$
declare
  r text := '';
  ok int := 0;
  bad int := 0;
  n int;
  v boolean;
  j jsonb;
  t text;
  u_pw uuid := gen_random_uuid();     -- email + password account
  u_g uuid := gen_random_uuid();      -- Google only (no password)
  u_x uuid := gen_random_uuid();      -- someone else
  u_gp uuid := gen_random_uuid();     -- Google only, email from Google
  u_ap uuid := gen_random_uuid();     -- Apple only, Apple did not verify the email
  u_ch uuid := gen_random_uuid();     -- email + password with Google linked (another address)
  s1 uuid := gen_random_uuid(); s2 uuid := gen_random_uuid(); s3 uuid := gen_random_uuid();
  s4 uuid := gen_random_uuid();
begin
  -- @migration (pre-deploy runs insert the migration here; after deploy it is already applied)

  -- Accounts verified before this release keep their status for the address they have now.
  select count(*) into n
    from public.email_verifications ev join auth.users u on u.id = ev.user_id
   where ev.verified and ev.verified_email is null and u.email is not null;
  if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' verified rows without address=' || n || ';'; end if;
  -- Accounts whose email is their Google / Apple email were backfilled as verified.
  select count(*) into n
    from auth.users u
   where public.email_is_provider_verified(u.id)
     and not exists (select 1 from public.email_verifications ev where ev.user_id = u.id and ev.verified);
  if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' provider emails not backfilled=' || n || ';'; end if;
  -- The triggers that keep it right are in place.
  select count(*) into n from pg_trigger
   where tgname in ('on_auth_user_email_changed', 'on_auth_identity_added') and not tgisinternal;
  if n = 2 then ok := ok + 1; else bad := bad + 1; r := r || ' triggers=' || n || ';'; end if;

  insert into auth.users (id, email, encrypted_password, aud, role, created_at, is_anonymous) values
    (u_pw, 'nf-pw@lysm-test.invalid', extensions.crypt('Correct horse 1', extensions.gen_salt('bf')), 'authenticated', 'authenticated', now(), false),
    (u_g, 'nf-g@lysm-test.invalid', '', 'authenticated', 'authenticated', now(), false),
    (u_x, 'nf-x@lysm-test.invalid', extensions.crypt('Other pass 99', extensions.gen_salt('bf')), 'authenticated', 'authenticated', now(), false);
  insert into auth.identities (provider_id, user_id, identity_data, provider, created_at) values
    (u_pw::text, u_pw, jsonb_build_object('sub', u_pw::text, 'email', 'nf-pw@lysm-test.invalid'), 'email', now() - interval '2 days'),
    ('google-sub-123', u_pw, jsonb_build_object('sub', 'google-sub-123'), 'google', now() - interval '1 day'),
    ('google-sub-456', u_g, jsonb_build_object('sub', 'google-sub-456'), 'google', now() - interval '3 days'),
    ('apple-sub-789', u_g, jsonb_build_object('sub', 'apple-sub-789'), 'apple', now() - interval '1 day');
  insert into auth.sessions (id, user_id, created_at, updated_at) values
    (s1, u_pw, now(), now()), (s2, u_pw, now(), now()), (s3, u_pw, now(), now());

  -- ===== Verification belongs to an address =====
  v := public.auth_mark_email_verified(u_pw, 'NF-PW@lysm-test.invalid');
  if v then ok := ok + 1; else bad := bad + 1; r := r || ' mark current refused;'; end if;
  select verified into v from public.email_verifications where user_id = u_pw;
  if v then ok := ok + 1; else bad := bad + 1; r := r || ' not verified after mark;'; end if;
  v := public.auth_mark_email_verified(u_pw, 'someone-else@lysm-test.invalid');
  if not v then ok := ok + 1; else bad := bad + 1; r := r || ' marked an address that is not the account email;'; end if;

  update auth.users set email = 'NF-PW@LYSM-TEST.INVALID' where id = u_pw; -- same address, other case
  select verified into v from public.email_verifications where user_id = u_pw;
  if v then ok := ok + 1; else bad := bad + 1; r := r || ' case change unverified;'; end if;

  update auth.users set email = 'nf-pw-new@lysm-test.invalid' where id = u_pw; -- a different address
  select verified into v from public.email_verifications where user_id = u_pw;
  if not v then ok := ok + 1; else bad := bad + 1; r := r || ' verified carried over to a new address;'; end if;
  update auth.users set email = 'nf-pw@lysm-test.invalid' where id = u_pw;

  -- ===== Google / Apple verified the email themselves (p.18) =====
  insert into auth.users (id, email, encrypted_password, aud, role, created_at, is_anonymous) values
    (u_gp, 'nf-gp@lysm-test.invalid', '', 'authenticated', 'authenticated', now(), false),
    (u_ap, 'nf-ap@lysm-test.invalid', '', 'authenticated', 'authenticated', now(), false),
    (u_ch, 'nf-ch@lysm-test.invalid', extensions.crypt('Pass word 77', extensions.gen_salt('bf')), 'authenticated', 'authenticated', now(), false);
  insert into auth.identities (provider_id, user_id, identity_data, provider, created_at) values
    ('google-sub-gp', u_gp, jsonb_build_object('sub', 'google-sub-gp', 'email', 'NF-GP@lysm-test.invalid', 'email_verified', true), 'google', now()),
    ('apple-sub-ap', u_ap, jsonb_build_object('sub', 'apple-sub-ap', 'email', 'nf-ap@lysm-test.invalid', 'email_verified', false), 'apple', now()),
    (u_ch::text, u_ch, jsonb_build_object('sub', u_ch::text, 'email', 'nf-ch@lysm-test.invalid'), 'email', now()),
    ('google-sub-ch', u_ch, jsonb_build_object('sub', 'google-sub-ch', 'email', 'nf-ch-gmail@lysm-test.invalid', 'email_verified', true), 'google', now());
  select verified_email into t from public.email_verifications where user_id = u_gp and verified;
  if t = 'nf-gp@lysm-test.invalid' then ok := ok + 1; else bad := bad + 1; r := r || ' google email not verified=' || coalesce(t, 'null') || ';'; end if;
  select count(*) into n from public.email_verifications where user_id = u_ap and verified;
  if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' unverified provider email counted;'; end if;
  select count(*) into n from public.email_verifications where user_id = u_ch and verified;
  if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' another address counted;'; end if;
  -- Switching to the address Google verified makes it verified; a later typed address does not.
  update auth.users set email = 'nf-ch-gmail@lysm-test.invalid' where id = u_ch;
  select verified_email into t from public.email_verifications where user_id = u_ch and verified;
  if t = 'nf-ch-gmail@lysm-test.invalid' then ok := ok + 1; else bad := bad + 1; r := r || ' provider address after change=' || coalesce(t, 'null') || ';'; end if;
  update auth.users set email = 'nf-ch@lysm-test.invalid' where id = u_ch;
  select count(*) into n from public.email_verifications where user_id = u_ch and verified;
  if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' typed address kept the provider verification;'; end if;

  -- ===== Codes: issue, cooldown, keep, cap =====
  j := public.auth_code_issue(u_pw, 'verify_email', 'nf-pw@lysm-test.invalid', 'h1', 600, 60, 3, false);
  if j->>'status' = 'issued' then ok := ok + 1; else bad := bad + 1; r := r || ' first issue=' || j::text || ';'; end if;
  j := public.auth_code_issue(u_pw, 'verify_email', 'nf-pw@lysm-test.invalid', 'h2', 600, 60, 3, true);
  if j->>'status' = 'active' then ok := ok + 1; else bad := bad + 1; r := r || ' ensure=' || j::text || ';'; end if;
  j := public.auth_code_issue(u_pw, 'verify_email', 'NF-PW@lysm-test.invalid', 'h2', 600, 60, 3, false);
  if j->>'status' = 'cooldown' and (j->>'retry_after')::int between 1 and 60 then ok := ok + 1; else bad := bad + 1; r := r || ' resend=' || j::text || ';'; end if;
  select code_hash into t from public.auth_codes where user_id = u_pw and purpose = 'verify_email';
  if t = 'h1' then ok := ok + 1; else bad := bad + 1; r := r || ' cooldown replaced the code;'; end if;
  -- A fixed typo (another address) is not held back by the cooldown.
  j := public.auth_code_issue(u_pw, 'verify_email', 'nf-typo-fixed@lysm-test.invalid', 'h3', 600, 60, 3, false);
  if j->>'status' = 'issued' then ok := ok + 1; else bad := bad + 1; r := r || ' new address=' || j::text || ';'; end if;
  -- After the cooldown, a resend replaces the code; the hourly cap (3) then stops a 4th.
  update public.auth_codes set sent_at = now() - interval '2 minutes' where user_id = u_pw and purpose = 'verify_email';
  j := public.auth_code_issue(u_pw, 'verify_email', 'nf-typo-fixed@lysm-test.invalid', 'h4', 600, 60, 3, false);
  if j->>'status' = 'issued' then ok := ok + 1; else bad := bad + 1; r := r || ' resend after cooldown=' || j::text || ';'; end if;
  update public.auth_codes set sent_at = now() - interval '2 minutes' where user_id = u_pw and purpose = 'verify_email';
  j := public.auth_code_issue(u_pw, 'verify_email', 'nf-typo-fixed@lysm-test.invalid', 'h5', 600, 60, 3, false);
  if j->>'status' = 'too_many' then ok := ok + 1; else bad := bad + 1; r := r || ' hourly cap=' || j::text || ';'; end if;
  -- An hour later the cap starts over.
  update public.auth_codes set window_started_at = now() - interval '61 minutes' where user_id = u_pw and purpose = 'verify_email';
  j := public.auth_code_issue(u_pw, 'verify_email', 'nf-pw@lysm-test.invalid', 'h6', 600, 60, 3, false);
  if j->>'status' = 'issued' then ok := ok + 1; else bad := bad + 1; r := r || ' after the hour=' || j::text || ';'; end if;

  -- ===== Codes: check (wrong tries, lock, expiry, single use) =====
  j := public.auth_code_check(u_pw, 'verify_email', 'wrong');
  if j->>'status' = 'invalid' and (j->>'attempts_left')::int = 4 then ok := ok + 1; else bad := bad + 1; r := r || ' wrong 1=' || j::text || ';'; end if;
  perform public.auth_code_check(u_pw, 'verify_email', 'wrong');
  perform public.auth_code_check(u_pw, 'verify_email', 'wrong');
  j := public.auth_code_check(u_pw, 'verify_email', 'wrong');
  if j->>'status' = 'invalid' and (j->>'attempts_left')::int = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' wrong 4=' || j::text || ';'; end if;
  j := public.auth_code_check(u_pw, 'verify_email', 'wrong');
  if j->>'status' = 'locked' then ok := ok + 1; else bad := bad + 1; r := r || ' wrong 5=' || j::text || ';'; end if;
  j := public.auth_code_check(u_pw, 'verify_email', 'h6');
  if j->>'status' = 'locked' then ok := ok + 1; else bad := bad + 1; r := r || ' right code after lock=' || j::text || ';'; end if;
  -- A locked code is not "active": asking again sends a new one.
  update public.auth_codes set sent_at = now() - interval '2 minutes' where user_id = u_pw and purpose = 'verify_email';
  j := public.auth_code_issue(u_pw, 'verify_email', 'nf-pw@lysm-test.invalid', 'h7', 600, 60, 9, true);
  if j->>'status' = 'issued' then ok := ok + 1; else bad := bad + 1; r := r || ' new after lock=' || j::text || ';'; end if;
  j := public.auth_code_check(u_pw, 'verify_email', 'h7');
  if j->>'status' = 'ok' and j->>'email' = 'nf-pw@lysm-test.invalid' then ok := ok + 1; else bad := bad + 1; r := r || ' right code=' || j::text || ';'; end if;
  j := public.auth_code_check(u_pw, 'verify_email', 'h7');
  if j->>'status' = 'missing' then ok := ok + 1; else bad := bad + 1; r := r || ' used twice=' || j::text || ';'; end if;
  update public.auth_codes set sent_at = now() - interval '2 minutes' where user_id = u_pw and purpose = 'verify_email';
  perform public.auth_code_issue(u_pw, 'verify_email', 'nf-pw@lysm-test.invalid', 'h8', 600, 60, 9, false);
  update public.auth_codes set expires_at = now() - interval '1 second' where user_id = u_pw and purpose = 'verify_email';
  j := public.auth_code_check(u_pw, 'verify_email', 'h8');
  if j->>'status' = 'expired' then ok := ok + 1; else bad := bad + 1; r := r || ' expired=' || j::text || ';'; end if;
  j := public.auth_code_check(u_x, 'verify_email', 'h8');
  if j->>'status' = 'missing' then ok := ok + 1; else bad := bad + 1; r := r || ' other user=' || j::text || ';'; end if;
  perform public.auth_code_void(u_pw, 'verify_email');
  select count(*) into n from public.auth_codes where user_id = u_pw and purpose = 'verify_email';
  if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' void kept the code;'; end if;
  -- Purposes are separate.
  j := public.auth_code_issue(u_pw, 'password_reset', 'nf-pw@lysm-test.invalid', 'p1', 600, 60, 5, false);
  j := public.auth_code_check(u_pw, 'change_email', 'p1');
  if j->>'status' = 'missing' then ok := ok + 1; else bad := bad + 1; r := r || ' cross purpose=' || j::text || ';'; end if;

  -- ===== Password reset ticket =====
  v := public.auth_reset_ticket_issue(u_pw, 't1', 600);
  if not v then ok := ok + 1; else bad := bad + 1; r := r || ' ticket before the code was used;'; end if;
  j := public.auth_code_check(u_pw, 'password_reset', 'p1');
  v := public.auth_reset_ticket_issue(u_pw, 't1', 600);
  if v then ok := ok + 1; else bad := bad + 1; r := r || ' ticket refused;'; end if;
  v := public.auth_reset_ticket_use(u_pw, 'nope');
  if not v then ok := ok + 1; else bad := bad + 1; r := r || ' wrong ticket accepted;'; end if;
  v := public.auth_reset_ticket_use(u_pw, 't1');
  if v then ok := ok + 1; else bad := bad + 1; r := r || ' ticket not accepted;'; end if;
  v := public.auth_reset_ticket_use(u_pw, 't1');
  if not v then ok := ok + 1; else bad := bad + 1; r := r || ' ticket used twice;'; end if;
  perform public.auth_reset_ticket_issue(u_pw, 't2', 600);
  update public.auth_codes set ticket_expires_at = now() - interval '1 second' where user_id = u_pw and purpose = 'password_reset';
  v := public.auth_reset_ticket_use(u_pw, 't2');
  if not v then ok := ok + 1; else bad := bad + 1; r := r || ' expired ticket accepted;'; end if;

  -- ===== Accounts and passwords =====
  j := public.auth_account(u_pw);
  if (j->>'has_password')::boolean and j->'identities'->0->>'provider' = 'email'
     and j->'identities'->1->>'provider_id' = 'google-sub-123' then ok := ok + 1; else bad := bad + 1; r := r || ' account pw=' || j::text || ';'; end if;
  j := public.auth_account(u_g);
  if not (j->>'has_password')::boolean and j->'identities'->0->>'provider' = 'google' then ok := ok + 1; else bad := bad + 1; r := r || ' account google=' || j::text || ';'; end if;
  j := public.auth_account_by_email('  NF-G@lysm-test.invalid ');
  if j->>'id' = u_g::text then ok := ok + 1; else bad := bad + 1; r := r || ' by email=' || coalesce(j::text, 'null') || ';'; end if;
  j := public.auth_account_by_email('nobody@lysm-test.invalid');
  if j is null then ok := ok + 1; else bad := bad + 1; r := r || ' unknown email found;'; end if;

  if public.auth_verify_password(u_pw, 'Correct horse 1') then ok := ok + 1; else bad := bad + 1; r := r || ' right password refused;'; end if;
  if not public.auth_verify_password(u_pw, 'correct horse 1') then ok := ok + 1; else bad := bad + 1; r := r || ' wrong password accepted;'; end if;
  if not public.auth_verify_password(u_g, '') then ok := ok + 1; else bad := bad + 1; r := r || ' no-password account accepted;'; end if;
  if not public.auth_verify_password(u_x, 'Correct horse 1') then ok := ok + 1; else bad := bad + 1; r := r || ' other account password;'; end if;

  -- ===== Sign out other devices =====
  n := public.auth_revoke_sessions(u_pw, s1);
  if n = 2 then ok := ok + 1; else bad := bad + 1; r := r || ' revoke others=' || n || ';'; end if;
  select count(*) into n from auth.sessions where user_id = u_pw and id = s1;
  if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' this device signed out;'; end if;
  n := public.auth_revoke_sessions(u_pw, null);
  if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' revoke all=' || n || ';'; end if;
  -- One session (the browser Google re-authentication's), only for its own user.
  insert into auth.sessions (id, user_id, created_at, updated_at) values (s4, u_x, now(), now());
  v := public.auth_end_session(u_pw, s4);
  if not v then ok := ok + 1; else bad := bad + 1; r := r || ' ended another user session;'; end if;
  v := public.auth_end_session(u_x, s4);
  select count(*) into n from auth.sessions where id = s4;
  if v and n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' end session=' || n || ';'; end if;

  -- ===== Rate limits =====
  if public.auth_rate_hit('nf-test-key', 60, 2) and public.auth_rate_hit('nf-test-key', 60, 2)
     and not public.auth_rate_hit('nf-test-key', 60, 2) then ok := ok + 1; else bad := bad + 1; r := r || ' rate hit;'; end if;
  perform public.auth_rate_add('nf-test-key');
  if public.auth_rate_count('nf-test-key', 60) = 3 then ok := ok + 1; else bad := bad + 1; r := r || ' rate count;'; end if;
  perform public.auth_rate_clear('nf-test-key');
  if public.auth_rate_count('nf-test-key', 60) = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' rate clear;'; end if;

  -- ===== Only the server can use the private functions and tables =====
  if not has_function_privilege('authenticated', 'public.auth_verify_password(uuid,text)', 'execute')
     and not has_function_privilege('anon', 'public.auth_verify_password(uuid,text)', 'execute')
     and has_function_privilege('service_role', 'public.auth_verify_password(uuid,text)', 'execute')
  then ok := ok + 1; else bad := bad + 1; r := r || ' verify_password grants;'; end if;
  if not has_function_privilege('authenticated', 'public.auth_revoke_sessions(uuid,uuid)', 'execute')
     and not has_function_privilege('authenticated', 'public.auth_code_check(uuid,text,text)', 'execute')
     and not has_function_privilege('authenticated', 'public.auth_account_by_email(text)', 'execute')
     and not has_function_privilege('anon', 'public.auth_mark_email_verified(uuid,text)', 'execute')
     and not has_function_privilege('authenticated', 'public.auth_end_session(uuid,uuid)', 'execute')
     and has_function_privilege('service_role', 'public.auth_end_session(uuid,uuid)', 'execute')
     and not has_function_privilege('authenticated', 'public.email_verification_mark_provider(uuid)', 'execute')
     and not has_function_privilege('anon', 'public.email_is_provider_verified(uuid)', 'execute')
  then ok := ok + 1; else bad := bad + 1; r := r || ' private function grants;'; end if;
  -- Linked sign-in is matched by the provider's own account id, never by the email (p.19).
  select count(*) into n from pg_constraint
   where conrelid = 'auth.identities'::regclass and contype = 'u'
     and pg_get_constraintdef(oid) = 'UNIQUE (provider_id, provider)';
  if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' identity key;'; end if;
  if has_function_privilege('authenticated', 'public.my_sign_in_methods()', 'execute')
     and not has_function_privilege('anon', 'public.my_sign_in_methods()', 'execute')
  then ok := ok + 1; else bad := bad + 1; r := r || ' my_sign_in_methods grants;'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', u_g, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    select count(*) into n from public.auth_codes;
    bad := bad + 1; r := r || ' app user read auth_codes;';
  exception when insufficient_privilege then ok := ok + 1;
  end;
  begin
    insert into public.auth_rate_events (key) values ('x');
    bad := bad + 1; r := r || ' app user wrote auth_rate_events;';
  exception when insufficient_privilege then ok := ok + 1;
  end;
  begin
    update public.email_verifications set verified = true where user_id = u_g;
    get diagnostics n = row_count;
    if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' app user verified itself;'; end if;
  exception when insufficient_privilege then ok := ok + 1;
  end;
  j := public.my_sign_in_methods();
  if not (j->>'has_password')::boolean and j->'providers' = '["google","apple"]'::jsonb
     and j->>'email' = 'nf-g@lysm-test.invalid' then ok := ok + 1; else bad := bad + 1; r := r || ' my methods=' || coalesce(j::text, 'null') || ';'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', u_pw, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.my_sign_in_methods();
  if (j->>'has_password')::boolean and j->'providers' = '["email","google"]'::jsonb then ok := ok + 1; else bad := bad + 1; r := r || ' my methods pw=' || coalesce(j::text, 'null') || ';'; end if;
  execute 'reset role';

  raise exception 'ROLLED BACK. ok=% bad=% %', ok, bad, r;
end
$test$;
