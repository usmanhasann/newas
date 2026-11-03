-- Live circles (N1, client revisions 10/14 p.7): every change a circle's members can see sends one
-- small signal on the circle's private Realtime topic, and only the circle's members may listen.
-- Verifies migration 20261022030000_circle_posts_live AFTER it is applied: run against the database
-- (Management API query or psql). Everything runs in ONE DO block that always ends with RAISE EXCEPTION,
-- so nothing it creates is kept (and nothing is ever broadcast: Realtime only sees committed rows).
-- The signals are captured by swapping circle_posts_live_send for a recorder inside the block (after
-- checking the real one calls realtime.send), so the result doesn't depend on Realtime having
-- created today's realtime.messages partition. When that partition exists, one real send is also
-- checked end to end (reported as "e2e ok"; "e2e skipped" otherwise).
-- Expected: the error "ROLLED BACK. ok=28 bad=0" (followed by e2e ok / e2e skipped). On a database
-- without the migration most checks fail (2026-10-20 on the live database: ok=6 bad=22 without it,
-- ok=28 bad=0 with the migration inserted at the marker below, all rolled back).
do $test$
declare
  r text := '';
  ok int := 0;
  bad int := 0;
  n int;
  can boolean;
  def text;
  u_owner uuid := gen_random_uuid(); u_mem uuid := gen_random_uuid(); u_out uuid := gen_random_uuid();
  c uuid; c_other uuid;
  p uuid; rep uuid; rep2 uuid; p2 uuid; p3 uuid; e uuid;
  before_n int;
begin
  -- @migration (pre-deploy runs insert the migration here; after deploy it is already applied)

  -- ===== Wiring =====
  select pg_get_functiondef(f.oid) into def from pg_proc f
   where f.oid = to_regprocedure('public.circle_posts_live_send(uuid,jsonb)');
  if def like '%realtime.send(p_payload, ''post'', ''circle-posts:'' || p_circle::text, true)%' then ok := ok + 1;
  else bad := bad + 1; r := r || ' send helper missing or wrong;'; end if;
  -- Nobody can send signals themselves (only the trigger, as the function owner).
  if to_regprocedure('public.circle_posts_live_send(uuid,jsonb)') is not null
     and not has_function_privilege('authenticated', 'public.circle_posts_live_send(uuid,jsonb)', 'execute')
     and not has_function_privilege('anon', 'public.circle_posts_live_send(uuid,jsonb)', 'execute')
  then ok := ok + 1; else bad := bad + 1; r := r || ' send helper callable by users;'; end if;
  if exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages'
             and policyname = 'circle_posts_live_members_listen' and cmd = 'SELECT'
             and roles = '{authenticated}' and qual like '%can_listen_to_circle_posts%')
  then ok := ok + 1; else bad := bad + 1; r := r || ' listen policy missing;'; end if;

  -- ===== End to end, when Realtime has created today's partition (real row, real policy) =====
  if to_regprocedure('public.circle_posts_live_send(uuid,jsonb)') is not null and exists (
       select 1 from pg_inherits i join pg_class k on k.oid = i.inhrelid
        where i.inhparent = 'realtime.messages'::regclass
          and now()::timestamp >= (regexp_match(pg_get_expr(k.relpartbound, k.oid), 'FROM \(''([^'']+)''\)'))[1]::timestamp
          and now()::timestamp < (regexp_match(pg_get_expr(k.relpartbound, k.oid), 'TO \(''([^'']+)''\)'))[1]::timestamp) then
    insert into auth.users (id, email, aud, role, created_at) values
      (gen_random_uuid(), 'live-e2e@lysm-test.invalid', 'authenticated', 'authenticated', now()) returning id into e;
    insert into public.circles (owner_id, name, type) values (e, 'Live e2e', 'private') returning id into c;
    insert into public.circle_posts (circle_id, author_id, body) values (c, e, 'e2e') returning id into p;
    if exists (select 1 from realtime.messages m where m.topic = 'circle-posts:' || c::text and m.private
               and m.event = 'post' and m.extension = 'broadcast' and m.payload @> jsonb_build_object('op', 'insert', 'post_id', p)) then
      perform set_config('realtime.topic', 'circle-posts:' || c::text, true);
      perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      select exists (select 1 from realtime.messages m where m.topic = 'circle-posts:' || c::text) into can;
      execute 'reset role';
      if can then r := r || ' e2e ok;'; else bad := bad + 1; r := r || ' e2e member cannot read the signal;'; end if;
    else
      bad := bad + 1; r := r || ' e2e no realtime.messages row;';
    end if;
  else
    r := r || ' e2e skipped (no realtime.messages partition for today yet);';
  end if;

  -- ===== Capture signals: swap the sender for a recorder (rolled back with everything else) =====
  create temp table live_sent (circle uuid, payload jsonb) on commit drop;
  create or replace function public.circle_posts_live_send(p_circle uuid, p_payload jsonb)
  returns void language sql security definer set search_path = public, pg_temp
  as $f$ insert into live_sent values (p_circle, p_payload) $f$;

  insert into auth.users (id, email, raw_user_meta_data, aud, role, created_at) values
    (u_owner, 'live-owner@lysm-test.invalid', '{"display_name":"Konah"}', 'authenticated', 'authenticated', now()),
    (u_mem, 'live-mem@lysm-test.invalid', '{"display_name":"Auguste"}', 'authenticated', 'authenticated', now()),
    (u_out, 'live-out@lysm-test.invalid', '{"display_name":"Outsider"}', 'authenticated', 'authenticated', now());
  insert into public.circles (owner_id, name, type) values (u_owner, 'Live private', 'private') returning id into c;
  insert into public.circles (owner_id, name, type) values (u_owner, 'Live other', 'private') returning id into c_other;
  insert into public.circle_members (circle_id, user_id, role, status) values (c, u_mem, 'member', 'approved')
  on conflict do nothing;

  -- 1. A new post: one "insert" signal for this circle, ids and counts only.
  insert into public.circle_posts (circle_id, author_id, body) values (c, u_owner, 'Walk at 5?') returning id into p;
  select count(*) into n from live_sent s where s.circle = c;
  if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' post signals=' || n || ';'; end if;
  if exists (select 1 from live_sent s where s.circle = c
             and s.payload = jsonb_build_object('op', 'insert', 'post_id', p, 'parent_id', null, 'like_count', 0, 'reply_count', 0, 'edited', false))
  then ok := ok + 1; else bad := bad + 1; r := r || ' post insert payload wrong;'; end if;
  -- Never the text or who wrote it (members who joined later must not learn about older threads).
  if not exists (select 1 from live_sent s
                 where s.payload ? 'body' or s.payload ? 'author_id' or s.payload::text like '%Walk at 5%')
  then ok := ok + 1; else bad := bad + 1; r := r || ' payload leaks content;'; end if;

  -- 2. A member's reply, through RLS as that member: the reply's signal AND its post's new count.
  perform set_config('request.jwt.claims', json_build_object('sub', u_mem, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.circle_posts (circle_id, author_id, parent_id, body) values (c, u_mem, p, 'Yes!') returning id into rep;
  execute 'reset role';
  if exists (select 1 from live_sent s where s.circle = c
             and s.payload @> jsonb_build_object('op', 'insert', 'post_id', rep, 'parent_id', p))
  then ok := ok + 1; else bad := bad + 1; r := r || ' reply insert missing;'; end if;
  if exists (select 1 from live_sent s where s.circle = c
             and s.payload @> jsonb_build_object('op', 'update', 'post_id', p, 'reply_count', 1, 'edited', false))
  then ok := ok + 1; else bad := bad + 1; r := r || ' reply count update missing;'; end if;

  -- 3. A heart: the post's new like count. Un-heart: back to 0.
  insert into public.post_reactions (post_id, user_id) values (p, u_mem);
  if exists (select 1 from live_sent s where s.circle = c
             and s.payload @> jsonb_build_object('op', 'update', 'post_id', p, 'like_count', 1))
  then ok := ok + 1; else bad := bad + 1; r := r || ' heart update missing;'; end if;
  delete from public.post_reactions where post_id = p and user_id = u_mem;
  if exists (select 1 from live_sent s where s.circle = c
             and s.payload @> jsonb_build_object('op', 'update', 'post_id', p, 'like_count', 0, 'reply_count', 1))
  then ok := ok + 1; else bad := bad + 1; r := r || ' unheart update missing;'; end if;

  -- 4. An edit (a shared entry's text changing): "update" with edited = true.
  update public.circle_posts set body = 'Walk at 6?' where id = p;
  if exists (select 1 from live_sent s where s.circle = c
             and s.payload @> jsonb_build_object('op', 'update', 'post_id', p, 'edited', true))
  then ok := ok + 1; else bad := bad + 1; r := r || ' edit missing;'; end if;

  -- 5. Nothing visible changed: no signal.
  select count(*) into before_n from live_sent;
  update public.circle_posts set body = 'Walk at 6?' where id = p;
  update public.circle_posts set reply_to_id = null where id = p;
  select count(*) into n from live_sent;
  if n = before_n then ok := ok + 1; else bad := bad + 1; r := r || ' no-op update signalled ' || (n - before_n) || ';'; end if;

  -- 6. Moderation removes the reply (soft delete): "delete" for it, and the post's count drops.
  update public.circle_posts set deleted_at = now(), deleted_reason = 'test' where id = rep;
  if exists (select 1 from live_sent s where s.circle = c
             and s.payload @> jsonb_build_object('op', 'delete', 'post_id', rep, 'parent_id', p))
  then ok := ok + 1; else bad := bad + 1; r := r || ' removed reply missing;'; end if;
  if exists (select 1 from live_sent s where s.circle = c
             and s.payload @> jsonb_build_object('op', 'update', 'post_id', p, 'reply_count', 0))
  then ok := ok + 1; else bad := bad + 1; r := r || ' count after removal missing;'; end if;
  -- Hard-deleting the already-removed reply: members already saw it go, so no signal.
  select count(*) into before_n from live_sent;
  delete from public.circle_posts where id = rep;
  select count(*) into n from live_sent;
  if n = before_n then ok := ok + 1; else bad := bad + 1; r := r || ' removed row delete signalled;'; end if;

  -- 7. Deleting a post with a reply under it: ONE "delete" for the post, nothing for the reply.
  insert into public.circle_posts (circle_id, author_id, parent_id, body) values (c, u_mem, p, 'Me too') returning id into rep2;
  select count(*) into before_n from live_sent;
  delete from public.circle_posts where id = p;
  select count(*) into n from live_sent;
  if n = before_n + 1 then ok := ok + 1; else bad := bad + 1; r := r || ' post delete signals=' || (n - before_n) || ';'; end if;
  if exists (select 1 from live_sent s where s.circle = c
             and s.payload @> jsonb_build_object('op', 'delete', 'post_id', p, 'parent_id', null))
  then ok := ok + 1; else bad := bad + 1; r := r || ' post delete missing;'; end if;
  if not exists (select 1 from live_sent s where s.payload @> jsonb_build_object('op', 'delete', 'post_id', rep2))
  then ok := ok + 1; else bad := bad + 1; r := r || ' cascaded reply signalled;'; end if;

  -- 8. A shared reflection that isn't ready (body null, only its author sees it): no signal; when
  --    its text arrives it becomes an "insert" for everyone.
  select count(*) into before_n from live_sent;
  insert into public.journal_entries (user_id, mood_slug, local_date, note)
    values (u_owner, 'calm', current_date, 'Slowed down today.') returning id into e;
  insert into public.circle_posts (circle_id, author_id, entry_id, entry_version)
    values (c, u_owner, e, 'reflection') returning id into p2;
  select count(*) into n from live_sent;
  if n = before_n and (select body from public.circle_posts where id = p2) is null then ok := ok + 1;
  else bad := bad + 1; r := r || ' hidden post signalled;'; end if;
  update public.circle_posts set body = 'A reflection' where id = p2;
  if exists (select 1 from live_sent s where s.circle = c
             and s.payload @> jsonb_build_object('op', 'insert', 'post_id', p2))
  then ok := ok + 1; else bad := bad + 1; r := r || ' newly visible post missing;'; end if;

  -- 9. Each circle has its own topic.
  insert into public.circle_posts (circle_id, author_id, body) values (c_other, u_owner, 'elsewhere') returning id into p3;
  if exists (select 1 from live_sent s where s.circle = c_other and s.payload @> jsonb_build_object('post_id', p3))
     and not exists (select 1 from live_sent s where s.circle = c and s.payload @> jsonb_build_object('post_id', p3))
  then ok := ok + 1; else bad := bad + 1; r := r || ' topic per circle wrong;'; end if;

  -- 10. Deleting a whole circle sends nothing for its posts.
  select count(*) into before_n from live_sent;
  delete from public.circles where id = c_other;
  select count(*) into n from live_sent;
  if n = before_n then ok := ok + 1; else bad := bad + 1; r := r || ' circle delete signalled;'; end if;

  -- 11. Who may listen (what the realtime.messages policy asks): the circle's members, nobody else.
  perform set_config('request.jwt.claims', json_build_object('sub', u_mem, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    can := public.can_listen_to_circle_posts('circle-posts:' || c::text);
  exception when others then can := null;
  end;
  execute 'reset role';
  if can then ok := ok + 1; else bad := bad + 1; r := r || ' member cannot listen;'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', u_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    can := public.can_listen_to_circle_posts('circle-posts:' || c::text);
  exception when others then can := null;
  end;
  execute 'reset role';
  if can then ok := ok + 1; else bad := bad + 1; r := r || ' owner cannot listen;'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', u_out, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    can := public.can_listen_to_circle_posts('circle-posts:' || c::text);
  exception when others then can := null;
  end;
  execute 'reset role';
  if can = false then ok := ok + 1; else bad := bad + 1; r := r || ' outsider can listen;'; end if;

  -- Someone removed from the circle stops being allowed.
  delete from public.circle_members where circle_id = c and user_id = u_mem;
  perform set_config('request.jwt.claims', json_build_object('sub', u_mem, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    can := public.can_listen_to_circle_posts('circle-posts:' || c::text);
  exception when others then can := null;
  end;
  execute 'reset role';
  if can = false then ok := ok + 1; else bad := bad + 1; r := r || ' former member can listen;'; end if;

  -- Malformed or other topics are refused even for the owner.
  perform set_config('request.jwt.claims', json_build_object('sub', u_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    can := public.can_listen_to_circle_posts('circle-posts:not-a-uuid')
        or public.can_listen_to_circle_posts('other:' || c::text)
        or coalesce(public.can_listen_to_circle_posts(null), false);
  exception when others then can := null;
  end;
  execute 'reset role';
  if can = false then ok := ok + 1; else bad := bad + 1; r := r || ' malformed topic allowed;'; end if;

  -- Anonymous visitors can't use the check at all.
  if to_regprocedure('public.can_listen_to_circle_posts(text)') is not null
     and not has_function_privilege('anon', 'public.can_listen_to_circle_posts(text)', 'execute')
  then ok := ok + 1; else bad := bad + 1; r := r || ' anon can call the listen check;'; end if;

  raise exception 'ROLLED BACK. ok=% bad=% %', ok, bad, r;
end
$test$;
