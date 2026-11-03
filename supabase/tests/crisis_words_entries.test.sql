-- Entries with concerning words (N18, client revisions 10/14 p.36): keywords only. The database flags
-- an entry whose text has a crisis keyword on every save (the app can't set or clear it), a flagged
-- entry holds no AI reflection and can't be shared into any circle (share_entry, an older app's
-- entry_shares insert, a direct insert, a version switch), an edit that adds the words takes the
-- entry out of its circles and removes its reflection, an edit that removes them makes it ordinary
-- again, and the edge functions' re-check (crisis_flagged_entries) is service role only.
-- Verifies migration 20261022120000_crisis_words_entries AFTER it is applied: run against the database
-- (Management API query or psql). Everything runs in ONE DO block that always ends with RAISE EXCEPTION,
-- so nothing it creates is kept. Expected: the error "ROLLED BACK. ok=24 bad=0". On a database without
-- the migration most checks fail (2026-10-21 on the live database: ok=3 bad=20 without it, ok=24 bad=0
-- with the migration inserted at the marker below, all rolled back).
do $test$
declare
  r text := '';
  ok int := 0;
  bad int := 0;
  n int;
  b boolean;
  t text;
  st text;
  u_a uuid := gen_random_uuid(); -- the writer
  u_b uuid := gen_random_uuid(); -- a member of the writer's Private circle
  c uuid;
  e_hope uuid; e_curly uuid; e_dash uuid; e_ok uuid; e_word uuid; e_late uuid;
  ids uuid[];
begin
  -- @migration (pre-deploy runs insert the migration here; after deploy it is already applied)

  insert into auth.users (id, email, raw_user_meta_data, aud, role, created_at) values
    (u_a, 'cw-a@lysm-test.invalid', '{"display_name":"Asha"}', 'authenticated', 'authenticated', now()),
    (u_b, 'cw-b@lysm-test.invalid', '{"display_name":"Ben"}', 'authenticated', 'authenticated', now());
  insert into public.circles (owner_id, name, type) values (u_a, 'Crisis words test', 'private') returning id into c;
  insert into public.circle_members (circle_id, user_id, role, status) values (c, u_b, 'member', 'approved');

  -- ===== Writing, signed in as the writer (RLS and grants apply) =====
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.journal_entries (user_id, mood_slugs, note) values (u_a, '{sad}', 'I feel hopeless tonight.') returning id into e_hope;
  insert into public.journal_entries (user_id, mood_slugs, note) values (u_a, '{sad}', 'I don’t want to live like this') returning id into e_curly;
  insert into public.journal_entries (user_id, mood_slugs, note) values (u_a, '{sad}', 'Thinking about self-harm again') returning id into e_dash;
  insert into public.journal_entries (user_id, mood_slugs, note) values (u_a, '{calm}', 'Had a lovely walk by the river.') returning id into e_ok;
  insert into public.journal_entries (user_id, mood_slugs, note) values (u_a, '{tired}', 'The hopelessness of Mondays, ha.') returning id into e_word;
  insert into public.journal_entries (user_id, mood_slugs, note) values (u_a, '{calm}', 'Blue whale song all day.') returning id into e_late;
  execute 'reset role';

  -- 1. A keyword flags the entry on save: no reflection, nothing to ask for.
  begin
    execute 'select crisis_flagged, ai_status::text from public.journal_entries where id = $1' into b, st using e_hope;
    if b and st = 'ready' then ok := ok + 1; else bad := bad + 1; r := r || ' hopeless not flagged (' || coalesce(b::text, 'null') || ',' || st || ');'; end if;
  exception when others then bad := bad + 1; r := r || ' flag on save: ' || sqlerrm || ';';
  end;
  -- 2. A curly apostrophe (iPhone) still matches "dont want to live".
  begin
    execute 'select crisis_flagged from public.journal_entries where id = $1' into b using e_curly;
    if b then ok := ok + 1; else bad := bad + 1; r := r || ' curly apostrophe missed;'; end if;
  exception when others then bad := bad + 1; r := r || ' curly: ' || sqlerrm || ';';
  end;
  -- 3. "self-harm" matches "self harm".
  begin
    execute 'select crisis_flagged from public.journal_entries where id = $1' into b using e_dash;
    if b then ok := ok + 1; else bad := bad + 1; r := r || ' dashed phrase missed;'; end if;
  exception when others then bad := bad + 1; r := r || ' dash: ' || sqlerrm || ';';
  end;
  -- 4. Ordinary entries aren't flagged and get their reflection as before; whole words only.
  begin
    execute 'select count(*) from public.journal_entries where id = any($1) and not crisis_flagged and ai_status = ''idle'''
      into n using array[e_ok, e_word, e_late];
    if n = 3 then ok := ok + 1; else bad := bad + 1; r := r || ' ordinary entries flagged or not idle (' || n || '/3);'; end if;
  exception when others then bad := bad + 1; r := r || ' ordinary: ' || sqlerrm || ';';
  end;

  -- 5. The app can't clear the flag, or slip a reflection onto a flagged entry.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    execute 'update public.journal_entries set crisis_flagged = false, ai_status = ''idle'' where id = $1' using e_hope;
    execute 'reset role';
    execute 'select crisis_flagged, ai_status::text from public.journal_entries where id = $1' into b, st using e_hope;
    if b and st = 'ready' then ok := ok + 1; else bad := bad + 1; r := r || ' app cleared the flag;'; end if;
  exception when others then bad := bad + 1; r := r || ' clear flag: ' || sqlerrm || ';';
  end;
  begin
    execute 'update public.journal_entries set ai_summary = ''A reflection'', ai_status = ''ready'' where id = $1' using e_hope;
    select ai_summary into t from public.journal_entries where id = e_hope;
    if t is null then ok := ok + 1; else bad := bad + 1; r := r || ' flagged entry kept a reflection;'; end if;
  exception when others then bad := bad + 1; r := r || ' reflection on flagged: ' || sqlerrm || ';';
  end;

  -- ===== Sharing, signed in as the writer =====
  -- 7. share_entry refuses a flagged entry (Private circle, either version).
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.share_entry(e_hope, array[c], 'written');
      bad := bad + 1; r := r || ' share_entry shared a flagged entry;';
    exception when insufficient_privilege then
      get stacked diagnostics t = pg_exception_hint;
      if t = 'crisis_words' then ok := ok + 1; else bad := bad + 1; r := r || ' share refused for another reason: ' || sqlerrm || ';'; end if;
    end;
    execute 'reset role';
  exception when others then bad := bad + 1; r := r || ' share_entry: ' || sqlerrm || ';';
  end;
  -- 8. A direct post of the entry is refused too.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      insert into public.circle_posts (circle_id, author_id, entry_id, entry_version) values (c, u_a, e_curly, 'reflection');
      bad := bad + 1; r := r || ' direct insert shared a flagged entry;';
    exception when insufficient_privilege then
      get stacked diagnostics t = pg_exception_hint;
      if t = 'crisis_words' then ok := ok + 1; else bad := bad + 1; r := r || ' direct insert refused for another reason: ' || sqlerrm || ';'; end if;
    end;
    execute 'reset role';
  exception when others then bad := bad + 1; r := r || ' direct insert: ' || sqlerrm || ';';
  end;
  -- 9. An older app's entry_shares write is refused.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      insert into public.entry_shares (entry_id, circle_id) values (e_dash, c);
      bad := bad + 1; r := r || ' legacy entry_shares shared a flagged entry;';
    exception when insufficient_privilege then
      get stacked diagnostics t = pg_exception_hint;
      if t = 'crisis_words' then ok := ok + 1; else bad := bad + 1; r := r || ' legacy refused for another reason: ' || sqlerrm || ';'; end if;
    end;
    execute 'reset role';
  exception when others then bad := bad + 1; r := r || ' legacy share: ' || sqlerrm || ';';
  end;
  select count(*) into n from public.circle_posts where entry_id in (e_hope, e_curly, e_dash);
  if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' a flagged entry reached a circle (' || n || ');'; end if;

  -- 11. An ordinary entry still shares as before.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.share_entry(e_ok, array[c], 'written');
    perform public.share_entry(e_late, array[c], 'reflection');
    execute 'reset role';
    select count(*) into n from public.circle_posts where entry_id in (e_ok, e_late);
    if n = 2 then ok := ok + 1; else bad := bad + 1; r := r || ' ordinary share failed (' || n || ');'; end if;
  exception when others then bad := bad + 1; r := r || ' ordinary share: ' || sqlerrm || ';';
  end;
  -- Its reflection arrives (the ai-summary function writes it as the service role).
  update public.journal_entries set ai_summary = 'I felt calm by the water.', ai_status = 'ready' where id = e_ok;

  -- ===== Editing =====
  -- 12. An edit that adds the words: flagged, reflection gone, out of every circle (its members no
  --     longer see it), and "shared" goes back to false.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.journal_entries set note = 'Had a walk. I want to kill myself.' where id = e_ok;
    execute 'reset role';
    execute 'select crisis_flagged, ai_status::text, ai_summary from public.journal_entries where id = $1'
      into b, st, t using e_ok;
    if b and st = 'ready' and t is null then ok := ok + 1;
    else bad := bad + 1; r := r || ' edit to flagged kept reflection or flag (' || coalesce(b::text, 'null') || ',' || st || ',' || coalesce(t, 'null') || ');'; end if;
  exception when others then bad := bad + 1; r := r || ' edit to flagged: ' || sqlerrm || ';';
  end;
  select count(*) into n from public.circle_posts where entry_id = e_ok;
  if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' edit to flagged stayed in the circle;'; end if;
  select shared into b from public.journal_entries where id = e_ok;
  if not b then ok := ok + 1; else bad := bad + 1; r := r || ' shared still true after unshare;'; end if;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u_b, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from public.circle_posts where circle_id = c and body like '%kill myself%';
    execute 'reset role';
    if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' the member saw the flagged text;'; end if;
  exception when others then bad := bad + 1; r := r || ' member view: ' || sqlerrm || ';';
  end;

  -- 16. A moods-only edit keeps it flagged with no reflection, even when the app asks for one.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.journal_entries set mood_slugs = '{sad,tired}', ai_status = 'idle' where id = e_ok;
    execute 'reset role';
    execute 'select crisis_flagged, ai_status::text from public.journal_entries where id = $1' into b, st using e_ok;
    if b and st = 'ready' then ok := ok + 1; else bad := bad + 1; r := r || ' moods edit re-armed a reflection;'; end if;
  exception when others then bad := bad + 1; r := r || ' moods edit: ' || sqlerrm || ';';
  end;

  -- 17. An edit that removes the words: ordinary again, its reflection is made (idle), and it shares.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.journal_entries set note = 'Feeling a little better today.' where id = e_hope;
    execute 'select crisis_flagged, ai_status::text from public.journal_entries where id = $1' into b, st using e_hope;
    perform public.share_entry(e_hope, array[c], 'reflection');
    execute 'reset role';
    select count(*) into n from public.circle_posts where entry_id = e_hope;
    if not b and st = 'idle' and n = 1 then ok := ok + 1;
    else bad := bad + 1; r := r || ' edit out of flagged (' || coalesce(b::text, 'null') || ',' || st || ',' || n || ');'; end if;
  exception when others then bad := bad + 1; r := r || ' edit out of flagged: ' || sqlerrm || ';';
  end;

  -- ===== The edge functions' re-check =====
  -- 18. Service role: exactly the entries that must not reach an AI.
  begin
    execute 'set local role service_role';
    execute 'select array_agg(x order by x) from public.crisis_flagged_entries($1) x' into ids
      using array[e_hope, e_curly, e_dash, e_ok, e_word, e_late];
    execute 'reset role';
    if ids = (select array_agg(x order by x) from unnest(array[e_curly, e_dash, e_ok]) x) then ok := ok + 1;
    else bad := bad + 1; r := r || ' re-check returned ' || coalesce(ids::text, 'null') || ';'; end if;
  exception when others then bad := bad + 1; r := r || ' re-check: ' || sqlerrm || ';';
  end;
  -- 19. The text check: case, apostrophes, dashes, whole words.
  begin
    execute 'set local role service_role';
    execute 'select public.crisis_words_match(''I want to KILL MYSELF'') and public.crisis_words_match(''I can''''t go on'')
              and public.crisis_words_match(''self-harm'') and public.crisis_words_match(''the suicide’s anniversary'')
              and not public.crisis_words_match(''my diet is fine'')
              and not public.crisis_words_match(''hopelessness'') and not public.crisis_words_match(null)' into b;
    execute 'reset role';
    if b then ok := ok + 1; else bad := bad + 1; r := r || ' text check wrong;'; end if;
  exception when others then bad := bad + 1; r := r || ' text check: ' || sqlerrm || ';';
  end;
  -- 20. Closed to the app.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      execute 'select count(*) from public.crisis_flagged_entries($1)' into n using array[e_curly];
      bad := bad + 1; r := r || ' the app can call crisis_flagged_entries;';
    exception when insufficient_privilege then ok := ok + 1;
    end;
    begin
      execute 'select public.crisis_words_match(''x'')' into b;
      bad := bad + 1; r := r || ' the app can call crisis_words_match;';
    exception when insufficient_privilege then ok := ok + 1;
    end;
    execute 'reset role';
  exception when others then bad := bad + 1; r := r || ' grants: ' || sqlerrm || ';';
  end;

  -- ===== The keyword list changes =====
  -- 22. A new keyword flags existing entries at once (and unshares them); removing it unflags them.
  begin
    insert into public.crisis_keywords (phrase, match_type, severity, title, message, resource_name, resource_phone)
    values ('blue whale', 'contains', 'high', 't', 'm', '988 Suicide & Crisis Lifeline', '988');
    execute 'select crisis_flagged from public.journal_entries where id = $1' into b using e_late;
    select count(*) into n from public.circle_posts where entry_id = e_late;
    if b and n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' new keyword did not flag (' || coalesce(b::text, 'null') || ',' || n || ');'; end if;
    delete from public.crisis_keywords where phrase = 'blue whale';
    execute 'select crisis_flagged, ai_status::text from public.journal_entries where id = $1' into b, st using e_late;
    if not b and st = 'idle' then ok := ok + 1; else bad := bad + 1; r := r || ' removed keyword kept the flag;'; end if;
  exception when others then bad := bad + 2; r := r || ' keyword change: ' || sqlerrm || ';';
  end;
  -- 24. Switching what a circle sees re-checks the words right now, even when the stored flag is
  --     behind (here: a keyword added with the refresh switched off, and the entry's text changed
  --     with the flag trigger switched off). e_hope is shared as its 'reflection'.
  begin
    execute 'alter table public.crisis_keywords disable trigger crisis_keywords_refresh_flags';
    insert into public.crisis_keywords (phrase, match_type, severity, title, message, resource_name, resource_phone)
    values ('calm by the water', 'contains', 'high', 't', 'm', '988 Suicide & Crisis Lifeline', '988');
    execute 'alter table public.journal_entries disable trigger journal_entries_crisis_flag';
    update public.journal_entries set note = 'Feeling calm by the water today.' where id = e_hope;
    execute 'alter table public.journal_entries enable trigger journal_entries_crisis_flag';
    perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.share_entry(e_hope, array[c], 'written');
      bad := bad + 1; r := r || ' version switch showed a flagged entry;';
    exception when insufficient_privilege then
      get stacked diagnostics t = pg_exception_hint;
      if t = 'crisis_words' then ok := ok + 1; else bad := bad + 1; r := r || ' switch refused for another reason: ' || sqlerrm || ';'; end if;
    end;
    execute 'reset role';
  exception when others then bad := bad + 1; r := r || ' version switch: ' || sqlerrm || ';';
  end;

  raise exception 'ROLLED BACK. ok=% bad=% %', ok, bad, r;
end;
$test$;
