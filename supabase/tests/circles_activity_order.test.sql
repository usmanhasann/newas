-- Your Circles sorted by latest activity (N2, client revisions 10/14 p.2).
-- Verifies migration 20261022040000_circles_activity_order AFTER it is applied: run against the
-- database (Management API query or psql). Everything runs in ONE DO block that always ends with
-- RAISE EXCEPTION, so nothing it creates is kept. Expected: the error "ROLLED BACK. ok=12 bad=0".
-- On a database without the migration every check fails (bad=12).
do $test$
declare
  r text := '';
  ok int := 0;
  bad int := 0;
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); u3 uuid := gen_random_uuid();
  ca uuid; cb uuid; cc uuid; cd uuid; ce uuid; cf uuid; cg uuid;
  pa uuid; pd uuid; pe uuid;
  got uuid[];
  want uuid[];
  page uuid[];
  tie uuid[];
  t timestamptz;
  last_arch boolean; last_act timestamptz; last_id uuid;
  rounds int;
  rec record;
begin
  -- @migration (pre-deploy runs insert the migration here; after deploy it is already applied)

  insert into auth.users (id, email, raw_user_meta_data, aud, role, created_at) values
    (u1, 'n2a@lysm-test.invalid', '{"display_name":"Konah"}', 'authenticated', 'authenticated', now()),
    (u2, 'n2b@lysm-test.invalid', '{"display_name":"Auguste"}', 'authenticated', 'authenticated', now()),
    (u3, 'n2c@lysm-test.invalid', '{"display_name":"Outsider"}', 'authenticated', 'authenticated', now());
  insert into public.circles (owner_id, name, type) values (u1, 'N2 A', 'private') returning id into ca;
  insert into public.circles (owner_id, name, type) values (u1, 'N2 B', 'public') returning id into cb;
  insert into public.circles (owner_id, name, type) values (u1, 'N2 C', 'private') returning id into cc;
  insert into public.circles (owner_id, name, type) values (u2, 'N2 D', 'private') returning id into cd;
  insert into public.circles (owner_id, name, type) values (u1, 'N2 E', 'private') returning id into ce;
  insert into public.circles (owner_id, name, type) values (u1, 'N2 F', 'public') returning id into cf;
  insert into public.circle_members (circle_id, user_id, role, status) values
    (ca, u2, 'member', 'approved'), (cb, u2, 'member', 'approved'), (cc, u2, 'member', 'approved'),
    (ce, u2, 'member', 'approved'), (cf, u2, 'member', 'approved')
  on conflict do nothing;
  update public.circles set archived_at = now() where id in (ce, cf);

  -- The database itself (not the app) sets each circle's last activity for the scenario.
  -- B newest, then A; C long ago (so its activity for u2 is when u2 joined: now); D created now;
  -- E archived with the newest activity of all; F archived long ago.
  begin
    update public.circles set last_activity_at = now() + interval '2 minutes' where id = cb;
    update public.circles set last_activity_at = now() + interval '1 minute' where id = ca;
    update public.circles set last_activity_at = now() - interval '1 day' where id = cc;
    update public.circles set last_activity_at = now() + interval '3 minutes' where id = ce;
    update public.circles set last_activity_at = now() - interval '2 days' where id = cf;
  exception when others then r := r || ' setup: ' || sqlerrm || ';';
  end;
  -- C and D tie at "now" (joined / created): ties go by id, newest id first.
  tie := case when cc > cd then array[cc, cd] else array[cd, cc] end;

  -- 1. u2's list: most recent activity first, join/create counts, archived last (newest first).
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    got := array(select x.id from public.my_circles_by_activity(100) x);
    execute 'reset role';
    want := array[cb, ca] || tie || array[ce, cf];
    if got = want then ok := ok + 1; else bad := bad + 1; r := r || ' order=' || coalesce(got::text, 'null') || ' want ' || want::text || ';'; end if;
  exception when others then execute 'reset role'; bad := bad + 1; r := r || ' order: ' || sqlerrm || ';';
  end;

  -- 2. Keyset pages of 2 read the same list, in the same order, with nothing missed or repeated.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    got := '{}';
    last_arch := null; last_act := null; last_id := null;
    rounds := 0;
    loop
      rounds := rounds + 1;
      page := '{}';
      -- The next page starts after the last row of this one: its (archived, activity_at, id).
      for rec in select * from public.my_circles_by_activity(2, last_arch, last_act, last_id) loop
        page := page || rec.id;
        last_arch := rec.archived_at is not null;
        last_act := rec.activity_at;
        last_id := rec.id;
      end loop;
      exit when coalesce(array_length(page, 1), 0) = 0 or rounds > 10;
      got := got || page;
    end loop;
    execute 'reset role';
    if got = array[cb, ca] || tie || array[ce, cf] and rounds = 4 then ok := ok + 1; else bad := bad + 1; r := r || ' pages=' || got::text || ' rounds=' || rounds || ';'; end if;
  exception when others then execute 'reset role'; bad := bad + 1; r := r || ' pages: ' || sqlerrm || ';';
  end;

  -- 3. Activity for u2 = greatest(the circle's last activity, when u2 joined): C shows "now".
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select x.activity_at into t from public.my_circles_by_activity(100) x where x.id = cc;
    execute 'reset role';
    if t = now() then ok := ok + 1; else bad := bad + 1; r := r || ' join-activity=' || coalesce(t::text, 'null') || ';'; end if;
  exception when others then execute 'reset role'; bad := bad + 1; r := r || ' join-activity: ' || sqlerrm || ';';
  end;

  -- 4. A new post (from anyone) moves its circle to the top.
  begin
    perform set_config('request.jwt.claims', '', true);
    insert into public.circle_posts (circle_id, author_id, body, created_at)
    values (cc, u1, 'hello', now() + interval '4 minutes');
    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    got := array(select x.id from public.my_circles_by_activity(100) x);
    execute 'reset role';
    if got[1] = cc then ok := ok + 1; else bad := bad + 1; r := r || ' post-bump first=' || coalesce(got[1]::text, 'null') || ';'; end if;
  exception when others then execute 'reset role'; bad := bad + 1; r := r || ' post-bump: ' || sqlerrm || ';';
  end;

  -- 5. A reply counts too (the user's own included).
  begin
    perform set_config('request.jwt.claims', '', true);
    insert into public.circle_posts (circle_id, author_id, body, created_at)
    values (ca, u1, 'post', now() - interval '1 hour') returning id into pa;
    insert into public.circle_posts (circle_id, author_id, parent_id, body, created_at)
    values (ca, u2, pa, 'reply', now() + interval '5 minutes');
    if (select last_activity_at from public.circles where id = ca) = now() + interval '5 minutes'
    then ok := ok + 1; else bad := bad + 1; r := r || ' reply-bump wrong;'; end if;
  exception when others then bad := bad + 1; r := r || ' reply-bump: ' || sqlerrm || ';';
  end;

  -- 6. An older post never moves a circle back in time.
  begin
    insert into public.circle_posts (circle_id, author_id, body, created_at)
    values (ca, u1, 'late import', now() - interval '3 days');
    if (select last_activity_at from public.circles where id = ca) = now() + interval '5 minutes'
    then ok := ok + 1; else bad := bad + 1; r := r || ' older-post moved it;'; end if;
  exception when others then bad := bad + 1; r := r || ' older-post: ' || sqlerrm || ';';
  end;

  -- 7. Something members can't see yet (a shared reflection still being written) doesn't count;
  --    it counts the moment its text arrives.
  begin
    update public.circles set last_activity_at = now() - interval '1 hour' where id = cd;
    insert into public.journal_entries (user_id, mood_slug, note) values (u2, 'calm', 'walked') returning id into pe;
    insert into public.circle_posts (circle_id, author_id, entry_id, entry_version)
    values (cd, u2, pe, 'reflection') returning id into pd;
    if (select body from public.circle_posts where id = pd) is null
       and (select last_activity_at from public.circles where id = cd) = now() - interval '1 hour'
    then ok := ok + 1; else bad := bad + 1; r := r || ' hidden post counted;'; end if;
    update public.journal_entries set ai_summary = 'A calm walk.' where id = pe;
    if (select last_activity_at from public.circles where id = cd) = now()
    then ok := ok + 1; else bad := bad + 1; r := r || ' visible-now not counted;'; end if;
  exception when others then bad := bad + 2; r := r || ' hidden: ' || sqlerrm || ';';
  end;

  -- 8. The app can't move a circle's activity: an owner's edit keeps it, a new circle starts now.
  begin
    t := (select last_activity_at from public.circles where id = cb);
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.circles set last_activity_at = now() + interval '9 days', name = 'N2 B!' where id = cb;
    insert into public.circles (owner_id, name, type, last_activity_at)
    values (u1, 'N2 G', 'private', now() + interval '9 days') returning id into cg;
    execute 'reset role';
    if (select last_activity_at from public.circles where id = cb) = t
       and (select last_activity_at from public.circles where id = cg) = now()
    then ok := ok + 1; else bad := bad + 1; r := r || ' app moved activity;'; end if;
  exception when others then execute 'reset role'; bad := bad + 1; r := r || ' guard: ' || sqlerrm || ';';
  end;

  -- 9. Someone in none of these circles gets none of them.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    got := array(select x.id from public.my_circles_by_activity(100) x);
    execute 'reset role';
    if coalesce(array_length(got, 1), 0) = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' outsider saw ' || got::text || ';'; end if;
  exception when others then execute 'reset role'; bad := bad + 1; r := r || ' outsider: ' || sqlerrm || ';';
  end;

  -- 10. Signed-out callers can't use the list.
  begin
    if not has_function_privilege('anon', 'public.my_circles_by_activity(integer, boolean, timestamptz, uuid)', 'execute')
    then ok := ok + 1; else bad := bad + 1; r := r || ' anon can call;'; end if;
  exception when others then bad := bad + 1; r := r || ' grant: ' || sqlerrm || ';';
  end;

  -- 11. Circle and membership changes reach the app live (Realtime publication).
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'circles')
     and exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'circle_members')
  then ok := ok + 1; else bad := bad + 1; r := r || ' not in realtime publication;'; end if;

  raise exception 'ROLLED BACK. ok=% bad=% %', ok, bad, r;
end
$test$;
