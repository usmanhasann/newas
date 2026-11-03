-- Streak milestones (N11, client revisions 10/14 p.24 to 29): the longest streak BEFORE the current
-- run, for the streak popup (get_previous_longest_streak) and the 8pm reminder (claim_streak_reminders
-- .previous_longest), while who gets the reminder stays exactly as before.
-- Verifies migration 20261022020000_streak_milestones AFTER it is applied: run against the database
-- (Management API query or psql). Everything runs in ONE DO block that always ends with RAISE EXCEPTION,
-- so nothing it creates is kept. Expected: the error "ROLLED BACK. ok=14 bad=0". On a database without
-- the migration the previous_longest and the two new functions' checks fail ("ok=5 bad=9").
do $test$
declare
  r text := '';
  ok int := 0;
  bad int := 0;
  n int;
  j jsonb;
  run_at timestamptz := '2030-01-15 20:05:00+00'; -- 20:05 on Jan 15 for a UTC profile
  u_a uuid := gen_random_uuid(); -- earlier run 5, current 5      -> streak 5,  previous 5
  u_b uuid := gen_random_uuid(); -- first-ever streak of 10       -> streak 10, previous 0
  u_c uuid := gen_random_uuid(); -- earlier run 12, current 3     -> streak 3,  previous 12
  u_d uuid := gen_random_uuid(); -- two lone days, current 4      -> streak 4,  previous 1
  u_e uuid := gen_random_uuid(); -- last journaled Jan 13: broken -> no reminder
  u_f uuid := gen_random_uuid(); -- live streak, reminder off     -> no reminder
  d date;
begin
  -- @migration (pre-deploy runs insert the migration here; after deploy it is already applied)

  insert into auth.users (id, email, raw_user_meta_data, aud, role, created_at) values
    (u_a, 'sm-a@lysm-test.invalid', '{"display_name":"Asha"}', 'authenticated', 'authenticated', now()),
    (u_b, 'sm-b@lysm-test.invalid', '{"display_name":"Ben"}', 'authenticated', 'authenticated', now()),
    (u_c, 'sm-c@lysm-test.invalid', '{"display_name":"Cy"}', 'authenticated', 'authenticated', now()),
    (u_d, 'sm-d@lysm-test.invalid', '{"display_name":"Di"}', 'authenticated', 'authenticated', now()),
    (u_e, 'sm-e@lysm-test.invalid', '{"display_name":"Ed"}', 'authenticated', 'authenticated', now()),
    (u_f, 'sm-f@lysm-test.invalid', '{"display_name":"Fay"}', 'authenticated', 'authenticated', now());
  update public.profiles set timezone = 'UTC' where user_id in (u_a, u_b, u_c, u_d, u_e, u_f);
  delete from public.notification_prefs where user_id = u_f;
  insert into public.notification_prefs (user_id, streak_reminder) values (u_f, false);

  -- Journaled days (what the entry trigger records).
  for d in select generate_series(date '2029-12-01', date '2029-12-05', interval '1 day')::date loop
    insert into public.journal_days (user_id, local_date, first_entry_id) values (u_a, d, gen_random_uuid());
  end loop;
  for d in select generate_series(date '2030-01-10', date '2030-01-14', interval '1 day')::date loop
    insert into public.journal_days (user_id, local_date, first_entry_id) values (u_a, d, gen_random_uuid());
  end loop;
  for d in select generate_series(date '2030-01-05', date '2030-01-14', interval '1 day')::date loop
    insert into public.journal_days (user_id, local_date, first_entry_id) values (u_b, d, gen_random_uuid());
  end loop;
  for d in select generate_series(date '2029-11-01', date '2029-11-12', interval '1 day')::date loop
    insert into public.journal_days (user_id, local_date, first_entry_id) values (u_c, d, gen_random_uuid());
  end loop;
  for d in select generate_series(date '2030-01-12', date '2030-01-14', interval '1 day')::date loop
    insert into public.journal_days (user_id, local_date, first_entry_id) values (u_c, d, gen_random_uuid());
  end loop;
  insert into public.journal_days (user_id, local_date, first_entry_id) values
    (u_d, '2029-12-01', gen_random_uuid()), (u_d, '2029-12-03', gen_random_uuid());
  for d in select generate_series(date '2030-01-11', date '2030-01-14', interval '1 day')::date loop
    insert into public.journal_days (user_id, local_date, first_entry_id) values (u_d, d, gen_random_uuid());
  end loop;
  for d in select generate_series(date '2030-01-10', date '2030-01-13', interval '1 day')::date loop
    insert into public.journal_days (user_id, local_date, first_entry_id) values (u_e, d, gen_random_uuid());
  end loop;
  for d in select generate_series(date '2030-01-10', date '2030-01-14', interval '1 day')::date loop
    insert into public.journal_days (user_id, local_date, first_entry_id) values (u_f, d, gen_random_uuid());
  end loop;

  -- ===== The 8pm claim (service role): who is unchanged, previous_longest is new =====
  select coalesce(jsonb_object_agg(t->>'user_id', t), '{}'::jsonb) into j
    from (select to_jsonb(c) as t from public.claim_streak_reminders(run_at) c) s
   where t->>'user_id' in (u_a::text, u_b::text, u_c::text, u_d::text, u_e::text, u_f::text);

  if (select count(*) from jsonb_object_keys(j)) = 4 and j ? u_a::text and j ? u_b::text and j ? u_c::text
     and j ? u_d::text then ok := ok + 1;
  else bad := bad + 1; r := r || ' recipients=' || j::text || ';'; end if;
  if not (j ? u_e::text) and not (j ? u_f::text) then ok := ok + 1;
  else bad := bad + 1; r := r || ' broken streak or reminder off was claimed;'; end if;
  if (j->u_a::text->>'streak')::int = 5 and (j->u_b::text->>'streak')::int = 10
     and (j->u_c::text->>'streak')::int = 3 and (j->u_d::text->>'streak')::int = 4 then ok := ok + 1;
  else bad := bad + 1; r := r || ' streaks wrong;'; end if;

  if (j->u_a::text->>'previous_longest')::int is not distinct from 5 then ok := ok + 1;
  else bad := bad + 1; r := r || ' A previous=' || coalesce(j->u_a::text->>'previous_longest', 'null') || ';'; end if;
  if (j->u_b::text->>'previous_longest')::int is not distinct from 0 then ok := ok + 1;
  else bad := bad + 1; r := r || ' B previous=' || coalesce(j->u_b::text->>'previous_longest', 'null') || ';'; end if;
  if (j->u_c::text->>'previous_longest')::int is not distinct from 12 then ok := ok + 1;
  else bad := bad + 1; r := r || ' C previous=' || coalesce(j->u_c::text->>'previous_longest', 'null') || ';'; end if;
  if (j->u_d::text->>'previous_longest')::int is not distinct from 1 then ok := ok + 1;
  else bad := bad + 1; r := r || ' D previous=' || coalesce(j->u_d::text->>'previous_longest', 'null') || ';'; end if;

  -- Claimed once per local day: a second run the same evening claims nobody new.
  select count(*) into n from public.claim_streak_reminders(run_at + interval '20 minutes') c
   where c.user_id in (u_a, u_b, u_c, u_d, u_e, u_f);
  if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' second run claimed ' || n || ';'; end if;

  -- ===== The popup's lookup, signed in as Asha (RLS + grants apply) =====
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- Right after saving Jan 14 (the run Jan 10 to 14 is left out): the December run of 5.
  begin
    execute 'select public.get_previous_longest_streak($1)' into n using date '2030-01-14';
    if n = 5 then ok := ok + 1; else bad := bad + 1; r := r || ' A popup previous=' || n || ';'; end if;
  exception when others then bad := bad + 1; r := r || ' A popup: ' || sqlerrm || ';';
  end;
  -- On the run's first day (Jan 10) the same.
  begin
    execute 'select public.get_previous_longest_streak($1)' into n using date '2030-01-10';
    if n = 5 then ok := ok + 1; else bad := bad + 1; r := r || ' A day-1 previous=' || n || ';'; end if;
  exception when others then bad := bad + 1; r := r || ' A day-1: ' || sqlerrm || ';';
  end;
  -- Only the caller's own days count (Cy's 12-day run is not Asha's).
  begin
    execute 'select public.get_previous_longest_streak($1)' into n using date '2029-12-05';
    if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' A first run previous=' || n || ';'; end if;
  exception when others then bad := bad + 1; r := r || ' A first run: ' || sqlerrm || ';';
  end;
  -- The service-role helpers stay closed to the app.
  begin
    execute 'select public.prev_longest_streak($1, $2)' into n using u_c, date '2030-01-14';
    bad := bad + 1; r := r || ' authenticated could read another user via prev_longest_streak;';
  exception when insufficient_privilege then ok := ok + 1;
    when others then bad := bad + 1; r := r || ' prev_longest_streak: ' || sqlerrm || ';';
  end;
  begin
    perform public.claim_streak_reminders(run_at);
    bad := bad + 1; r := r || ' authenticated could claim reminders;';
  exception when insufficient_privilege then ok := ok + 1;
  end;
  execute 'reset role';

  -- Signed out: no access.
  execute 'set local role anon';
  begin
    execute 'select public.get_previous_longest_streak($1)' into n using date '2030-01-14';
    bad := bad + 1; r := r || ' anon could call get_previous_longest_streak;';
  exception when insufficient_privilege then ok := ok + 1;
    when others then bad := bad + 1; r := r || ' anon: ' || sqlerrm || ';';
  end;
  execute 'reset role';

  raise exception 'ROLLED BACK. ok=% bad=% %', ok, bad, r;
end;
$test$;
