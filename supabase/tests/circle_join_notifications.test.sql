-- Join notifications for Public circle owners (N10, client revisions 10/14 p.9).
-- Verifies migration 20261022042000_circle_join_notifications AFTER it is applied: run against the
-- database (Management API query or psql). Everything runs in ONE DO block that always ends with
-- RAISE EXCEPTION, so nothing it creates is kept. Expected: the error "ROLLED BACK. ok=13 bad=0".
-- On a database without the migration every check fails (bad=13).
do $test$
declare
  r text := '';
  ok int := 0;
  bad int := 0;
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); u3 uuid := gen_random_uuid();
  u4 uuid := gen_random_uuid(); u5 uuid := gen_random_uuid();
  cp uuid; cq uuid;
  p_code text;
  n int;
  rec record;
  res json;
  due uuid[];
  flag boolean;
begin
  -- @migration (pre-deploy runs insert the migration here; after deploy it is already applied)

  insert into auth.users (id, email, raw_user_meta_data, aud, role, created_at) values
    (u1, 'n10a@lysm-test.invalid', '{"display_name":"Konah"}', 'authenticated', 'authenticated', now()),
    (u2, 'n10b@lysm-test.invalid', '{"display_name":"Ana"}', 'authenticated', 'authenticated', now()),
    (u3, 'n10c@lysm-test.invalid', '{"display_name":"Auguste"}', 'authenticated', 'authenticated', now()),
    (u4, 'n10d@lysm-test.invalid', '{"display_name":"Bea"}', 'authenticated', 'authenticated', now()),
    (u5, 'n10e@lysm-test.invalid', '{"display_name":"Cy"}', 'authenticated', 'authenticated', now());
  insert into public.circles (owner_id, name, type) values (u1, 'Book club', 'public') returning id, invite_code into cp, p_code;
  insert into public.circles (owner_id, name, type) values (u1, 'N10 private', 'private') returning id into cq;

  -- 1. The owner's "New members" switch exists and starts on.
  begin
    insert into public.circle_notification_prefs (user_id, circle_id) values (u1, cp);
    execute 'select new_members from public.circle_notification_prefs where user_id = $1 and circle_id = $2' into flag using u1, cp;
    if flag then ok := ok + 1; else bad := bad + 1; r := r || ' switch=' || coalesce(flag::text, 'null') || ';'; end if;
  exception when others then bad := bad + 1; r := r || ' switch: ' || sqlerrm || ';';
  end;

  -- 2. Creating the circle (the owner's own membership) queues nothing.
  begin
    execute 'select count(*) from public.circle_join_queue where circle_id = $1' into n using cp;
    if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' owner queued;'; end if;
  exception when others then bad := bad + 1; r := r || ' owner: ' || sqlerrm || ';';
  end;

  -- 3. Joining from Discover (open join, through RLS) and with the invite code both queue the join.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into public.circle_members (circle_id, user_id, role, status) values (cp, u2, 'member', 'approved');
    execute 'reset role';
    perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    res := public.redeem_invite_code(p_code);
    -- Using the code again while already in: not a new join.
    res := public.redeem_invite_code(p_code);
    execute 'reset role';
    execute 'select count(*) from public.circle_join_queue where circle_id = $1' into n using cp;
    if n = 2 then ok := ok + 1; else bad := bad + 1; r := r || ' queued=' || n || ';'; end if;
  exception when others then execute 'reset role'; bad := bad + 1; r := r || ' join: ' || sqlerrm || ';';
  end;

  -- 4. Private circles have no join notifications (the owner approves every request there).
  begin
    perform set_config('request.jwt.claims', '', true);
    insert into public.circle_members (circle_id, user_id, role, status) values (cq, u2, 'member', 'approved');
    execute 'select count(*) from public.circle_join_queue where circle_id = $1' into n using cq;
    if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' private queued;'; end if;
  exception when others then bad := bad + 1; r := r || ' private: ' || sqlerrm || ';';
  end;

  -- 5. The first claim takes both joins: names the newest joiner, counts 2, empties the queue.
  begin
    execute 'update public.circle_join_queue set joined_at = now() - interval ''1 minute'' where circle_id = $1 and user_id = $2' using cp, u2;
    execute 'select * from public.claim_circle_join_digest($1)' into rec using cp;
    if rec.owner_id = u1 and rec.circle_name = 'Book club' and rec.latest_user_id = u3 and rec.joined_count = 2
    then ok := ok + 1; else bad := bad + 1; r := r || ' claim=' || coalesce(row_to_json(rec)::text, 'null') || ';'; end if;
    execute 'select count(*) from public.circle_join_queue where circle_id = $1' into n using cp;
    if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' queue left=' || n || ';'; end if;
  exception when others then bad := bad + 2; r := r || ' claim: ' || sqlerrm || ';';
  end;

  -- 6. Within 10 minutes of that push, a new join waits (nothing claimed, still queued, not due).
  begin
    insert into public.circle_members (circle_id, user_id, role, status) values (cp, u4, 'member', 'approved');
    execute 'select * from public.claim_circle_join_digest($1)' into rec using cp;
    execute 'select count(*) from public.circle_join_queue where circle_id = $1' into n using cp;
    execute 'select array(select public.due_circle_join_digests(500))' into due;
    if rec.owner_id is null and n = 1 and not (cp = any (due)) then ok := ok + 1;
    else bad := bad + 1; r := r || ' cooldown broken (queued=' || n || ');'; end if;
  exception when others then bad := bad + 1; r := r || ' cooldown: ' || sqlerrm || ';';
  end;

  -- 7. Once the 10 minutes are up it is due, and the claim announces it on its own.
  begin
    execute 'update public.circle_join_digests set last_sent_at = now() - interval ''11 minutes'' where circle_id = $1' using cp;
    execute 'select array(select public.due_circle_join_digests(500))' into due;
    if cp = any (due) then ok := ok + 1; else bad := bad + 1; r := r || ' not due;'; end if;
    execute 'select * from public.claim_circle_join_digest($1)' into rec using cp;
    if rec.latest_user_id = u4 and rec.joined_count = 1 then ok := ok + 1;
    else bad := bad + 1; r := r || ' late claim=' || coalesce(row_to_json(rec)::text, 'null') || ';'; end if;
  exception when others then bad := bad + 2; r := r || ' due: ' || sqlerrm || ';';
  end;

  -- 8. Someone who joined and left again before the push isn't announced (the queue is still used up).
  begin
    insert into public.circle_members (circle_id, user_id, role, status) values (cp, u5, 'member', 'approved');
    delete from public.circle_members where circle_id = cp and user_id = u5;
    execute 'update public.circle_join_digests set last_sent_at = now() - interval ''11 minutes'' where circle_id = $1' using cp;
    execute 'select * from public.claim_circle_join_digest($1)' into rec using cp;
    execute 'select count(*) from public.circle_join_queue where circle_id = $1' into n using cp;
    if rec.owner_id is null and n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' left joiner announced or kept;'; end if;
  exception when others then bad := bad + 1; r := r || ' left: ' || sqlerrm || ';';
  end;

  -- 9. Nothing for a Private circle.
  begin
    execute 'select * from public.claim_circle_join_digest($1)' into rec using cq;
    if rec.owner_id is null then ok := ok + 1; else bad := bad + 1; r := r || ' private claimed;'; end if;
  exception when others then bad := bad + 1; r := r || ' private claim: ' || sqlerrm || ';';
  end;

  -- 10. Only the server: the app can't claim, list, or read the queue.
  begin
    if not has_function_privilege('authenticated', 'public.claim_circle_join_digest(uuid)', 'execute')
       and not has_function_privilege('authenticated', 'public.due_circle_join_digests(integer)', 'execute')
       and not has_table_privilege('authenticated', 'public.circle_join_queue', 'select')
       and not has_table_privilege('authenticated', 'public.circle_join_digests', 'select')
    then ok := ok + 1; else bad := bad + 1; r := r || ' app has access;'; end if;
  exception when others then bad := bad + 1; r := r || ' grants: ' || sqlerrm || ';';
  end;

  -- 11. A member can save the switch off for their own circle (the bell screen).
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    execute 'update public.circle_notification_prefs set new_members = false where user_id = $1 and circle_id = $2' using u1, cp;
    execute 'reset role';
    execute 'select new_members from public.circle_notification_prefs where user_id = $1 and circle_id = $2' into flag using u1, cp;
    if flag = false then ok := ok + 1; else bad := bad + 1; r := r || ' switch not saved;'; end if;
  exception when others then execute 'reset role'; bad := bad + 1; r := r || ' save switch: ' || sqlerrm || ';';
  end;

  raise exception 'ROLLED BACK. ok=% bad=% %', ok, bad, r;
end
$test$;
