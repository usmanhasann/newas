-- Traveling never breaks a streak on its own (client revisions 10/14 p.30, N14).
-- Verifies migration 20261022010000_travel_keeps_streak AFTER it is applied: run against the database
-- (Management API query or psql). Everything runs in ONE DO block that always ends with RAISE EXCEPTION,
-- so nothing it creates is kept. Expected: the error "ROLLED BACK. ok=30 bad=0".
do $test$
declare
  r text := '';
  ok int := 0;
  bad int := 0;
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); u3 uuid := gen_random_uuid();
  u4 uuid := gen_random_uuid(); u5 uuid := gen_random_uuid(); u6 uuid := gen_random_uuid();
  u7 uuid := gen_random_uuid(); u8 uuid := gen_random_uuid(); u9 uuid := gen_random_uuid();
  u10 uuid := gen_random_uuid();
  la text := 'America/Los_Angeles';
  syd text := 'Australia/Sydney';
  n int;
  s record;
  jd record;
  e uuid;
  t date;
  d date;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role, created_at)
  select x.id, 'n14-' || x.i || '@lysm-test.invalid', '{}', 'authenticated', 'authenticated', now()
    from unnest(array[u1, u2, u3, u4, u5, u6, u7, u8, u9, u10]) with ordinality as x (id, i);
  update public.profiles set timezone = la where user_id in (u1, u2, u3, u4, u5, u7, u8, u9, u10);
  update public.profiles set timezone = syd where user_id = u6;

  -- 1. Los Angeles, Monday 8 PM, then Sydney on Wednesday 9 AM (still Tuesday 3 PM in LA): the
  --    phone never showed Tuesday on the ground. Tuesday is kept as a travel day.
  insert into public.journal_entries (user_id, mood_slug, note, local_date, created_at)
    values (u1, 'calm', 'mon', '2026-10-19', '2026-10-20 03:00:00+00');
  n := public.fill_travel_days(u1, '2026-10-19', '2026-10-21', la, syd, '2026-10-20 22:00:00+00');
  if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' a-fill=' || n || ';'; end if;
  select * into jd from public.journal_days where user_id = u1 and local_date = '2026-10-20';
  if jd.travel_day and jd.first_entry_id = '00000000-0000-0000-0000-000000000000' then ok := ok + 1;
  else bad := bad + 1; r := r || ' a-row;'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  select * into s from public.get_journal_stats('2026-10-21');
  if s.current_streak = 2 and s.longest_streak = 2 then ok := ok + 1;
  else bad := bad + 1; r := r || ' a-streak=' || s.current_streak || ';'; end if;
  insert into public.journal_entries (user_id, mood_slug, note, local_date) values (u1, 'happy', 'wed', '2026-10-21');
  select * into s from public.get_journal_stats('2026-10-21');
  if s.current_streak = 3 and s.last_entry_date = '2026-10-21' then ok := ok + 1;
  else bad := bad + 1; r := r || ' a-wed=' || s.current_streak || ';'; end if;
  -- Entries stay on the day they were written (Monday stays Monday).
  select count(*) into n from public.journal_entries where user_id = u1 and local_date = '2026-10-19';
  if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' a-entry-day;'; end if;
  -- Idempotent.
  n := public.fill_travel_days(u1, '2026-10-19', '2026-10-21', la, syd, '2026-10-20 22:00:00+00');
  if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' a-again;'; end if;

  -- 2. An entry written later on a travel day (after flying back west) makes it a real day.
  insert into public.journal_entries (user_id, mood_slug, note, local_date) values (u1, 'calm', 'tue', '2026-10-20')
    returning id into e;
  select * into jd from public.journal_days where user_id = u1 and local_date = '2026-10-20';
  if not jd.travel_day and jd.first_entry_id = e then ok := ok + 1; else bad := bad + 1; r := r || ' convert;'; end if;

  -- 3. Seen in the NEW zone: Monday 8 AM in LA is already Tuesday in Sydney, so a first look on
  --    Wednesday 11 PM in Sydney (Wednesday 5 AM in LA) still keeps the streak.
  insert into public.journal_entries (user_id, mood_slug, note, local_date, created_at)
    values (u2, 'calm', 'mon', '2026-10-19', '2026-10-19 15:00:00+00');
  n := public.fill_travel_days(u2, '2026-10-19', '2026-10-21', la, syd, '2026-10-21 12:00:00+00');
  if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' newzone=' || n || ';'; end if;

  -- 4. Moved east and the app wasn't used in LA on the skipped Tuesday: the trip used it up, even
  --    though Monday's entry was at 3 AM and the first look in Sydney is late on Wednesday.
  insert into public.journal_entries (user_id, mood_slug, note, local_date, created_at)
    values (u3, 'calm', 'mon', '2026-10-19', '2026-10-19 10:00:00+00'),
           (u4, 'calm', 'mon', '2026-10-19', '2026-10-19 10:00:00+00');
  n := public.fill_travel_days(u3, '2026-10-19', '2026-10-21', la, syd, '2026-10-21 12:00:00+00', '2026-10-19 09:00:00+00');
  if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' trip=' || n || ';'; end if;
  --    ...but not when the app was used in LA on that Tuesday (11 AM), or nothing says when.
  n := public.fill_travel_days(u4, '2026-10-19', '2026-10-21', la, syd, '2026-10-21 12:00:00+00', '2026-10-20 18:00:00+00');
  if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' seen-tue;'; end if;
  n := public.fill_travel_days(u4, '2026-10-19', '2026-10-21', la, syd, '2026-10-21 12:00:00+00');
  if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' unseen-null;'; end if;

  -- 5. A real missed day is never filled: no travel (LA all along), Wednesday 9 AM.
  insert into public.journal_entries (user_id, mood_slug, note, local_date, created_at)
    values (u5, 'calm', 'mon', '2026-10-19', '2026-10-20 03:00:00+00');
  n := public.fill_travel_days(u5, '2026-10-19', '2026-10-21', la, la, '2026-10-21 16:00:00+00', '2026-10-01 00:00:00+00');
  if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' no-travel;'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u5, 'role', 'authenticated')::text, true);
  select * into s from public.get_journal_stats('2026-10-21');
  if s.current_streak = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' no-travel-streak;'; end if;
  --    Two missing days are never filled, even after a trip east.
  n := public.fill_travel_days(u5, '2026-10-19', '2026-10-22', la, syd, '2026-10-21 16:00:00+00', '2026-10-01 00:00:00+00');
  if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' two-days;'; end if;

  -- 6. Flying WEST with a real gap: Sydney Monday 8 PM, LA Wednesday 9 AM (Thursday in Sydney).
  insert into public.journal_entries (user_id, mood_slug, note, local_date, created_at)
    values (u6, 'calm', 'mon', '2026-10-19', '2026-10-19 09:00:00+00');
  n := public.fill_travel_days(u6, '2026-10-19', '2026-10-21', syd, la, '2026-10-21 16:00:00+00', '2026-10-01 00:00:00+00');
  if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' west;'; end if;

  -- 7. A travel day never leads to another one.
  insert into public.journal_entries (user_id, mood_slug, note, local_date, created_at)
    values (u7, 'calm', 'mon', '2026-10-19', '2026-10-20 03:00:00+00');
  n := public.fill_travel_days(u7, '2026-10-19', '2026-10-21', la, syd, '2026-10-20 22:00:00+00');
  if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' chain-first;'; end if;
  n := public.fill_travel_days(u7, '2026-10-20', '2026-10-22', syd, 'Pacific/Kiritimati', '2026-10-21 22:00:00+00', '2026-10-01 00:00:00+00');
  if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' chain;'; end if;

  -- 8. The app saves the phone's new zone (LA to Sydney): the trigger keeps the skipped day, the
  --    Home streak stays alive and the 8 PM reminder goes out in Sydney with that streak.
  t := (now() at time zone syd)::date;
  insert into public.journal_entries (user_id, mood_slug, note, local_date, created_at)
    values (u8, 'calm', 'last', t - 2, now() - interval '1 day');
  update public.profiles set timezone = syd where user_id = u8;
  select * into jd from public.journal_days where user_id = u8 and local_date = t - 1;
  if jd.travel_day then ok := ok + 1; else bad := bad + 1; r := r || ' trg-fill;'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u8, 'role', 'authenticated')::text, true);
  select * into s from public.get_journal_stats(t);
  if s.current_streak = 2 then ok := ok + 1; else bad := bad + 1; r := r || ' trg-streak=' || s.current_streak || ';'; end if;
  select c.streak into n
    from public.claim_streak_reminders(((t::timestamp + interval '20 hours') at time zone syd)) c
   where c.user_id = u8;
  if n = 2 then ok := ok + 1; else bad := bad + 1; r := r || ' trg-reminder=' || coalesce(n::text, 'none') || ';'; end if;
  --    The same zone saved again changes nothing.
  update public.profiles set timezone = syd where user_id = u8;
  select count(*) into n from public.journal_days where user_id = u8;
  if n = 2 then ok := ok + 1; else bad := bad + 1; r := r || ' trg-same;'; end if;

  -- 9. Backstop: the first entry in the new zone arrives while the profile still says LA (the zone
  --    save failed). It is already the next day on the phone but still today in LA.
  d := (now() at time zone la)::date;
  insert into public.journal_entries (user_id, mood_slug, note, local_date, created_at)
    values (u9, 'calm', 'yesterday', d - 1, now() - interval '20 hours');
  insert into public.journal_entries (user_id, mood_slug, note, local_date) values (u9, 'happy', 'phone day', d + 1);
  select * into jd from public.journal_days where user_id = u9 and local_date = d;
  if jd.travel_day then ok := ok + 1; else bad := bad + 1; r := r || ' backstop;'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u9, 'role', 'authenticated')::text, true);
  select * into s from public.get_journal_stats(d + 1);
  if s.current_streak = 3 then ok := ok + 1; else bad := bad + 1; r := r || ' backstop-streak=' || s.current_streak || ';'; end if;

  -- 10. No travel, a real missed day: the entry trigger fills nothing.
  insert into public.journal_entries (user_id, mood_slug, note, local_date, created_at)
    values (u10, 'calm', 'two days ago', d - 2, now() - interval '2 days');
  insert into public.journal_entries (user_id, mood_slug, note, local_date) values (u10, 'calm', 'today', d);
  select count(*) into n from public.journal_days where user_id = u10;
  if n = 2 then ok := ok + 1; else bad := bad + 1; r := r || ' miss-fill;'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u10, 'role', 'authenticated')::text, true);
  select * into s from public.get_journal_stats(d);
  if s.current_streak = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' miss-streak;'; end if;

  -- 11. Only a usable zone name is ever stored; anything else keeps the zone it had, without failing
  --     the save.
  update public.profiles set timezone = 'GMT+5', bio = 'still saved' where user_id = u10;
  select count(*) into n from public.profiles where user_id = u10 and timezone = la and bio = 'still saved';
  if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' keep-offset;'; end if;
  update public.profiles set timezone = 'Mars/Olympus_Mons' where user_id = u10;
  select count(*) into n from public.profiles where user_id = u10 and timezone = la;
  if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' keep-unknown;'; end if;
  update public.profiles set timezone = 'America/Argentina/Buenos_Aires' where user_id = u10;
  select count(*) into n from public.profiles where user_id = u10 and timezone = 'America/Argentina/Buenos_Aires';
  if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' zone-ok;'; end if;
  if public.is_time_zone('UTC') and public.is_time_zone('Etc/GMT+5') and not public.is_time_zone('+05:00')
     and not public.is_time_zone(null) then ok := ok + 1; else bad := bad + 1; r := r || ' is_time_zone;'; end if;

  -- 12. Grants: only the server fills travel days.
  if not has_function_privilege('authenticated', 'public.fill_travel_days(uuid, date, date, text, text, timestamptz, timestamptz)', 'execute')
     and not has_function_privilege('anon', 'public.fill_travel_days(uuid, date, date, text, text, timestamptz, timestamptz)', 'execute')
     and not has_function_privilege('authenticated', 'public.on_profile_timezone_change()', 'execute')
     and not has_function_privilege('authenticated', 'public.keep_usable_time_zone()', 'execute')
  then ok := ok + 1; else bad := bad + 1; r := r || ' grants;'; end if;

  raise exception 'ROLLED BACK. ok=% bad=% %', ok, bad, r;
end
$test$;
