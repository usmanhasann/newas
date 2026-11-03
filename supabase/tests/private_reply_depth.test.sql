-- Private circles reply like Public (client revisions 10/14 p.6).
-- Verifies migration 20261020100000_private_reply_depth AFTER it is applied: run against the database
-- (Management API query or psql). Everything runs in ONE DO block that always ends with RAISE EXCEPTION,
-- so nothing it creates is kept. Expected: the error "ROLLED BACK. ok=7 bad=0".
do $test$
declare
  r text := '';
  ok int := 0;
  bad int := 0;
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid();
  c_priv uuid; c_pub uuid;
  p0 uuid; r1 uuid; r2 uuid; r3 uuid;
  q0 uuid; s1 uuid; s2 uuid; s3 uuid;
  par uuid; rto uuid; men uuid;
begin


  insert into auth.users (id, email, raw_user_meta_data, aud, role, created_at) values
    (u1, 'o3a@lysm-test.invalid', '{"display_name":"Asha"}', 'authenticated', 'authenticated', now()),
    (u2, 'o3b@lysm-test.invalid', '{"display_name":"Auguste"}', 'authenticated', 'authenticated', now());
  insert into public.circles (owner_id, name, type) values (u1, 'O3 private', 'private') returning id into c_priv;
  insert into public.circles (owner_id, name, type) values (u1, 'O3 public', 'public') returning id into c_pub;
  insert into public.circle_members (circle_id, user_id, role, status) values
    (c_priv, u2, 'member', 'approved'), (c_pub, u2, 'member', 'approved')
  on conflict do nothing;

  -- PRIVATE: my post > Auguste's reply > my reply to Auguste > Auguste's reply to that.
  insert into public.circle_posts (circle_id, author_id, body) values (c_priv, u1, 'post') returning id into p0;
  insert into public.circle_posts (circle_id, author_id, parent_id, body) values (c_priv, u2, p0, 'r1') returning id into r1;
  insert into public.circle_posts (circle_id, author_id, parent_id, body) values (c_priv, u1, r1, 'r2') returning id into r2;
  insert into public.circle_posts (circle_id, author_id, parent_id, body) values (c_priv, u2, r2, 'r3') returning id into r3;

  select parent_id, reply_to_id, mention_user_id into par, rto, men from public.circle_posts where id = r1;
  if par = p0 and rto is null and men is null then ok := ok + 1; else bad := bad + 1; r := r || ' priv-r1 wrong;'; end if;
  -- THE FIX: a reply to Auguste's reply is attached to Auguste's reply (not moved under the post).
  select parent_id, reply_to_id, mention_user_id into par, rto, men from public.circle_posts where id = r2;
  if par = r1 and rto is null and men is null then ok := ok + 1; else bad := bad + 1; r := r || ' priv-r2 parent=' || coalesce(par::text,'null') || ';'; end if;
  -- Deeper than that: joins the same group, tagged "@" the person answered (as Public does).
  select parent_id, reply_to_id, mention_user_id into par, rto, men from public.circle_posts where id = r3;
  if par = r1 and rto = r2 and men = u1 then ok := ok + 1; else bad := bad + 1; r := r || ' priv-r3 wrong;'; end if;

  -- PUBLIC: unchanged.
  insert into public.circle_posts (circle_id, author_id, body) values (c_pub, u1, 'prompt') returning id into q0;
  insert into public.circle_posts (circle_id, author_id, parent_id, body) values (c_pub, u2, q0, 's1') returning id into s1;
  insert into public.circle_posts (circle_id, author_id, parent_id, body) values (c_pub, u1, s1, 's2') returning id into s2;
  insert into public.circle_posts (circle_id, author_id, parent_id, body) values (c_pub, u2, s2, 's3') returning id into s3;
  select parent_id into par from public.circle_posts where id = s2;
  if par = s1 then ok := ok + 1; else bad := bad + 1; r := r || ' pub-s2 wrong;'; end if;
  select parent_id, reply_to_id, mention_user_id into par, rto, men from public.circle_posts where id = s3;
  if par = s1 and rto = s2 and men = u1 then ok := ok + 1; else bad := bad + 1; r := r || ' pub-s3 wrong;'; end if;

  -- Reply counts and the thread total follow the deeper Private thread.
  if (select reply_count from public.circle_posts where id = r1) = 2 then ok := ok + 1; else bad := bad + 1; r := r || ' r1 count=' || (select reply_count from public.circle_posts where id = r1) || ';'; end if;
  -- The total counts what the signed-in person can see: sign in as the circle's owner.
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  if public.circle_post_reply_total(p0) = 3 then ok := ok + 1; else bad := bad + 1; r := r || ' total=' || public.circle_post_reply_total(p0) || ';'; end if;

  raise exception 'ROLLED BACK. ok=% bad=% %', ok, bad, r;
end
$test$;
