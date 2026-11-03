-- Recap pushes and reflections only for periods with real entries, at 9 AM local, skipped once opened
-- (client revisions 10/14 p.8 and p.14: O27, O28), including a first entry on the 29th to 31st.
-- Verifies migration 20261021150500_reflection_periods_month_end AFTER it is applied: run against the
-- database (Management API query or psql). Everything runs in ONE DO block that always ends with
-- RAISE EXCEPTION, so nothing it creates is kept. Every date is in 2027, so no real account is due on
-- any of them. Expected: the error "ROLLED BACK. ok=18 bad=0".
-- On a database without the migration the month-end checks fail (idx, due-a1, due-a2, claim-a1,
-- claim-a2); the rest pin what already worked.
do $test$
declare
  r text := '';
  ok int := 0;
  bad int := 0;
  a uuid := gen_random_uuid();   -- monthly: first entry Jan 31 (month end)
  b uuid := gen_random_uuid();   -- weekly, nothing special
  c uuid := gen_random_uuid();   -- weekly, opened Insights before 9 AM (reflection ready)
  d uuid := gen_random_uuid();   -- weekly, Weekly Recap switched off
  e uuid := gen_random_uuid();   -- weekly, reflection still being written at 9 AM (never seen)
  f uuid := gen_random_uuid();   -- weekly, lives in Asia/Karachi (UTC+5)
  n int;
  x record;
begin
  -- @migration

  insert into auth.users (id, email, raw_user_meta_data, aud, role, created_at) values
    (a, 'o28a@lysm-test.invalid', '{}', 'authenticated', 'authenticated', now()),
    (b, 'o28b@lysm-test.invalid', '{}', 'authenticated', 'authenticated', now()),
    (c, 'o28c@lysm-test.invalid', '{}', 'authenticated', 'authenticated', now()),
    (d, 'o28d@lysm-test.invalid', '{}', 'authenticated', 'authenticated', now()),
    (e, 'o28e@lysm-test.invalid', '{}', 'authenticated', 'authenticated', now()),
    (f, 'o28f@lysm-test.invalid', '{}', 'authenticated', 'authenticated', now());
  update public.profiles set timezone = 'UTC' where user_id in (a, b, c, d, e);
  update public.profiles set timezone = 'Asia/Karachi' where user_id = f;
  insert into public.device_tokens (user_id, platform, token)
    select u, 'ios', 'ExponentPushToken[o28-' || u || ']' from unnest(array[a, b, c, d, e, f]) as u;
  update public.notification_prefs set weekly_recap = false where user_id = d;
  if not found then
    insert into public.notification_prefs (user_id, weekly_recap) values (d, false);
  end if;

  -- A: months are Jan 31 to Feb 27, Feb 28 to Mar 30, Mar 31 to Apr 29, Apr 30 to May 30.
  -- Nothing Mar 31 to Apr 29; one entry on Apr 30 (that month's first day, written before 9 AM).
  insert into public.journal_entries (user_id, mood_slug, note, local_date) values
    (a, 'calm', 'first', '2027-01-31'),
    (a, 'happy', 'new month', '2027-04-30');
  -- B to F: week Mar 1 to 7 has entries; B leaves Mar 8 to 14 empty and writes on Mar 15.
  insert into public.journal_entries (user_id, mood_slug, note, local_date) values
    (b, 'calm', 'w0', '2027-03-01'), (b, 'happy', 'w0b', '2027-03-03'), (b, 'tired', 'w2', '2027-03-15'),
    (c, 'calm', 'w0', '2027-03-01'),
    (d, 'calm', 'w0', '2027-03-01'),
    (e, 'calm', 'w0', '2027-03-01'),
    (f, 'calm', 'w0', '2027-03-01');
  insert into public.reflections (user_id, type, period_start, period_end, status, content, generated_at) values
    (c, 'weekly', '2027-03-01', '2027-03-07', 'ready', 'You read this at midnight.', '2027-03-08 00:05+00');
  insert into public.reflections (user_id, type, period_start, period_end, status) values
    (e, 'weekly', '2027-03-01', '2027-03-07', 'pending');

  -- idx: every day's period index is the period whose dates contain it (2 years of first entries,
  -- 3 years of days each; Feb 29 2024 covers yearly).
  select count(*) into n
    from generate_series('2024-01-01'::date, '2025-12-31'::date, '1 day') fd
   cross join unnest(enum_range(null::public.reflection_type)) ty (t)
   cross join generate_series(fd::date, fd::date + 1100, '1 day') dd
   cross join lateral public.reflection_period_bounds(
                ty.t, fd::date, public.reflection_period_index(ty.t, fd::date, dd::date)) pb
   where dd::date not between pb.period_start and pb.period_end;
  if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' idx ' || n || ' days outside;'; end if;

  -- idx-same: no other day moved (only a period's first day that age() put one period early).
  select count(*) into n
    from generate_series('2024-01-01'::date, '2025-12-31'::date, '1 day') fd
   cross join unnest(array['monthly', 'yearly']::public.reflection_type[]) ty (t)
   cross join generate_series(fd::date, fd::date + 1100, '1 day') dd
   cross join lateral (
     select case ty.t
              when 'monthly' then extract(year from age(dd::date, fd::date))::int * 12
                                  + extract(month from age(dd::date, fd::date))::int
              else extract(year from age(dd::date, fd::date))::int
            end as old_idx
   ) o
   cross join lateral public.reflection_period_bounds(ty.t, fd::date, o.old_idx) ob
   where dd::date between ob.period_start and ob.period_end
     and public.reflection_period_index(ty.t, fd::date, dd::date) <> o.old_idx;
  if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' idx-same ' || n || ';'; end if;

  -- due-a1: on Apr 30 the empty month Mar 31 to Apr 29 is NOT due (no AI reflection from zero entries).
  select count(*) into n from public.get_due_reflection_periods('2027-04-30', a)
   where type = 'monthly' and period_start = '2027-03-31';
  if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' due-a1;'; end if;
  -- due-a2: on May 31 the month Apr 30 to May 30 is due with its one entry.
  select count(*) into n from public.get_due_reflection_periods('2027-05-31', a)
   where type = 'monthly' and period_start = '2027-04-30' and period_end = '2027-05-30' and entry_count = 1;
  if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' due-a2;'; end if;
  -- due-a3: the first month (Jan 31 to Feb 27) is due as before.
  select count(*) into n from public.get_due_reflection_periods('2027-05-31', a)
   where type = 'monthly' and period_start = '2027-01-31' and period_end = '2027-02-27' and entry_count = 1;
  if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' due-a3;'; end if;

  -- claim-a1: Apr 30, 9 AM: no Monthly push for the empty Mar 31 to Apr 29 (the Apr 30 entry is not in it).
  select count(*) into n from public.claim_recap_pushes('2027-04-30 09:10+00') where user_id = a;
  if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' claim-a1;'; end if;
  -- claim-a2: May 31, 9 AM: the Monthly push for Apr 30 to May 30 (its only entry is on Apr 30).
  select count(*) into n from public.claim_recap_pushes('2027-05-31 09:10+00')
   where user_id = a and type = 'monthly' and period_start = '2027-04-30' and period_end = '2027-05-30';
  if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' claim-a2;'; end if;

  -- 8:30 AM on the unlock day: too early for everyone.
  select count(*) into n from public.claim_recap_pushes('2027-03-08 08:30+00') where user_id in (b, c, d, e, f);
  if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' early;'; end if;

  -- 9 AM UTC on Mar 8.
  create temp table o28_claims on commit drop as
    select * from public.claim_recap_pushes('2027-03-08 09:00+00') where user_id in (b, c, d, e, f);
  select count(*) into n from o28_claims
   where user_id = b and type = 'weekly' and period_start = '2027-03-01' and period_end = '2027-03-07';
  if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' nine-b;'; end if;
  select count(*) into n from o28_claims where user_id = c;
  if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' opened-c;'; end if;
  select count(*) into n from o28_claims where user_id = d;
  if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' switch-off-d;'; end if;
  select count(*) into n from o28_claims where user_id = e and type = 'weekly';
  if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' pending-e;'; end if;
  select count(*) into n from o28_claims where user_id = f;
  if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' karachi-2pm;'; end if;

  -- 9:30 run: the same period is never announced twice.
  select count(*) into n from public.claim_recap_pushes('2027-03-08 09:30+00') where user_id = b;
  if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' once-b;'; end if;

  -- Karachi: 04:00 UTC is 9 AM there.
  select count(*) into n from public.claim_recap_pushes('2027-03-08 04:00+00')
   where user_id = f and type = 'weekly' and period_start = '2027-03-01';
  if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' karachi-9am;'; end if;

  -- Mar 15, 9 AM: B's week Mar 8 to 14 was empty: no push, switch on and an entry already written today.
  select count(*) into n from public.claim_recap_pushes('2027-03-15 09:00+00') where user_id = b;
  if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' empty-week-b;'; end if;
  -- ...and no reflection is due for it.
  select count(*) into n from public.get_due_reflection_periods('2027-03-15', b)
   where type = 'weekly' and period_start = '2027-03-08';
  if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' empty-week-due;'; end if;

  -- Grants unchanged: the claim is service role only; the due list stays callable by the app.
  if has_function_privilege('service_role', 'public.claim_recap_pushes(timestamptz)', 'execute')
     and not has_function_privilege('authenticated', 'public.claim_recap_pushes(timestamptz)', 'execute')
     and not has_function_privilege('anon', 'public.claim_recap_pushes(timestamptz)', 'execute')
     and has_function_privilege('authenticated', 'public.get_due_reflection_periods(date, uuid)', 'execute')
  then ok := ok + 1; else bad := bad + 1; r := r || ' grants;'; end if;

  raise exception 'ROLLED BACK. ok=% bad=% %', ok, bad, r;
end
$test$;
