-- Account linking pre-check (N4, client revisions 10/14 p.15-16 and p.19).
-- Verifies migration 20261022110000_account_link_precheck AFTER it is applied: run against the
-- database (Management API query or psql). Everything runs in ONE DO block that always ends with
-- RAISE EXCEPTION, so nothing it creates is kept. Expected: the error "ROLLED BACK. ok=10 bad=0".
-- On a database without the migration it fails (the function does not exist).
do $test$
declare
  r text := '';
  ok int := 0;
  bad int := 0;
  owner uuid;
  u_a uuid := gen_random_uuid();   -- email + password, Google and Apple linked
  u_b uuid := gen_random_uuid();   -- Google only
begin
  -- @migration (pre-deploy runs insert the migration here; after deploy it is already applied)

  insert into auth.users (id, email, encrypted_password, aud, role, created_at, is_anonymous) values
    (u_a, 'n4-a@lysm-test.invalid', extensions.crypt('Pass word 12', extensions.gen_salt('bf')), 'authenticated', 'authenticated', now(), false),
    (u_b, 'n4-b@lysm-test.invalid', '', 'authenticated', 'authenticated', now(), false);
  insert into auth.identities (provider_id, user_id, identity_data, provider, created_at) values
    (u_a::text, u_a, jsonb_build_object('sub', u_a::text, 'email', 'n4-a@lysm-test.invalid'), 'email', now() - interval '3 days'),
    ('n4-google-a', u_a, jsonb_build_object('sub', 'n4-google-a', 'email', 'n4-a@lysm-test.invalid'), 'google', now() - interval '2 days'),
    ('n4-apple-a', u_a, jsonb_build_object('sub', 'n4-apple-a', 'email', 'x1@privaterelay.appleid.com'), 'apple', now() - interval '1 day'),
    ('n4-google-b', u_b, jsonb_build_object('sub', 'n4-google-b', 'email', 'n4-b@lysm-test.invalid'), 'google', now());

  -- Every linked Google / Apple identity leads to the same single account (p.16).
  owner := public.auth_identity_owner('google', 'n4-google-a');
  if owner = u_a then ok := ok + 1; else bad := bad + 1; r := r || ' google owner=' || coalesce(owner::text, 'null') || ';'; end if;
  owner := public.auth_identity_owner('apple', 'n4-apple-a');
  if owner = u_a then ok := ok + 1; else bad := bad + 1; r := r || ' apple owner=' || coalesce(owner::text, 'null') || ';'; end if;
  owner := public.auth_identity_owner('google', 'n4-google-b');
  if owner = u_b then ok := ok + 1; else bad := bad + 1; r := r || ' other account owner=' || coalesce(owner::text, 'null') || ';'; end if;

  -- Matched by the provider's own account id and provider, never by email text (p.19).
  owner := public.auth_identity_owner('google', 'n4-unknown');
  if owner is null then ok := ok + 1; else bad := bad + 1; r := r || ' unknown sub matched;'; end if;
  owner := public.auth_identity_owner('apple', 'n4-google-a');
  if owner is null then ok := ok + 1; else bad := bad + 1; r := r || ' wrong provider matched;'; end if;
  owner := public.auth_identity_owner('google', 'n4-a@lysm-test.invalid');
  if owner is null then ok := ok + 1; else bad := bad + 1; r := r || ' email text matched;'; end if;
  owner := public.auth_identity_owner('google', 'N4-GOOGLE-A');
  if owner is null then ok := ok + 1; else bad := bad + 1; r := r || ' sub matched case-insensitively;'; end if;
  -- Only Google / Apple: an email identity (provider_id = the user id) is never answered.
  owner := public.auth_identity_owner('email', u_a::text);
  if owner is null then ok := ok + 1; else bad := bad + 1; r := r || ' email identity answered;'; end if;

  -- Private: the Edge Function's service role only, never the app.
  if not has_function_privilege('anon', 'public.auth_identity_owner(text, text)', 'execute')
     and not has_function_privilege('authenticated', 'public.auth_identity_owner(text, text)', 'execute')
  then ok := ok + 1; else bad := bad + 1; r := r || ' app roles can call it;'; end if;
  if has_function_privilege('service_role', 'public.auth_identity_owner(text, text)', 'execute')
  then ok := ok + 1; else bad := bad + 1; r := r || ' service role cannot call it;'; end if;

  raise exception 'ROLLED BACK. ok=% bad=% %', ok, bad, r;
end
$test$;
