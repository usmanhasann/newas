-- Archiving and unarchiving, Public and Private circles (N3, client revisions 10/14 p.23-24).
-- Verifies migration 20261022041000_circle_archiving AFTER it is applied: run against the database
-- (Management API query or psql). Everything runs in ONE DO block that always ends with RAISE
-- EXCEPTION, so nothing it creates is kept. Expected: the error "ROLLED BACK. ok=23 bad=0".
-- On a database without the migration most checks fail.
do $test$
declare
  r text := '';
  ok int := 0;
  bad int := 0;
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid();
  u3 uuid := gen_random_uuid(); u4 uuid := gen_random_uuid();
  cp uuid; cq uuid; cr uuid;
  p_code text; q_code text;
  prompt uuid;
  k text;
  n int;
  i int;
  claimed int;
  res json;
begin
  -- @migration (pre-deploy runs insert the migration here; after deploy it is already applied)

  insert into auth.users (id, email, raw_user_meta_data, aud, role, created_at) values
    (u1, 'n3a@lysm-test.invalid', '{"display_name":"Konah"}', 'authenticated', 'authenticated', now()),
    (u2, 'n3b@lysm-test.invalid', '{"display_name":"Auguste"}', 'authenticated', 'authenticated', now()),
    (u3, 'n3c@lysm-test.invalid', '{"display_name":"Newcomer"}', 'authenticated', 'authenticated', now()),
    (u4, 'n3d@lysm-test.invalid', '{"display_name":"Asker"}', 'authenticated', 'authenticated', now());
  insert into public.circles (owner_id, name, type) values (u1, 'N3 public', 'public') returning id, invite_code into cp, p_code;
  insert into public.circles (owner_id, name, type) values (u1, 'N3 private', 'private') returning id, invite_code into cq, q_code;
  insert into public.circles (owner_id, name, type) values (u1, 'N3 toggled', 'private') returning id into cr;
  insert into public.circle_members (circle_id, user_id, role, status) values
    (cp, u2, 'member', 'approved'), (cq, u2, 'member', 'approved'), (cq, u4, 'member', 'requested')
  on conflict do nothing;
  insert into public.circle_posts (circle_id, author_id, body) values (cp, u1, 'Prompt') returning id into prompt;

  -- 1. The owner archives the Public circle from the app; the server sets the time (not the phone).
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.circles set archived_at = '2001-01-01T00:00:00Z' where id = cp;
    execute 'reset role';
    if (select archived_at from public.circles where id = cp) = now() then ok := ok + 1;
    else bad := bad + 1; r := r || ' archived_at=' || coalesce((select archived_at from public.circles where id = cp)::text, 'null') || ';'; end if;
  exception when others then execute 'reset role'; bad := bad + 1; r := r || ' archive: ' || sqlerrm || ';';
  end;

  -- 2. The change is recorded once, as "archived".
  begin
    execute 'select count(*) from public.circle_archive_events where circle_id = $1 and kind = ''archived''' into n using cp;
    if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' archived events=' || n || ';'; end if;
  exception when others then bad := bad + 1; r := r || ' event: ' || sqlerrm || ';';
  end;

  -- 3. A member still opens it and reads everything.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    if exists (select 1 from public.circles where id = cp) and exists (select 1 from public.circle_posts where id = prompt)
    then ok := ok + 1; else bad := bad + 1; r := r || ' member lost access;'; end if;
    execute 'reset role';
  exception when others then execute 'reset role'; bad := bad + 1; r := r || ' member read: ' || sqlerrm || ';';
  end;

  -- 4. No one can reply anymore (before: replies were still allowed in an archived circle).
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      insert into public.circle_posts (circle_id, author_id, parent_id, body) values (cp, u2, prompt, 'reply');
      bad := bad + 1; r := r || ' reply allowed in archived;';
    exception when others then ok := ok + 1;
    end;
    execute 'reset role';
  exception when others then execute 'reset role'; bad := bad + 1; r := r || ' reply: ' || sqlerrm || ';';
  end;

  -- 5. ...and no new post either, the owner's included.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      insert into public.circle_posts (circle_id, author_id, body) values (cp, u1, 'New prompt');
      bad := bad + 1; r := r || ' prompt allowed in archived;';
    exception when others then ok := ok + 1;
    end;
    execute 'reset role';
  exception when others then execute 'reset role'; bad := bad + 1; r := r || ' prompt: ' || sqlerrm || ';';
  end;

  -- 6. It leaves Discover: someone not in it can't see it at all.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    if not exists (select 1 from public.circles where id = cp) then ok := ok + 1;
    else bad := bad + 1; r := r || ' archived public visible to outsider;'; end if;
    execute 'reset role';
  exception when others then execute 'reset role'; bad := bad + 1; r := r || ' discover: ' || sqlerrm || ';';
  end;

  -- 7. No one new joins: Discover's open join is refused...
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      insert into public.circle_members (circle_id, user_id, role, status) values (cp, u3, 'member', 'approved');
      bad := bad + 1; r := r || ' open join allowed;';
    exception when others then ok := ok + 1;
    end;
    execute 'reset role';
  exception when others then execute 'reset role'; bad := bad + 1; r := r || ' open join: ' || sqlerrm || ';';
  end;

  -- 8. ...and so is the invite code, with the reason "circle_archived".
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      res := public.redeem_invite_code(p_code);
      bad := bad + 1; r := r || ' code join allowed: ' || coalesce(res::text, 'null') || ';';
    exception when others then
      if sqlerrm = 'circle_archived' then ok := ok + 1; else bad := bad + 1; r := r || ' code join error=' || sqlerrm || ';'; end if;
    end;
    execute 'reset role';
  exception when others then execute 'reset role'; bad := bad + 1; r := r || ' code: ' || sqlerrm || ';';
  end;

  -- 9. Someone already in it who uses the code again is just told they're in.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    res := public.redeem_invite_code(p_code);
    execute 'reset role';
    if res->>'status' = 'approved' then ok := ok + 1; else bad := bad + 1; r := r || ' member code=' || coalesce(res::text, 'null') || ';'; end if;
  exception when others then execute 'reset role'; bad := bad + 1; r := r || ' member code: ' || sqlerrm || ';';
  end;

  -- 10. Members can still leave an archived circle.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    delete from public.circle_members where circle_id = cp and user_id = u2;
    execute 'reset role';
    if not exists (select 1 from public.circle_members where circle_id = cp and user_id = u2) then ok := ok + 1;
    else bad := bad + 1; r := r || ' could not leave;'; end if;
    -- Put them back (as the database, for the next checks).
    perform set_config('request.jwt.claims', '', true);
    insert into public.circle_members (circle_id, user_id, role, status) values (cp, u2, 'member', 'approved');
  exception when others then execute 'reset role'; bad := bad + 1; r := r || ' leave: ' || sqlerrm || ';';
  end;

  -- 11. Archived Private circle: a new request to join is refused too.
  begin
    update public.circles set archived_at = now() where id = cq;
    perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      res := public.redeem_invite_code(q_code);
      bad := bad + 1; r := r || ' private request allowed;';
    exception when others then ok := ok + 1;
    end;
    execute 'reset role';
  exception when others then execute 'reset role'; bad := bad + 1; r := r || ' private request: ' || sqlerrm || ';';
  end;

  -- 12. The push is claimed exactly once per change, and only with the service role's function.
  begin
    execute 'select public.claim_circle_archive_push($1)' into k using cp;
    if k = 'archived' then ok := ok + 1; else bad := bad + 1; r := r || ' claim=' || coalesce(k, 'null') || ';'; end if;
    execute 'select public.claim_circle_archive_push($1)' into k using cp;
    if k is null then ok := ok + 1; else bad := bad + 1; r := r || ' second claim=' || k || ';'; end if;
  exception when others then bad := bad + 2; r := r || ' claim: ' || sqlerrm || ';';
  end;
  begin
    if not has_function_privilege('authenticated', 'public.claim_circle_archive_push(uuid)', 'execute')
       and not has_table_privilege('authenticated', 'public.circle_archive_events', 'insert')
    then ok := ok + 1; else bad := bad + 1; r := r || ' app can claim or write events;'; end if;
  exception when others then bad := bad + 1; r := r || ' grants: ' || sqlerrm || ';';
  end;

  -- 13. The circle's members can read its archive history (the notifications list); others can't.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    execute 'select count(*) from public.circle_archive_events where circle_id = $1' into n using cp;
    execute 'reset role';
    perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    execute 'select count(*) from public.circle_archive_events where circle_id = $1' into i using cp;
    execute 'reset role';
    if n = 1 and i = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' events seen member=' || n || ' outsider=' || i || ';'; end if;
  exception when others then execute 'reset role'; bad := bad + 1; r := r || ' events read: ' || sqlerrm || ';';
  end;

  -- 14. The owner unarchives: back to normal (recorded, announced once).
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.circles set archived_at = null where id = cp;
    execute 'reset role';
    execute 'select public.claim_circle_archive_push($1)' into k using cp;
    if (select archived_at from public.circles where id = cp) is null and k = 'unarchived' then ok := ok + 1;
    else bad := bad + 1; r := r || ' unarchive claim=' || coalesce(k, 'null') || ';'; end if;
  exception when others then execute 'reset role'; bad := bad + 1; r := r || ' unarchive: ' || sqlerrm || ';';
  end;

  -- 15. Replies work again...
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into public.circle_posts (circle_id, author_id, parent_id, body) values (cp, u2, prompt, 'back');
    execute 'reset role';
    ok := ok + 1;
  exception when others then execute 'reset role'; bad := bad + 1; r := r || ' reply after unarchive: ' || sqlerrm || ';';
  end;

  -- 16. ...it is back in Discover and people can join again.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    if exists (select 1 from public.circles where id = cp) then ok := ok + 1;
    else bad := bad + 1; r := r || ' not back in Discover;'; end if;
    res := public.redeem_invite_code(p_code);
    execute 'reset role';
    if res->>'status' = 'approved' then ok := ok + 1; else bad := bad + 1; r := r || ' rejoin=' || coalesce(res::text, 'null') || ';'; end if;
  exception when others then execute 'reset role'; bad := bad + 1; r := r || ' rejoin: ' || sqlerrm || ';';
  end;

  -- 17. Archived and unarchived again before anyone was told: nothing to announce.
  begin
    update public.circles set archived_at = now() where id = cr;
    update public.circles set archived_at = null where id = cr;
    execute 'select public.claim_circle_archive_push($1)' into k using cr;
    if k is null then ok := ok + 1; else bad := bad + 1; r := r || ' flip-flop claim=' || k || ';'; end if;
  exception when others then bad := bad + 1; r := r || ' flip-flop: ' || sqlerrm || ';';
  end;

  -- 18. At most 6 announcements per circle per day.
  begin
    claimed := 0;
    for i in 1..8 loop
      update public.circles set archived_at = case when archived_at is null then now() end where id = cr;
      execute 'select public.claim_circle_archive_push($1)' into k using cr;
      if k is not null then claimed := claimed + 1; end if;
    end loop;
    if claimed = 6 then ok := ok + 1; else bad := bad + 1; r := r || ' rate claimed=' || claimed || ';'; end if;
  exception when others then bad := bad + 1; r := r || ' rate: ' || sqlerrm || ';';
  end;

  -- 19. The owner may still let in someone who asked before the Private circle was archived.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.circle_members set status = 'approved' where circle_id = cq and user_id = u4;
    execute 'reset role';
    if (select status::text from public.circle_members where circle_id = cq and user_id = u4) = 'approved'
    then ok := ok + 1; else bad := bad + 1; r := r || ' owner approval blocked;'; end if;
  exception when others then execute 'reset role'; bad := bad + 1; r := r || ' approval: ' || sqlerrm || ';';
  end;

  -- 20. Archiving again keeps the original time and records nothing new.
  begin
    execute 'select count(*) from public.circle_archive_events where circle_id = $1' into n using cq;
    update public.circles set archived_at = now() + interval '1 day' where id = cq;
    execute 'select count(*) from public.circle_archive_events where circle_id = $1' into i using cq;
    if (select archived_at from public.circles where id = cq) = now() and i = n and n = 1 then ok := ok + 1;
    else bad := bad + 1; r := r || ' re-archive moved time or recorded (' || n || '->' || i || ');'; end if;
  exception when others then bad := bad + 1; r := r || ' re-archive: ' || sqlerrm || ';';
  end;

  raise exception 'ROLLED BACK. ok=% bad=% %', ok, bad, r;
end
$test$;
