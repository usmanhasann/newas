-- Verified badges (N7, client revisions 10/14 p.5): an admin-only profiles.verified flag, no check
-- marks in names, and verified_circle_owners() for Discover.
-- Verifies migration 20261022060000_verified_badges AFTER it is applied: run against the database
-- (Management API query or psql). Everything runs in ONE DO block that always ends with RAISE
-- EXCEPTION, so nothing it creates is kept. Expected: the error "ROLLED BACK. ok=31 bad=0".
-- On a database without the migration most checks fail (no column, names with check marks saved,
-- no function), so the result shows bad > 0.
do $test$
declare
  r text := '';
  ok int := 0;
  bad int := 0;
  n int;
  v boolean;
  s text;
  sym text;
  u_star uuid := gen_random_uuid();   -- a well-known person (admin verifies them)
  u_plain uuid := gen_random_uuid();  -- an ordinary owner
  u_a uuid := gen_random_uuid();      -- a member of the star's circles
  u_new uuid := gen_random_uuid();    -- has no profile row (tests the INSERT path)
  u_x uuid := gen_random_uuid();      -- browses Discover, in no circle
  u_sys uuid := gen_random_uuid();
  u_sys2 uuid := gen_random_uuid();
  c_star_pub uuid; c_star_priv uuid; c_plain_pub uuid;
  many uuid[];
begin
  -- @migration (pre-deploy runs insert the migration here; after deploy it is already applied)

  insert into auth.users (id, email, raw_user_meta_data, aud, role, created_at) values
    (u_star, 'vb-star@lysm-test.invalid', '{"display_name":"Taylor Star"}', 'authenticated', 'authenticated', now()),
    (u_plain, 'vb-plain@lysm-test.invalid', '{"display_name":"Pat Plain"}', 'authenticated', 'authenticated', now()),
    (u_a, 'vb-a@lysm-test.invalid', '{"display_name":"Asha"}', 'authenticated', 'authenticated', now()),
    (u_new, 'vb-new@lysm-test.invalid', '{"display_name":"Nia"}', 'authenticated', 'authenticated', now()),
    (u_x, 'vb-x@lysm-test.invalid', '{"display_name":"Xan"}', 'authenticated', 'authenticated', now());
  insert into public.circles (owner_id, name, type) values (u_star, 'VB star public', 'public') returning id into c_star_pub;
  insert into public.circles (owner_id, name, type) values (u_star, 'VB star private', 'private') returning id into c_star_priv;
  insert into public.circles (owner_id, name, type) values (u_plain, 'VB plain public', 'public') returning id into c_plain_pub;
  insert into public.circle_members (circle_id, user_id, role, status) values
    (c_star_pub, u_a, 'member', 'approved'), (c_star_priv, u_a, 'member', 'approved')
  on conflict do nothing;
  delete from public.profiles where user_id = u_new;

  -- 1. A new profile is NOT verified.
  begin
    execute 'select verified from public.profiles where user_id = $1' into v using u_star;
    if v is false then ok := ok + 1; else bad := bad + 1; r := r || ' new profile verified=' || coalesce(v::text, 'null') || ';'; end if;
  exception when others then bad := bad + 1; r := r || ' read verified: ' || sqlerrm || ';';
  end;

  -- ===== As the person themselves (the app's role, RLS on) =====
  perform set_config('request.jwt.claims', json_build_object('sub', u_star, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- 2. Can't turn it on.
  begin
    execute 'update public.profiles set verified = true where user_id = $1' using u_star;
    bad := bad + 1; r := r || ' user turned verified on;';
  exception when others then
    if sqlstate = '42501' then ok := ok + 1; else bad := bad + 1; r := r || ' turn on: ' || sqlerrm || ';'; end if;
  end;
  -- 3. Not even alongside a normal edit (the app's Edit Profile update shape).
  begin
    execute 'update public.profiles set display_name = ''Taylor'', bio = ''hi'', verified = true where user_id = $1' using u_star;
    bad := bad + 1; r := r || ' user set verified with an edit;';
  exception when others then
    if sqlstate = '42501' then ok := ok + 1; else bad := bad + 1; r := r || ' edit+verified: ' || sqlerrm || ';'; end if;
  end;
  -- 4. A normal edit still works (control).
  update public.profiles set display_name = 'Taylor Star', bio = 'Singer' where user_id = u_star;
  get diagnostics n = row_count;
  if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' normal edit rows=' || n || ';'; end if;

  -- 5..14. Names with check marks or verification symbols are refused (Edit Profile path).
  foreach sym in array array[
    U&'\2713', U&'\2714', U&'\2714\FE0F', U&'\2611', U&'\2611\FE0F', U&'\2705',
    U&'\+01F5F8', U&'\+01F5F9', U&'\221A', U&'\237B'
  ] loop
    begin
      update public.profiles set display_name = 'Taylor ' || sym where user_id = u_star;
      bad := bad + 1; r := r || ' name with ' || sym || ' saved;';
    exception when others then
      if sqlerrm = 'name_has_check_mark' then ok := ok + 1; else bad := bad + 1; r := r || ' ' || sym || ': ' || sqlerrm || ';'; end if;
    end;
  end loop;
  -- 15. The name the person had is untouched.
  select display_name into s from public.profiles where user_id = u_star;
  if s = 'Taylor Star' then ok := ok + 1; else bad := bad + 1; r := r || ' name now ' || coalesce(s, 'null') || ';'; end if;
  -- 16. Ordinary names, emoji included, still save (control).
  update public.profiles set display_name = U&'Ta\00EFlor \+01F33F' where user_id = u_star;
  get diagnostics n = row_count;
  if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' ordinary emoji name refused;'; end if;
  update public.profiles set display_name = 'Taylor Star' where user_id = u_star;
  execute 'reset role';

  -- 17..18. The INSERT path (a profile written by the app itself) can't set it either.
  perform set_config('request.jwt.claims', json_build_object('sub', u_new, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute 'insert into public.profiles (user_id, verified) values ($1, true)' using u_new;
    bad := bad + 1; r := r || ' user inserted verified profile;';
  exception when others then
    if sqlstate = '42501' then ok := ok + 1; else bad := bad + 1; r := r || ' insert verified: ' || sqlerrm || ';'; end if;
  end;
  insert into public.profiles (user_id) values (u_new);
  get diagnostics n = row_count;
  if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' plain insert refused;'; end if;
  execute 'reset role';

  -- ===== Admin (Supabase Table Editor / SQL editor run as postgres) =====
  -- 19. Turn it on.
  begin
    execute 'update public.profiles set verified = true where user_id = $1' using u_star;
    get diagnostics n = row_count;
    if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' admin on rows=' || n || ';'; end if;
  exception when others then bad := bad + 1; r := r || ' admin on: ' || sqlerrm || ';';
  end;

  -- 20. A member of the star's circle reads the flag (RLS lets members see each other's profile).
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute 'select verified from public.profiles where user_id = $1' into v using u_star;
    if v is true then ok := ok + 1; else bad := bad + 1; r := r || ' member sees verified=' || coalesce(v::text, 'null') || ';'; end if;
  exception when others then bad := bad + 1; r := r || ' member read: ' || sqlerrm || ';';
  end;
  execute 'reset role';

  -- ===== Discover: verified_circle_owners, as someone in none of these circles =====
  perform set_config('request.jwt.claims', json_build_object('sub', u_x, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  -- 21. Control: profiles' RLS hides the star from an outsider (why the function exists).
  select count(*) into n from public.profiles where user_id = u_star;
  if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' outsider sees star profile;'; end if;
  begin
    -- 22. The star's PUBLIC circle comes back with the star's name.
    execute 'select count(*) from public.verified_circle_owners($1) where circle_id = $2 and owner_id = $3 and display_name = ''Taylor Star'''
      into n using array[c_star_pub, c_plain_pub, c_star_priv], c_star_pub, u_star;
    if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' star public rows=' || n || ';'; end if;
    -- 23. Nothing else: not the ordinary owner, not the star's PRIVATE circle.
    execute 'select count(*) from public.verified_circle_owners($1)' into n using array[c_star_pub, c_plain_pub, c_star_priv];
    if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' owners rows=' || n || ';'; end if;
    -- 24. At most 200 circles a call: the 201st id is ignored.
    select array_agg(gen_random_uuid()) into many from generate_series(1, 200);
    execute 'select count(*) from public.verified_circle_owners($1)' into n using many || c_star_pub;
    if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' cap ignored;'; end if;
  exception when others then bad := bad + 3; r := r || ' owners fn: ' || sqlerrm || ';';
  end;
  execute 'reset role';

  -- 25. Not callable signed out.
  execute 'set local role anon';
  begin
    execute 'select count(*) from public.verified_circle_owners($1)' into n using array[c_star_pub];
    bad := bad + 1; r := r || ' anon called owners fn;';
  exception when others then
    if sqlstate = '42501' then ok := ok + 1; else bad := bad + 1; r := r || ' anon: ' || sqlerrm || ';'; end if;
  end;
  execute 'reset role';

  -- 26..27. Admin turns it off: the function stops returning the star at once.
  begin
    execute 'update public.profiles set verified = false where user_id = $1' using u_star;
    get diagnostics n = row_count;
    if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' admin off rows=' || n || ';'; end if;
    execute 'select count(*) from public.verified_circle_owners($1)' into n using array[c_star_pub];
    if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' still listed after off;'; end if;
  exception when others then bad := bad + 2; r := r || ' admin off: ' || sqlerrm || ';';
  end;

  -- 28. A sign-up whose name carries check marks (the form, or Google / Apple, copied by
  --     handle_new_user) still succeeds, with the symbols removed.
  insert into auth.users (id, email, raw_user_meta_data, aud, role, created_at) values
    (u_sys, 'vb-sys@lysm-test.invalid', jsonb_build_object('display_name', U&'Ana \2705 Lee \2714\FE0F'), 'authenticated', 'authenticated', now());
  select display_name into s from public.profiles where user_id = u_sys;
  if s = 'Ana Lee' then ok := ok + 1; else bad := bad + 1; r := r || ' sign-up name=' || coalesce(s, 'null') || ';'; end if;
  -- 29. A name that is only check marks leaves the name empty (the app then fills it).
  insert into auth.users (id, email, raw_user_meta_data, aud, role, created_at) values
    (u_sys2, 'vb-sys2@lysm-test.invalid', jsonb_build_object('display_name', U&'\2713\2713'), 'authenticated', 'authenticated', now());
  select display_name into s from public.profiles where user_id = u_sys2;
  if s is null then ok := ok + 1; else bad := bad + 1; r := r || ' check-only name=' || s || ';'; end if;
  -- 30. An admin typing one gets it removed too.
  update public.profiles set display_name = U&'Pat \2611\FE0F Plain' where user_id = u_plain;
  select display_name into s from public.profiles where user_id = u_plain;
  if s = 'Pat Plain' then ok := ok + 1; else bad := bad + 1; r := r || ' admin name=' || coalesce(s, 'null') || ';'; end if;

  -- 31. App users have no UPDATE right on the column at all (first line of defence).
  select count(*) into n from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'profiles' and column_name = 'verified'
     and grantee in ('authenticated') and privilege_type = 'UPDATE';
  if n = 0 and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'verified')
  then ok := ok + 1; else bad := bad + 1; r := r || ' column grant/exists check;'; end if;

  raise exception 'ROLLED BACK. ok=% bad=% %', ok, bad, r;
end
$test$;
