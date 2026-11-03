-- Circle descriptions max 150 characters (O13, client revisions 10/14 p.29) and members can leave an
-- ARCHIVED circle (O30, p.17).
-- Verifies migration 20261021120500_circle_description_limit AFTER it is applied: run against the database
-- (Management API query or psql). Everything runs in ONE DO block that always ends with RAISE EXCEPTION,
-- so nothing it creates is kept. Expected: the error "ROLLED BACK. ok=12 bad=0". On a database without
-- the migration the two 151-character checks fail; the O30 leave checks pin what already works.
do $test$
declare
  r text := '';
  ok int := 0;
  bad int := 0;
  n int;
  u_owner uuid := gen_random_uuid(); u_a uuid := gen_random_uuid(); u_b uuid := gen_random_uuid();
  c_priv uuid; c_pub uuid;
begin
  -- @migration (pre-deploy runs insert the migration here; after deploy it is already applied)

  insert into auth.users (id, email, raw_user_meta_data, aud, role, created_at) values
    (u_owner, 'cd-owner@lysm-test.invalid', '{"display_name":"Owner"}', 'authenticated', 'authenticated', now()),
    (u_a, 'cd-a@lysm-test.invalid', '{"display_name":"Asha"}', 'authenticated', 'authenticated', now()),
    (u_b, 'cd-b@lysm-test.invalid', '{"display_name":"Ben"}', 'authenticated', 'authenticated', now());
  insert into public.circles (owner_id, name, type) values (u_owner, 'CD private', 'private') returning id into c_priv;
  insert into public.circles (owner_id, name, type) values (u_owner, 'CD public', 'public') returning id into c_pub;
  insert into public.circle_members (circle_id, user_id, role, status) values
    (c_priv, u_a, 'member', 'approved'), (c_priv, u_b, 'member', 'approved'),
    (c_pub, u_a, 'member', 'approved'), (c_pub, u_b, 'member', 'approved')
  on conflict do nothing;
  -- Both circles archived (what the owner's Archive button does).
  update public.circles set archived_at = now() where id in (c_priv, c_pub);

  -- ===== O30: sign in as member Asha (RLS applies) =====
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into n from public.circles where id = c_priv;
  if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' archived private not visible to member;'; end if;

  -- Control: a member can't remove someone else (proves RLS is on in this test).
  delete from public.circle_members where circle_id = c_priv and user_id = u_b;
  get diagnostics n = row_count;
  if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' member removed someone else;'; end if;

  -- The app's leaveCircle query, on the ARCHIVED private circle.
  delete from public.circle_members where circle_id = c_priv and user_id = u_a;
  get diagnostics n = row_count;
  if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' leave archived private rows=' || n || ';'; end if;

  select count(*) into n from public.circles where id = c_priv;
  if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' private still visible after leaving;'; end if;

  -- The same on the ARCHIVED public circle.
  delete from public.circle_members where circle_id = c_pub and user_id = u_a;
  get diagnostics n = row_count;
  if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' leave archived public rows=' || n || ';'; end if;

  execute 'reset role';
  -- Member counts follow (owner + Ben left in each).
  select member_count into n from public.circles where id = c_priv;
  if n = 2 then ok := ok + 1; else bad := bad + 1; r := r || ' private count=' || n || ';'; end if;
  select member_count into n from public.circles where id = c_pub;
  if n = 2 then ok := ok + 1; else bad := bad + 1; r := r || ' public count=' || n || ';'; end if;

  -- ===== O13: 150 character description cap, as the owner through RLS =====
  perform set_config('request.jwt.claims', json_build_object('sub', u_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  update public.circles set description = repeat('a', 150) where id = c_pub;
  get diagnostics n = row_count;
  if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' 150 refused;'; end if;

  begin
    update public.circles set description = repeat('a', 151) where id = c_pub;
    bad := bad + 1; r := r || ' 151 update accepted;';
  exception when check_violation then ok := ok + 1;
  end;

  begin
    insert into public.circles (owner_id, name, type, description) values (u_owner, 'CD long', 'public', repeat('b', 151));
    bad := bad + 1; r := r || ' 151 insert accepted;';
  exception when check_violation then ok := ok + 1;
  end;

  -- An emoji is one character here (two in the app's count), so whatever the app allows passes.
  update public.circles set description = repeat(U&'\+01F33F', 150) where id = c_pub;
  get diagnostics n = row_count;
  if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' 150 emoji refused;'; end if;

  -- No description at all stays allowed.
  update public.circles set description = null where id = c_pub;
  get diagnostics n = row_count;
  if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' null refused;'; end if;

  execute 'reset role';
  raise exception 'ROLLED BACK. ok=% bad=% %', ok, bad, r;
end
$test$;
