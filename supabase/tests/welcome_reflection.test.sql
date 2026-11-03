-- The first reflection on the new paywall (N15, client revisions 10/14 p.33 to p.35): the
-- welcome_reflections table (owner can read and delete, never write), get_welcome_reflection(),
-- delete_welcome_reflection(), and the onboarding tone applying right away.
-- Verifies migration 20261022080000_welcome_reflection AFTER it is applied: run against the
-- database (Management API query or psql). Everything runs in ONE DO block that always ends with
-- RAISE EXCEPTION, so nothing it creates is kept. Expected: the error "ROLLED BACK. ok=23 bad=0".
-- On a database without the migration the table, both functions and the tone sync are missing, so
-- the result shows bad > 0.
do $test$
declare
  r text := '';
  ok int := 0;
  bad int := 0;
  n int;
  s text;
  s2 text;
  u1 uuid := gen_random_uuid();  -- skipped the first check in: has a welcome reflection
  u2 uuid := gen_random_uuid();  -- someone else
  u3 uuid := gen_random_uuid();  -- still in onboarding (tone sync)
begin
  -- @migration (pre-deploy runs insert the migration here; after deploy it is already applied)

  insert into auth.users (id, email, raw_user_meta_data, aud, role, created_at, is_anonymous) values
    (u1, 'wr-1@lysm-test.invalid', '{"display_name":"Konah"}', 'authenticated', 'authenticated', now(), false),
    (u2, 'wr-2@lysm-test.invalid', '{"display_name":"Asha"}', 'authenticated', 'authenticated', now(), false),
    (u3, null, '{}', 'authenticated', 'authenticated', now(), true);

  -- 1. The table exists with row level security on.
  select count(*) into n from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and c.relname = 'welcome_reflections' and c.relrowsecurity;
  if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' no table with RLS;'; end if;

  -- 2. The Edge Function (service role / owner) writes it.
  begin
    execute 'insert into public.welcome_reflections (user_id, status, body) values ($1, ''ready'', ''You came here wanting calmer days. The rest.'')' using u1;
    ok := ok + 1;
  exception when others then bad := bad + 1; r := r || ' server insert: ' || sqlerrm || ';';
  end;

  -- 3. A deleted card can't keep text; 4. the text has a length cap.
  begin
    execute 'insert into public.welcome_reflections (user_id, status, body) values ($1, ''deleted'', ''x'')' using u2;
    bad := bad + 1; r := r || ' deleted with text saved;';
  exception when others then
    if sqlstate = '23514' then ok := ok + 1; else bad := bad + 1; r := r || ' deleted check: ' || sqlerrm || ';'; end if;
  end;
  begin
    execute 'insert into public.welcome_reflections (user_id, status, body) values ($1, ''ready'', repeat(''a'', 4001))' using u2;
    bad := bad + 1; r := r || ' 4001 chars saved;';
  exception when others then
    if sqlstate = '23514' then ok := ok + 1; else bad := bad + 1; r := r || ' length check: ' || sqlerrm || ';'; end if;
  end;

  -- ===== As the person (the app's role, RLS on) =====
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- 5. They read their own row.
  begin
    execute 'select count(*) from public.welcome_reflections where user_id = $1' into n using u1;
    if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' own row not visible;'; end if;
  exception when others then bad := bad + 1; r := r || ' own read: ' || sqlerrm || ';';
  end;
  -- 6. get_welcome_reflection() returns it.
  begin
    execute 'select status, body from public.get_welcome_reflection()' into s, s2;
    if s = 'ready' and s2 like 'You came here%' then ok := ok + 1; else bad := bad + 1; r := r || ' get=' || coalesce(s, 'null') || ';'; end if;
  exception when others then bad := bad + 1; r := r || ' get: ' || sqlerrm || ';';
  end;
  -- 7. They can't write it themselves (insert, update, delete).
  begin
    execute 'update public.welcome_reflections set body = ''mine'' where user_id = $1' using u1;
    bad := bad + 1; r := r || ' user updated;';
  exception when others then
    if sqlstate = '42501' then ok := ok + 1; else bad := bad + 1; r := r || ' update: ' || sqlerrm || ';'; end if;
  end;
  begin
    execute 'delete from public.welcome_reflections where user_id = $1' using u1;
    bad := bad + 1; r := r || ' user hard-deleted;';
  exception when others then
    if sqlstate = '42501' then ok := ok + 1; else bad := bad + 1; r := r || ' delete: ' || sqlerrm || ';'; end if;
  end;
  begin
    execute 'insert into public.welcome_reflections (user_id, status, body) values ($1, ''ready'', ''fake'')' using u2;
    bad := bad + 1; r := r || ' user inserted;';
  exception when others then
    if sqlstate = '42501' then ok := ok + 1; else bad := bad + 1; r := r || ' insert: ' || sqlerrm || ';'; end if;
  end;
  execute 'reset role';

  -- 8. Someone else sees nothing of it (table and function).
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute 'select count(*) from public.welcome_reflections' into n;
    if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' other sees ' || n || ';'; end if;
    execute 'select count(*) from public.get_welcome_reflection()' into n;
    if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' other get ' || n || ';'; end if;
  exception when others then bad := bad + 2; r := r || ' other read: ' || sqlerrm || ';';
  end;
  -- 9. Their delete doesn't touch it.
  begin
    execute 'select public.delete_welcome_reflection()';
    ok := ok + 1;
  exception when others then bad := bad + 1; r := r || ' other delete call: ' || sqlerrm || ';';
  end;
  execute 'reset role';
  begin
    execute 'select status from public.welcome_reflections where user_id = $1' into s using u1;
    if s = 'ready' then ok := ok + 1; else bad := bad + 1; r := r || ' other delete changed it to ' || coalesce(s, 'null') || ';'; end if;
  exception when others then bad := bad + 1; r := r || ' after other delete: ' || sqlerrm || ';';
  end;

  -- 10. Signed out (anon) can't call it.
  execute 'set local role anon';
  begin
    execute 'select count(*) from public.get_welcome_reflection()' into n;
    bad := bad + 1; r := r || ' anon read;';
  exception when others then
    if sqlstate = '42501' then ok := ok + 1; else bad := bad + 1; r := r || ' anon: ' || sqlerrm || ';'; end if;
  end;
  execute 'reset role';

  -- 11. The owner's ••• > Delete: a tombstone with no text, so it is never written again.
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute 'select public.delete_welcome_reflection()';
  exception when others then r := r || ' delete call: ' || sqlerrm || ';';
  end;
  execute 'reset role';
  begin
    execute 'select status, body from public.welcome_reflections where user_id = $1 and deleted_at is not null' into s, s2 using u1;
    if s = 'deleted' and s2 is null then ok := ok + 1; else bad := bad + 1; r := r || ' after delete=' || coalesce(s, 'null') || ';'; end if;
  exception when others then bad := bad + 1; r := r || ' after delete: ' || sqlerrm || ';';
  end;

  -- ===== The onboarding tone applies right away (u3, onboarding not completed) =====
  perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  -- 12. Two tones: both columns, in order.
  perform public.set_onboarding('{"personal_reflection_style":["direct","reflective"]}'::jsonb);
  select personal_reflection_style::text, personal_reflection_style_secondary::text into s, s2 from public.profiles where user_id = u3;
  if s = 'direct' and s2 = 'reflective' then ok := ok + 1; else bad := bad + 1; r := r || ' two tones=' || coalesce(s, 'null') || '/' || coalesce(s2, 'null') || ';'; end if;
  -- 13. One tone: no second.
  perform public.set_onboarding('{"personal_reflection_style":["encouraging"]}'::jsonb);
  select personal_reflection_style::text, personal_reflection_style_secondary::text into s, s2 from public.profiles where user_id = u3;
  if s = 'encouraging' and s2 is null then ok := ok + 1; else bad := bad + 1; r := r || ' one tone=' || coalesce(s, 'null') || '/' || coalesce(s2, 'null') || ';'; end if;
  -- 14. The same tone twice is one tone.
  perform public.set_onboarding('{"personal_reflection_style":["gentle","gentle"]}'::jsonb);
  select personal_reflection_style::text, personal_reflection_style_secondary::text into s, s2 from public.profiles where user_id = u3;
  if s = 'gentle' and s2 is null then ok := ok + 1; else bad := bad + 1; r := r || ' same twice=' || coalesce(s, 'null') || '/' || coalesce(s2, 'null') || ';'; end if;
  -- 15. An unknown value changes nothing.
  perform public.set_onboarding('{"personal_reflection_style":["loud"]}'::jsonb);
  select personal_reflection_style::text into s from public.profiles where user_id = u3;
  if s = 'gentle' then ok := ok + 1; else bad := bad + 1; r := r || ' unknown=' || coalesce(s, 'null') || ';'; end if;
  -- 16. An older build's single string still counts.
  perform public.set_onboarding('{"personal_reflection_style":"reflective"}'::jsonb);
  select personal_reflection_style::text, personal_reflection_style_secondary::text into s, s2 from public.profiles where user_id = u3;
  if s = 'reflective' and s2 is null then ok := ok + 1; else bad := bad + 1; r := r || ' scalar=' || coalesce(s, 'null') || ';'; end if;
  execute 'reset role';
  -- 17. A save that doesn't change the tone leaves the columns alone.
  update public.profiles set personal_reflection_style = 'direct' where user_id = u3;
  perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.set_onboarding('{"step":"trial"}'::jsonb);
  execute 'reset role';
  select personal_reflection_style::text into s from public.profiles where user_id = u3;
  if s = 'direct' then ok := ok + 1; else bad := bad + 1; r := r || ' unrelated save=' || coalesce(s, 'null') || ';'; end if;
  -- 18. Once onboarding is completed, Edit Profile owns the tone.
  update public.profiles set onboarding_completed = true where user_id = u3;
  perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.set_onboarding('{"personal_reflection_style":["encouraging"]}'::jsonb);
  execute 'reset role';
  select personal_reflection_style::text into s from public.profiles where user_id = u3;
  if s = 'direct' then ok := ok + 1; else bad := bad + 1; r := r || ' after completion=' || coalesce(s, 'null') || ';'; end if;

  -- 19. Deleting the account removes it.
  delete from auth.users where id = u1;
  begin
    execute 'select count(*) from public.welcome_reflections where user_id = $1' into n using u1;
    if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' kept after account delete;'; end if;
  exception when others then bad := bad + 1; r := r || ' cascade: ' || sqlerrm || ';';
  end;

  raise exception 'ROLLED BACK. ok=% bad=% %', ok, bad, r;
end
$test$;
