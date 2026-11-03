-- Insights cards move on every period, empty or not (client revisions 10/14 p.13-14).
-- Verifies migration 20261020110000_insights_empty_periods AFTER it is applied: run against the database
-- (Management API query or psql). Everything runs in ONE DO block that always ends with RAISE EXCEPTION,
-- so nothing it creates is kept. Expected: the error "ROLLED BACK. ok=14 bad=0".
do $test$
declare
  r text := '';
  ok int := 0;
  bad int := 0;
  u uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  b record;
  o record;
  procedure_check int;
begin


  insert into auth.users (id, email, raw_user_meta_data, aud, role, created_at)
    values (u, 'o7@lysm-test.invalid', '{"display_name":"Tess"}', 'authenticated', 'authenticated', now());
  -- Week 0 = Sep 14 to 20 (entries), week 1 = Sep 21 to 27 (none).
  insert into public.journal_entries (user_id, mood_slug, note, local_date) values
    (u, 'calm', 'a', '2026-09-14'), (u, 'happy', 'b', '2026-09-16');
  insert into public.reflections (user_id, type, period_start, period_end, status, content, generated_at)
    values (u, 'weekly', '2026-09-14', '2026-09-20', 'ready', 'Matcha with Augie', now());
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);

  -- During week 1: the card shows week 0 (it had entries; its reflection is ready).
  select * into b from public.get_breakdown_periods('2026-09-24') where type = 'weekly';
  if b.period_start = '2026-09-14' and b.has_entries then ok := ok + 1; else bad := bad + 1; r := r || ' b0;'; end if;
  select * into o from public.get_reflections_overview('2026-09-24') where type = 'weekly';
  if o.content = 'Matcha with Augie' and o.period_start = '2026-09-14' and o.period_has_entries then ok := ok + 1; else bad := bad + 1; r := r || ' o0;'; end if;

  -- Sep 28 (week 1 over, no entries): BOTH cards move to Sep 21 to 27 with an empty state.
  select * into b from public.get_breakdown_periods('2026-09-28') where type = 'weekly';
  if b.period_start = '2026-09-21' and b.period_end = '2026-09-27' and not b.has_entries then ok := ok + 1; else bad := bad + 1; r := r || ' b1 ' || coalesce(b.period_start::text,'null') || ';'; end if;
  select * into o from public.get_reflections_overview('2026-09-28') where type = 'weekly';
  if o.content is null and o.period_start = '2026-09-21' and o.period_end = '2026-09-27'
     and o.period_has_entries = false and not o.generating and not o.failed
     and o.next_unlock_date = '2026-10-05' then ok := ok + 1; else bad := bad + 1; r := r || ' o1 next=' || coalesce(o.next_unlock_date::text,'null') || ';'; end if;

  -- Journaling again on Sep 29 doesn't move it early: still Sep 21 to 27 on Oct 4.
  insert into public.journal_entries (user_id, mood_slug, note, local_date) values (u, 'tired', 'c', '2026-09-29');
  select * into o from public.get_reflections_overview('2026-10-04') where type = 'weekly';
  if o.period_start = '2026-09-21' and o.period_has_entries = false then ok := ok + 1; else bad := bad + 1; r := r || ' o2;'; end if;

  -- Oct 5: Sep 28 to Oct 4 takes over (it has entries; its reflection isn't made yet, then pending).
  select * into o from public.get_reflections_overview('2026-10-05') where type = 'weekly';
  if o.period_start = '2026-09-28' and o.period_has_entries and o.content is null and not o.generating then ok := ok + 1; else bad := bad + 1; r := r || ' o3;'; end if;
  insert into public.reflections (user_id, type, period_start, period_end, status)
    values (u, 'weekly', '2026-09-28', '2026-10-04', 'pending');
  select * into o from public.get_reflections_overview('2026-10-05') where type = 'weekly';
  if o.generating and o.content is null then ok := ok + 1; else bad := bad + 1; r := r || ' o4;'; end if;
  select * into b from public.get_breakdown_periods('2026-10-05') where type = 'weekly';
  if b.period_start = '2026-09-28' and b.has_entries then ok := ok + 1; else bad := bad + 1; r := r || ' b2;'; end if;

  -- No month finished yet: no breakdown period, and the reflection has no period (not-ready text).
  select count(*) into procedure_check from public.get_breakdown_periods('2026-10-05') where type = 'monthly';
  if procedure_check = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' bm;'; end if;
  select * into o from public.get_reflections_overview('2026-10-05') where type = 'monthly';
  if o.period_start is null and o.period_has_entries is null and o.content is null then ok := ok + 1; else bad := bad + 1; r := r || ' om;'; end if;

  -- Weekly next date = the day after the current week ends.
  select * into o from public.get_reflections_overview('2026-09-28') where type = 'weekly';
  if o.next_unlock_date = '2026-10-05' then ok := ok + 1; else bad := bad + 1; r := r || ' wk-next;'; end if;
  -- Month end: first entry Jan 31. On Feb 28 the finished month is Jan 31 to Feb 27 and the next
  -- one is ready Mar 31 (not 'today', Feb 28).
  insert into auth.users (id, email, raw_user_meta_data, aud, role, created_at)
    values (u2, 'o7b@lysm-test.invalid', '{}', 'authenticated', 'authenticated', now());
  insert into public.journal_entries (user_id, mood_slug, note, local_date) values (u2, 'calm', 'x', '2027-01-31');
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  select * into o from public.get_reflections_overview('2027-02-28') where type = 'monthly';
  if o.period_start = '2027-01-31' and o.period_end = '2027-02-27' and o.next_unlock_date = '2027-03-31' then ok := ok + 1;
  else bad := bad + 1; r := r || ' month-end ' || coalesce(o.period_end::text,'null') || ' next=' || coalesce(o.next_unlock_date::text,'null') || ';'; end if;
  -- No finished month yet (Feb 15): no period, next date = Feb 28's day after the first month ends.
  select * into o from public.get_reflections_overview('2027-02-15') where type = 'monthly';
  if o.period_start is null and o.next_unlock_date = '2027-02-28' then ok := ok + 1; else bad := bad + 1; r := r || ' first-month next=' || coalesce(o.next_unlock_date::text,'null') || ';'; end if;

  -- Grants: callable by signed-in users only.
  if has_function_privilege('authenticated', 'public.get_reflections_overview(date)', 'execute')
     and not has_function_privilege('anon', 'public.get_reflections_overview(date)', 'execute')
     and has_function_privilege('authenticated', 'public.get_breakdown_periods(date)', 'execute')
     and not has_function_privilege('anon', 'public.get_breakdown_periods(date)', 'execute')
  then ok := ok + 1; else bad := bad + 1; r := r || ' grants;'; end if;

  raise exception 'ROLLED BACK. ok=% bad=% %', ok, bad, r;
end
$test$;
